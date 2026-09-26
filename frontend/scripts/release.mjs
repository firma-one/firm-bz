#!/usr/bin/env node
/**
 * Release script — bumps version, generates MDX release notes using Gemma 4, tags git.
 *
 * Usage: npm run release --bump=major|minor|patch
 *
 * On first run: downloads onnx-community/gemma-4-E2B-it-ONNX (~500MB) to
 * ~/.cache/huggingface/ — cached forever after.
 *
 * Requires: git tag v1.0.0 baseline to exist before running.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- 1. Validate bump type
const bumpType = process.env.npm_config_bump;
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('❌  Usage: npm run release --bump=major|minor|patch');
  process.exit(1);
}

// --- 2. Read current files
const pkgPath = resolve(ROOT, 'package.json');
const mdxPath = resolve(ROOT, 'content/releases.mdx');
const metaPath = resolve(ROOT, 'content/releases-meta.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const { data, content: existingBody } = existsSync(mdxPath)
  ? matter(readFileSync(mdxPath, 'utf8'))
  : { data: { releases: [] }, content: '' };
const releases = data.releases ?? [];

// --- 3. Get current commit SHA + diff range from last git tag
const currentCommit = execSync('git rev-parse HEAD').toString().trim();
let lastTag;
try {
  lastTag = execSync('git describe --tags --abbrev=0').toString().trim();
} catch {
  console.error('❌  No git tags found. Create a baseline tag first:');
  console.error('       git tag v1.0.0 && git push origin v1.0.0');
  process.exit(1);
}

// In squash-merge workflows, `git log lastTag..HEAD` includes every individual dev
// commit that was squashed — they're not ancestors of the squash commit. Instead:
// find the merge commit where the tag was synced back into dev, then collect
// (a) dev commits not yet in the tag + (b) commits after the sync.
const lastTagSha = execSync(`git rev-parse ${lastTag}`).toString().trim();
const mergeLines = execSync(`git log --merges --pretty=format:"%H %P"`).toString().trim().split('\n');
const syncMergeLine = mergeLines.find(line => line.trim().split(/\s+/).slice(1).includes(lastTagSha));

let gitLog;
if (syncMergeLine) {
  const [syncSha, ...parents] = syncMergeLine.trim().split(/\s+/);
  const devParent = parents.find(p => p !== lastTagSha);
  const preSync = devParent
    ? execSync(`git log ${lastTagSha}..${devParent} --no-merges --pretty=format:"%s"`).toString().trim()
    : '';
  const postSync = execSync(`git log ${syncSha}..HEAD --no-merges --pretty=format:"%s"`).toString().trim();
  gitLog = [postSync, preSync].filter(Boolean).join('\n');
  console.log(`🔍  Squash-merge workflow detected — using sync merge ${syncSha.slice(0, 7)} as range base`);
} else {
  gitLog = execSync(`git log ${lastTag}..HEAD --no-merges --pretty=format:"%s"`).toString().trim();
}
if (!gitLog) {
  console.log(`ℹ️   No new commits since ${lastTag}. Nothing to release.`);
  process.exit(0);
}

// --- 4. Categorise commits
//
// Conventional-commit prefixes are used WHERE PRESENT, but a commit without one is kept rather
// than discarded. Dropping them silently produced a badly wrong v2.0.0: of 250 commits only 5
// carried prefixes — all from a prior release — so the model summarised those 5 and described a
// release that had not happened.
//
// `other` holds everything unprefixed. It feeds the model alongside the rest, so the summary is
// drawn from the whole range regardless of commit style.
const features = [], fixes = [], improvements = [], other = [];
gitLog.split('\n').forEach(line => {
  const subject = line.trim();
  if (!subject) return;
  if (subject.startsWith('chore: release v')) return;
  // A squashed release PR ("v2.0.0 — …") describes the release itself, not a change within it.
  if (/^v\d+\.\d+\.\d+\s*[—-]/.test(subject)) return;
  // Squash merges append " (#123)" — noise for a summariser.
  const clean = subject.replace(/\s*\(#\d+\)$/, '');

  const match = clean.match(/^(\w+)(?:\([\w-]+\))?!?:\s+(.+)$/);
  if (!match) { other.push(clean); return; }

  const [, type, desc] = match;
  if (type === 'feat') features.push(desc);
  else if (type === 'fix') fixes.push(desc);
  else if (['refactor', 'perf', 'style'].includes(type)) improvements.push(desc);
  else if (type !== 'chore' && type !== 'docs' && type !== 'test') other.push(desc);
});
const totalChanges = features.length + fixes.length + improvements.length + other.length;
console.log(`📋  Commits since ${lastTag}: ${features.length} features, ${fixes.length} fixes, ${improvements.length} improvements, ${other.length} other (${totalChanges} summarised)`);
if (totalChanges > 60) {
  console.log(`⚠️   Large range — the generated notes will be broad. Review them before committing.`);
}

// --- 5. Generate release title + notes with Gemma 4 E2B (Apache 2.0, no API key needed)
console.log('⏳  Loading Gemma 4 E2B model (first run downloads ~500MB, then cached)...');
const { pipeline } = await import('@huggingface/transformers');
const generator = await pipeline('text-generation', 'onnx-community/gemma-4-E2B-it-ONNX');
console.log('✅  Model loaded');

// Prefixed commits first — they are the ones an author explicitly marked as user-facing — then
// everything else. Capped because a 250-commit list exceeds what the model can weigh sensibly,
// and an arbitrary head of the range reads as random.
const MAX_CHANGES_FOR_MODEL = 60;
const allChanges = [...features, ...fixes, ...improvements, ...other];
const changeList = allChanges.slice(0, MAX_CHANGES_FOR_MODEL).map(c => `- ${c}`).join('\n');
if (allChanges.length > MAX_CHANGES_FOR_MODEL) {
  console.log(`ℹ️   Summarising the first ${MAX_CHANGES_FOR_MODEL} of ${allChanges.length} changes.`);
}

console.log('🤖  Generating release title...');
const titleResult = await generator(
  [{ role: 'user', content: `Write a single short software release title (max 8 words, no quotes, no punctuation at end) summarising these changes:\n${changeList}` }],
  { max_new_tokens: 20 }
);
const title = (titleResult[0].generated_text.at(-1).content ?? '').split('\n')[0].replace(/['"]/g, '').trim() || 'Updates and improvements';
console.log(`📝  Title: "${title}"`);

console.log('🤖  Generating release notes...');
const notesResult = await generator(
  [{ role: 'user', content: `Write 3–5 product release notes for end users. Each note must be one crisp sentence (max 12 words), starting with "- ", describing a user-facing benefit. No technical jargon, no commit prefixes. Output only the bullet lines.\n\nChanges:\n${changeList}` }],
  { max_new_tokens: 300 }
);
const notesRaw = notesResult[0].generated_text.at(-1).content ?? '';
console.log(`📄  Raw notes output:\n${notesRaw}`);
const generatedNotes = notesRaw.split('\n').filter(l => l.startsWith('- ')).join('\n') || changeList;
console.log(generatedNotes === changeList ? '⚠️  Notes fallback triggered — using raw commit list' : '✅  Notes generated successfully');

// --- 6. Bump version from last git tag (not from package.json)
const [major, minor, patch] = lastTag.replace(/^v/, '').split('.').map(Number);
const newVersion =
  bumpType === 'major' ? `${major + 1}.0.0` :
  bumpType === 'minor' ? `${major}.${minor + 1}.0` :
  `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;

// --- 7. Build new MDX section
const dateStr = new Date().toISOString().split('T')[0];
const friendlyDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

let newSection = `## v${newVersion} — ${title}\n\n*Released ${friendlyDate}*\n\n${generatedNotes}\n\n---\n\n`;

// --- 8. Update frontmatter metadata array
const newMeta = { version: newVersion, commit: currentCommit, date: dateStr, title };
releases.unshift(newMeta);

// --- 9. Write releases.mdx (updated frontmatter + prepended body)
const newMdxContent = matter.stringify(newSection + existingBody, { releases });
writeFileSync(mdxPath, newMdxContent);

// --- 10. Write releases-meta.json (lightweight metadata for client-side modal)
writeFileSync(metaPath, JSON.stringify(releases, null, 2) + '\n');

// --- 11. Write package.json
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// --- 12. Create local git tag + stage files
execSync(`git tag v${newVersion}`);
execSync('git add package.json content/releases.mdx content/releases-meta.json', { cwd: ROOT });

console.log(`\n✅  Release v${newVersion} ready`);
console.log(`    Title:  "${title}"`);
console.log(`    Tag:    v${newVersion} (local — push after committing)`);
console.log(`\nReview staged files, then:\n`);
console.log(`    git commit -m "chore: release v${newVersion}"`);
console.log(`    git push && git push origin v${newVersion}`);
