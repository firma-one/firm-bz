# Claude Instructions

## Settings
- Mode: Auto Accept Edits
- Model: Haiku 4.5
- Context Limit: 200K tokens

## Post-Change
After changes, offer to: 1) run build, 2) commit/push. **Never auto-execute**—wait for explicit confirmation.

**NEVER commit or push without explicit user approval.** Always present the proposed commit message and ask before running any `git commit` or `git push` command.

## Prisma Migrations

- **Always create a migration file** for any schema change — never apply SQL directly to the DB.
- Use `npx prisma migrate dev --name <name> --create-only` to generate the file without applying it.
- The user runs `npm run build` to apply migrations (same as production) — never run `prisma migrate dev` without `--create-only`.
- Never edit a migration file after it has been applied — add a new migration instead.
- This keeps local and production migration history in sync and prevents drift.

## GitHub PRs

To create a PR via CLI (only when explicitly asked by the user):

```bash
unset GH_TOKEN && gh pr create --repo firma-one/firm-bz --title "..." --body "..." --base main --head dev
```

`GH_TOKEN` env var may be set but invalid — unsetting it falls back to the valid keyring token (`deepaksshettigar`). **Never create a PR without explicit user instruction.**

**Don't cut a PR mid-feature.** Only open/merge a PR once the current round of changes for a feature is actually done — not at an arbitrary checkpoint while a file is still being actively edited in the same session. A PR opened mid-edit can snapshot a partial state, silently leaving later changes unshipped (this happened with PR #73: a ~22-hour, single-commit squash titled "extractive snippet summaries" was cut mid-session and missed the second half of a Doc Search UI overhaul that kept going in the same conversation).

**Verify before/after merging a PR to main**: run `git diff --stat origin/main origin/dev` (after fetching) — if it's non-empty right after a "ship it" PR, something didn't make the cut. This is the cheapest way to catch a partial-snapshot PR before it causes a "why isn't this on Production" confusion later.

## Plans
All plans must be created under `.claude/plans/` in the project root. Never save plans to `~/.claude/plans/` or any other location.

## Agents
For specific roles, use: `.claude/agents/{product-manager,architecture,ux-coding,coding,quality-engineer,devops}.md`

## Memory
Run `/anthropic-skills:consolidate-memory` periodically (or enable auto-compact via `/update-config`) to keep memory lean.
