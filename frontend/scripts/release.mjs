#!/usr/bin/env node
/**
 * Release script — bumps version, generates MDX release notes using Gemma 4, tags git.
 *
 * Usage: npm run release --type=major|minor|patch
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
const bumpType = process.env.npm_config_type;
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('❌  Usage: npm run release --type=major|minor|patch');
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

const gitLog = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`).toString().trim();
if (!gitLog) {
  console.log(`ℹ️   No new commits since ${lastTag}. Nothing to release.`);
  process.exit(0);
}

// --- 4. Parse conventional commits into categorised lists
const features = [], fixes = [], improvements = [];
gitLog.split('\n').forEach(line => {
  if (line.startsWith('chore: release v')) return;
  const match = line.match(/^(\w+)(?:\([\w-]+\))?!?:\s+(.+)$/);
  if (!match) return;
  const [, type, desc] = match;
  if (type === 'feat') features.push(desc);
  else if (type === 'fix') fixes.push(desc);
  else if (['refactor', 'perf', 'style'].includes(type)) improvements.push(desc);
});

// --- 5. Generate release title with Gemma 4 E2B (Apache 2.0, no API key needed)
console.log('⏳  Loading Gemma 4 E2B model (first run downloads ~500MB, then cached)...');
const { pipeline } = await import('@huggingface/transformers');
const generator = await pipeline('text-generation', 'onnx-community/gemma-4-E2B-it-ONNX');

const allChanges = [...features, ...fixes, ...improvements];
const changeList = allChanges.length > 0
  ? allChanges.map(c => `- ${c}`).join('\n')
  : gitLog.split('\n').slice(0, 8).join('\n');

const prompt = `<start_of_turn>user\nWrite a single short software release title (max 8 words, no quotes, no punctuation at end) summarising these changes:\n${changeList}\n<end_of_turn>\n<start_of_turn>model\n`;
const result = await generator(prompt, { max_new_tokens: 20 });
const raw = result[0].generated_text.split('<start_of_turn>model\n').pop() ?? '';
const title = raw.split('\n')[0].replace(/['"]/g, '').trim() || 'Updates and improvements';

// --- 6. Bump version
const [major, minor, patch] = pkg.version.split('.').map(Number);
const newVersion =
  bumpType === 'major' ? `${major + 1}.0.0` :
  bumpType === 'minor' ? `${major}.${minor + 1}.0` :
  `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;

// --- 7. Build new MDX section
const dateStr = new Date().toISOString().split('T')[0];
const friendlyDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

let newSection = `## v${newVersion} — ${title}\n\n*Released ${friendlyDate}*\n`;
if (features.length) newSection += `\n### ✨ Features\n\n${features.map(d => `- ${d}`).join('\n')}\n`;
if (fixes.length) newSection += `\n### 🐛 Bug Fixes\n\n${fixes.map(d => `- ${d}`).join('\n')}\n`;
if (improvements.length) newSection += `\n### ⚡ Improvements\n\n${improvements.map(d => `- ${d}`).join('\n')}\n`;
newSection += '\n---\n\n';

// --- 8. Update frontmatter metadata array
const newMeta = { version: newVersion, commit: currentCommit, date: dateStr, title };
releases.unshift(newMeta);

// --- 9. Write releases.mdx (updated frontmatter + prepended body)
const newMdxContent = matter.stringify(newSection + existingBody, { releases });
writeFileSync(mdxPath, newMdxContent);

// --- 10. Write releases-meta.json (lightweight metadata for client-side modal)
writeFileSync(metaPath, JSON.stringify(releases, null, 2) + '\n');

// --- 11. Bump package.json
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
