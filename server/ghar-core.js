'use strict';
/*
 * ghar-core.js — the "Ghar feel" engine (dependency-free, CommonJS).
 *
 * This is the single source of truth for turning a free-text house brief into a
 * normalized Ghar design object with the same look & polish as the five curated
 * homes. It holds:
 *
 *   - the design contracts mirrored from ghar-prototype.html (SHAPES, SETBACK,
 *     CATALOG, plot presets) so server-side normalization matches the client;
 *   - the five real palettes (tokens map to actual DESIGNS style{} objects AND
 *     to watercolor prompt fragments);
 *   - the OpenAI Structured-Outputs JSON schema + system prompt for extraction;
 *   - the LOCKED Universal System Suffix that every image prompt must end with;
 *   - normalize() — deterministic Vaastu / plot-snap / capacity clamping;
 *   - buildSubject() / buildImagePrompt() — subject string + locked suffix.
 *
 * Nothing here touches the network or the filesystem; server.js wires it to
 * OpenAI. Keeping it isolated means it is trivially unit-testable with `node`.
 */

/* ============================ DESIGN CONTRACTS ============================ */
/* Mirrored 1:1 from ghar-prototype.html — keep in sync if the HTML changes. */

var SETBACK = 0.72;   // buildable fraction of plot after municipal setbacks
var EPS = 0.5;        // m² tolerance for the capacity constraint

var SHAPES = {
  rect: { label: 'Rectangle', frac: 1.00 },
  L:    { label: 'L-shape',   frac: 0.82 },
  T:    { label: 'T-shape',   frac: 0.66 },
  U:    { label: 'U-shape',   frac: 0.78 }
};

// [width_ft, depth_ft] — the exact presets offered on the plot step.
var PLOT_PRESETS = [[20, 30], [30, 40], [30, 50], [40, 60], [50, 80], [40, 40]];

// id -> { max, sizes:{S,M,L}, floor } — mirrored from CATALOG.
var CATALOG = {
  master:  { max: 2, sizes: { S: 12, M: 16, L: 22 } },
  bedroom: { max: 5, sizes: { S: 10, M: 13, L: 17 } },
  guest:   { max: 2, sizes: { S: 9,  M: 12, L: 15 } },
  bath:    { max: 6, sizes: { S: 3,  M: 4.5, L: 6 } },
  toilet:  { max: 4, sizes: { S: 2,  M: 3,  L: 4 } },
  drawing: { max: 1, sizes: { S: 14, M: 20, L: 28 } },
  hall:    { max: 2, sizes: { S: 12, M: 18, L: 25 } },
  dining:  { max: 1, sizes: { S: 8,  M: 12, L: 16 } },
  kitchen: { max: 2, sizes: { S: 7,  M: 10, L: 14 } },
  pooja:   { max: 1, sizes: { S: 2,  M: 3.5, L: 5 } },
  study:   { max: 2, sizes: { S: 6,  M: 9,  L: 12 } },
  balcony: { max: 6, sizes: { S: 3,  M: 5,  L: 8 } },
  terrace: { max: 1, sizes: { S: 15, M: 30, L: 50 } },
  verandah:{ max: 2, sizes: { S: 6,  M: 10, L: 14 } },
  court:   { max: 1, sizes: { S: 6,  M: 12, L: 20 } },
  parking: { max: 3, sizes: { S: 12, M: 18, L: 30 } },
  store:   { max: 3, sizes: { S: 3,  M: 5,  L: 8 } },
  utility: { max: 2, sizes: { S: 3,  M: 5,  L: 7 } },
  stairs:  { max: 2, sizes: { S: 4,  M: 5.5, L: 7 } },
  servant: { max: 1, sizes: { S: 6,  M: 9,  L: 12 } }
};
var ROOM_IDS = Object.keys(CATALOG);
var FLOORS_MAX = 4;

/* ============================ PALETTES ============================ *
 * Five tokens, one per curated home. Each carries the exact style{} object
 * (for any SVG fallback) AND a watercolor prompt fragment (for image gen).
 * These replace the spec's mismatched tokens so the LLM can only pick a
 * palette the app actually ships.
 */
