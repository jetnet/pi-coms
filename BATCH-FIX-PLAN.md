# Batch-Fix Plan — All Open Issues & PRs

## Inventory

### Open Issues (7)
| # | Title | Status | Action |
|---|-------|--------|--------|
| 26 | Add license | ✅ Already Fixed | LICENSE (MIT) already exists — close with comment |
| 24 | [HIGH] damage-control doesn't protect subagents | 🔧 Fix | Add warning header + pass DC extension to subagents |
| 23 | Purpose gate toggle feature | 🔧 Fix | Add `/purpose` toggle command |
| 22 | VS Code "Language model unavailable" | ❌ Not-a-bug | User support question, not project issue |
| 21 | Issues with agent teams | 🔍 Investigate | Agent team file-edit failures — likely cwd/session issue |
| 17 | RangeError: Invalid count value: -1 | 🔧 Fix | Guard `renderCard` width calculation |
| 16 | Bug: Incorrect bowser skill dir structure | ✅ Already Fixed | `.pi/skills/bowser/SKILL.md` already correct |
| 12 | tilldone: 400 orphaned tool_result | 🔧 Fix | Add message sanitization before nudge |

### Open PRs (9)
| # | Title | Action |
|---|-------|--------|
| 25 | theme-cycler: persist theme to settings.json | Apply locally |
| 20 | pi-pi: truncate widget message to terminal width | Apply locally |
| 13 | snap-packaged node: use process.execPath | Apply locally |
| 18 | Externalize pi-backtask submodule | Skip (structural) |
| 9 | Per-agent model override + Ollama audit | Skip (large feature) |
| 8 | git-status extension with live footer | Skip (new extension) |
| 7 | Update pi-coding-agent repo URLs in README | Apply locally |
| 3 | Security audit + shared agent loader | ✅ Applied (shared loader + 22 tests) |
| 1 | Normalize CRLF/CR line endings | Apply locally |

---

## Implementation Plan

### Fix 1: Issue #17 — RangeError in agent-team.ts renderCard
**Root cause:** `colWidth - 2` can be negative on narrow terminals.
**Fix:** Clamp `w` to minimum 1 in both `agent-team.ts` and `pi-pi.ts` `renderCard`.

### Fix 2: Issue #24 — damage-control subagent bypass
**Root cause:** `--no-extensions` in spawn args.
**Fix:** Add prominent `⚠️ LIMITATION` warning in damage-control.ts header docstring.
Pass damage-control extension to subagent spawns in `agent-team.ts` and `subagent-widget.ts`.

### Fix 3: Issue #23 — Purpose gate toggle
**Root cause:** No way to temporarily disable purpose injection.
**Fix:** Add `/purpose` command to toggle on/off, and `/purpose set` to change.

### Fix 4: Issue #12 — tilldone orphaned tool_result
**Root cause:** `sendMessage` with `triggerTurn: true` can create orphaned tool_result after context truncation.
**Fix:** Guard nudge — only send if there's a matching tool_use in the active branch.

### Fix 5: PR #20 — pi-pi truncate widget "No experts found"
**Fix:** Apply 1-line change to wrap message with `truncateToWidth()`.

### Fix 6: PR #1 — CRLF normalization
**Fix:** Add `.replace(/\r\n/g, "\n").replace(/\r/g, "\n")` after `readFileSync` in 6 files.

### Fix 7: PR #7 — Update pi-coding-agent repo URLs
**Fix:** Update README.md URLs.

### Fix 8: PR #25 — theme-cycler persist theme
**Fix:** Add `persistTheme()` helper and call after every `setTheme()`.

### Fix 9: PR #13 — snap-packaged node subprocess fix
**Fix:** Use `process.execPath` in agent-team.ts, agent-chain.ts, subagent-widget.ts, pi-pi.ts.

### Fix 10: PR #3 — Security audit + shared agent loader
**Root cause:** Duplicate `parseAgentFile()` in 3 files with no input validation.
**Fix:** Created `extensions/utils/agent-loader.ts` with name/tools/prompt validation.
Rewired `agent-team.ts`, `agent-chain.ts`, `pi-pi.ts` to use shared loader.
Added 22 tests in `tests/agent-loader.test.ts`.
