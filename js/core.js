"use strict";

/* ============================ DATA ============================ */
// sizes = usable floor-area in m² [S,M,L]. floor = stacking affinity (low = lower floor)
var CATALOG = [
  { id:'master',  cat:'beds', label:'Master Bedroom', icon:'🛏️', color:'#ec6a86', max:2, floor:6,  sizes:{S:12,M:16,L:22} },
  { id:'bedroom', cat:'beds', label:'Bedroom',        icon:'🛌', color:'#f2869c', max:5, floor:6,  sizes:{S:10,M:13,L:17} },
  { id:'guest',   cat:'beds', label:'Guest Room',     icon:'🧳', color:'#f59db0', max:2, floor:3,  sizes:{S:9,M:12,L:15} },
  { id:'bath',    cat:'beds', label:'Bathroom',       icon:'🛁', color:'#4ea8de', max:6, floor:6,  sizes:{S:3,M:4.5,L:6} },
  { id:'toilet',  cat:'beds', label:'Common Toilet',  icon:'🚻', color:'#6cb6e0', max:4, floor:1,  sizes:{S:2,M:3,L:4} },

  { id:'drawing', cat:'living', label:'Drawing Room',  icon:'🛋️', color:'#f0a341', max:1, floor:0, sizes:{S:14,M:20,L:28} },
  { id:'hall',    cat:'living', label:'Family Living',  icon:'📺', color:'#f4b45f', max:2, floor:1, sizes:{S:12,M:18,L:25} },
  { id:'dining',  cat:'living', label:'Dining',         icon:'🍽️', color:'#e8a24a', max:1, floor:1, sizes:{S:8,M:12,L:16} },
  { id:'kitchen', cat:'living', label:'Kitchen',        icon:'🍳', color:'#c8794f', max:2, floor:1, sizes:{S:7,M:10,L:14} },
  { id:'pooja',   cat:'living', label:'Pooja Room',     icon:'🪔', color:'#e8833a', max:1, floor:1, sizes:{S:2,M:3.5,L:5} },
  { id:'study',   cat:'living', label:'Study / Office',  icon:'📚', color:'#d9944a', max:2, floor:3, sizes:{S:6,M:9,L:12} },

  { id:'balcony', cat:'outdoor', label:'Balcony',    icon:'🌤️', color:'#5cb87a', max:6, floor:8,  sizes:{S:3,M:5,L:8} },
  { id:'terrace', cat:'outdoor', label:'Terrace',    icon:'☀️', color:'#6cc98a', max:1, floor:12, sizes:{S:15,M:30,L:50} },
  { id:'verandah',cat:'outdoor', label:'Verandah',   icon:'🪑', color:'#4fae72', max:2, floor:0,  sizes:{S:6,M:10,L:14} },
  { id:'court',   cat:'outdoor', label:'Courtyard',  icon:'🌿', color:'#7ec698', max:1, floor:1,  sizes:{S:6,M:12,L:20} },

  { id:'parking', cat:'utility', label:'Car Parking',  icon:'🚗', color:'#7d8496', max:3, floor:0, sizes:{S:12,M:18,L:30} },
  { id:'store',   cat:'utility', label:'Store Room',   icon:'📦', color:'#8f95a6', max:3, floor:2, sizes:{S:3,M:5,L:8} },
  { id:'utility', cat:'utility', label:'Utility / Wash',icon:'🧺', color:'#9aa0b3', max:2, floor:2, sizes:{S:3,M:5,L:7} },
  { id:'stairs',  cat:'utility', label:'Staircase',    icon:'🪜', color:'#6f7688', max:2, floor:0, sizes:{S:4,M:5.5,L:7} },
  { id:'servant', cat:'utility', label:'Servant Room', icon:'🚪', color:'#848ba0', max:1, floor:2, sizes:{S:6,M:9,L:12} }
];
var CATS = [
  { key:'beds',    label:'Beds & Baths' },
  { key:'living',  label:'Living' },
  { key:'outdoor', label:'Outdoor' },
  { key:'utility', label:'Utility' }
];
// footprint shapes: rects [x,y,w,h] as fractions of the buildable box; frac = ground coverage of buildable
var SHAPES = {
  rect: { label:'Rectangle', sub:'Simple & efficient', frac:1.00, rects:[[0,0,1,1]] },
  L:    { label:'L-shape',    sub:'Corner plot / court', frac:0.82, rects:[[0,0,0.58,1],[0.58,0.42,0.42,0.58]] },
  T:    { label:'T-shape',    sub:'Deep central plot',   frac:0.66, rects:[[0,0,1,0.42],[0.30,0.42,0.40,0.58]] },
  U:    { label:'U-shape',    sub:'Wraps a courtyard',   frac:0.78, rects:[[0,0,0.32,1],[0.68,0,0.32,1],[0,0.62,1,0.38]] }
};
var ZONE = { beds:['Beds & Baths','#ec6a86'], living:['Living','#f0a341'], outdoor:['Outdoor','#5cb87a'], utility:['Utility','#7d8496'] };

