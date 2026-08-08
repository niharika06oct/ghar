# Ghar — AI house design & cost estimator for India

**Ghar** is an Indian take on [Drafted.ai](https://drafted.ai): an interactive tool to
*design* your house — pick your rooms, shape the plot, and see a layout — then get a
grounded construction-cost estimate. Everything is localised for how homes are actually
built in India: **metric (m² / sq ft)**, multi-floor by default (compact plots), flat RCC
roofs, Vaastu guidance, and Indian room types like the **pooja room**, **drawing room**,
and **servant room**.

The whole experience is designed to run inside a 340×724 phone mockup with a warm,
bright, modern-Indian palette (terracotta, gold, pink, green).

## The flow

Ghar follows Drafted's three-step design journey:

| Step | Screen | Status |
|------|--------|--------|
| **1. Room List** | Build your wishlist from an Indian room catalog | ✅ `Ghar Design.dc.html` |
| **2. Shape & Place** | Pick the plot footprint, place & stack rooms | 🔜 planned |
| **3. Results** | Floor plan, 3D massing, and cost estimate | ✅ (cost) `Ghar.dc.html` |

### Step 1 — Room List builder (`Ghar Design.dc.html`)
- **Indian room catalog** grouped into *Beds & Baths / Living / Outdoor / Utility*,
  including pooja room, drawing room, family living, verandah, courtyard, servant room,
  car parking and more.
- Per-room **+/− counters** with sensible **MAX** caps.
- **S / M / L size toggle** per room, with live m² for each option.
- Running **total floor area**, room count, and a **Room List Capacity** meter.
- Auto floor-stacking: Ghar figures out how many floors (**G + N**) your rooms need on a
  typical compact Indian plot and shows a flat-roof stacking note.
- A **"My Rooms"** board with colour-coded tiles and an *area-by-zone* breakdown.

### Cost estimator (`Ghar.dc.html`)
City-based base rates × Vaastu-aware layout → a construction-cost estimate with a
tier toggle (Economy / Standard / Premium), cost breakdown, and 3D massing preview.

## Tech

These are **Design Component** files (`.dc.html`) — a small React-backed template
runtime (`support.js`, generated, do-not-edit). Each file has:

- an `<x-dc>` template using `{{ expr }}` interpolation, `<sc-if>`, `<sc-for>`, and
  `onClick="{{ fn }}"` bindings, and
- a `<script type="text/x-dc">` block with a `class Component extends DCLogic`
  (`state`, `setState`, `renderVals()`).

### Running locally
The runtime loads React from a CDN, so serve over HTTP (not `file://`):

```bash
npx serve .
# then open "Ghar Design.dc.html" in a browser
```

## Design system
- **Palette:** terracotta `#c8794f`, gold `#e0a458`, pink `#ec6a86`, green `#5cb87a`,
  dark hero `#12100d`, warm bg `#fbf8f2`.
- **Type:** Bricolage Grotesque (headings), IBM Plex Sans (body), IBM Plex Mono (labels).

---

*A localised design study inspired by Drafted.ai — built for Indian homes.*
