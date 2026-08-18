"use strict";
/* Ghar — Guided-discovery feature: interview/brief/directions data, iv* handlers, brief reducers, fetch helpers, and renderInterview/renderBrief/renderDirections.
   Loaded as a plain <script> (shared global scope, no bundler). See ghar-prototype.html
   for load order. Part of the modular split of the former single-file prototype. */

var ASPIRATION_THUMBS = {
  courtyard_light: 'd4',
  open_family: 'd3',
  compact_smart: 'd1',
  warm_traditional: 'd5'
};
// Client-side swatch hexes for the q_palette imagepicker (thumbnails only —
// the authoritative palette lives server-side in ghar-core.js PALETTES).
var PALETTE_SWATCHES = {
  terracotta:  ['#f2e4d5', '#b85f3d', '#75432e'],
  charcoal:    ['#e5e3df', '#34373b', '#8195a0'],
  coastal_blue:['#edf4f3', '#477f95', '#92bdcf'],
  sage_green:  ['#e7ebdf', '#56705a', '#604a35'],
  ivory_gold:  ['#f4ecd9', '#b49352', '#694b2d']
};
function paletteThumb(key){
  var sw=PALETTE_SWATCHES[key]; if(!sw) return '';
  var w=100/sw.length, bars='';
  sw.forEach(function(c,i){ bars+='<rect x="'+(i*w)+'" y="0" width="'+w+'" height="100" fill="'+c+'"/>'; });
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block">'+bars+'</svg>';
}
function aspirationThumb(key){
  if(PALETTE_SWATCHES[key]) return paletteThumb(key);
  var thumbId=ASPIRATION_THUMBS[key];
  if(!thumbId) return '';
  var dd=designOf(thumbId);
  if(!dd) return '';
  if(hasRender(dd,'front')) return renderImg(dd,'renderImg','front');
  return withConfig(dd, function(){ return facadeSVG(dd,'front'); });
}
var ASPIRATION_PROSE = {
  courtyard_light: 'drawn to calm, light-filled homes built around an inner courtyard',
  open_family: 'drawn to open, sociable family homes where everyone gathers in one flowing space',
  compact_smart: 'drawn to compact, clever homes that make every square foot count',
  warm_traditional: 'drawn to warm, rooted homes with a contemporary-traditional Indian feel'
};
var PRIORITY_LABELS = {
  natural_light:'Natural light', parents_ground_floor:'Parents on ground floor',
  big_kitchen:'A generous kitchen', outdoor_space:'Outdoor / court space',
  guest_room:'A proper guest room', parking:'Covered parking',
  pooja:'A pooja room', quiet_study:'A quiet study'
};

function freshIv(){
  return {
    active:false, mode:'discovery', answers:{}, dontknow:[], asked:[], current:null, count:0,
    brief:null, designs:{}, chosen:null, pendingImprovements:{},
    busy:false, error:null, retry:null, noteOpen:false, historyStack:[],
    // refine mode only:
    refineId:null, refineName:null, refineRef:null, refineBase:null, qlog:[]
  };
}
/* Map a raw request failure to Ghar's own voice, keep the real error in the
   console for debugging, and remember how to retry the exact action. */
function ivFail(err, retry){
  if(typeof console!=='undefined' && console.error) console.error('[Ghar] request failed:', err);
  var raw=String((err && err.message) || err || '');
  var msg;
  if(/failed to fetch|networkerror|load failed|err_internet|network request|offline/i.test(raw))
    msg='Couldn’t reach Ghar’s studio — check your connection and try again.';
  else if(/\b429\b|rate.?limit|too many/i.test(raw))
    msg='Ghar’s studio is busy right now. Give it a moment, then try again.';
  else
    msg='Ghar’s studio hit a snag while working on this. Please try again.';
  state.iv.error=msg;
  state.iv.retry=(typeof retry==='function') ? retry : null;
}
function startInterview(){
  state.iv = freshIv();
  state.iv.active = true;
  state.step = 'interview';
  state.design = null;
  syncHistory();
  fetchNextQuestion();
}

/* ---- Refine an existing design by answering more "what to change" questions.
   Reuses the whole interview UI/state (renderInterview + iv* handlers); only the
   endpoint and the finish step differ, gated on state.iv.mode==='refine'. ---- */
function startRefine(designId){
  var d=designOf(designId); if(!d) return;
  state.iv = freshIv();
  state.iv.active = true;
  state.iv.mode = 'refine';
  state.iv.refineId = designId;
  state.iv.refineName = d.name || 'your home';
  // The CURRENT front render is the edit reference — the variation extends the same
  // building. renderSrc gives a data URL (guided) or a committed path (gallery starter);
  // the server's refToImg accepts either.
  state.iv.refineRef = renderSrc(d, 'front');
  state.iv.refineBase = d;
  state.step = 'interview';
  state.design = null;
  syncHistory();
  fetchNextQuestion();
}

// Turn answered refine questions into plain-language change statements. Skips
// "keep …"/none/don't-know options; uses the chosen option's own label (the refine
// prompt phrases every label as a complete change instruction).
function refineChanges(){
  var iv=state.iv, out=[];
  (iv.qlog||[]).forEach(function(q){
    var a=iv.answers[q.id]; if(!a || a.skipped) return;
    var v=a.v;
    if(q.kind==='freetext'){ if(typeof v==='string' && v.trim()) out.push(v.trim()); return; }
    if(typeof v!=='string' || !v) return;
    if(v==='dontknow' || v==='none' || v.indexOf('keep')===0) return;
    var opt=(q.options||[]).find(function(o){ return o.v===v; });
    if(opt && opt.label) out.push(opt.label);
    if(a.note) out.push(a.note);
  });
  return out;
}

// Apply the handful of changes we can represent structurally (palette, floor count,
// outdoor room) so the plan/specs and card reflect them; everything else rides as
// prose via _subjectExtra. The render response re-normalizes and is merged back.
function applyRefineDeltas(d, answers){
  answers=answers||{};
  var pal=answers.r_palette && answers.r_palette.v;
  if(typeof pal==='string' && pal.indexOf('keep')!==0 && PALETTE_SWATCHES[pal]){
    // designToRaw prefers a valid palette_token over the old style hexes, and normalize
    // rebuilds the hexes from it — so we set the token and keep style as the pre-render
    // fallback (facadeSVG reads style). The merged render response corrects it after.
    d.palette_token=pal;
  }
  var fl=answers.r_floors && answers.r_floors.v;
  if(fl==='add_floor') d.floorsN=Math.min((Number(d.floorsN)||1)+1, 4);
  else if(fl==='remove_floor') d.floorsN=Math.max((Number(d.floorsN)||1)-1, 1);
  var od=answers.r_outdoor && answers.r_outdoor.v;
  var roomFor={ add_courtyard:'court', add_terrace_garden:'terrace', add_balcony:'balcony' };
  if(roomFor[od]){ d.rooms=d.rooms||{}; if(!d.rooms[roomFor[od]]) d.rooms[roomFor[od]]={count:1,size:'M'}; }
}

