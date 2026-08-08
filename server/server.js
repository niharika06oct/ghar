'use strict';
/*
 * server.js — dependency-free Node backend for Ghar.
 *
 * Two jobs:
 *   1. Serve the static site (ghar-prototype.html and friends) so the browser
 *      loads over http:// and can call the API.
 *   2. Expose POST /api/design — a SECURE proxy that:
 *        a. sends the user's free-text brief to OpenAI with Structured Outputs
 *           (schema + system prompt from ghar-core),
 *        b. deterministically normalizes the result (Vaastu/plot/capacity),
 *        c. builds the subject + LOCKED watercolor suffix,
 *        d. calls DALL·E 3 to render the elevation,
 *        e. returns { design, imageDataUrl } to the client.
 *
 * The OpenAI API key is read from OPENAI_API_KEY and NEVER sent to the browser.
 * No third-party packages — only Node's built-in http/https/fs/path.
 *
 * Run:  OPENAI_API_KEY=sk-... node server/server.js
 * Then: open http://localhost:8787/ghar-prototype.html
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
var IMAGE_MODEL = process.env.GHAR_IMAGE_MODEL || 'dall-e-3';

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

/* ---- step 4: normalized design -> watercolor image (base64 data URL) ---- */
function renderImage(design) {
  var prompt = core.buildImagePrompt(design);
  return postJSON('api.openai.com', '/v1/images/generations', {
    model: IMAGE_MODEL,
    prompt: prompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    response_format: 'b64_json'
  }).then(function (resp) {
    var d0 = resp && resp.data && resp.data[0];
    if (!d0) throw new Error('empty image response');
    if (d0.b64_json) return 'data:image/png;base64,' + d0.b64_json;
    if (d0.url) return getBuffer(d0.url).then(function (buf) {
      return 'data:image/png;base64,' + buf.toString('base64');
    });
    throw new Error('no image payload');
  });
}

/* ---- POST /api/design ---- */
function handleDesign(req, res) {
  if (!API_KEY) { sendJSON(res, 500, { error: 'server missing OPENAI_API_KEY' }); return; }
  var body = '';
  req.on('data', function (c) {
    body += c;
    if (body.length > 20000) req.destroy(); // reject absurdly large briefs
  });
  req.on('end', function () {
    var brief;
    try { brief = String((JSON.parse(body) || {}).brief || '').trim(); }
    catch (e) { sendJSON(res, 400, { error: 'invalid JSON body' }); return; }
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

function sendJSON(res, code, obj) {
  var s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
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
  if (req.method === 'GET') { serveStatic(req, res); return; }
  res.writeHead(405); res.end('method not allowed');
});

server.listen(PORT, function () {
  console.log('Ghar server on http://localhost:' + PORT + '/ghar-prototype.html');
  if (!API_KEY) console.warn('WARNING: OPENAI_API_KEY not set — /api/design will 500.');
});