var SETBACK = 0.72;     // buildable fraction of plot after municipal setbacks
var EPS = 0.5;          // m² tolerance for the capacity constraint

/* ============================ STATE ============================ */
var state = {
  step: 'gallery',         // gallery | detail | interview | brief | directions | plot | rooms | layout
  cat: 'beds',
  design: null,            // id of the design being previewed in detail
  elev: 'front',           // front | back | side (elevation view in detail)
  elevBusy: null,
  elevError: null,
  pw: 30, pd: 40, facing: 'North', shape: 'rect', floorsN: 2,
  rooms: {
    master:{count:1,size:'M'}, bedroom:{count:2,size:'M'}, bath:{count:2,size:'M'},
    drawing:{count:1,size:'M'}, kitchen:{count:1,size:'M'}, pooja:{count:1,size:'S'},
    parking:{count:1,size:'M'}, stairs:{count:1,size:'M'}
  },
  floorView: 0, sel: null, layout: null, _drag: null,
  // Guided discovery (adaptive interview → brief → 3 directions → one render)
  iv: {
    active: false,
    answers: {},              // qId -> { v, note?, skipped? }
    dontknow: [],
    asked: [],
    current: null,
    count: 0,
    brief: null,
    designs: {},
    chosen: null,
    pendingImprovements: {},
    busy: false,
    error: null,
    noteOpen: false,
    historyStack: []          // prior {current,count} for Back within interview
  }
};

/* ============================ HELPERS ============================ */
function roomOf(id){ for(var i=0;i<CATALOG.length;i++) if(CATALOG[i].id===id) return CATALOG[i]; return null; }
function totalArea(){ var s=0; for(var id in state.rooms){ var r=roomOf(id); if(r) s+=r.sizes[state.rooms[id].size]*state.rooms[id].count; } return Math.round(s); }
function roomCount(){ var n=0; for(var id in state.rooms) n+=state.rooms[id].count; return n; }
function activeRooms(){ return CATALOG.filter(function(r){ return state.rooms[r.id]; }); }
function plotAreaM2(){ return state.pw*state.pd*0.092903; }
function footprintM2(){ return plotAreaM2()*SETBACK*SHAPES[state.shape].frac; }
function capacityM2(){ return footprintM2()*state.floorsN; }   // total built-up budget
function freeM2(){ return capacityM2()-totalArea(); }

function setRoom(id, patch){
  var cur = state.rooms[id] || {count:0,size:'M'};
  var next = {count: patch.count!=null?patch.count:cur.count, size: patch.size!=null?patch.size:cur.size};
  if(next.count<=0) delete state.rooms[id];
  else state.rooms[id]=next;
}
// can we add one more of room r at its current (or default M) size without busting capacity?
function canAdd(r){
  var e=state.rooms[r.id]; if(e && e.count>=r.max) return false;
  var delta = e ? r.sizes[e.size] : r.sizes.M;
  return totalArea()+delta <= capacityM2()+EPS;
}
function canSize(r,z){
  var e=state.rooms[r.id]; if(!e) return true;
  if(r.sizes[z] <= r.sizes[e.size]) return true;        // shrinking is always allowed
  var delta=(r.sizes[z]-r.sizes[e.size])*e.count;
  return totalArea()+delta <= capacityM2()+EPS;
}
function incRoom(id){ var r=roomOf(id); if(!canAdd(r)) return; var c=(state.rooms[id]||{count:0}).count; setRoom(id,{count:c+1}); }
function decRoom(id){ var cur=state.rooms[id]; if(cur) setRoom(id,{count:cur.count-1}); }