// Build a non-destructive clone of the base design with a new identity + the change prose.
function buildVariation(base, changes){
  var d=JSON.parse(JSON.stringify(base));
  // drop all runtime image/plan caches so the clone regenerates fresh
  ['_render','_renders','_fetching','_sheet','_plan','_planFetching',
   '_viewCheck','_viewChecking','_notes','_notesFetching'].forEach(function(k){ delete d[k]; });
  var n=(state.userDesigns ? state.userDesigns.length : 0)+1;
  d.id=base.id+'_v'+n;
  d.name=(base.name||'Home')+' — variation '+n;
  applyRefineDeltas(d, state.iv.answers);
  var prose=changes.join('. ');
  d._subjectExtra=[(base._subjectExtra||''), prose].filter(Boolean).join(' ').trim();
  d._refineChanges=changes;
  d._variationOf=base.id;
  return d;
}

function finishRefine(){
  var base=state.iv.refineBase, ref=state.iv.refineRef;
  var changes=refineChanges();
  var clone=buildVariation(base, changes);
  state.userDesigns=state.userDesigns||[];
  state.userDesigns.push(clone);
  state.iv.designs[clone.id]=clone;   // so designOf resolves it during regeneration
  state.design=clone.id; state.elev='front';
  state.elevBusy=null; state.elevError=null;
  state.iv.busy=false; state.iv.error=null; state.iv.current=null;
  state.step='detail';
  syncHistory(); render();
  regenerateVariation(clone, ref);
}

// Regenerate the variation's front from the base render (image-edit → same house with the
// change), then the other three views reference the NEW front. Then fetch the design notes.
function regenerateVariation(clone, ref){
  if(location.protocol==='file:') return;
  clone._fetching=clone._fetching||{};
  clone._fetching.front=true;
  state.elevBusy='front'; state.elevError=null;
  render();
  var lean={}; for(var k in clone){ if(k!=='_render' && k!=='_renders' && k!=='_fetching') lean[k]=clone[k]; }
  apiPost('/api/render', {design:lean, view:'front', ref:ref}).then(function(res){
    if(res.design){
      // merge the re-normalized structured fields back, keeping our identity + prose
      var id=clone.id, name=clone.name, extra=clone._subjectExtra,
          vof=clone._variationOf, rc=clone._refineChanges;
      Object.keys(res.design).forEach(function(kk){ clone[kk]=res.design[kk]; });
      clone.id=id; clone.name=name; clone._subjectExtra=extra;
      clone._variationOf=vof; clone._refineChanges=rc;
    }
    clone._renders={ front: res.imageDataUrl||null };
    clone._render=res.imageDataUrl||null;
    clone._fetching.front=false;
    if(state.elevBusy==='front') state.elevBusy=null;
    render();
    // Other three views, referencing the new front (fetchElevation already reference-based).
    ['left','back','right'].forEach(function(v){ fetchElevation(clone, v); });
    fetchDesignNotes(clone);
  }).catch(function(err){
    clone._fetching.front=false;
    if(state.elevBusy==='front') state.elevBusy=null;
    ivFail(err, function(){ regenerateVariation(clone, ref); });
    // keep the user on the detail page; ivFail messaging surfaces via the detail note
    if(typeof console!=='undefined' && console.error) console.error('[Ghar] variation render failed:', err);
    render();
  });
}

// "Design notes": ask the server how the produced home honors the ask and what was
// adjusted. Works for guided homes (intent = brief text) and variations (intent = changes).
function fetchDesignNotes(d){
  if(!d || d._notes || d._notesFetching) return;
  if(location.protocol==='file:') return;
  var intent;
  if(d._refineChanges && d._refineChanges.length){
    intent='The client asked to change their existing home: '+d._refineChanges.join('; ')+'.';
  } else if(state.iv && state.iv.brief){
    intent=briefToText(state.iv.brief);
  } else {
    intent='A ready-made Ghar starter home the client picked from the gallery.';
  }
  d._notesFetching=true;
  var lean={}; for(var k in d){ if(k!=='_render' && k!=='_renders' && k!=='_fetching') lean[k]=d[k]; }
  apiPost('/api/design-summary', {design:lean, intent:intent}).then(function(res){
    d._notesFetching=false;
    d._notes={ honored:(res.honored||[]), compromises:(res.compromises||[]) };
    render();
  }).catch(function(err){
    d._notesFetching=false;
    if(typeof console!=='undefined' && console.error) console.error('[Ghar] design notes failed:', err);
  });
}

function scrapeIvInputs(){
  var iv=state.iv, cur=iv.current; if(!cur) return;
  var ans=iv.answers[cur.id] || (iv.answers[cur.id]={v:null});
  var noteEl=document.getElementById('ivNote');
  if(noteEl){ var n=noteEl.value.trim(); if(n) ans.note=n; else delete ans.note; }
  var openEl=document.getElementById('ivOpen');
  if(openEl && cur.kind==='freetext'){ ans.v=openEl.value.trim(); }
}

function ivAnswered(cur){
  if(!cur) return false;
  var ans=state.iv.answers[cur.id];
  if(!ans) return false;
  if(ans.skipped) return true;
  if(cur.kind==='pick2') return Array.isArray(ans.v) && ans.v.length===2;
  if(cur.kind==='counter'){
    var v=ans.v||{}; return (Number(v.adults)||0)+(Number(v.children)||0)+(Number(v.elders)||0) > 0;
  }
  if(cur.kind==='plot'){
    var v=ans.v||{}; return !!(v.unknown || (v.plot_w && v.plot_d) || v.facing);
  }
  if(cur.kind==='freetext') return true; // open prompt may be empty
  return ans.v!=null && ans.v!=='';
}

