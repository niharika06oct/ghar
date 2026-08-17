'use strict';
/*
 * server.js — dependency-free Node backend for Ghar.
 *
 * Jobs:
 *   1. Serve the static site (ghar-prototype.html and friends) so the browser
 *      loads over http:// and can call the API.
 *   2. Expose AI endpoints that keep the OpenAI key server-side:
 *        POST /api/design        — brief → design + watercolor (legacy)
 *        POST /api/next-question — adaptive interview turn
 *        POST /api/base-design   — brief → design + 3 SVG directions (no image)
 *        POST /api/render        — design → one watercolor (the only image call
 *                                  in the Guided discovery flow)
 *
 * The OpenAI API key is read from OPENAI_API_KEY and NEVER sent to the browser.
 * No third-party packages — only Node's built-in http/https/fs/path.
 *
 * Run:  OPENAI_API_KEY=sk-... node server/server.js
 * Then: open http://localhost:8787/ghar-prototype.html
 *
 * NOTE: This file may be git skip-worktree locally (can hold a real key).
 *       Never commit it. Keep reviewable logic in ghar-core.js.
 */

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var core = require('./ghar-core');

var PORT = process.env.PORT || 8787;
var ROOT = path.join(__dirname, '..');
var API_KEY = process.env.OPENAI_API_KEY || '';
var CHAT_MODEL = process.env.GHAR_CHAT_MODEL || 'gpt-4o';
// gpt-image-1 returns b64 by default. dall-e-3 is NOT on some accounts — do not
// switch away from gpt-image-1 unless the env override is set intentionally.
var IMAGE_MODEL = process.env.GHAR_IMAGE_MODEL || 'gpt-image-1';

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

/* ---- tiny HTTPS JSON helper (Promise over https.request) ---- */
function postJSON(hostname, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify(body);
    var req = https.request({
      hostname: hostname, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
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
    req.write(payload);
    req.end();
  });
}

/* ---- multipart/form-data POST (for /v1/images/edits — image-to-image) ----
 * fields: { name: stringValue }; file: { field, filename, contentType, buffer }.
 * Hand-rolled so we keep the zero-dependency server. */
