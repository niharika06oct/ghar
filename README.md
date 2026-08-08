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
| **0. Describe** | Natural-language brief → full design + watercolor render (AI, backend) | ✅ `server/` + `ghar-prototype.html` |
| **1. Plot** | Plot size, facing, footprint shape, floors → a fixed built-up **budget** | ✅ `ghar-prototype.html` |
| **2. Rooms** | Add rooms **within** that budget — overflow is blocked | ✅ `ghar-prototype.html` |
| **3. Layout** | Auto-fit rooms into the footprint + editable **2D plan** | ✅ `ghar-prototype.html` |
| **Cost** | 3D massing, cost breakdown, Vaastu score | ✅ `Ghar.dc.html` |

## 📤 Shareable prototype — `ghar-prototype.html`

A **self-contained HTML file** (no build, no dependencies) covering the full
**Plot → Rooms → Layout** flow. Just **double-click it** or send it to anyone — it opens
directly in any browser. This is the file to share.

The **manual** design flow, the watercolor gallery, and the hero all work fully offline from
`file://`. The one feature that needs a server is **"Design from a sentence"** (below): it calls
OpenAI, and the API key must stay server-side, so that path is served by the small backend in
`server/` rather than embedded in the HTML.

### Watercolor design gallery
The landing page opens on a full-bleed **watercolor architectural hero banner** and a row of
**five ready homes**, each illustrated with a hand-painted **watercolor elevation render**
(embedded in the file as base64 — no external image dependencies, still a single shareable
file at ~1.8 MB). The five homes lay out in **one horizontal line** you can swipe through, or
step through a card at a time with the **‹ / › scroll arrows**. Opening a home shows its
watercolor front elevation alongside generated per-floor plans; rear/side views fall back to
the parametric SVG elevation generator. Homes without an embedded render degrade gracefully to
the SVG elevation.

### Design from a sentence (AI, backend-powered)
On the **Plot** step there's a **"Describe your dream home"** box. Type a plain-language brief
— *"a modern 3BHK duplex on a small east-facing city plot, minimal, with a pooja room and covered
parking"* — and Ghar drafts a complete home in the **same look & polish as the five curated
renders**: a snapped plot, Vaastu-sane facing, a full room list, and a **hand-painted watercolor
elevation**. The generated home drops straight into the normal Plot → Rooms → Layout flow, so you
can keep editing it by hand.

**How the "Ghar feel" stays consistent** — a two-stage pipeline in `server/ghar-core.js`:
1. **Extract** — the brief goes to OpenAI with **Structured Outputs** (`strict` JSON schema +
   an intake-architect system prompt). The model can only pick from the app's real room types,
   the four footprint shapes, and **five locked palette tokens** (`terracotta, charcoal,
   coastal_blue, sage_green, ivory_gold`) that map 1:1 to the curated designs.
2. **Normalize (deterministic)** — code-side clamping guarantees the essentials (staircase,
   kitchen, drawing room, a bedroom, a bath), snaps the plot to a real preset, and **enforces the
   capacity constraint** (`plot × setback × shape × floors`) by shrinking/trimming the least
   essential rooms until the home fits — the same rule the manual flow uses.
3. **Render** — a subject string is built from the normalized home and a **locked Universal
   Suffix** (never user-editable) is appended, pinning the output to the watercolor series, then
   **DALL·E 3** paints the elevation.

This needs the **backend** (below): the OpenAI key is held **server-side only** and is never
shipped in the HTML. Opened as a bare `file://` (no server), the box degrades to a clear
"run the server" message and the manual plot flow still works.

#### Running the backend
Dependency-free — Node's built-ins only, no `npm install`:

```bash
export OPENAI_API_KEY=sk-...        # or copy .env.example → .env
npm start                            # = node server/server.js
# open http://localhost:8787/ghar-prototype.html
```

`POST /api/design {brief}` → `{design, imageDataUrl}`. Everything else is served statically.

### Plot-first, budget-constrained
You pick the **plot first**. Ghar computes a hard built-up **capacity**
(`plot × setback × shape × floors`) and the Rooms step enforces it: the `+` button and any
size-up that would overflow the plot are **disabled** ("PLOT FULL"), with a live
*used / capacity* meter. **Total room area can never exceed the plot you chose.**

### Editable 2D layout
The Layout step auto-fits your rooms into the footprint with a *squarified-treemap* packing
(gapless, edge-to-edge — verified **100% fill** on Rectangle / L / T / U) and stacks them the
Indian way: parking, drawing room, kitchen and pooja low; bedrooms and baths above; terrace
on top. Then you **edit the plan**: **drag** a room onto another to swap, **tap** to select
and **resize (S/M/L)**, **move up/down a floor**, **reorder**, or **delete** — plus
**auto-arrange** to reset. Switch floors with the G / F1 / F2… tabs.

Every screen is a **fully responsive website**: a two-column workspace on laptop
(inputs + a live sticky preview panel) that collapses to a single-column, app-style
layout with a sticky action bar on phones. No fixed device frame.

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

### Step 2 — Shape & Floors (`Ghar Design.dc.html`)
- **Plot size** presets (metric m² shown) and **entrance facing**.
- **Footprint shape** — Rectangle / L / T / U — each with a live top-down preview.
- A **floor stepper** (defaults to what your room list needs; compact Indian plots
  stack upward) with a live **3D massing** model of the stacked floor plates.
- **Fit check:** built-up area vs. the room list, with municipal setbacks reserved,
  so you know instantly whether to add a floor or size up the plot.

### Step 3 — Cost estimator (`Ghar.dc.html`)
City-based base rates × Vaastu-aware layout → a construction-cost estimate with a
live tier toggle (Economy / Standard / Premium), itemised cost breakdown, timeline,
Vaastu score, and a 3D massing preview.

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