function ivChoose(el){
  var cur=state.iv.current; if(!cur) return;
  var v=el.dataset.v;
  var ans=state.iv.answers[cur.id] || (state.iv.answers[cur.id]={v:null});
  if(cur.kind==='pick2'){
    var arr=Array.isArray(ans.v)?ans.v.slice():[];
    var i=arr.indexOf(v);
    if(i>=0) arr.splice(i,1);
    else if(arr.length<2) arr.push(v);
    ans.v=arr; ans.skipped=false;
  } else {
    ans.v=v; ans.skipped=false;
  }
  state.iv.answers[cur.id]=ans;
  render();
}
function ivCount(el){
  var cur=state.iv.current; if(!cur) return;
  var field=el.dataset.field, dir=+el.dataset.dir;
  var ans=state.iv.answers[cur.id] || (state.iv.answers[cur.id]={v:{}});
  if(!ans.v || typeof ans.v!=='object' || Array.isArray(ans.v)) ans.v={};
  var fields=cur.fields && cur.fields.length ? cur.fields : ['adults','children','elders'];
  fields.forEach(function(f){ if(ans.v[f]==null) ans.v[f]=f==='adults'?2:0; });
  ans.v[field]=Math.max(0, Math.min(12, (Number(ans.v[field])||0)+dir));
  ans.skipped=false;
  state.iv.answers[cur.id]=ans;
  render();
}
function ivPlot(el){
  var cur=state.iv.current; if(!cur) return;
  var ans=state.iv.answers[cur.id] || (state.iv.answers[cur.id]={v:{}});
  if(!ans.v || typeof ans.v!=='object') ans.v={};
  ans.v.plot_w=+el.dataset.w; ans.v.plot_d=+el.dataset.d;
  delete ans.v.unknown; ans.skipped=false;
  state.iv.answers[cur.id]=ans;
  render();
}
function ivFacing(el){
  var cur=state.iv.current; if(!cur) return;
  var ans=state.iv.answers[cur.id] || (state.iv.answers[cur.id]={v:{}});
  if(!ans.v || typeof ans.v!=='object') ans.v={};
  ans.v.facing=el.dataset.v; delete ans.v.unknown; ans.skipped=false;
  state.iv.answers[cur.id]=ans;
  render();
}
function ivToggleNote(){
  scrapeIvInputs();
  state.iv.noteOpen=!state.iv.noteOpen;
  render();
}
function ivDontKnow(){
  var cur=state.iv.current; if(!cur) return;
  var ans=state.iv.answers[cur.id] || (state.iv.answers[cur.id]={});
  ans.skipped=true; ans.v = (cur.kind==='plot') ? {unknown:true} : 'dontknow';
  state.iv.answers[cur.id]=ans;
  if(state.iv.dontknow.indexOf(cur.id)<0) state.iv.dontknow.push(cur.id);
  ivSubmitAndNext();
}
function ivSubmitAndNext(){
  var cur=state.iv.current;
  if(!cur){ fetchNextQuestion(); return; }
  if(!ivAnswered(cur)) return;
  // Ensure an answer object exists even for empty freetext
  if(!state.iv.answers[cur.id]) state.iv.answers[cur.id]={v:''};
  state.iv.historyStack.push({
    current:cur, count:state.iv.count, askedLen:state.iv.asked.length
  });
  state.iv.count += 1;
  fetchNextQuestion();
}
function ivBack(){
  if(state.iv.count<=0 || !state.iv.historyStack.length){
    state.step='gallery'; state.iv=freshIv(); syncHistory(); render(); return;
  }
  var prev=state.iv.historyStack.pop();
  // Remove the question we're leaving from asked if it was the latest
  if(state.iv.current && state.iv.asked.length && state.iv.asked[state.iv.asked.length-1]===state.iv.current.id){
    state.iv.asked.pop();
  }
  state.iv.current=prev.current;
  state.iv.count=prev.count;
  state.iv.error=null; state.iv.busy=false; state.iv.noteOpen=false;
  syncHistory(); render();
}

function apiPost(url, body){
  return fetch(url,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }).then(function(r){
    return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return j; });
  });
}

function fetchNextQuestion(){
  var refine=(state.iv.mode==='refine');
  if(location.protocol==='file:'){
    state.iv.error=refine
      ? 'Run the local server (npm start) to refine this home.'
      : 'Run the local server (npm start) to use Guided discovery.';
    state.iv.busy=false; render(); return;
  }
  state.iv.busy=true; state.iv.error=null; state.iv.retry=null; render();
  var url=refine ? '/api/refine-question' : '/api/next-question';
  var leanBase={};
  if(refine){ var b=state.iv.refineBase||{}; for(var bk in b){ if(bk!=='_render'&&bk!=='_renders'&&bk!=='_fetching'&&bk!=='_sheet') leanBase[bk]=b[bk]; } }
  var body=refine ? {
    design: leanBase,
    changes: refineChanges(),
    asked: state.iv.asked,
    dontknow: state.iv.dontknow
  } : {
    answers: state.iv.answers,
    asked: state.iv.asked,
    dontknow: state.iv.dontknow
  };
  apiPost(url, body).then(function(res){
    if(res.done){ refine ? finishRefine() : finishInterview(); return; }
    var q=res.question;
    if(!q || !q.id){ refine ? finishRefine() : finishInterview(); return; }
    if(state.iv.asked.indexOf(q.id)<0) state.iv.asked.push(q.id);
    if(refine){ state.iv.qlog=state.iv.qlog||[]; state.iv.qlog.push(q); }
    state.iv.current=q;
    // seed defaults for counter/plot
    if(q.kind==='counter' && !state.iv.answers[q.id]){
      var fields=q.fields && q.fields.length ? q.fields : ['adults','children','elders'];
      var v={}; fields.forEach(function(f){ v[f]=f==='adults'?2:0; });
      state.iv.answers[q.id]={v:v};
    }
    if(q.kind==='plot' && !state.iv.answers[q.id]){
      state.iv.answers[q.id]={v:{plot_w:30,plot_d:40,facing:'North'}};
    }
    state.iv.busy=false; state.iv.noteOpen=false;
    syncHistory(); render();
  }).catch(function(err){
    state.iv.busy=false;
    ivFail(err, fetchNextQuestion);
    render();
  });
}

function finishInterview(){
  state.iv.brief = briefFromAnswers(state.iv.answers);
  state.iv.busy=false; state.iv.error=null; state.iv.current=null;
  state.step='brief';
  syncHistory(); render();
}

/* ---- brief reducers ---- */
function briefFromAnswers(answers){
  answers=answers||{};
  var brief={
    people:{adults:2, children:0, elders:0},
    land:{plot_w:30, plot_d:40, facing:'unknown', budget_band:'mid'},
    daily:{cook:'everyday', wfh:false, entertain:'sometimes', vehicles:1, pooja:true},
    aspiration:{feeling:[], picked_image:null, palette:null, outdoor:null},
    priorities:[],
    accessibility:{ground_floor_bedroom:false, low_stair_dependency:false},
    notes:{},
    open:''
  };
  Object.keys(answers).forEach(function(qid){
    var a=answers[qid]; if(!a) return;
    if(a.note) brief.notes[qid]=a.note;
    if(a.skipped && a.v==='dontknow') return;
    if(qid==='q_people' && a.v && typeof a.v==='object'){
      brief.people.adults=Number(a.v.adults)||0;
      brief.people.children=Number(a.v.children)||0;
      brief.people.elders=Number(a.v.elders)||0;
    } else if(qid==='q_plot' && a.v && typeof a.v==='object'){
      if(a.v.unknown || a.skipped){ brief.land.facing='unknown'; }
      else {
        if(a.v.plot_w) brief.land.plot_w=a.v.plot_w;
        if(a.v.plot_d) brief.land.plot_d=a.v.plot_d;
        if(a.v.facing) brief.land.facing=a.v.facing;
      }
    } else if(qid==='q_floors'){
      // stored for briefToText via notes/daily — map into land floors hint via notes
      brief.notes.q_floors_choice=a.v;
    } else if(qid==='q_cook'){
      brief.daily.cook=a.v||brief.daily.cook;
    } else if(qid==='q_feel'){
      brief.aspiration.picked_image=a.v;
      if(a.v==='courtyard_light') brief.aspiration.feeling=['calm','airy'];
      else if(a.v==='open_family') brief.aspiration.feeling=['open','sociable'];
      else if(a.v==='compact_smart') brief.aspiration.feeling=['efficient','clever'];
      else if(a.v==='warm_traditional') brief.aspiration.feeling=['warm','rooted'];
    } else if(qid==='q_palette'){
      if(typeof a.v==='string') brief.aspiration.palette=a.v;
    } else if(qid==='q_outdoor'){
      if(typeof a.v==='string') brief.aspiration.outdoor=a.v;
    } else if(qid==='q_elder_floor'){
      if(a.v==='ground_only'){
        brief.accessibility.ground_floor_bedroom=true;
        brief.accessibility.low_stair_dependency=true;
      } else if(a.v==='sometimes'){
        brief.accessibility.ground_floor_bedroom=true;
      }
    } else if(qid==='q_wfh'){
      brief.daily.wfh = (a.v==='yes' || a.v===true || a.v==='often');
    } else if(qid==='q_guests' || qid==='q_entertain'){
      brief.daily.entertain=a.v||brief.daily.entertain;
    } else if(qid==='q_vehicles'){
      var n=parseInt(a.v,10); if(!isNaN(n)) brief.daily.vehicles=n;
      else if(a.v==='none') brief.daily.vehicles=0;
      else if(a.v==='two_plus') brief.daily.vehicles=2;
    } else if(qid==='q_pooja'){
      brief.daily.pooja = !(a.v==='no' || a.v===false);
    } else if(qid==='q_priorities' && Array.isArray(a.v)){
      brief.priorities=a.v.slice(0,2);
    } else if(qid==='q_open'){
      brief.open=typeof a.v==='string'?a.v:'';
    }
  });
  // Inference: elders present + floors not single → prefer ground-floor bedroom if unanswered
  var floorsChoice=(answers.q_floors&&answers.q_floors.v)||'';
  if(brief.people.elders>0 && floorsChoice && floorsChoice!=='single_floor' && !answers.q_elder_floor){
    brief.accessibility.ground_floor_bedroom=true;
  }
  return brief;
}