var PALETTES = {
  terracotta: {
    name: 'Terracotta',
    style: { wall: '#f2e4d5', band: '#b85f3d', trim: '#fff8ef', glass: '#9bb8c4', door: '#75432e' },
    prompt: 'rich terracotta and clay-red accents against clean white render, warm teak wood panels, bold burnt-orange feature wall, large dark-framed glazing'
  },
  charcoal: {
    name: 'Charcoal',
    style: { wall: '#e5e3df', band: '#34373b', trim: '#f6f3ed', glass: '#8195a0', door: '#45372f' },
    prompt: 'bold charcoal-grey and bright white palette, exposed concrete and dark metal, high contrast, expansive reflective glazing, sleek minimalist facade'
  },
  coastal_blue: {
    name: 'Coastal Blue',
    style: { wall: '#edf4f3', band: '#477f95', trim: '#ffffff', glass: '#92bdcf', door: '#71513c' },
    prompt: 'fresh coastal palette, crisp white render with deep teal-blue accents, light stone cladding, generous glass, bright and airy'
  },
  sage_green: {
    name: 'Sage Green',
    style: { wall: '#e7ebdf', band: '#56705a', trim: '#f8f4e9', glass: '#8aa5a0', door: '#604a35' },
    prompt: 'refined sage-green and warm stone palette, deep olive-green accents, natural wood louvers, lush architectural planting, biophilic modern look'
  },
  ivory_gold: {
    name: 'Ivory Gold',
    style: { wall: '#f4ecd9', band: '#b49352', trim: '#fffaf0', glass: '#9caaad', door: '#694b2d' },
    prompt: 'luxe ivory and champagne-gold palette, polished stone and brushed-brass accents, dark teak, high-end contemporary elegance'
  }
};
var PALETTE_TOKENS = Object.keys(PALETTES);

/* ============================ LLM CONTRACTS ============================ */

// OpenAI Structured Outputs schema. strict:true → every property required and
// additionalProperties:false, so the model must return exactly this shape.
var DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'tagline', 'palette_token', 'plot_width_ft', 'plot_depth_ft',
             'facing', 'shape', 'floors_count', 'rooms'],
  properties: {
    name: { type: 'string', description: 'Short evocative home name, 1-3 words, Indian-modern feel.' },
    tagline: { type: 'string', description: 'One-line description of the home (max ~12 words).' },
    palette_token: { type: 'string', enum: PALETTE_TOKENS },
    plot_width_ft: { type: 'integer', description: 'Plot frontage in feet (a best guess; will be snapped to a preset).' },
    plot_depth_ft: { type: 'integer', description: 'Plot depth in feet.' },
    facing: { type: 'string', enum: ['North', 'East', 'South', 'West'] },
    shape: { type: 'string', enum: ['rect', 'L', 'T', 'U'] },
    floors_count: { type: 'integer', enum: [1, 2, 3, 4] },
    rooms: {
      type: 'array',
      description: 'The rooms in the home. Only include rooms the brief implies.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'count', 'size'],
        properties: {
          type: { type: 'string', enum: ROOM_IDS },
          count: { type: 'integer' },
          size: { type: 'string', enum: ['S', 'M', 'L'] }
        }
      }
    }
  }
};

var SYSTEM_PROMPT = [
  'You are the intake architect for "Ghar", an AI house-design tool for Indian homes.',
  'Turn the user\'s free-text brief into a single structured design object.',
  '',
  'RULES — follow every one:',
  '- Indian homes are compact and stack UPWARD. Prefer 2-3 floors unless the brief clearly wants a bungalow.',
  '- Always include a staircase ("stairs") and car parking ("parking") on a multi-floor home.',
  '- Include a pooja room unless the user explicitly says no pooja.',
  '- Map bedroom needs sensibly: a "3BHK" = 1 master + 2 bedroom; "2BHK" = 1 master + 1 bedroom, etc.',
  '- Give every home at least one bathroom; add more for larger homes.',
  '- Choose the palette_token whose mood best fits the brief (warm/traditional -> terracotta or ivory_gold;',
  '  modern/minimal -> charcoal; airy/coastal -> coastal_blue; natural/garden -> sage_green).',
  '- Vaastu: a kitchen leans South-East, master bedroom South-West, pooja North-East — you do NOT place rooms,',
  '  but pick a sensible entrance facing (default North or East) that suits the brief.',
  '- Estimate plot size from the brief; if unstated, assume a typical urban plot (~30x40 ft).',
  '- Keep room counts within reason for the plot; do not exceed what a compact Indian plot can hold.',
  'Return ONLY the structured object.'
].join('\n');

