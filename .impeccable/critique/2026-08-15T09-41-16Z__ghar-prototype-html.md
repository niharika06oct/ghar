---
target: ghar-prototype.html + Ghar.dc.html (Home visualization & cost estimator)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-15T09-41-16Z
slug: ghar-prototype-html
---
# Design Critique — Ghar (Home visualization & cost estimator)

Method: dual-agent (A + B). Target: ghar-prototype.html (Plot→Rooms→Layout) + Ghar.dc.html / Ghar Design.dc.html / Ghar Estimate.dc.html (cost estimator). Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Real-time overflow blocking strong; async steps fail with no retry |
| 2 | Match System / Real World | 4 | India-first typology, floor shorthand, INR (L/Cr) formatting |
| 3 | User Control and Freedom | 2 | editReorder silent no-op on single-room floors |
| 4 | Consistency and Standards | 2 | T-shape fraction drift (0.66 vs 0.65); button vs div onClick |
| 5 | Error Prevention | 3 | Proactive canAdd/canSize overflow gating is genuinely good |
| 6 | Recognition Rather Than Recall | 3 | Visual catalog helps; 8-item Priorities taxes recall |
| 7 | Flexibility and Efficiency | 2 | No fast-path/skip for returning users |
| 8 | Aesthetic and Minimalist Design | 3 | Cohesive warm palette; deliberate type system |
| 9 | Error Recovery | 1 | Raw JS/network error strings leak into UI |
| 10 | Help and Documentation | 2 | Vaastu/setback copy excellent; cost formula unexplained |
| Total | | 25/40 | Acceptable — significant improvements needed |

## Design Specificity Verdict
Genuinely specific — India-first domain logic (setback gating, pooja/servant room types, G/G+1 shorthand, flat RCC default, woven Vaastu, squarified-treemap layout). Not a reskinned form wizard. Clears the "authored for this user" bar.

Deterministic scan: DEGRADED regex-fallback (parser modules unavailable — undercount). 4 findings:
- ghar-prototype.html:159 layout-transition (genuine)
- Ghar Design.dc.html:704 layout-transition (genuine)
- ghar-prototype.html:197 codex-grid-background (false positive — intentional blueprint grid)
- ghar-prototype.html:73 dark-glow (false positive — page bg is light cream)
Detector missed the more serious constants-drift and accessibility-regression issues (undercount).

Visual overlays: NOT available — browser navigate tool is https-only, local server is plain HTTP, file:// blocked. No screenshots/overlay obtained.

## What's Working
1. Domain fluency as design — Vaastu/setback copy teaches while gating.
2. Budget-constrained mechanic — plot×setback×shape×floors, blocks overflow in real time.
3. 3-direction SVG reveal is a well-built peak.

## Priority Issues
- [P1] Accessibility regression: button (prototype) vs div onClick (DC files) for equivalent toggles → keyboard/AT users locked out. Fix: standardize on button. (/impeccable harden)
- [P1] Two cognitive-load violations back to back: room catalog (830-854, >4 no grouping) + 8-option Priorities (2396-2401/3043-3050). Fix: group catalog, shorten Priorities. (/impeccable layout)
- [P2] Constants drift: T-shape 0.66 vs 0.65; CAP_TARGET=420 fixed vs plot-driven fits check → pass Rooms, fail Shape on same input. Fix: single shared source + regression check. (/impeccable harden)
- [P2] Two failure feels for same over-budget event: preventive (Rooms) vs after-the-fact fitCard (Shape). Fix: one pattern. (/impeccable clarify)
- [P3] Raw error strings leaked (state.iv.error=String(err.message), fetchNextQuestion ~2565 + repeated). Fix: branded copy + retry, log raw. (/impeccable harden)

## Persona Red Flags
- Casey (mobile): room catalog + adjacent Priorities = stacked high-load drop-off.
- Jordan (first-timer): well served by Vaastu/setback copy, but cost formula & vaastu() opaque.
- Riley (stress): CAP_TARGET vs fits contradiction; editReorder dead control; raw error paths.

## Minor Observations
- No clear end-state after cost reveal (needs visual confirmation) — weakens peak-end.
- layout-transition thrash at :159 and :704 — use transform/opacity.
- Blueprint grid + terracotta glow are intentional/on-theme — detector false positives.

## Questions to Consider
- Should the premium peak anchor on the design, not the cost number?
- Is facing-only Vaastu a placeholder or permanent (overclaiming precision)?
- Why did DC files regress to div onClick vs the prototype's accessible buttons?