/* ============================ LAYOUT MODEL (materialised instances) ============================ */
function layoutSig(){ return JSON.stringify(state.rooms)+'|'+state.floorsN+'|'+state.shape+'|'+state.pw+'x'+state.pd; }

// build individual room instances and auto-assign them to floors (Indian convention)
function materialize(){
  var expanded=[], seq=0;
  activeRooms().forEach(function(r){
    var e=state.rooms[r.id];
    for(var i=0;i<e.count;i++){
      expanded.push({ key:'k'+(seq++), id:r.id, cat:r.cat, color:r.color, icon:r.icon,
                      aff:r.floor, size:e.size, area:r.sizes[e.size],
                      label:r.label + (e.count>1 ? ' '+(i+1) : ''), floor:0 });
    }
  });
  expanded.sort(function(a,b){ return a.aff-b.aff; });          // services/living low, beds high
  var N=state.floorsN, foot=footprintM2(), f=0, fill=0;
  var nonTerrace=0; expanded.forEach(function(it){ if(it.id!=='terrace') nonTerrace+=it.area; });
  var target=nonTerrace/N;                                       // aim for an even built-up split across floors
  expanded.forEach(function(it){
    if(it.id==='terrace'){ it.floor=N-1; return; }              // terrace tops out
    var overFoot   = fill>0 && fill+it.area > foot*1.12;        // never overflow a floor's footprint
    var pastTarget = fill>0 && fill+it.area/2 > target;         // keep floors balanced (no empty floors)
    if(f<N-1 && (overFoot || pastTarget)){ f++; fill=0; }
    it.floor=f; fill+=it.area;
  });
  expanded.sort(function(a,b){ return (a.floor-b.floor) || (a.aff-b.aff); });
  state.layout={ sig:layoutSig(), instances:expanded };
  state.sel=null; state.floorView=0;
}
function ensureLayout(){ if(!state.layout || state.layout.sig!==layoutSig()) materialize(); }
function floorsData(){
  var N=state.floorsN, fl=[]; for(var i=0;i<N;i++) fl.push([]);
  state.layout.instances.forEach(function(it){ if(it.floor>=0 && it.floor<N) fl[it.floor].push(it); });
  return fl;
}
function findInst(k){ return state.layout.instances.find(function(x){ return x.key===k; }); }

/* ---- editing ops (mutate instances in place, keep sig stable) ---- */
function editSize(k,z){ var it=findInst(k); if(!it) return; it.size=z; it.area=roomOf(it.id).sizes[z]; }
function editFloor(k,dir){ var it=findInst(k); if(!it) return; it.floor=Math.max(0,Math.min(state.floorsN-1,it.floor+dir)); }
function reorderTarget(k,dir){                                    // index of the same-floor neighbour in dir, or -1
  var arr=state.layout.instances, i=arr.findIndex(function(x){return x.key===k;}); if(i<0) return -1;
  var fl=arr[i].floor, j=i+dir;
  while(j>=0 && j<arr.length && arr[j].floor!==fl) j+=dir;       // next neighbour on the same floor
  return (j<0||j>=arr.length) ? -1 : j;
}
function canReorder(k,dir){ return reorderTarget(k,dir)>=0; }    // is there a neighbour to swap with?
function editReorder(k,dir){
  var arr=state.layout.instances, i=arr.findIndex(function(x){return x.key===k;}); if(i<0) return;
  var j=reorderTarget(k,dir); if(j<0) return;
  var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
}
function editDelete(k){
  var arr=state.layout.instances, i=arr.findIndex(function(x){return x.key===k;}); if(i<0) return;
  arr.splice(i,1); if(state.sel===k) state.sel=null;
}
function editSwap(k1,k2){                                        // drag-drop: exchange both floor slot + order
  if(k1===k2) return;
  var a=findInst(k1), b=findInst(k2); if(!a||!b) return;
  var tf=a.floor; a.floor=b.floor; b.floor=tf;
  var arr=state.layout.instances, ia=arr.indexOf(a), ib=arr.indexOf(b);
  arr[ia]=b; arr[ib]=a;
}