// LOCKED. Every image prompt MUST end with this. Never exposed to or editable
// by the user. This pins the output to a consistent, MODERN watercolor style —
// crisp and contemporary, not loose or old-fashioned.
var UNIVERSAL_SUFFIX = [
  'Rendered as a CRISP MODERN architectural watercolor illustration — clean and contemporary, editorial quality, not photorealistic.',
  'Controlled precise washes with smooth flat color fields (NOT loose, blotchy or bleeding), sharp confident straight ink linework,',
  'rich saturated contemporary palette with strong contrast, bold directional daylight and clean crisp shadows.',
  'Sleek modern Indian architecture: bold rectilinear massing, large floor-to-ceiling glazing, slim mullions, cantilevered slabs,',
  'a mix of exposed concrete, stone cladding and warm wood accents, minimalist detailing, flat RCC roof with a thin parapet.',
  'Three-quarter front elevation of a single detached contemporary house on a clean landscaped plot,',
  'framed with a generous crisp white margin, clean gradient sky, tidy modern landscaping with a few sculptural plants and one slender tree.',
  'Cohesive with a premium curated series of modern Indian home illustrations: sleek, aspirational, architectural, high-end.',
  'No text, no people, no moving cars, no watermark, no frame border, no photographic realism, no muddy or faded colors, no rustic or vintage look.'
].join(' ');

/* ============================ NORMALIZATION ============================ */

function clampInt(n, lo, hi) {
  n = Math.round(Number(n) || 0);
  return n < lo ? lo : (n > hi ? hi : n);
}

// Snap an arbitrary [w,d] to the nearest offered preset by plot area.
function snapPlot(w, d) {
  var target = (Number(w) || 30) * (Number(d) || 40);
  var best = PLOT_PRESETS[0], bestDiff = Infinity;
  PLOT_PRESETS.forEach(function (p) {
    var diff = Math.abs(p[0] * p[1] - target);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  });
  return { pw: best[0], pd: best[1] };
}

function plotAreaM2(pw, pd) { return pw * pd * 0.092903; }
function footprintM2(pw, pd, shape) { return plotAreaM2(pw, pd) * SETBACK * SHAPES[shape].frac; }
function capacityM2(pw, pd, shape, floorsN) { return footprintM2(pw, pd, shape) * floorsN; }

function roomsArea(rooms) {
  var s = 0;
  for (var id in rooms) {
    var def = CATALOG[id]; if (!def) continue;
    s += def.sizes[rooms[id].size] * rooms[id].count;
  }
  return s;
}

// Order rooms trim first (least essential -> most essential) when over capacity.
var TRIM_ORDER = ['balcony', 'terrace', 'verandah', 'court', 'store', 'utility',
                  'servant', 'study', 'guest', 'dining', 'hall', 'toilet',
                  'bedroom', 'pooja', 'bath', 'parking', 'kitchen', 'drawing',
                  'master', 'stairs'];

/*
 * Turn the raw LLM object into a validated Ghar design that the client can load
 * directly (same shape as a DESIGNS[] entry). Deterministic and total: any
 * malformed field is coerced to a safe default.
 */
