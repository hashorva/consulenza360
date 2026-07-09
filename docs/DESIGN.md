---
name: Consulenza360 — Design & UI rules
loaded: on demand (any UI/component/styling task)
---

# Design & UI

## Product density (this project's override — takes priority)

Luma should make the UI softer and more refined, but compact ISIN rows,
scan-friendly tables, and the required **44–52px row height** still take priority
over Luma's default airiness.

## Luma style

- Luma is the shadcn/ui visual baseline: rounded geometry, soft elevation, breathable
  spacing, a calm product-app rhythm.
- Never use the deprecated/default shadcn style or generic New York/default
  components for new UI.
- Procedure for installing/applying components: `.agents/skills/shadcn-luma/SKILL.md`
  (includes the preset code and the `apply` vs `--only theme` rule).
- When adapting existing components manually: update radius, surface treatment,
  shadows, gaps, and control sizing to match Luma — not only theme tokens. Luma
  changes geometry and spacing, not just colors.

## Theme & components

- Stone light/dark theme; cyan chart accents.
- Recharts for charts; TanStack Table for list state; Hugeicons free icons.
- Avoid arbitrary Tailwind bracket values when a scale token is close
  (`mb-14`/`mb-16`, not `mb-[60px]`).

## Required UI

- The dashboard is the first screen. Do not add a landing page.
- Minimal sidebar with Dashboard and Settings.
- KPI cards: active ISINs, present count, errors, latest run.
- Cyan area chart for historical counts.
- Cyan/stone status donut for latest result split.
- Compact full-width ISIN rows (~44–52px).
- Filtering, sorting, add, soft-delete, manual run trigger.
- Live execution log visible during active runs (poll `GET /api/runs/:run_id/logs`
  every 4s while active; stop on completed/failed/blocked).
