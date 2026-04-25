# Claude Instructions

## Settings
- Mode: Auto Accept Edits
- Model: Haiku 4.5
- Context Limit: 200K tokens

## Post-Change
After changes, offer to: 1) run build, 2) commit/push. **Never auto-execute**—wait for explicit confirmation.

## Agents
For specific roles, use: `.claude/agents/{product-manager,architecture,ux-coding,coding,quality-engineer,devops}.md`

## Memory
Run `/anthropic-skills:consolidate-memory` periodically (or enable auto-compact via `/update-config`) to keep memory lean.