function normalize(raw) {
  raw = raw || {};

  var palette_token = PALETTE_TOKENS.indexOf(raw.palette_token) >= 0 ? raw.palette_token : 'terracotta';
  var shape = SHAPES[raw.shape] ? raw.shape : 'rect';
  var facing = ['North', 'East', 'South', 'West'].indexOf(raw.facing) >= 0 ? raw.facing : 'North';
  var floorsN = clampInt(raw.floors_count, 1, FLOORS_MAX);
  var snapped = snapPlot(raw.plot_width_ft, raw.plot_depth_ft);

  // ---- collapse the room array into a { id: {count,size} } map, clamped ----
  var rooms = {};
  (Array.isArray(raw.rooms) ? raw.rooms : []).forEach(function (r) {
    if (!r || !CATALOG[r.type]) return;
    var def = CATALOG[r.type];
    var size = ['S', 'M', 'L'].indexOf(r.size) >= 0 ? r.size : 'M';
    var count = clampInt(r.count, 0, def.max);
    if (count <= 0) return;
    if (rooms[r.type]) { // merge duplicates the model may emit
      rooms[r.type].count = clampInt(rooms[r.type].count + count, 1, def.max);
    } else {
      rooms[r.type] = { count: count, size: size };
    }
  });

  // ---- guarantee the essentials the Ghar feel depends on ----
  if (!rooms.stairs && floorsN > 1) rooms.stairs = { count: 1, size: 'S' };
  if (!rooms.drawing) rooms.drawing = { count: 1, size: 'M' };
  if (!rooms.kitchen) rooms.kitchen = { count: 1, size: 'M' };
  if (!rooms.master && !rooms.bedroom) rooms.master = { count: 1, size: 'M' };
  if (!rooms.bath && !rooms.toilet) rooms.bath = { count: 1, size: 'M' };

  // ---- capacity clamp: never let rooms exceed the buildable plot ----
  var cap = capacityM2(snapped.pw, snapped.pd, shape, floorsN);
  var guard = 0;
  while (roomsArea(rooms) > cap + EPS && guard++ < 200) {
    var trimmed = false;
    // 1) try to shrink an oversized room one size step
    for (var i = 0; i < TRIM_ORDER.length && !trimmed; i++) {
      var id = TRIM_ORDER[i], rm = rooms[id];
      if (rm && rm.size === 'L') { rm.size = 'M'; trimmed = true; }
      else if (rm && rm.size === 'M') { rm.size = 'S'; trimmed = true; }
    }
    if (trimmed) continue;
    // 2) then drop a unit of the least-essential room present
    for (var j = 0; j < TRIM_ORDER.length && !trimmed; j++) {
      var tid = TRIM_ORDER[j], tr = rooms[tid];
      if (tr && tid !== 'stairs' && tid !== 'kitchen' && tid !== 'master') {
        tr.count -= 1;
        if (tr.count <= 0) delete rooms[tid];
        trimmed = true;
      }
    }
    if (!trimmed) break; // can't reduce further without breaking essentials
  }

  var pal = PALETTES[palette_token];
  return {
    id: 'ai',
    name: (raw.name && String(raw.name).slice(0, 40)) || (pal.name + ' Home'),
    tag: (raw.tagline && String(raw.tagline).slice(0, 90)) || 'A custom Ghar design',
    palette_token: palette_token,
    pw: snapped.pw,
    pd: snapped.pd,
    facing: facing,
    shape: shape,
    floorsN: floorsN,
    style: Object.assign({ cols: 2, porch: true, balcony: !!rooms.balcony }, pal.style),
    rooms: rooms,
    // Soft prefs from the interview (accessibility / priorities / feeling). Passthrough
    // only — never part of DESIGN_SCHEMA. Safe for existing callers.
    preferences: raw.preferences || {}
  };
}

/* ============================ PROMPT BUILDERS ============================ */

var FACING_HINT = { North: 'north-facing', East: 'east-facing', South: 'south-facing', West: 'west-facing' };
var SHAPE_HINT = {
  rect: 'clean rectangular footprint',
  L: 'L-shaped plan wrapping a small side court',
  T: 'T-shaped plan with a projecting central bay',
  U: 'U-shaped plan embracing a central courtyard'
};