function postMultipart(hostname, urlPath, fields, file) {
  return new Promise(function (resolve, reject) {
    var boundary = '----gharform' + Buffer.byteLength(String(urlPath)) + 'b' + (file.buffer.length);
    var pre = [];
    Object.keys(fields).forEach(function (k) {
      pre.push('--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="' + k + '"\r\n\r\n' +
        String(fields[k]) + '\r\n');
    });
    var fileHead = '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="' + file.field + '"; filename="' + file.filename + '"\r\n' +
      'Content-Type: ' + file.contentType + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--\r\n';
    var payload = Buffer.concat([
      Buffer.from(pre.join(''), 'utf8'),
      Buffer.from(fileHead, 'utf8'),
      file.buffer,
      Buffer.from(tail, 'utf8')
    ]);
    var req = https.request({
      hostname: hostname, path: urlPath, method: 'POST',
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
    req.write(payload);
    req.end();
  });
}

/* ---- data:image/...;base64,XXXX  ->  { buffer, contentType }  (or null) ---- */
function decodeDataUrl(dataUrl) {
  var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(dataUrl || ''));
  if (!m || !m[2]) return null; // only base64 data URLs
  try { return { buffer: Buffer.from(m[3], 'base64'), contentType: m[1] || 'image/png' }; }
  catch (e) { return null; }
}

/* ---- fetch an arbitrary https URL as a Buffer (for DALL·E image url) ---- */
function getBuffer(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      if (res.statusCode !== 200) { reject(new Error('image fetch ' + res.statusCode)); return; }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

function sendJSON(res, code, obj) {
  var s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

/* ---- shared body reader (default 20KB cap; larger for image-reference routes) ---- */
function readJSONBody(req, res, cb, maxBytes) {
  var cap = maxBytes || 20000;
  var body = '';
  req.on('data', function (c) {
    body += c;
    if (body.length > cap) req.destroy();
  });
  req.on('end', function () {
    var parsed;
    try { parsed = JSON.parse(body || '{}'); }
    catch (e) { sendJSON(res, 400, { error: 'invalid JSON body' }); return; }
    cb(parsed);
  });
}

/* ---- step 1: brief -> raw structured design ---- */
function extractDesign(brief) {
  return postJSON('api.openai.com', '/v1/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.1,
    messages: [
      { role: 'system', content: core.SYSTEM_PROMPT },
      { role: 'user', content: brief }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ghar_design_object', strict: true, schema: core.DESIGN_SCHEMA }
    }
  }).then(function (resp) {
    var content = resp && resp.choices && resp.choices[0] && resp.choices[0].message.content;
    if (!content) throw new Error('empty completion');
    return JSON.parse(content);
  });
}

/* ---- interview: answers so far -> next question (or done) ---- */
function nextQuestion(payload) {
  var userMsg = JSON.stringify({
    answers: payload.answers || {},
    asked: payload.asked || [],
    dontknow: payload.dontknow || []
  });
  return postJSON('api.openai.com', '/v1/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.4,
    messages: [
      { role: 'system', content: core.INTERVIEW_SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ghar_next_question', strict: true, schema: core.QUESTION_SCHEMA }
    }
  }).then(function (resp) {
    var content = resp && resp.choices && resp.choices[0] && resp.choices[0].message.content;
    if (!content) throw new Error('empty completion');
    return JSON.parse(content);
  });
}

/* ---- design (+ brief) -> per-room zones for a nicer, brief-driven arrangement ---- */
function floorplan(payload) {
  var design = (payload && payload.design) || {};
  var userMsg = JSON.stringify({
    facing: design.facing,
    floors_count: design.floorsN,
    rooms: design.rooms || {},
    preferences: design.preferences || {},
    brief: (payload && payload.brief) || ''
  });
  return postJSON('api.openai.com', '/v1/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: core.FLOORPLAN_SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ghar_floorplan', strict: true, schema: core.FLOORPLAN_SCHEMA }
    }
  }).then(function (resp) {
    var content = resp && resp.choices && resp.choices[0] && resp.choices[0].message.content;
    if (!content) throw new Error('empty completion');
    return JSON.parse(content);
  });
}

/* ---- 4-view sheet -> advisory "do these look like the same house?" (vision) ----
 * One gpt-4o vision pass on the 2x2 sheet. Advisory only: the client shows a small note
 * when consistent===false; it never regenerates. */
function checkViews(sheetDataUrl) {
  return postJSON('api.openai.com', '/v1/chat/completions', {
    model: CHAT_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: core.VIEWCHECK_SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Do these four panels show the same house?' },
        { type: 'image_url', image_url: { url: sheetDataUrl } }
      ] }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ghar_view_check', strict: true, schema: core.VIEWCHECK_SCHEMA }
    }
  }).then(function (resp) {
    var content = resp && resp.choices && resp.choices[0] && resp.choices[0].message.content;
    if (!content) throw new Error('empty completion');
    return JSON.parse(content);
  });
}

/* ---- normalized design -> watercolor image (base64 data URL) ----
 * For non-front views, if a front reference image is supplied, paint via the image
 * EDITS endpoint so the side/rear depict the SAME house (issue #7). The prompt is the
 * same locked view-aware prompt — the watercolor style is unchanged. */