function briefToText(brief){
  brief=brief||{};
  var p=brief.people||{}, land=brief.land||{}, daily=brief.daily||{}, asp=brief.aspiration||{};
  var adults=Number(p.adults)||0, children=Number(p.children)||0, elders=Number(p.elders)||0;
  var who=[];
  if(adults) who.push(adults+' adult'+(adults===1?'':'s'));
  if(children) who.push(children+' child'+(children===1?'':'ren'));
  if(elders) who.push(elders+' elder'+(elders===1?'':'s'));
  var s=[];
  s.push('Design a modern Indian family home for '+(who.length?who.join(', '):'a small family')+'.');
  if(land.plot_w && land.plot_d){
    s.push('Plot about '+land.plot_w+'×'+land.plot_d+' ft'+(land.facing && land.facing!=='unknown'?', '+land.facing+'-facing entrance':'')+'.');
  } else {
    s.push('Plot size unknown — assume a typical urban 30×40 ft plot.');
  }
  var floorsHint=(brief.notes&&brief.notes.q_floors_choice)||'';
  if(floorsHint==='single_floor') s.push('Prefer a single-storey home.');
  else if(floorsHint==='two_floors') s.push('Comfortable with about two floors (G+1).');
  else if(floorsHint==='three_plus') s.push('Comfortable stacking to three or four floors if the plot is tight.');
  if(daily.cook) s.push('Cooking is '+String(daily.cook).replace(/_/g,' ')+' in this household.');
  if(daily.wfh) s.push('Someone works from home regularly — include a quiet study nook.');
  if(daily.entertain) s.push('They entertain guests '+String(daily.entertain).replace(/_/g,' ')+'.');
  if(daily.vehicles!=null) s.push('Need parking for '+daily.vehicles+' vehicle'+(daily.vehicles===1?'':'s')+'.');
  if(daily.pooja) s.push('Include a small pooja room.');
  var feel=Array.isArray(asp.feeling)?asp.feeling:[];
  if(feel.length) s.push('The home should feel '+feel.join(' and ')+'.');
  if(asp.picked_image && ASPIRATION_PROSE[asp.picked_image]) s.push('They are '+ASPIRATION_PROSE[asp.picked_image]+'.');
  var bits=[];
  var acc=brief.accessibility||{};
  if(acc.ground_floor_bedroom) bits.push('parents/elders must sleep on the ground floor');
  if(acc.low_stair_dependency) bits.push('keep stair dependency low');
  if(brief.priorities && brief.priorities.length) bits.push('top priorities: '+brief.priorities.join(', ').replace(/_/g,' '));
  if(bits.length) s.push('Non-negotiables: '+bits.join('; ')+'.');
  var noteBits=[];
  Object.keys(brief.notes||{}).forEach(function(k){ if(k==='q_floors_choice') return; if(brief.notes[k]) noteBits.push(String(brief.notes[k])); });
  if(brief.open) noteBits.push(String(brief.open));
  if(noteBits.length) s.push('Also note: '+noteBits.join('; ')+'.');
  return s.join(' ').replace(/\s+/g,' ').trim();
}

function briefPreferences(brief){
  brief=brief||{};
  var asp=brief.aspiration||{};
  return {
    accessibility: brief.accessibility||{},
    priorities: brief.priorities||[],
    feeling: asp.feeling||[],
    palette: asp.palette||null,
    outdoor: asp.outdoor||null,
    aspiration: asp
  };
}

function briefEdit(el){
  var section=el.dataset.section, field=el.dataset.field, v=el.dataset.v;
  var b=state.iv.brief; if(!b) return;
  if(section==='people'){
    b.people=b.people||{}; b.people[field]=Math.max(0, Math.min(12, (Number(b.people[field])||0)+(+el.dataset.dir||0)));
    if(el.dataset.dir==null && v!=null) b.people[field]=+v;
  } else if(section==='land'){
    b.land=b.land||{};
    if(field==='plot'){ b.land.plot_w=+el.dataset.w; b.land.plot_d=+el.dataset.d; }
    else if(field==='facing') b.land.facing=v;
    else b.land[field]=v;
  } else if(section==='daily'){
    b.daily=b.daily||{};
    if(v==='true') b.daily[field]=true;
    else if(v==='false') b.daily[field]=false;
    else b.daily[field]=v;
  } else if(section==='aspiration'){
    b.aspiration=b.aspiration||{};
    if(field==='picked_image'){
      b.aspiration.picked_image=v;
      if(v==='courtyard_light') b.aspiration.feeling=['calm','airy'];
      else if(v==='open_family') b.aspiration.feeling=['open','sociable'];
      else if(v==='compact_smart') b.aspiration.feeling=['efficient','clever'];
      else if(v==='warm_traditional') b.aspiration.feeling=['warm','rooted'];
    } else if(field==='palette'){
      b.aspiration.palette=v;
    } else if(field==='outdoor'){
      b.aspiration.outdoor=v;
    }
  } else if(section==='priorities'){
    var arr=Array.isArray(b.priorities)?b.priorities.slice():[];
    var i=arr.indexOf(v);
    if(i>=0) arr.splice(i,1);
    else if(arr.length<2) arr.push(v);
    b.priorities=arr;
  } else if(section==='accessibility'){
    b.accessibility=b.accessibility||{};
    b.accessibility[field]=(v==='true');
  }
  render();
}

function generateBrief(){
  if(location.protocol==='file:'){
    state.iv.error='Run the local server (npm start) to generate designs.';
    render(); return;
  }
  var brief=state.iv.brief; if(!brief) return;
  // scrape any open brief textarea
  var openTa=document.getElementById('ivBriefOpen');
  if(openTa) brief.open=openTa.value.trim();
  state.iv.busy=true; state.iv.error=null; state.iv.retry=null; render();
  apiPost('/api/base-design', {
    brief: briefToText(brief),
    preferences: briefPreferences(brief)
  }).then(function(res){
    var dirs=res.directions||[];
    state.iv.designs={};
    dirs.forEach(function(d){ state.iv.designs[d.id]=d; });
    state.iv.pendingImprovements={};
    state.iv.busy=false; state.iv.error=null;
    state.step='directions';
    syncHistory(); render();
  }).catch(function(err){
    state.iv.busy=false;
    ivFail(err, generateBrief);
    render();
  });
}

