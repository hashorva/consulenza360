---
status: draft | approved | in-progress | done
owner: { { HUMAN } }
orchestrator: Claude Fable
created: { { DATE } }
---

# Goal

## Mission (2–4 sentences, outcome not tasks)

{{e.g. Ship the Fund Detail page: tabs Overview/Performance/Fees/Rules, data from the
Worker only, Luma-styled, live on staging behind auth.}}

## Why now / forcing function

{{deadline, dependency, campaign date}}

## In scope

- {{...}}

## Explicitly OUT of scope (workers: do not touch)

- {{...}}

## Constraints

- Hard rules: see AGENTS.md PROJECT block — all apply.
- {{mission-specific: e.g. no new dependencies without orchestrator approval}}

## Human gates

- GATE 0: feature list approved before any dispatch
- GATE {{n}}: {{e.g. staging review before merging to main}}

## Source of truth

The binary checklist lives in `features.json`. This file is narrative only —
if they disagree, features.json wins.