/* ============================ SQUARIFIED TREEMAP ============================ */
function squarify(areas, x, y, w, h){
  var out=new Array(areas.length);
  var rx=x, ry=y, rw=w, rh=h, start=0;
  function worst(row, side){
    var sum=0,max=-Infinity,min=Infinity;
    for(var i=0;i<row.length;i++){ var a=areas[row[i]]; sum+=a; if(a>max)max=a; if(a<min)min=a; }
    return Math.max((side*side*max)/(sum*sum), (sum*sum)/(side*side*min));
  }
  while(start<areas.length){
    var side=Math.min(rw,rh);
    var row=[start], end=start+1, best=worst(row,side);
    while(end<areas.length){
      var cand=row.concat([end]), wr=worst(cand,side);
      if(wr<=best){ row=cand; best=wr; end++; } else break;
    }
    var sum=0; for(var i=0;i<row.length;i++) sum+=areas[row[i]];
    if(rw<=rh){
      var t=sum/rw, off=rx;
      for(var i=0;i<row.length;i++){ var len=areas[row[i]]/t; out[row[i]]={x:off,y:ry,w:len,h:t}; off+=len; }
      ry+=t; rh-=t;
    } else {
      var t=sum/rh, off=ry;
      for(var i=0;i<row.length;i++){ var len=areas[row[i]]/t; out[row[i]]={x:rx,y:off,w:t,h:len}; off+=len; }
      rx+=t; rw-=t;
    }
    start=end;
  }
  return out;
}

// lay one floor's rooms (in array order) into the shape's rects; returns [{room,x,y,w,h}] in canvas units
function layoutFloor(rooms, W, H){
  var inset=0.06, bx=W*inset, by=H*inset, bw=W*(1-2*inset), bh=H*(1-2*inset);
  var shapeRects = SHAPES[state.shape].rects.map(function(r){ return {x:bx+r[0]*bw, y:by+r[1]*bh, w:r[2]*bw, h:r[3]*bh}; });
  if(!rooms.length) return [];
  var tagged = rooms.map(function(r,i){ return {r:r, ord:i, area:r.area}; });
  var totRoom=0; tagged.forEach(function(t){ totRoom+=t.area; });
  var totRect=0; shapeRects.forEach(function(r){ totRect+=r.w*r.h; });
  var kGlobal = totRect/totRoom;                                // px² per m² (same unit for capacities)
  var buckets = shapeRects.map(function(r){ return {rect:r, cap:r.w*r.h, fill:0, items:[]}; });
  tagged.slice().sort(function(a,b){ return b.area-a.area; }).forEach(function(t){   // assign big→small for good fit
    var best=0, bestRem=-Infinity;
    for(var i=0;i<buckets.length;i++){ var rem=buckets[i].cap-buckets[i].fill; if(rem>bestRem){bestRem=rem;best=i;} }
    buckets[best].items.push(t); buckets[best].fill += t.area*kGlobal;
  });
  var placed=[];
  buckets.forEach(function(b){
    if(!b.items.length) return;
    b.items.sort(function(a,b2){ return a.ord-b2.ord; });       // honour the user's order within each rect
    var s=0; for(var i=0;i<b.items.length;i++) s+=b.items[i].area;
    var k=(b.rect.w*b.rect.h)/s;                                // rescale to fill this rect exactly (gapless)
    var cells=squarify(b.items.map(function(t){ return t.area*k; }), b.rect.x, b.rect.y, b.rect.w, b.rect.h);
    b.items.forEach(function(t,idx){ placed.push({room:t.r, x:cells[idx].x, y:cells[idx].y, w:cells[idx].w, h:cells[idx].h}); });
  });
  return placed;
}