// Human-readable subject string describing THIS home (no style words — those
// live in the locked suffix).
function buildSubject(d) {
  var pal = PALETTES[d.palette_token] || PALETTES.terracotta;
  var beds = (d.rooms.master ? d.rooms.master.count : 0) + (d.rooms.bedroom ? d.rooms.bedroom.count : 0);
  var floorLabel = d.floorsN <= 1 ? 'single-storey' : ('G+' + (d.floorsN - 1) + ' (' + d.floorsN + '-storey)');
  var features = [];
  if (d.rooms.balcony) features.push('cantilevered balconies');
  if (d.rooms.verandah) features.push('a shaded front verandah');
  if (d.rooms.court) features.push('an internal courtyard');
  if (d.rooms.parking) features.push('a covered car porch');
  if (d.rooms.pooja) features.push('a small pooja alcove window');
  if (d.rooms.terrace) features.push('an accessible flat terrace');
  if (d.style && d.style.voidLiving) features.push('a double-height living volume');

  var parts = [
    'A ' + floorLabel + ' modern-Indian family house',
    'on a ' + d.pw + 'x' + d.pd + ' ft ' + FACING_HINT[d.facing] + ' plot,',
    SHAPE_HINT[d.shape] + ',',
    (beds ? beds + '-bedroom, ' : '') + pal.prompt + '.',
    features.length ? 'Features ' + features.join(', ') + '.' : ''
  ];
  // Optional extras from ticked direction improvements (Stage 1 render-only deltas).
  if (d._subjectExtra) parts.push(String(d._subjectExtra));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// Full image prompt = subject + LOCKED suffix. Always call this for image gen.
function buildImagePrompt(d) {
  return buildSubject(d) + ' ' + UNIVERSAL_SUFFIX;
}

/* ============================ ADAPTIVE INTERVIEW ============================ */

// Strict Structured Outputs schema for POST /api/next-question.
// Every property required; use empty arrays / sentinel question when done:true.
var QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'question'],
  properties: {
    done: { type: 'boolean', description: 'true when the interview is complete (no more questions).' },
    question: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'layer', 'kind', 'q', 'options', 'allowDK', 'fields'],
      properties: {
        id: { type: 'string', description: 'Stable question id, e.g. q_people. Empty string when done.' },
        layer: {
          type: 'string',
          description: 'Semantic layer: people | land | daily | aspiration | accessibility | priorities | open | done'
        },
        kind: {
          type: 'string',
          enum: ['choice', 'counter', 'plot', 'pick2', 'imagepicker', 'freetext']
        },
        q: { type: 'string', description: 'The question text shown to the user. Empty when done.' },
        options: {
          type: 'array',
          description: 'Choice / pick2 / imagepicker options. Empty array for counter/plot/freetext.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['v', 'label'],
            properties: {
              v: { type: 'string' },
              label: { type: 'string' }
            }
          }
        },
        allowDK: { type: 'boolean', description: 'Whether "I don\'t know" is a valid answer.' },
        fields: {
          type: 'array',
          description: 'For kind=counter: field names (e.g. adults, children, elders). Empty otherwise.',
          items: { type: 'string' }
        }
      }
    }
  }
};

var INTERVIEW_SYSTEM_PROMPT = [
  'You are a warm, patient Indian architect doing an intake interview for "Ghar",',
  'an AI house-design tool. Your job is to slowly figure out HOW the family lives —',
  'not to talk architecture at them.',
  '',
  'HARD RULES:',
  '- Ask about LIFE, never architecture. Never say "L-shape", "setback", "servant room",',
  '  "footprint", "built-up", "Vaastu zone", or technical jargon.',
  '- Never repeat a question id that already appears in the asked[] list.',
  '- "I don\'t know" is always a valid answer when allowDK is true — never shame it.',
  '- Keep each question short, concrete, and one idea at a time.',
  '- Hard cap: after at most ~12 total questions (asked.length + 1), return done:true.',
  '',
  'ESSENTIALS — ask these first, in this order, unless already in asked[]:',
  '1. id "q_people", kind "counter", fields ["adults","children","elders"] — who lives here.',
  '2. id "q_plot", kind "plot" — roughly how big is the plot + which way the entrance faces.',
  '   allowDK true. options may be empty (the client renders plot presets).',
  '3. id "q_floors", kind "choice" — how tall they are comfortable going',
  '   (options like single_floor / two_floors / three_plus).',
  '4. id "q_cook", kind "choice" — how central cooking / the kitchen is day-to-day.',
  '5. id "q_feel", kind "imagepicker" — which home *feels* like theirs.',
  '   options MUST use these exact v keys (labels short & warm):',
  '   courtyard_light, open_family, compact_smart, warm_traditional.',
  '',
  'THEN 2–8 adaptive follow-ups chosen from prior answers. Examples:',
  '- If elders > 0 AND floors ≠ single_floor → ask id "q_elder_floor" (accessibility):',
  '  will elders mostly stay on the ground floor?',
  '- If children ≥ 2 → share vs own rooms.',
  '- If adults ≥ 1 → work-from-home needs.',
  '- Cheap always-useful: guests/entertain, vehicles, pooja.',
  '',
  'ALWAYS include exactly one pick-2 constraints question before finishing:',
  '  id "q_priorities", kind "pick2" — "If space runs tight, what must we NOT sacrifice?"',
  '  Offer 5–6 warm options (natural_light, parents_ground_floor, big_kitchen, outdoor_space,',
  '  guest_room, parking, pooja, quiet_study). Client enforces max 2 picks.',
  '',
  'ALWAYS end with exactly one open freetext prompt:',
  '  id "q_open", kind "freetext" — invite anything else they want the home to hold.',
  '',
  'Return done:true once essentials + priorities + open are collected AND no high-value',
  'follow-up remains, OR when the ~12-question hard cap is hit. When done:true, still',
  'return a sentinel question object with empty id/q/options/fields and allowDK false.',
  '',
  'Output MUST match the strict JSON schema. Use empty arrays (not null) for unused',
  'options/fields.'
].join('\n');