function renderImage(design, view, ref) {
  view = view || 'front';
  // 'sheet' = one 2x2 image of all four elevations (sliced client-side). Same house,
  // one generation. Plain text-to-image (no reference), locked watercolor style reused.
  var prompt = view === 'sheet' ? core.buildSheetPrompt(design)
                                 : core.buildImagePrompt(design, view);

  var refImg = (view !== 'front' && view !== 'sheet' && String(IMAGE_MODEL).indexOf('dall-e') !== 0) ? decodeDataUrl(ref) : null;
  if (refImg) {
    return postMultipart('api.openai.com', '/v1/images/edits', {
      model: IMAGE_MODEL,
      prompt: prompt,
      n: '1',
      size: '1024x1024',
      quality: 'high'
    }, {
      field: 'image',
      filename: 'front.png',
      contentType: refImg.contentType || 'image/png',
      buffer: refImg.buffer
    }).then(function (resp) {
      var d0 = resp && resp.data && resp.data[0];
      if (d0 && d0.b64_json) return 'data:image/png;base64,' + d0.b64_json;
      if (d0 && d0.url) return getBuffer(d0.url).then(function (buf) {
        return 'data:image/png;base64,' + buf.toString('base64');
      });
      throw new Error('no image payload');
    });
  }

  var body = {
    model: IMAGE_MODEL,
    prompt: prompt,
    n: 1,
    // The sheet packs four landscape elevations — go wide so each sliced panel (~768x512)
    // keeps decent resolution. Single-view generations stay square.
    size: view === 'sheet' ? '1536x1024' : '1024x1024'
  };
  // dall-e-3 uses quality:hd + response_format; gpt-image-1 returns b64 by default.
  if (String(IMAGE_MODEL).indexOf('dall-e') === 0) {
    body.quality = 'hd';
    body.response_format = 'b64_json';
  } else {
    body.quality = 'high';
  }
  return postJSON('api.openai.com', '/v1/images/generations', body).then(function (resp) {
    var d0 = resp && resp.data && resp.data[0];
    if (!d0) throw new Error('empty image response');
    if (d0.b64_json) return 'data:image/png;base64,' + d0.b64_json;
    if (d0.url) return getBuffer(d0.url).then(function (buf) {
      return 'data:image/png;base64,' + buf.toString('base64');
    });
    throw new Error('no image payload');
  });
}

/* ---- POST /api/design (legacy free-text → design + image) ---- */
function handleDesign(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  readJSONBody(req, res, function (parsed) {
    var brief = String((parsed && parsed.brief) || '').trim();
    if (!brief) { sendJSON(res, 400, { error: 'empty brief' }); return; }

    extractDesign(brief)
      .then(function (raw) {
        var design = core.normalize(raw);
        return renderImage(design).then(function (imageDataUrl) {
          sendJSON(res, 200, { design: design, imageDataUrl: imageDataUrl });
        });
      })
      .catch(function (err) {
        sendJSON(res, 502, { error: String(err.message || err) });
      });
  });
}

/* ---- POST /api/next-question ---- */
function handleNextQuestion(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  readJSONBody(req, res, function (parsed) {
    nextQuestion(parsed || {})
      .then(function (out) {
        // When done, omit the sentinel question so the client stays simple.
        if (out && out.done) { sendJSON(res, 200, { done: true }); return; }
        sendJSON(res, 200, { done: false, question: out.question });
      })
      .catch(function (err) {
        sendJSON(res, 502, { error: String(err.message || err) });
      });
  });
}

/* ---- POST /api/base-design — extract + normalize + 3 directions, NO image ---- */
function handleBaseDesign(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  readJSONBody(req, res, function (parsed) {
    var brief = String((parsed && parsed.brief) || '').trim();
    if (!brief) { sendJSON(res, 400, { error: 'empty brief' }); return; }
    var preferences = (parsed && parsed.preferences) || {};

    extractDesign(brief)
      .then(function (raw) {
        raw.preferences = preferences;
        var design = core.normalize(raw);
        design.preferences = preferences;
        var directions = core.deriveDirections(design);
        sendJSON(res, 200, { design: design, directions: directions });
      })
      .catch(function (err) {
        sendJSON(res, 502, { error: String(err.message || err) });
      });
  });
}

