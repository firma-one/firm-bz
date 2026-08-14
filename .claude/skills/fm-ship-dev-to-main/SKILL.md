---
name: fm-ship-dev-to-main
description: Commit pending changes on dev, open a PR to main, wait for checks, squash-merge, sync main back into dev, and verify the production Vercel deploy. Use when the user asks to "push and test on prod", "ship this", "cut a release", or otherwise wants the dev→main release pipeline run end-to-end.
argument-hint: "[autonomous|confirm]"
---

# Ship dev → main

Runs the full release pipeline for this repo: commit → push → PR → merge → sync → verify prod deploy.

This performs a squash-merge into `main`, which triggers a **production** deployment. Treat every step from the merge onward as a real, hard-to-reverse action on shared state — not a routine local edit.

## Step 0 — Determine autonomy mode

The `argument-hint` accepts `autonomous` or `confirm`.

- If the user typed one of those with the command (e.g. `/ship-dev-to-main autonomous`), use it directly — do not ask.
- If no argument was given, **ask the user** with AskUserQuestion before doing anything:
  - "Autonomous" — run all steps below without pausing, matching the flow described here. Only stop early if genuinely blocked (build fails, checks fail, merge conflicts).
  - "Confirm at each step" — pause before each numbered step below (git commit, git push, PR create, merge, dev sync, prod verify) and wait for explicit go-ahead.

Never infer autonomy from tone or urgency in the request — always resolve it via the flag or the question above.

## Step 1 — Review and commit

1. Run `git status` and `git diff --stat` to see everything pending — not just what you personally touched this session. The user's instruction is "commit all the code diff," which may include unrelated pre-existing uncommitted files (docs, other plans, etc.).
2. If there are files whose purpose or safety you're unsure of (e.g. something that looks like a secret, or a large unrelated change bundled in), flag it and ask before staging — even in autonomous mode. Do not silently drop files the user didn't mention, and do not silently include anything that looks sensitive.
3. In **confirm mode**: show the proposed commit message and file list, and wait for approval before running `git commit`.
4. In **autonomous mode**: proceed directly, but still show the commit message and file list in your response after the fact so the user has a record.
5. Use a HEREDOC commit message ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` per this repo's global commit convention.

## Step 2 — Push to the source branch

`git push origin <branch>` (typically `dev`). This repo's pre-push hook runs a full `npm run build` (including `prisma generate`, typecheck, and `prisma migrate deploy`) — it can take several minutes. Use a long timeout (300000ms) and do not treat a slow build as a hang.

If the pre-push build fails, stop and report the failure — do not force-push or bypass hooks to work around it.

## Step 3 — Create the PR

```bash
unset GH_TOKEN && gh pr create --repo firma-one/firm-bz --title "..." --body "..." --base main --head <branch>
```

`GH_TOKEN` may be set but invalid in this environment — always `unset` it first so the CLI falls back to the valid keyring token, per this repo's CLAUDE.md.

Write a real Summary + Test plan body, not a placeholder.

## Step 4 — Monitor PR checks

```bash
unset GH_TOKEN && gh pr checks <PR#> --repo firma-one/firm-bz --watch --interval 15
```

Run this in the background (it can take a few minutes for Vercel preview to build). Do not poll manually in a sleep loop — launch it as a background command and let the harness notify you when it completes, or use Monitor if available.

If checks fail, stop and report — do not merge a red PR, autonomous mode or not.

## Step 5 — Squash-merge

**Confirm mode:** always pause here and get explicit go-ahead, even if every earlier step was confirmed — this is the step that ships to production.

**Autonomous mode:** proceed only if Step 4's checks are all green.

```bash
unset GH_TOKEN && gh pr merge <PR#> --repo firma-one/firm-bz --squash --delete-branch=false
```

Do not delete the source branch (`dev` is a long-lived branch here, not a feature branch).

## Step 6 — Sync main back into dev

1. `git fetch origin`
2. `git diff --stat origin/main origin/dev` — if non-empty, the squash may not have captured everything that was on `dev` (see `docs` memory on PR #73). Investigate before proceeding rather than pushing through it.
3. `git checkout dev && git merge origin/main -m "Merge main (PR #<N>) into dev\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`
4. `git push origin dev` (same pre-push build hook as Step 2 — same long timeout).
5. Re-run `git diff --stat origin/main origin/dev` after the push — confirm it's empty. This is the cheapest way to catch a partial sync before it causes "why isn't this on prod" confusion later.

## Step 7 — Verify the production deploy

Production deploys are triggered by the merge to `main`, independent of the PR preview deploy from Step 4 — they are two different Vercel deployments and must be checked separately.

1. Resolve team/project IDs once via `mcp__claude_ai_Vercel__list_teams` and `mcp__claude_ai_Vercel__list_projects` if not already known (there is no `.vercel/project.json` in this repo).
2. `mcp__claude_ai_Vercel__list_deployments` for the project, find the deployment with `target: "production"` and `meta.githubCommitSha` matching the squash-merge commit on `main` (from Step 5's `gh pr merge` output or `git log -1 origin/main`).
3. If it's `QUEUED`/`BUILDING`, poll with `ScheduleWakeup` (60–120s intervals) rather than blocking — do not sleep-loop in Bash.
4. Report final state: `READY` (success) or `ERROR` (report the failure and stop — do not attempt a rollback or redeploy without asking).

## Reporting

At the end (whether autonomous or confirm mode), summarize what happened: commit SHA, PR number/link, merge commit SHA, dev-sync status, and final prod deploy state. Do not fabricate any of these — if a step is still in flight when you report, say so explicitly rather than assuming success.