/* ---- Aspiration image keys → prose for briefToText ---- */
var ASPIRATION_PROSE = {
  courtyard_light: 'drawn to calm, light-filled homes built around an inner courtyard',
  open_family: 'drawn to open, sociable family homes where everyone gathers in one flowing space',
  compact_smart: 'drawn to compact, clever homes that make every square foot count',
  warm_traditional: 'drawn to warm, rooted homes with a contemporary-traditional Indian feel'
};

/* Soft preference prose appended to the design brief (not schema fields). */
function preferencesToText(prefs) {
  prefs = prefs || {};
  var bits = [];
  var acc = prefs.accessibility || {};
  if (acc.ground_floor_bedroom) bits.push('parents/elders must sleep on the ground floor');
  if (acc.low_stair_dependency) bits.push('keep stair dependency low');
  var pri = Array.isArray(prefs.priorities) ? prefs.priorities : [];
  if (pri.length) bits.push('top priorities: ' + pri.join(', ').replace(/_/g, ' '));
  var feeling = prefs.feeling || (prefs.aspiration && prefs.aspiration.feeling) || [];
  if (Array.isArray(feeling) && feeling.length) bits.push('the home should feel ' + feeling.join(' and '));
  if (!bits.length) return '';
  return 'Non-negotiables: ' + bits.join('; ') + '.';
}

/*
 * Turn a semantic interview brief into a rich natural-language paragraph that
 * the existing extractDesign (DESIGN_SCHEMA) already knows how to parse.
 */
function briefToText(brief) {
  brief = brief || {};
  var p = brief.people || {};
  var land = brief.land || {};
  var daily = brief.daily || {};
  var asp = brief.aspiration || {};
  var acc = brief.accessibility || {};
  var notes = brief.notes || {};

  var adults = Number(p.adults) || 0;
  var children = Number(p.children) || 0;
  var elders = Number(p.elders) || 0;
  var who = [];
  if (adults) who.push(adults + ' adult' + (adults === 1 ? '' : 's'));
  if (children) who.push(children + ' child' + (children === 1 ? '' : 'ren'));
  if (elders) who.push(elders + ' elder' + (elders === 1 ? '' : 's'));

  var sentences = [];
  sentences.push('Design a modern Indian family home for ' +
    (who.length ? who.join(', ') : 'a small family') + '.');

  var pw = land.plot_w, pd = land.plot_d;
  if (pw && pd) {
    sentences.push('Plot about ' + pw + '×' + pd + ' ft' +
      (land.facing && land.facing !== 'unknown' ? ', ' + land.facing + '-facing entrance' : '') + '.');
  } else if (land.facing && land.facing !== 'unknown') {
    sentences.push('Entrance facing ' + land.facing + '; typical urban plot if size unknown.');
  } else {
    sentences.push('Plot size unknown — assume a typical urban 30×40 ft plot.');
  }
  if (land.budget_band) sentences.push('Budget band: ' + land.budget_band + '.');

  if (daily.cook) sentences.push('Cooking is ' + String(daily.cook).replace(/_/g, ' ') + ' in this household.');
  if (daily.wfh) sentences.push('Someone works from home regularly — include a quiet study nook.');
  if (daily.entertain) sentences.push('They entertain guests ' + String(daily.entertain).replace(/_/g, ' ') + '.');
  if (daily.vehicles) sentences.push('Need parking for ' + daily.vehicles + ' vehicle' + (daily.vehicles === 1 ? '' : 's') + '.');
  if (daily.pooja) sentences.push('Include a small pooja room.');

  var feel = Array.isArray(asp.feeling) ? asp.feeling : [];
  if (feel.length) sentences.push('The home should feel ' + feel.join(' and ') + '.');
  if (asp.picked_image && ASPIRATION_PROSE[asp.picked_image]) {
    sentences.push('They are ' + ASPIRATION_PROSE[asp.picked_image] + '.');
  }

  var prefs = {
    accessibility: acc,
    priorities: brief.priorities || [],
    feeling: feel,
    aspiration: asp
  };
  var prefLine = preferencesToText(prefs);
  if (prefLine) sentences.push(prefLine);

  var noteBits = [];
  Object.keys(notes).forEach(function (k) {
    if (notes[k]) noteBits.push(String(notes[k]));
  });
  if (brief.open) noteBits.push(String(brief.open));
  if (noteBits.length) sentences.push('Also note: ' + noteBits.join('; ') + '.');

  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}