/* ---- POST /api/render — the ONLY image call in Guided discovery ---- */
function handleRender(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  // Larger cap: non-front views ride along with the front reference image (~1-2MB base64).
  readJSONBody(req, res, function (parsed) {
    var design = parsed && parsed.design;
    if (!design || typeof design !== 'object') {
      sendJSON(res, 400, { error: 'missing design' }); return;
    }
    // Re-normalize lightly so a client-tweaked design still has essentials,
    // but preserve id / direction metadata / subject extras / preferences.
    var raw = core.designToRaw(design);
    raw.preferences = design.preferences || {};
    var normalized = core.normalize(raw);
    normalized.id = design.id || normalized.id;
    normalized.directionKey = design.directionKey;
    normalized.note = design.note;
    normalized.improvements = design.improvements;
    normalized.preferences = design.preferences || {};
    if (design._subjectExtra) normalized._subjectExtra = design._subjectExtra;
    if (design.style && design.style.voidLiving) {
      normalized.style = normalized.style || {};
      normalized.style.voidLiving = true;
    }

    var view = (parsed && parsed.view) || 'front';
    if (['front', 'back', 'left', 'right', 'side', 'sheet'].indexOf(view) < 0) view = 'front';
    var ref = (parsed && typeof parsed.ref === 'string') ? parsed.ref : null;

    renderImage(normalized, view, ref)
      .then(function (imageDataUrl) {
        sendJSON(res, 200, { imageDataUrl: imageDataUrl, design: normalized, view: view });
      })
      .catch(function (err) {
        sendJSON(res, 502, { error: String(err.message || err) });
      });
  }, 7000000);
}

/* ---- POST /api/floorplan — brief-driven room zones (no image) ---- */
function handleFloorplan(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  readJSONBody(req, res, function (parsed) {
    if (!parsed || !parsed.design) { sendJSON(res, 400, { error: 'missing design' }); return; }
    floorplan(parsed)
      .then(function (out) { sendJSON(res, 200, { plan: out }); })
      .catch(function (err) { sendJSON(res, 502, { error: String(err.message || err) }); });
  });
}

/* ---- POST /api/check-views — advisory consistency note on the 4-view sheet ---- */
function handleCheckViews(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  readJSONBody(req, res, function (parsed) {
    var sheet = parsed && parsed.sheet;
    if (!sheet || typeof sheet !== 'string' || !decodeDataUrl(sheet)) {
      sendJSON(res, 400, { error: 'missing sheet image' }); return;
    }
    checkViews(sheet)
      .then(function (out) {
        sendJSON(res, 200, { consistent: !!out.consistent, note: String(out.note || '') });
      })
      .catch(function (err) { sendJSON(res, 502, { error: String(err.message || err) }); });
  }, 7000000);
}

/* ---- static file serving (path-traversal safe) ---- */
function serveStatic(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/ghar-prototype.html';
  var full = path.join(ROOT, urlPath);
  if (full.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(full, function (err, data) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    var ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

var server = http.createServer(function (req, res) {
  if (req.method === 'POST' && req.url === '/api/design') { handleDesign(req, res); return; }
  if (req.method === 'POST' && req.url === '/api/next-question') { handleNextQuestion(req, res); return; }
  if (req.method === 'POST' && req.url === '/api/base-design') { handleBaseDesign(req, res); return; }
  if (req.method === 'POST' && req.url === '/api/render') { handleRender(req, res); return; }
  if (req.method === 'POST' && req.url === '/api/floorplan') { handleFloorplan(req, res); return; }
  if (req.method === 'POST' && req.url === '/api/check-views') { handleCheckViews(req, res); return; }
  if (req.method === 'GET') { serveStatic(req, res); return; }
  res.writeHead(405); res.end('method not allowed');
});

server.listen(PORT, function () {
  console.log('Ghar server on http://localhost:' + PORT + '/ghar-prototype.html');
  if (!API_KEY) console.warn('WARNING: OPENAI_API_KEY not set — AI endpoints will 500.');
});