function toggleImprovement(designId, impId){
  var arr=state.iv.pendingImprovements[designId]||[];
  var i=arr.indexOf(impId);
  if(i>=0) arr.splice(i,1); else arr.push(impId);
  state.iv.pendingImprovements[designId]=arr;
  render();
}

function applyImprovementDeltas(design, impIds){
  var d=JSON.parse(JSON.stringify(design));
  var extras=[];
  (impIds||[]).forEach(function(impId){
    var imp=(design.improvements||[]).find(function(x){ return x.id===impId; });
    if(!imp || !imp.delta) return;
    var delta=imp.delta;
    if(delta.rooms){
      Object.keys(delta.rooms).forEach(function(rid){
        var op=delta.rooms[rid];
        if(op.op==='add' || op.count){
          d.rooms[rid]={count:op.count||1, size:op.size||'S'};
        }
      });
    }
    if(delta.style){
      d.style=d.style||{};
      Object.keys(delta.style).forEach(function(k){ d.style[k]=delta.style[k]; });
    }
    if(delta.subject) extras.push(delta.subject);
  });
  if(extras.length) d._subjectExtra=extras.join(' ');
  return d;
}

function chooseDirection(designId){
  var base=state.iv.designs[designId]; if(!base) return;
  state.iv.chosen=designId;
  var finalDesign=applyImprovementDeltas(base, state.iv.pendingImprovements[designId]||[]);
  if(location.protocol==='file:'){
    state.iv.error='Run the local server (npm start) to render the chosen home.';
    render(); return;
  }
  state.iv.busy=true; state.iv.error=null; state.iv.retry=null; render();
  // ONE generation: a 2x2 sheet with all four elevations of the SAME house (front | left on
  // top, rear | right below), then sliced client-side into the four view slots. This
  // guarantees every view is the same building at ~1 image cost (issue #7 — single sheet).
  apiPost('/api/render', {design: finalDesign, view:'sheet'}).then(function(res){
    var sheet=res.imageDataUrl||null;
    if(res.design){
      res.design.id=designId;
      res.design._subjectExtra=finalDesign._subjectExtra;
      finalDesign=res.design;
    }
    finalDesign._sheet=sheet;
    state.iv.designs[designId]=finalDesign;
    state.design=designId; state.elev='front';
    state.elevBusy=null; state.elevError=null;
    state.iv.busy=false; state.iv.error=null;
    state.step='detail';
    syncHistory(); render();
    // Slice the sheet into front/left/rear/right (async image decode).
    sliceSheet(sheet).then(function(views){
      finalDesign._renders=views;
      finalDesign._render=views.front;
      render();
      checkViews(finalDesign, sheet);   // advisory "same house?" note
    }).catch(function(){
      // Slice failed — show the whole sheet as the front view rather than nothing.
      finalDesign._render=sheet;
      finalDesign._renders={ front: sheet };
      render();
    });
    // LLM-driven plan arrangement (issue #1b) — reorders the deterministic plan.
    fetchFloorplan(finalDesign);
    // Design notes: how this home honors the brief + what was adjusted.
    fetchDesignNotes(finalDesign);
  }).catch(function(err){
    state.iv.busy=false;
    ivFail(err, function(){ chooseDirection(designId); });
    render();
  });
}

// Slice a 2x2 elevation sheet into the four view slots. The server lays it out as
// front | left on the top row, rear | right on the bottom row. Pure client-side (canvas);
// no extra API cost. Resolves { front, left, back, right } as PNG data URLs.
function sliceSheet(dataUrl){
  return new Promise(function(resolve, reject){
    if(!dataUrl){ reject(new Error('no sheet')); return; }
    var img=new Image();
    img.onload=function(){
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      if(!w || !h){ reject(new Error('bad sheet')); return; }
      var hw=Math.floor(w/2), hh=Math.floor(h/2);
      function cut(sx, sy){
        var c=document.createElement('canvas'); c.width=hw; c.height=hh;
        c.getContext('2d').drawImage(img, sx, sy, hw, hh, 0, 0, hw, hh);
        return c.toDataURL('image/png');
      }
      try{
        resolve({ front:cut(0,0), left:cut(hw,0), back:cut(0,hh), right:cut(hw,hh) });
      }catch(e){ reject(e); }
    };
    img.onerror=function(){ reject(new Error('sheet decode failed')); };
    img.src=dataUrl;
  });
}

// Advisory consistency check: one vision pass on the sheet. Shows a small "views may differ"
// note when the four panels look like different houses. Never blocks, never regenerates.
function checkViews(d, sheet){
  if(!d || !sheet || d._viewCheck || d._viewChecking) return;
  if(location.protocol==='file:') return;
  d._viewChecking=true;
  apiPost('/api/check-views', {sheet:sheet}).then(function(res){
    d._viewChecking=false;
    if(res && typeof res.consistent==='boolean'){
      d._viewCheck={ consistent:res.consistent, note:String(res.note||'') };
      render();
    }
  }).catch(function(err){
    d._viewChecking=false;
    if(typeof console!=='undefined' && console.error) console.error('[Ghar] view check failed:', err);
  });
}

function fetchElevation(d, view){
  view=view||'front';
  if(view==='front') return;
  if(!d) return;
  if(hasRender(d, view)) return;                  // already cached
  if(location.protocol==='file:') return;         // offline: keep the SVG fallback
  d._fetching=d._fetching||{};
  var active=(state.elev===view);                 // is the user looking at this tab now?
  if(d._fetching[view]){                           // already in flight (e.g. pre-generated on choose)
    if(active) state.elevBusy=view;                // show the spinner for the tab being viewed
    return;
  }
  d._fetching[view]=true;
  if(active){ state.elevBusy=view; state.elevError=null; }
  // Send a LEAN design (the renders are multi-MB base64 blobs) plus the FRONT render as a
  // separate `ref` so the server paints this side referencing the same house (issue #7).
  // /api/render accepts a larger body cap than other routes to fit the reference image.
  var lean={}; for(var k in d){ if(k!=='_render' && k!=='_renders' && k!=='_fetching') lean[k]=d[k]; }
  var ref=(d._renders && d._renders.front) || d._render || null;
  apiPost('/api/render', {design:lean, view:view, ref:ref}).then(function(res){
    d._renders=d._renders||{};
    d._renders[view]=res.imageDataUrl||null;
    d._fetching[view]=false;
    if(state.elevBusy===view) state.elevBusy=null;
    render();
  }).catch(function(err){
    if(typeof console!=='undefined' && console.error) console.error('[Ghar] elevation render failed:', err);
    d._fetching[view]=false;
    if(state.elev===view){
      state.elevBusy=null;
      state.elevError='Couldn’t paint this elevation. Tap the tab again to retry.';
    }
    render();
  });
}

