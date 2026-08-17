'use strict';
/*
 * bake-gallery-views.js — ONE-TIME, DEV-ONLY.
 *
 * The 5 starter gallery designs (js/core.js `DESIGNS`) ship with a committed FRONT
 * watercolor (js/assets.js `RENDERS[id]`) but only SVG fallbacks for the other views.
 * This script paints the left / rear / right elevations ONCE by editing the existing
 * front (OpenAI /v1/images/edits — the same "same house" path the app uses at runtime),
 * and writes all four views as static PNGs to img/renders/<id>-<view>.png.
 *
 * It is NOT part of the deployed server and adds NO runtime dependency. Run it by hand
 * whenever a starter design's look changes:
 *
 *     node --env-file=.env scripts/bake-gallery-views.js
 *
 * Reuses server/ghar-core.js for the LOCKED watercolor prompt (unchanged). Costs ~15
 * gpt-image-1 edit calls (3 non-front views x 5 designs).
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'img', 'renders');
var API_KEY = process.env.OPENAI_API_KEY || '';
var IMAGE_MODEL = process.env.GHAR_IMAGE_MODEL || 'gpt-image-1';
var core = require(path.join(ROOT, 'server', 'ghar-core.js'));

if (!API_KEY) { console.error('Set OPENAI_API_KEY (e.g. node --env-file=.env ...)'); process.exit(1); }

/* ---- load the browser globals (DESIGNS, RENDERS) into Node via vm ---- */
function loadGlobals() {
  var sandbox = { console: console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'assets.js'), 'utf8'), sandbox, { filename: 'assets.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'), sandbox, { filename: 'core.js' });
  return { DESIGNS: sandbox.DESIGNS || [], RENDERS: sandbox.RENDERS || {} };
}

/* ---- data:...;base64,XXX -> { buffer, contentType } ---- */
function decodeDataUrl(dataUrl) {
  var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(dataUrl || ''));
  if (!m || !m[2]) return null;
  return { buffer: Buffer.from(m[3], 'base64'), contentType: m[1] || 'image/png' };
}

/* ---- multipart POST to /v1/images/edits (mirrors server.js postMultipart) ---- */
function editImage(prompt, refBuffer, contentType) {
  return new Promise(function (resolve, reject) {
    var boundary = '----gharbake' + refBuffer.length;
    var fields = { model: IMAGE_MODEL, prompt: prompt, n: '1', size: '1024x1024', quality: 'high' };
    var pre = Object.keys(fields).map(function (k) {
      return '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n';
    }).join('');
    var fileHead = '--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="front.png"\r\n' +
      'Content-Type: ' + (contentType || 'image/png') + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--\r\n';
    var payload = Buffer.concat([Buffer.from(pre, 'utf8'), Buffer.from(fileHead, 'utf8'), refBuffer, Buffer.from(tail, 'utf8')]);
    var req = https.request({
      hostname: 'api.openai.com', path: '/v1/images/edits', method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': payload.length,
        'Authorization': 'Bearer ' + API_KEY
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        var json; try { json = JSON.parse(text); } catch (e) { json = null; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
        else reject(new Error('OpenAI ' + res.statusCode + ': ' +
          (json && json.error && json.error.message ? json.error.message : text.slice(0, 300))));
      });
    });
    req.on('error', reject);
    // Guard against a stalled socket hanging the whole bake (seen once on a slow edit).
    req.setTimeout(180000, function () { req.destroy(new Error('request timed out')); });
    req.write(payload); req.end();
  });
}

function b64FromResp(resp) {
  var d0 = resp && resp.data && resp.data[0];
  if (d0 && d0.b64_json) return d0.b64_json;
  throw new Error('no image payload');
}

/* ---- normalize a browser DESIGNS entry the same way handleRender does ---- */
function normalizeDesign(design) {
  var raw = core.designToRaw(design);
  raw.preferences = design.preferences || {};
  var d = core.normalize(raw);
  d.id = design.id;
  return d;
}

var VIEWS = ['left', 'back', 'right']; // front comes from the committed RENDERS blob

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  var g = loadGlobals();
  var designs = g.DESIGNS.filter(function (d) { return g.RENDERS[d.id]; });
  console.log('Baking ' + designs.length + ' designs -> ' + path.relative(ROOT, OUT));

  for (var i = 0; i < designs.length; i++) {
    var design = designs[i];
    var frontRef = decodeDataUrl(g.RENDERS[design.id]);
    if (!frontRef) { console.warn('  ' + design.id + ': no decodable front; skipping'); continue; }

    // front: reuse the committed render verbatim.
    var frontPath = path.join(OUT, design.id + '-front.png');
    if (fs.existsSync(frontPath)) {
      console.log('  ' + design.id + ' front  · skip (exists)');
    } else {
      fs.writeFileSync(frontPath, frontRef.buffer);
      console.log('  ' + design.id + ' front  ✓ (from committed render)');
    }

    var d = normalizeDesign(design);
    for (var j = 0; j < VIEWS.length; j++) {
      var view = VIEWS[j];
      var outPath = path.join(OUT, design.id + '-' + view + '.png');
      if (fs.existsSync(outPath)) { console.log('  ' + design.id + ' ' + view + '   · skip (exists)'); continue; }
      var prompt = core.buildImagePrompt(d, view);
      try {
        var resp = await editImage(prompt, frontRef.buffer, frontRef.contentType);
        fs.writeFileSync(outPath, Buffer.from(b64FromResp(resp), 'base64'));
        console.log('  ' + design.id + ' ' + view + '   ✓');
      } catch (e) {
        console.error('  ' + design.id + ' ' + view + '   ✗ ' + e.message);
      }
    }
  }
  console.log('Done.');
}

main().catch(function (e) { console.error(e); process.exit(1); });