/* ============================ DIRECTION DERIVATION ============================ */

// Optional "next improvements" offered on B/C cards. delta shape matches Stage 3.
var IMPROVEMENT_CATALOG = [
  {
    id: 'master_balcony',
    label: 'Private balcony off the master',
    delta: { rooms: { balcony: { op: 'add', count: 1, size: 'S' } } },
    when: function (d) { return !d.rooms.balcony; }
  },
  {
    id: 'roof_terrace',
    label: 'Rooftop terrace garden',
    delta: { rooms: { terrace: { op: 'add', count: 1, size: 'M' } } },
    when: function (d) { return !d.rooms.terrace; }
  },
  {
    id: 'double_height',
    label: 'Double-height living void',
    delta: { style: { voidLiving: true }, subject: '+double-height living volume' },
    when: function (d) { return !(d.style && d.style.voidLiving); }
  },
  {
    id: 'wide_glazing',
    label: 'Wider glazing on the street face',
    delta: { subject: '+expansive floor-to-ceiling street-facing glazing' },
    when: function () { return true; }
  },
  {
    id: 'green_court',
    label: 'Landscaped inner court',
    delta: { rooms: { court: { op: 'add', count: 1, size: 'S' } } },
    when: function (d) { return !d.rooms.court; }
  }
];

function pickImprovements(d, n) {
  n = n || 3;
  var out = [];
  for (var i = 0; i < IMPROVEMENT_CATALOG.length && out.length < n; i++) {
    var item = IMPROVEMENT_CATALOG[i];
    if (!item.when || item.when(d)) {
      out.push({ id: item.id, label: item.label, delta: item.delta });
    }
  }
  return out;
}

// Convert a normalized design back into a raw object normalize() accepts.
function designToRaw(d) {
  var rooms = [];
  var src = (d && d.rooms) || {};
  Object.keys(src).forEach(function (id) {
    rooms.push({ type: id, count: src[id].count, size: src[id].size });
  });
  return {
    name: d.name,
    tagline: d.tag,
    palette_token: d.palette_token,
    plot_width_ft: d.pw,
    plot_depth_ft: d.pd,
    facing: d.facing,
    shape: d.shape,
    floors_count: d.floorsN,
    rooms: rooms,
    preferences: d.preferences || {}
  };
}

function upsertRoom(roomsArr, type, count, size) {
  for (var i = 0; i < roomsArr.length; i++) {
    if (roomsArr[i].type === type) {
      roomsArr[i].count = count;
      roomsArr[i].size = size;
      return;
    }
  }
  roomsArr.push({ type: type, count: count, size: size });
}

function removeRoom(roomsArr, type) {
  for (var i = roomsArr.length - 1; i >= 0; i--) {
    if (roomsArr[i].type === type) roomsArr.splice(i, 1);
  }
}

/*
 * Derive three contrasting directions from one normalized base design.
 * Each is re-run through normalize() so capacity/essentials stay valid.
 * A = conventional textbook; B = courtyard-leaning modern; C = open/compact modern.
 */