// Fetch the LLM room-zone arrangement (issue #1b) and cache it on the design.
// Zones only reorder the deterministic plan — never fatal if it fails.
function fetchFloorplan(d){
  if(!d || d._plan || d._planFetching) return;   // cached / in flight
  if(location.protocol==='file:') return;         // offline: plain deterministic plan
  d._planFetching=true;
  var lean={}; for(var k in d){ if(k!=='_render' && k!=='_renders' && k!=='_fetching') lean[k]=d[k]; }
  apiPost('/api/floorplan', {design:lean, brief: briefToText(state.iv && state.iv.brief)}).then(function(res){
    d._planFetching=false;
    if(res && res.plan && Array.isArray(res.plan.floors)){ d._plan=res.plan; render(); }
  }).catch(function(err){
    d._planFetching=false;
    if(typeof console!=='undefined' && console.error) console.error('[Ghar] floorplan failed:', err);
  });
}

/* ---- screens ---- */
function ivShellStart(title, backAct){
  var h='';
  h+='<header class="nav">';
  h+='<div class="brand" data-act="gotogallery" style="cursor:pointer"><div class="dot">⌂</div> Ghar</div>';
  h+='<div class="navspace"></div>';
  h+='<button class="navback" data-act="'+(backAct||'ivback')+'">← Back</button>';
  h+='</header>';
  h+='<div class="ivwrap">';
  if(title) h+='<div class="ivprogress">'+esc(title)+'</div>';
  return h;
}

function renderInterview(){
  var iv=state.iv;
  var stage=iv.mode==='refine'
    ? ('REFINING · '+(iv.refineName||'YOUR HOME')).toUpperCase()
    : 'GUIDED DISCOVERY';
  var h=ivShellStart(iv.current ? ('QUESTION '+(iv.count+1)) : stage);

  if(location.protocol==='file:'){
    h+='<h2 class="ivq">Guided discovery needs the local server</h2>';
    h+='<p class="ivhint">Run <b>npm start</b> and open <b>http://localhost:8787/ghar-prototype.html</b>. The gallery and manual plot builder still work offline.</p>';
    h+='</div>';
    document.getElementById('app').innerHTML=h; return;
  }

  if(iv.busy && !iv.current){
    h+='<h2 class="ivq">Finding the right next question…</h2>';
    h+='<p class="ivhint"><span class="aispin" style="border-color:rgba(0,0,0,.15);border-top-color:#b85f3d"></span> &nbsp;One moment.</p>';
    h+='</div>';
    document.getElementById('app').innerHTML=h; return;
  }

  if(iv.error && !iv.current){
    h+='<h2 class="ivq">Something went wrong</h2>';
    h+='<div class="aierr">⚠ '+esc(iv.error)+'</div>';
    var firstRetry=iv.retry ? 'ivretry' : 'startinterview';
    h+='<div class="ivfooter"><button class="navcta" data-act="'+firstRetry+'">Try again</button></div>';
    h+='</div>';
    document.getElementById('app').innerHTML=h; return;
  }

  var cur=iv.current;
  if(!cur){
    h+='<h2 class="ivq">Ready when you are</h2>';
    h+='<div class="ivfooter"><button class="navcta" data-act="startinterview">Begin →</button></div></div>';
    document.getElementById('app').innerHTML=h; return;
  }

  var ans=iv.answers[cur.id]||{v:null};
  h+='<h2 class="ivq">'+esc(cur.q||'Tell us a little more')+'</h2>';

  if(cur.kind==='choice' || cur.kind==='pick2'){
    var picked=cur.kind==='pick2' ? (Array.isArray(ans.v)?ans.v:[]) : null;
    h+='<div class="presets">';
    (cur.options||[]).forEach(function(opt){
      var on=cur.kind==='pick2' ? picked.indexOf(opt.v)>=0 : ans.v===opt.v;
      var disabled=cur.kind==='pick2' && !on && picked.length>=2;
      h+='<button class="preset '+(on?'on':'')+(disabled?' off':'')+'" data-act="ivchoose" data-v="'+esc(opt.v)+'" '+(disabled?'disabled':'')+'>';
      h+='<div class="pd">'+esc(opt.label)+'</div>';
      if(cur.kind==='pick2') h+='<div class="ps">'+(on?'Selected':'Pick up to 2')+'</div>';
      h+='</button>';
    });
    h+='</div>';
    if(cur.kind==='pick2') h+='<div class="ivprogress" style="margin-top:12px">'+(picked.length)+' of 2 selected</div>';
  } else if(cur.kind==='imagepicker'){
    h+='<div class="imgPick">';
    (cur.options||[]).forEach(function(opt){
      var on=ans.v===opt.v;
      var thumb=aspirationThumb(opt.v);
      h+='<button class="shapeopt '+(on?'on':'')+'" data-act="ivchoose" data-v="'+esc(opt.v)+'">';
      h+='<div class="thumb">'+(thumb||'')+'</div>';
      h+='<div style="font:600 13px \'IBM Plex Sans\'">'+esc(opt.label)+'</div>';
      h+='</button>';
    });
    h+='</div>';
  } else if(cur.kind==='counter'){
    var fields=cur.fields && cur.fields.length ? cur.fields : ['adults','children','elders'];
    var labels={adults:'Adults', children:'Children', elders:'Elders'};
    var vals=ans.v && typeof ans.v==='object' ? ans.v : {};
    fields.forEach(function(f){
      var n=Number(vals[f]); if(isNaN(n)) n=(f==='adults'?2:0);
      h+='<div class="field"><div class="flabel">'+esc(labels[f]||f)+'</div>';
      h+='<div class="stepper">';
      h+='<button class="btn '+(n>0?'':'off')+'" data-act="ivcount" data-field="'+f+'" data-dir="-1">−</button>';
      h+='<div class="counter"><span class="cnt">'+n+'</span></div>';
      h+='<button class="btn" data-act="ivcount" data-field="'+f+'" data-dir="1">+</button>';
      h+='</div></div>';
    });
  } else if(cur.kind==='plot'){
    var pv=ans.v && typeof ans.v==='object' ? ans.v : {};
    h+='<div class="field"><div class="flabel">Plot size</div><div class="presets">';
    [[20,30],[30,40],[30,50],[40,60],[50,80],[40,40]].forEach(function(p){
      var on=pv.plot_w===p[0]&&pv.plot_d===p[1];
      h+='<button class="preset '+(on?'on':'')+'" data-act="ivplot" data-w="'+p[0]+'" data-d="'+p[1]+'"><div class="pd">'+p[0]+'×'+p[1]+' ft</div><div class="ps">'+Math.round(p[0]*p[1]*0.092903)+' m² plot</div></button>';
    });
    h+='</div></div>';
    h+='<div class="field"><div class="flabel">Entrance facing</div><div class="facings">';
    [['North','↑'],['East','→'],['South','↓'],['West','←']].forEach(function(f){
      h+='<button class="facing '+(pv.facing===f[0]?'on':'')+'" data-act="ivfacing" data-v="'+f[0]+'"><div style="font:600 18px \'IBM Plex Sans\'">'+f[1]+'</div><div style="font:500 11px \'IBM Plex Sans\';margin-top:3px">'+f[0]+'</div></button>';
    });
    h+='</div></div>';
  } else if(cur.kind==='freetext'){
    h+='<div class="aibox" style="margin-top:0">';
    h+='<textarea class="aita" id="ivOpen" rows="4" placeholder="Anything else — a tree you want to keep, a kitchen habit, a colour you love…">'
      +esc(typeof ans.v==='string'?ans.v:'')+'</textarea>';
    h+='</div>';
  }

  // optional note
  if(cur.kind!=='freetext'){
    h+='<button class="ivnoteToggle" data-act="ivnote">'+(iv.noteOpen?'− Hide note':'+ Tell us something specific')+'</button>';
    if(iv.noteOpen){
      h+='<div class="ivnoteBox"><textarea class="aita" id="ivNote" rows="2" placeholder="Optional detail for this answer…">'
        +esc(ans.note||'')+'</textarea></div>';
    }
  }

  if(iv.error){
    h+='<div class="aierr" style="margin-top:14px">⚠ '+esc(iv.error);
    if(iv.retry) h+=' <button class="ivretryBtn" data-act="ivretry">Try again</button>';
    h+='</div>';
  }
  if(iv.busy) h+='<div class="ivhint" style="margin-top:14px"><span class="aispin" style="border-color:rgba(0,0,0,.15);border-top-color:#b85f3d"></span> Thinking…</div>';

  // The final freetext prompt is optional — its button is always enabled and reads "Submit".
  var isFinal=cur.kind==='freetext';
  var canNext=isFinal ? true : ivAnswered(cur);
  var ctaLabel=isFinal ? 'Submit' : 'Next →';
  h+='<div class="ivfooter">';
  if(cur.allowDK) h+='<button class="ivdk" data-act="ivdk"'+(iv.busy?' disabled':'')+'>I don’t know</button>';
  h+='<button class="navcta '+(canNext && !iv.busy?'':'off')+'" data-act="ivnext"'+(canNext && !iv.busy?'':' disabled')+'>'+ctaLabel+'</button>';
  h+='</div></div>';
  document.getElementById('app').innerHTML=h;
}