/* ============================ GALLERY: 5 STARTER DESIGNS ============================ */
// each design carries a full builder config + a visual style for the elevations
var DESIGNS = [

  /* ============================================================
     1. COMPACT 2BHK — 20x30 — TERRACOTTA
     Vaastu intent:
       - East-facing entrance
       - Kitchen toward SE
       - Master bedroom toward SW
     ============================================================ */
  {
    id:'d1',
    name:'Terracotta Compact',
    tag:'Smart 2BHK G+2 for a 20×30 urban plot',
    shape:'rect',
    pw:20,
    pd:30,
    facing:'East',
    floorsN:3,

    style:{
      wall:'#f2e4d5',
      band:'#b85f3d',
      trim:'#fff8ef',
      glass:'#9bb8c4',
      door:'#75432e',
      cols:2,
      porch:true,
      balcony:true
    },

    rooms:{
      parking:{count:1,size:'S'},
      drawing:{count:1,size:'M'},
      hall:{count:1,size:'S'},
      dining:{count:1,size:'S'},
      kitchen:{count:1,size:'S'},
      pooja:{count:1,size:'S'},
      stairs:{count:1,size:'S'},

      master:{count:1,size:'S'},
      bedroom:{count:1,size:'S'},
      bath:{count:2,size:'S'},

      study:{count:1,size:'S'},
      utility:{count:1,size:'S'},
      balcony:{count:1,size:'S'}
    }
  },


  /* ============================================================
     2. 3BHK FAMILY HOME — 30x40 — CHARCOAL
     Vaastu intent:
       - North-facing entrance
       - Kitchen toward SE
       - Master bedroom toward SW
     ============================================================ */
  {
    id:'d2',
    name:'Charcoal Courtyard',
    tag:'Contemporary 3BHK with an intimate green court',
    shape:'L',
    pw:30,
    pd:40,
    facing:'North',
    floorsN:2,

    style:{
      wall:'#e5e3df',
      band:'#34373b',
      trim:'#f6f3ed',
      glass:'#8195a0',
      door:'#45372f',
      cols:2,
      porch:true,
      balcony:true
    },

    rooms:{
      parking:{count:1,size:'M'},
      drawing:{count:1,size:'M'},
      hall:{count:1,size:'S'},
      dining:{count:1,size:'S'},
      kitchen:{count:1,size:'M'},
      pooja:{count:1,size:'S'},
      stairs:{count:1,size:'S'},

      master:{count:1,size:'M'},
      bedroom:{count:2,size:'S'},
      bath:{count:3,size:'S'},

      court:{count:1,size:'S'}
    }
  },


  /* ============================================================
     3. 3BHK FAMILY HOME — 30x50 — COASTAL BLUE
     Vaastu intent:
       - East-facing entrance
       - Kitchen toward SE
       - Private bedroom zone toward SW / west
     ============================================================ */
  {
    id:'d3',
    name:'Coastal Blue House',
    tag:'Airy 3BHK G+2 with generous family spaces',
    shape:'T',
    pw:30,
    pd:50,
    facing:'East',
    floorsN:3,

    style:{
      wall:'#edf4f3',
      band:'#477f95',
      trim:'#ffffff',
      glass:'#92bdcf',
      door:'#71513c',
      cols:3,
      porch:true,
      balcony:true
    },

    rooms:{
      parking:{count:1,size:'M'},
      drawing:{count:1,size:'L'},
      hall:{count:1,size:'M'},
      dining:{count:1,size:'M'},
      kitchen:{count:1,size:'M'},
      pooja:{count:1,size:'S'},
      stairs:{count:1,size:'M'},

      master:{count:1,size:'L'},
      bedroom:{count:2,size:'M'},
      bath:{count:3,size:'M'},

      study:{count:1,size:'S'},
      utility:{count:1,size:'M'},
      balcony:{count:2,size:'M'}
    }
  },


  /* ============================================================
     4. 3BHK FAMILY HOME — 40x60 — GREEN COURTYARD
     Vaastu intent:
       - North-facing entrance
       - Kitchen toward SE
       - Master bedroom toward SW
       - Courtyard retained as central breathing space
     ============================================================ */
  {
    id:'d4',
    name:'Green Court House',
    tag:'Spacious 3BHK wrapped around a landscaped court',
    shape:'U',
    pw:40,
    pd:60,
    facing:'North',
    floorsN:2,

    style:{
      wall:'#e7ebdf',
      band:'#56705a',
      trim:'#f8f4e9',
      glass:'#8aa5a0',
      door:'#604a35',
      cols:3,
      porch:true,
      balcony:true
    },

    rooms:{
      parking:{count:1,size:'L'},
      drawing:{count:1,size:'L'},
      hall:{count:1,size:'L'},
      dining:{count:1,size:'L'},
      kitchen:{count:1,size:'L'},
      pooja:{count:1,size:'M'},
      stairs:{count:1,size:'M'},

      master:{count:1,size:'L'},
      bedroom:{count:2,size:'L'},
      bath:{count:3,size:'M'},

      court:{count:1,size:'L'},
      utility:{count:1,size:'M'},
      balcony:{count:2,size:'M'}
    }
  },


  /* ============================================================
     5. PREMIUM FAMILY HOME — 40x60 — CREAM + GOLD
     Vaastu intent:
       - West-facing plot for facing diversity
       - Kitchen still intended toward SE internally
       - Primary master suite toward SW
     ============================================================ */
  {
    id:'d5',
    name:'Ivory Gold Residence',
    tag:'Premium multigenerational G+2 statement home',
    shape:'rect',
    pw:40,
    pd:60,
    facing:'West',
    floorsN:3,

    style:{
      wall:'#f4ecd9',
      band:'#b49352',
      trim:'#fffaf0',
      glass:'#9caaad',
      door:'#694b2d',
      cols:3,
      porch:true,
      balcony:true
    },

    rooms:{
      parking:{count:2,size:'L'},
      drawing:{count:1,size:'L'},
      hall:{count:2,size:'L'},
      dining:{count:1,size:'L'},
      kitchen:{count:2,size:'L'},
      pooja:{count:1,size:'L'},
      stairs:{count:2,size:'L'},

      master:{count:2,size:'L'},
      bedroom:{count:3,size:'L'},
      guest:{count:1,size:'L'},
      bath:{count:6,size:'L'},

      study:{count:2,size:'L'},
      utility:{count:2,size:'L'},
      servant:{count:1,size:'L'},
      balcony:{count:4,size:'L'},
      terrace:{count:1,size:'M'}
    }
  }

];
function designOf(id){ if(state.iv && state.iv.designs && state.iv.designs[id]) return state.iv.designs[id]; return DESIGNS.find(function(d){ return d.id===id; })||null; }