function deriveDirections(base) {
  base = base || normalize({});
  var prefs = base.preferences || {};
  var acc = prefs.accessibility || {};
  var pri = Array.isArray(prefs.priorities) ? prefs.priorities : [];
  var wantLight = pri.indexOf('natural_light') >= 0 ||
    (prefs.feeling && prefs.feeling.indexOf('airy') >= 0);

  // ---- A · conventional ----
  var rawA = designToRaw(base);
  rawA.shape = 'rect';
  rawA.facing = base.facing || 'North';
  rawA.palette_token = (base.palette_token === 'ivory_gold') ? 'ivory_gold' : 'terracotta';
  rawA.rooms = rawA.rooms.map(function (r) {
    return { type: r.type, count: r.count, size: 'M' };
  });
  removeRoom(rawA.rooms, 'court');
  rawA.name = 'The Conventional';
  rawA.tagline = 'A sensible, textbook Indian home';
  var A = normalize(rawA);
  A.id = 'dir_conventional';
  A.directionKey = 'conventional';
  A.note = 'A conventional brief leads here — sensible, but it defaults to standard room sizes and predictable massing, and can miss how you actually want to live.';
  A.improvements = [];
  A.preferences = prefs;

  // ---- B · courtyard / lifestyle-leaning ----
  var rawB = designToRaw(base);
  var plotArea = (base.pw || 30) * (base.pd || 40);
  rawB.shape = plotArea >= 1600 ? 'U' : 'L';
  rawB.palette_token = wantLight ? 'coastal_blue' : 'sage_green';
  upsertRoom(rawB.rooms, 'court', 1, 'M');
  if (acc.ground_floor_bedroom || pri.indexOf('parents_ground_floor') >= 0) {
    // Keep a bedroom + bath; parking stays if present.
    if (!rawB.rooms.some(function (r) { return r.type === 'bedroom' || r.type === 'master'; })) {
      upsertRoom(rawB.rooms, 'bedroom', 1, 'M');
    }
    var bathExisting = rawB.rooms.filter(function (r) { return r.type === 'bath'; })[0];
    upsertRoom(rawB.rooms, 'bath', Math.max(2, bathExisting ? bathExisting.count : 1), 'M');
  }
  if (!rawB.rooms.some(function (r) { return r.type === 'parking'; })) {
    upsertRoom(rawB.rooms, 'parking', 1, 'M');
  }
  rawB.name = 'Courtyard Light';
  rawB.tagline = 'An intelligent modern home wrapped around light';
  var B = normalize(rawB);
  B.id = 'dir_courtyard';
  B.directionKey = 'courtyard';
  B.improvements = pickImprovements(B, 3);
  B.preferences = prefs;

  // ---- C · open-plan or compact-smart ----
  var rawC = designToRaw(base);
  var compactSignal = (prefs.aspiration && prefs.aspiration.picked_image === 'compact_smart') ||
    ((base.pw || 30) * (base.pd || 40) <= 900);
  if (compactSignal) {
    rawC.shape = 'rect';
    rawC.floors_count = Math.min(FLOORS_MAX, Math.max(2, (base.floorsN || 2) + 1));
    rawC.palette_token = 'charcoal';
    rawC.rooms = rawC.rooms.map(function (r) {
      var size = r.size === 'L' ? 'M' : (r.size === 'M' ? 'S' : 'S');
      // Keep essentials readable
      if (r.type === 'drawing' || r.type === 'master' || r.type === 'kitchen') size = 'M';
      return { type: r.type, count: r.count, size: size };
    });
    rawC.name = 'Compact Smart';
    rawC.tagline = 'A tighter, taller plan that spends space wisely';
  } else {
    rawC.shape = 'rect';
    rawC.palette_token = (base.palette_token === 'ivory_gold') ? 'ivory_gold' : 'charcoal';
    upsertRoom(rawC.rooms, 'drawing', 1, 'L');
    upsertRoom(rawC.rooms, 'hall', 1, 'L');
    removeRoom(rawC.rooms, 'dining'); // folded into hall / open plan
    rawC.name = 'Open Family';
    rawC.tagline = 'Flowing open-plan living for how you gather';
  }
  var C = normalize(rawC);
  C.id = 'dir_open_compact';
  C.directionKey = 'open_compact';
  C.improvements = pickImprovements(C, 3);
  C.preferences = prefs;

  return [A, B, C];
}

module.exports = {
  SETBACK: SETBACK, EPS: EPS, SHAPES: SHAPES, PLOT_PRESETS: PLOT_PRESETS,
  CATALOG: CATALOG, ROOM_IDS: ROOM_IDS, FLOORS_MAX: FLOORS_MAX,
  PALETTES: PALETTES, PALETTE_TOKENS: PALETTE_TOKENS,
  DESIGN_SCHEMA: DESIGN_SCHEMA, SYSTEM_PROMPT: SYSTEM_PROMPT,
  UNIVERSAL_SUFFIX: UNIVERSAL_SUFFIX,
  QUESTION_SCHEMA: QUESTION_SCHEMA, INTERVIEW_SYSTEM_PROMPT: INTERVIEW_SYSTEM_PROMPT,
  ASPIRATION_PROSE: ASPIRATION_PROSE, IMPROVEMENT_CATALOG: IMPROVEMENT_CATALOG,
  capacityM2: capacityM2, roomsArea: roomsArea, snapPlot: snapPlot,
  normalize: normalize, buildSubject: buildSubject, buildImagePrompt: buildImagePrompt,
  briefToText: briefToText, preferencesToText: preferencesToText,
  deriveDirections: deriveDirections, designToRaw: designToRaw
};
