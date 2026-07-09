---
name: Orchestration Protocol
version: 1.0.0
---

# Orchestration Protocol — Orchestrator + Cheap Workers

One orchestrator (Claude Fable — this chat, or Claude Code in plan mode) plans, decomposes,
dispatches, and reviews. Cheap workers (Cursor Composer, Codex, Gemini Flash) implement.
The loop runs on two files: `features.json` (what's true) and `PROGRESS.md` (what happened).

## Roles & dispatch table

| Agent                                  | Role                                                                                                                     | Send it                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **Claude Fable / Opus** (orchestrator) | Decompose goal → features.json, write WORKER_TASK files, review diffs, arbitrate, update AGENTS.md when decisions change | The GOAL, review requests, "what next"   |
| **Cursor Composer**                    | Multi-file implementation inside the repo, refactors, UI wiring                                                          | WORKER_TASK files touching many files    |
| **Codex**                              | Well-specified, self-contained tasks; execution fallback when Cursor stalls                                              | WORKER_TASK files with tight allow-lists |
| **Gemini Flash**                       | Cheap bulk work: boilerplate, translations, test scaffolds, doc generation                                               | High-volume low-judgment tasks           |

Rule of thumb: **judgment up, volume down.** Anything requiring a decision that isn't
already written in AGENTS.md / a skill / the task file goes UP to the orchestrator, never
improvised by a worker.

## The loop

```text
┌─ 1. INITIALIZER (orchestrator, once per mission)
│    - Read GOAL.md draft from human (or interview human to write it)
│    - Expand into features.json — every feature: description + verify steps + passes:false
│    - Ensure init/dev-server instructions exist (script or AGENTS.md)
│    - Human approves feature list  ← GATE 0
│
├─ 2. DISPATCH (orchestrator, each cycle)
│    - Pick next passes:false feature(s)
│    - Write WORKER_TASK file(s) from the template (one feature = one task)
│    - Choose worker per dispatch table; hand over the task file
│
├─ 3. EXECUTE (worker, one session per task)
│    - Bearings: pwd → PROGRESS.md → features.json → git log
│    - Baseline check: typecheck + dev server + smoke test
│    - Read the skills the task file names
│    - Implement ONLY the task. Test end-to-end. Flip passes:true.
│    - Commit. Append PROGRESS.md entry.
│
├─ 4. REVIEW (orchestrator)
│    - Read the diff (git diff or PR), PROGRESS.md entry, and verify claims
│    - Check against AGENTS.md hard rules and the task's deny-list
│    - PASS → next dispatch. FAIL → write a correction task (do NOT let the same
│      worker "keep trying" without a rewritten task — that's how context rots)
│    - Recurring failure class? → add a line to AGENTS.md or a skill  ← the flywheel
│
└─ 5. GATE (human)
     - At milestones marked in GOAL.md: human reviews, merges, decides scope changes.
     - Scope changes go through the orchestrator → features.json append. Never verbal.
```

## Context-rot rules (binding for all agents)

1. **Fresh session per task.** Workers never carry a finished task's context into the
   next one. The handoff is the task file + PROGRESS.md + git — nothing else.
2. **Files are memory; context is scratch.** Anything worth remembering goes in
   PROGRESS.md, a commit message, or a doc. If it only exists in a chat window, it
   doesn't exist.
3. **MCP hygiene.** Query → persist result to a file → work from the file → don't
   keep the server chatty in context. Full procedure: `.agents/skills/mcp-hygiene/`.
4. **Compaction is a smell.** If a worker session needs compaction, the task was too
   big — split the feature, don't summarize and push on.
5. **Orchestrator context is precious too.** Workers report back in ≤10 lines
   (what changed, what passed, what's blocked). Never paste full diffs into the
   orchestrator chat — point to commits.

## WORKER_TASK format

Use `docs/templates/WORKER_TASK.template.md`. Non-negotiable fields: objective (one
feature), context pointers (files to read, skills to follow), file allow-list, file
deny-list, exit criteria as binary checklist, test commands, iteration policy
(max attempts before escalating back to orchestrator).

## Escalation triggers (worker → orchestrator, immediately)

- A hard rule in AGENTS.md conflicts with the task
- The task requires touching a deny-listed file
- Baseline check fails and the fix isn't obvious in ≤15 min of work
- Two implementation attempts failed exit criteria
- Anything involving prod config, auth, secrets, or destructive DB ops