function renderBrief(){
  var b=state.iv.brief || briefFromAnswers(state.iv.answers);
  state.iv.brief=b;
  var h=ivShellStart('DESIGN BRIEF', 'backtointerview');
  h+='<h2 class="ivq">Here’s what I understood</h2>';
  h+='<p class="ivhint">About how you want to live. Change anything that’s off — I’ll only draw once you’re happy.</p>';

  // People
  h+='<div class="panel" style="margin-top:0"><div class="flabel">People</div>';
  ['adults','children','elders'].forEach(function(f){
    var n=Number((b.people||{})[f])||0;
    var label=f.charAt(0).toUpperCase()+f.slice(1);
    h+='<div class="field" style="margin-bottom:12px"><div class="flabel">'+label+'</div><div class="stepper">';
    h+='<button class="btn" data-act="briefedit" data-section="people" data-field="'+f+'" data-dir="-1">−</button>';
    h+='<div class="counter"><span class="cnt">'+n+'</span></div>';
    h+='<button class="btn" data-act="briefedit" data-section="people" data-field="'+f+'" data-dir="1">+</button>';
    h+='</div></div>';
  });
  h+='</div>';

  // Land
  h+='<div class="panel"><div class="flabel">Land</div>';
  h+='<div class="field"><div class="flabel">Plot size</div><div class="presets">';
  [[20,30],[30,40],[30,50],[40,60],[50,80],[40,40]].forEach(function(p){
    var on=b.land && b.land.plot_w===p[0] && b.land.plot_d===p[1];
    h+='<button class="preset '+(on?'on':'')+'" data-act="briefedit" data-section="land" data-field="plot" data-w="'+p[0]+'" data-d="'+p[1]+'"><div class="pd">'+p[0]+'×'+p[1]+' ft</div></button>';
  });
  h+='</div></div>';
  h+='<div class="field" style="margin-bottom:0"><div class="flabel">Facing</div><div class="facings">';
  ['North','East','South','West','unknown'].forEach(function(f){
    h+='<button class="facing '+((b.land&&b.land.facing)===f?'on':'')+'" data-act="briefedit" data-section="land" data-field="facing" data-v="'+f+'">'+(f==='unknown'?'Not sure':f)+'</button>';
  });
  h+='</div></div></div>';

  // Daily
  h+='<div class="panel"><div class="flabel">Daily life</div>';
  h+='<div class="field"><div class="flabel">Cooking</div><div class="presets">';
  [['everyday','Every day'],['sometimes','Sometimes'],['rarely','Rarely / eat out']].forEach(function(opt){
    h+='<button class="preset '+((b.daily&&b.daily.cook)===opt[0]?'on':'')+'" data-act="briefedit" data-section="daily" data-field="cook" data-v="'+opt[0]+'"><div class="pd">'+opt[1]+'</div></button>';
  });
  h+='</div></div>';
  h+='<div class="field"><div class="flabel">Work from home</div><div class="presets">';
  h+='<button class="preset '+(b.daily&&b.daily.wfh?'on':'')+'" data-act="briefedit" data-section="daily" data-field="wfh" data-v="true"><div class="pd">Yes</div></button>';
  h+='<button class="preset '+(b.daily&&!b.daily.wfh?'on':'')+'" data-act="briefedit" data-section="daily" data-field="wfh" data-v="false"><div class="pd">No</div></button>';
  h+='</div></div>';
  h+='<div class="field" style="margin-bottom:0"><div class="flabel">Pooja room</div><div class="presets">';
  h+='<button class="preset '+(b.daily&&b.daily.pooja?'on':'')+'" data-act="briefedit" data-section="daily" data-field="pooja" data-v="true"><div class="pd">Include</div></button>';
  h+='<button class="preset '+(b.daily&&!b.daily.pooja?'on':'')+'" data-act="briefedit" data-section="daily" data-field="pooja" data-v="false"><div class="pd">Skip</div></button>';
  h+='</div></div></div>';

  // Aspiration
  h+='<div class="panel"><div class="flabel">Aspiration</div><div class="imgPick">';
  [['courtyard_light','Courtyard light'],['open_family','Open family'],['compact_smart','Compact smart'],['warm_traditional','Warm traditional']].forEach(function(opt){
    var on=b.aspiration&&b.aspiration.picked_image===opt[0];
    var thumb=aspirationThumb(opt[0]);
    h+='<button class="shapeopt '+(on?'on':'')+'" data-act="briefedit" data-section="aspiration" data-field="picked_image" data-v="'+opt[0]+'">';
    h+='<div class="thumb">'+thumb+'</div><div style="font:600 13px \'IBM Plex Sans\'">'+opt[1]+'</div></button>';
  });
  h+='</div>';
  // Colour mood (palette) — strictly drives the render colours
  h+='<div class="flabel" style="margin-top:16px">Colour mood</div><div class="imgPick">';
  [['terracotta','Warm terracotta'],['ivory_gold','Ivory & gold'],['sage_green','Sage green'],['coastal_blue','Coastal blue'],['charcoal','Charcoal & white']].forEach(function(opt){
    var on=b.aspiration&&b.aspiration.palette===opt[0];
    h+='<button class="shapeopt '+(on?'on':'')+'" data-act="briefedit" data-section="aspiration" data-field="palette" data-v="'+opt[0]+'">';
    h+='<div class="thumb">'+paletteThumb(opt[0])+'</div><div style="font:600 13px \'IBM Plex Sans\'">'+opt[1]+'</div></button>';
  });
  h+='</div>';
  // Garden / open space
  h+='<div class="field" style="margin-top:16px;margin-bottom:0"><div class="flabel">Garden / open space</div><div class="presets">';
  [['front_garden','Front garden'],['courtyard','Inner courtyard'],['terrace_garden','Terrace garden'],['balcony_green','Green balconies'],['none','Not needed']].forEach(function(opt){
    var on=b.aspiration&&b.aspiration.outdoor===opt[0];
    h+='<button class="preset '+(on?'on':'')+'" data-act="briefedit" data-section="aspiration" data-field="outdoor" data-v="'+opt[0]+'"><div class="pd">'+opt[1]+'</div></button>';
  });
  h+='</div></div>';
  h+='</div>';

  // Priorities
  h+='<div class="panel"><div class="flabel">Priorities (pick up to 2)</div><div class="presets">';
  Object.keys(PRIORITY_LABELS).forEach(function(k){
    var on=b.priorities&&b.priorities.indexOf(k)>=0;
    var disabled=!on && b.priorities && b.priorities.length>=2;
    h+='<button class="preset '+(on?'on':'')+(disabled?' off':'')+'" data-act="briefedit" data-section="priorities" data-v="'+k+'" '+(disabled?'disabled':'')+'>';
    h+='<div class="pd">'+PRIORITY_LABELS[k]+'</div></button>';
  });
  h+='</div></div>';

  h+='<div class="panel"><div class="flabel">Anything else</div>';
  h+='<textarea class="aita" id="ivBriefOpen" rows="3" placeholder="Optional free note…">'+esc(b.open||'')+'</textarea></div>';

  if(state.iv.error){
    h+='<div class="aierr" style="margin-top:14px">⚠ '+esc(state.iv.error);
    if(state.iv.retry) h+=' <button class="ivretryBtn" data-act="ivretry">Try again</button>';
    h+='</div>';
  }

  h+='<div class="ivfooter">';
  h+='<button class="navback" data-act="backtointerview">Back to questions</button>';
  h+='<button class="navcta '+(state.iv.busy?'off':'')+'" data-act="generatebrief" '+(state.iv.busy?'disabled':'')+'>';
  h+=(state.iv.busy?'<span class="aispin"></span> Shaping designs…':'Looks right — show me designs →');
  h+='</button></div></div>';
  document.getElementById('app').innerHTML=h;
}

