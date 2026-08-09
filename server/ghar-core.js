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
    rooms: rooms
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

  return [
    'A ' + floorLabel + ' modern-Indian family house',
    'on a ' + d.pw + 'x' + d.pd + ' ft ' + FACING_HINT[d.facing] + ' plot,',
    SHAPE_HINT[d.shape] + ',',
    (beds ? beds + '-bedroom, ' : '') + pal.prompt + '.',
    features.length ? 'Features ' + features.join(', ') + '.' : ''
  ].join(' ').replace(/\s+/g, ' ').trim();
}

// Full image prompt = subject + LOCKED suffix. Always call this for image gen.
function buildImagePrompt(d) {
  return buildSubject(d) + ' ' + UNIVERSAL_SUFFIX;
}

module.exports = {
  SETBACK: SETBACK, EPS: EPS, SHAPES: SHAPES, PLOT_PRESETS: PLOT_PRESETS,
  CATALOG: CATALOG, ROOM_IDS: ROOM_IDS, FLOORS_MAX: FLOORS_MAX,
  PALETTES: PALETTES, PALETTE_TOKENS: PALETTE_TOKENS,
  DESIGN_SCHEMA: DESIGN_SCHEMA, SYSTEM_PROMPT: SYSTEM_PROMPT,
  UNIVERSAL_SUFFIX: UNIVERSAL_SUFFIX,
  capacityM2: capacityM2, roomsArea: roomsArea, snapPlot: snapPlot,
  normalize: normalize, buildSubject: buildSubject, buildImagePrompt: buildImagePrompt
};