// run a fn with state temporarily set to a design config, then restore (for plan thumbnails)
function withConfig(d, fn){
  var save={pw:state.pw,pd:state.pd,facing:state.facing,shape:state.shape,floorsN:state.floorsN,rooms:state.rooms,layout:state.layout,sel:state.sel,floorView:state.floorView};
  state.pw=d.pw; state.pd=d.pd; state.facing=d.facing; state.shape=d.shape; state.floorsN=d.floorsN;
  state.rooms=JSON.parse(JSON.stringify(d.rooms)); state.layout=null; state.sel=null; state.floorView=0;
  materialize();
  var out=fn();
  state.pw=save.pw; state.pd=save.pd; state.facing=save.facing; state.shape=save.shape; state.floorsN=save.floorsN;
  state.rooms=save.rooms; state.layout=save.layout; state.sel=save.sel; state.floorView=save.floorView;
  return out;
}
// load a design into the live builder
function loadDesign(d){
  state.pw=d.pw; state.pd=d.pd; state.facing=d.facing; state.shape=d.shape; state.floorsN=d.floorsN;
  state.rooms=JSON.parse(JSON.stringify(d.rooms)); state.layout=null; state.sel=null; state.floorView=0;
}

/* ---- Embedded watercolor architectural renders (base64 JPEG) ---- */
