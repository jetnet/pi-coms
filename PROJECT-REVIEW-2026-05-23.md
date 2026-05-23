# Project Review — 2026-05-23

## Scope assumptions

- Purpose: Pi Coding Agent extension playground and examples.
- Intended usage: local developer tooling, extension demos, and multi-agent orchestration experiments.
- In scope: correctness, maintainability, docs accuracy, regression tests, and practical local-tool safety.
- Out of scope: production SaaS hardening, hosted multi-tenant threat model, and large feature work.

## Inventory

- Stack: TypeScript extensions loaded by Pi/jiti; Node APIs; YAML dependency; tests via `npx tsx --test`.
- Entry points: `extensions/*.ts`, `scripts/coms-net-server.ts`, `justfile` recipes.
- Shared module reviewed: `extensions/utils/agent-loader.ts`.
- Agent definitions: `.pi/agents/**/*.md`, `.pi/agents/teams.yaml`, `.pi/agents/agent-chain.yaml`.
- Tests: `tests/agent-loader.test.ts`.
- Docs: `README.md`, `TOOLS.md`, `BATCH-FIX-PLAN.md`, specs in `specs/`.

## Baseline commands

- `npx tsx --test tests/agent-loader.test.ts` — passed before changes: 22 tests.
- `bun test tests/agent-loader.test.ts` — not runnable in this environment: `bun` not found.
- `bunx tsc ...` — not runnable in this environment: `bunx` not found.
- `npx tsc --noEmit ...` — blocked by missing local Pi/Node type dependencies, not used as an acceptance gate.

## Findings and plan

### Must-fix: checked-in Pi-Pi expert agents were rejected by the shared loader

Evidence:

- Direct loader check over `.pi/agents/**/*.md` rejected 11 files.
- Rejection reason was `systemPrompt: suspicious pattern: backtick command substitution`.
- Affected files included `.pi/agents/pi-pi/ext-expert.md` and the other Pi-Pi expert prompts, which contain normal Markdown fenced code examples.

Impact:

- `pi-pi` could silently start with no usable experts.
- Any agent definition using Markdown code spans/fences could be rejected despite being valid documentation.

Implemented fix:

1. Changed `extensions/utils/agent-loader.ts` to allow Markdown backticks.
2. Kept higher-confidence prompt checks for `$()`, shell piping, null bytes, `eval(...)`, destructive command chains, and length limits.
3. Added a regression test for Markdown inline/fenced command examples.
4. Added a repository fixture test that loads every checked-in `.pi/agents/**/*.md` file.

Acceptance:

- `npx tsx --test tests/agent-loader.test.ts` now passes 23 tests.

### Should-fix: loader errors were hidden in orchestrator extensions

Evidence:

- `agent-team.ts`, `agent-chain.ts`, and `pi-pi.ts` formatted only warning-severity loader issues.
- Error-severity issues caused agents to be skipped without diagnostic output.

Impact:

- Bad agent files were hard to diagnose from the UI/terminal.

Implemented fix:

1. Log all validation issues, including errors, through the existing per-extension prefixes.
2. Keep behavior unchanged otherwise: invalid agents are still rejected.

### Nice-to-have: tool reference omitted grep/find/ls

Evidence:

- Agent definitions and subagent launches use `grep`, `find`, and `ls`.
- Pi's installed tool type declarations include `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`.
- `TOOLS.md` documented only four tools.

Implemented fix:

1. Updated `TOOLS.md` with concise signatures for `grep`, `find`, and `ls`.

## Files changed

- `extensions/utils/agent-loader.ts` — allow Markdown backticks; clarify prompt validation boundary.
- `tests/agent-loader.test.ts` — add Markdown-code regression and checked-in agent fixture coverage.
- `extensions/agent-team.ts` — log all loader validation issues.
- `extensions/agent-chain.ts` — log all loader validation issues.
- `extensions/pi-pi.ts` — log all loader validation issues.
- `TOOLS.md` — document `grep`, `find`, and `ls`.

## Final validation

- `npx tsx --test tests/agent-loader.test.ts` — passed: 23 tests, 7 suites, 0 failures.
- `git diff --stat` after implementation: 6 files changed, 79 insertions, 15 deletions.

## Remaining low-hanging recommendations

1. Add a repo-standard test/check recipe once the package-manager decision is settled in this environment (`bun` is documented but not available here).
2. Add local dev dependencies/types if TypeScript compile checking should be part of CI.
3. Add unit tests for damage-control path matching and bash rule matching; that code has important safety semantics but no visible tests in this repo.
4. Add smoke tests for `pi-pi` expert discovery and `agent-team`/`agent-chain` agent discovery.