function renderDirections(){
  var h=ivShellStart('THREE DIRECTIONS', 'backtobrief');
  h+='<h2 class="ivq">Three ways this could go</h2>';
  h+='<p class="ivhint">Instant sketch elevations — no paint yet. Pick one; only the chosen home gets a watercolor render.</p>';
  if(state.iv.error){
    h+='<div class="aierr">⚠ '+esc(state.iv.error);
    if(state.iv.retry) h+=' <button class="ivretryBtn" data-act="ivretry">Try again</button>';
    h+='</div>';
  }
  h+='<div class="dirGrid">';
  ['dir_conventional','dir_courtyard','dir_open_compact'].forEach(function(id){
    var d=state.iv.designs[id]; if(!d) return;
    var elev=withConfig(d, function(){ return facadeSVG(d,'front'); });
    var ticked=state.iv.pendingImprovements[id]||[];
    var fLabel=d.floorsN<=1 ? 'G' : 'G + '+(d.floorsN-1);
    var beds=(d.rooms.master?d.rooms.master.count:0)+(d.rooms.bedroom?d.rooms.bedroom.count:0)+(d.rooms.guest?d.rooms.guest.count:0);
    var baths=(d.rooms.bath?d.rooms.bath.count:0)+(d.rooms.toilet?d.rooms.toilet.count:0);
    var shapeLabel=(SHAPES[d.shape]&&SHAPES[d.shape].label)||d.shape;
    var palName=String(d.palette_token||'').replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
    var st=d.style||{};
    h+='<div class="panel dirCard" style="margin-top:0">';
    h+='<div class="designElevation">'+elev+'</div>';
    h+='<div style="font:700 18px \'Bricolage Grotesque\';margin-top:14px">'+esc(d.name)+'</div>';
    h+='<div style="font:400 13px/1.45 \'IBM Plex Sans\';color:#7a7264;margin-top:4px">'+esc(d.tag||'')+'</div>';
    h+='<div class="dirSpecs">';
    h+='<div class="ds"><span class="k">Plot</span><span class="v">'+d.pw+'×'+d.pd+' ft</span></div>';
    h+='<div class="ds"><span class="k">Floors</span><span class="v">'+fLabel+'</span></div>';
    h+='<div class="ds"><span class="k">Beds</span><span class="v">'+beds+' BHK</span></div>';
    h+='<div class="ds"><span class="k">Baths</span><span class="v">'+baths+'</span></div>';
    h+='<div class="ds"><span class="k">Shape</span><span class="v">'+esc(shapeLabel)+'</span></div>';
    h+='<div class="ds"><span class="k">Facing</span><span class="v">'+esc(d.facing||'')+'</span></div>';
    h+='</div>';
    h+='<div class="dirSwatches">';
    ['wall','band','trim','door'].forEach(function(k){
      if(st[k]) h+='<span class="swatch" style="background:'+st[k]+'" title="'+k+'"></span>';
    });
    h+='<span class="swlabel">'+esc(palName)+'</span>';
    h+='</div>';
    if(d.directionKey==='conventional' && d.note){
      h+='<p class="dirNote">'+esc(d.note)+'</p>';
    }
    if(d.improvements && d.improvements.length){
      h+='<div class="flabel" style="margin-top:14px">Optional next improvements</div>';
      h+='<div class="dirImps">';
      d.improvements.forEach(function(imp){
        var on=ticked.indexOf(imp.id)>=0;
        h+='<button class="preset '+(on?'on':'')+'" data-act="toggleimprovement" data-id="'+id+'" data-imp="'+esc(imp.id)+'">';
        h+='<div class="pd">'+(on?'✓ ':'')+esc(imp.label)+'</div></button>';
      });
      h+='</div>';
    }
    h+='<button class="ebtn" data-act="choosedirection" data-id="'+id+'" '
      +'style="width:100%;margin-top:16px;background:#12100d;color:#fff;border-color:#12100d;padding:12px"'
      +(state.iv.busy?' disabled':'')+'>Choose this →</button>';
    h+='</div>';
  });
  h+='</div></div>';
  // While the chosen home is being painted, grey out the whole page with a blocking
  // overlay so no further selection is possible, and show a large, readable status.
  if(state.iv.busy){
    h+='<div class="ivPaintOverlay" aria-live="polite" aria-busy="true">'
      +'<div class="ivPaintCard">'
      +'<span class="ivPaintSpin"></span>'
      +'<div class="ivPaintTitle">Painting your chosen home…</div>'
      +'<div class="ivPaintSub">Rendering all four sides — this takes a few moments.</div>'
      +'</div></div>';
  }
  document.getElementById('app').innerHTML=h;
}

