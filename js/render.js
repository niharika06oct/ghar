"use strict";
/* Ghar — SVG elevation generator + gallery/detail views. renderSrc/facadeSVG/renderGallery/renderDetail live here.
   Loaded as a plain <script> (shared global scope, no bundler). See ghar-prototype.html
   for load order. Part of the modular split of the former single-file prototype. */

function renderSrc(d, view){
  if(!d) return null;
  var v=view||'front';
  var r=d._renders && d._renders[v];
  if(r) return r;                                   // in-memory render (guided / refined variation)
  if(v==='front' && d._render) return d._render;
  // Starter gallery designs ship committed watercolor renders for ALL four elevations,
  // baked once to img/renders/<id>-<view>.png (scripts/bake-gallery-views.js). Only the 5
  // starters have a RENDERS entry, so this self-gates to them.
  if(RENDERS[d.id] && (v==='front'||v==='left'||v==='back'||v==='right')){
    return 'img/renders/'+d.id+'-'+v+'.png';
  }
  if(v==='front') return RENDERS[d.id] || null;
  return null;
}
function hasRender(d, view){ return !!renderSrc(d, view); }
function renderImg(d, cls, view){ return '<img class="'+(cls||'')+'" src="'+renderSrc(d, view)+'" alt="'+esc(d.name)+'" draggable="false"/>'; }
function cardElevation(d){ return hasRender(d,'front') ? renderImg(d,'renderImg','front') : facadeSVG(d,'front'); }
function detailElevation(d, view){ return hasRender(d, view) ? renderImg(d,'renderImg',view) : facadeSVG(d,view); }
/* ---- SVG elevation generator (parametric modern Indian facade) ---- */
function chip(x,y,w,h,st){        // a window with chajja (sunshade) + mullions
  return '<rect x="'+(x-3)+'" y="'+(y-5)+'" width="'+(w+6)+'" height="4.5" rx="1.5" fill="'+st.band+'"/>'
    +'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="'+st.glass+'" stroke="'+st.trim+'" stroke-width="2.4"/>'
    +'<line x1="'+(x+w/2)+'" y1="'+y+'" x2="'+(x+w/2)+'" y2="'+(y+h)+'" stroke="'+st.trim+'" stroke-width="1.4"/>'
    +'<line x1="'+x+'" y1="'+(y+h/2)+'" x2="'+(x+w)+'" y2="'+(y+h/2)+'" stroke="'+st.trim+'" stroke-width="1.4"/>';
}
function facadeSVG(d, view){
  if(view==='left'||view==='right') view='side';   // both sides share the side sketch fallback
  var st=d.style, N=d.floorsN, W=400, H=260, gy=232, para=15;
  var fh=Math.min(56,(gy-46-para)/N);
  var bw = view==='side' ? 150 : 212;
  var bh = N*fh+para, bx=(W-bw)/2, top=gy-bh;
  var s='';
  s+='<defs><linearGradient id="sky'+d.id+view+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dff0fb"/><stop offset="1" stop-color="#f3f7ec"/></linearGradient></defs>';
  s+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#sky'+d.id+view+')"/>';
  s+='<circle cx="58" cy="46" r="19" fill="#ffe3a0"/><circle cx="58" cy="46" r="19" fill="#ffd36b" opacity=".5"/>';
  s+='<ellipse cx="330" cy="52" rx="34" ry="12" fill="#ffffff" opacity=".75"/><ellipse cx="305" cy="58" rx="22" ry="9" fill="#ffffff" opacity=".6"/>';
  s+='<rect x="0" y="'+gy+'" width="'+W+'" height="'+(H-gy)+'" fill="#e3d7bd"/>';
  s+='<rect x="0" y="'+gy+'" width="'+W+'" height="5" fill="#d3c4a3"/>';
  // greenery
  s+='<circle cx="30" cy="'+(gy-4)+'" r="16" fill="#7ec698"/><rect x="27" y="'+(gy-4)+'" width="6" height="12" fill="#8a6a44"/>';
  s+='<circle cx="372" cy="'+(gy-2)+'" r="14" fill="#5cb87a"/><rect x="369" y="'+(gy-2)+'" width="6" height="10" fill="#8a6a44"/>';
  // building floors
  for(var f=0; f<N; f++){
    var y=gy-(f+1)*fh - (f===N-1?0:0);
    var yTop = gy-(f+1)*fh;
    s+='<rect x="'+bx+'" y="'+yTop+'" width="'+bw+'" height="'+fh+'" fill="'+st.wall+'" stroke="rgba(0,0,0,.06)" stroke-width="1"/>';
    // string course band between floors
    s+='<rect x="'+bx+'" y="'+(yTop+fh-4)+'" width="'+bw+'" height="4" fill="'+st.band+'" opacity=".9"/>';
  }
  // parapet + roof accent
  s+='<rect x="'+(bx-4)+'" y="'+(top-para)+'" width="'+(bw+8)+'" height="'+para+'" rx="2" fill="'+st.wall+'" stroke="rgba(0,0,0,.06)"/>';
  s+='<rect x="'+(bx-4)+'" y="'+(top-para)+'" width="'+(bw+8)+'" height="4" fill="'+st.band+'"/>';
  // water tank (Sintex) + stair mumty on roof
  s+='<rect x="'+(bx+bw-40)+'" y="'+(top-para-20)+'" width="26" height="20" rx="3" fill="#1f5fa0"/><rect x="'+(bx+bw-40)+'" y="'+(top-para-20)+'" width="26" height="5" rx="2" fill="#2b7fd0"/>';
  s+='<rect x="'+(bx+10)+'" y="'+(top-para-16)+'" width="30" height="16" rx="2" fill="'+st.wall+'" stroke="'+st.band+'" stroke-width="2"/>';
  // windows per floor
  var cols = view==='side' ? 1 : st.cols;
  for(var f=0; f<N; f++){
    var yTop = gy-(f+1)*fh;
    var wy = yTop + fh*0.30, wh = fh*0.40;
    var pad = 22, span = bw - pad*2, ww = Math.min(38, (span/cols)-14);
    var gapX = cols>1 ? (span-ww*cols)/(cols-1) : 0;
    var isGround = f===0;
    for(var c=0; c<cols; c++){
      // on the ground-floor front, leave the middle column open for the door
      if(isGround && view==='front' && c===Math.floor(cols/2)) continue;
      var wx = bx+pad + c*(ww+gapX);
      s+=chip(wx,wy,ww,wh,st);
    }
  }
  // ground floor entrance / balcony
  if(view==='front'){
    // main door
    var dw=30, dh=fh*0.66, dx=bx+bw/2-dw/2, dyy=gy-dh;
    if(st.porch){ // car porch canopy
      s+='<rect x="'+(bx-2)+'" y="'+(gy-fh*0.42)+'" width="'+(bw*0.34)+'" height="6" rx="2" fill="'+st.band+'"/>';
      s+='<rect x="'+(bx+6)+'" y="'+(gy-fh*0.42)+'" width="4" height="'+(fh*0.42)+'" fill="'+st.band+'" opacity=".8"/>';
      // little car
      s+='<rect x="'+(bx+14)+'" y="'+(gy-15)+'" width="34" height="12" rx="4" fill="#c94f4f"/><rect x="'+(bx+20)+'" y="'+(gy-20)+'" width="20" height="7" rx="3" fill="#e07777"/><circle cx="'+(bx+22)+'" cy="'+(gy-3)+'" r="3.5" fill="#2a2a2a"/><circle cx="'+(bx+40)+'" cy="'+(gy-3)+'" r="3.5" fill="#2a2a2a"/>';
    }
    s+='<rect x="'+dx+'" y="'+dyy+'" width="'+dw+'" height="'+dh+'" rx="3" fill="'+st.door+'"/>';
    s+='<line x1="'+(dx+dw/2)+'" y1="'+dyy+'" x2="'+(dx+dw/2)+'" y2="'+gy+'" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>';
    s+='<circle cx="'+(dx+dw-7)+'" cy="'+(dyy+dh/2)+'" r="2" fill="#f2d27a"/>';
    // steps
    s+='<rect x="'+(dx-6)+'" y="'+(gy-4)+'" width="'+(dw+12)+'" height="4" fill="#ccbda0"/>';
    if(st.balcony && N>=2){ // first-floor balcony
      var by=gy-2*fh;
      s+='<rect x="'+(bx+bw/2-40)+'" y="'+(by-2)+'" width="80" height="5" fill="'+st.band+'"/>';
      s+='<rect x="'+(bx+bw/2-40)+'" y="'+(by-16)+'" width="80" height="14" fill="none" stroke="'+st.trim+'" stroke-width="2"/>';
      for(var b=0;b<7;b++) s+='<line x1="'+(bx+bw/2-40+b*13.3)+'" y1="'+(by-16)+'" x2="'+(bx+bw/2-40+b*13.3)+'" y2="'+(by-2)+'" stroke="'+st.trim+'" stroke-width="1.5"/>';
    }
  } else if(view==='back'){
    var dw2=22, dh2=fh*0.6, dx2=bx+bw-46;
    s+='<rect x="'+dx2+'" y="'+(gy-dh2)+'" width="'+dw2+'" height="'+dh2+'" rx="2" fill="'+st.door+'" opacity=".85"/>';
    // pipes
    s+='<line x1="'+(bx+20)+'" y1="'+top+'" x2="'+(bx+20)+'" y2="'+gy+'" stroke="#b9b0a0" stroke-width="3"/>';
  } else { // side
    s+='<line x1="'+(bx+bw-16)+'" y1="'+top+'" x2="'+(bx+bw-16)+'" y2="'+gy+'" stroke="#b9b0a0" stroke-width="3"/>';
  }
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+s+'</svg>';
}

/* ---- SVG top-down plan for a floor (used in cards + detail) ----
 * Drawn to read like an architectural drawing: a thick outer wall around the
 * built footprint, wall-weight partitions between rooms, a door opening + swing
 * arc per room, stair treads, a north arrow, and the main entry on the facing
 * edge. Geometry comes from layoutFloor() (deterministic, non-overlapping). */
var PLAN_WALL='#2b2620', PLAN_INK='#3a332a';
function planDoor(p, cx, cy){
  // Put the door on the room edge nearest the plan centre, with a 90° swing arc.
  var rcx=p.x+p.w/2, rcy=p.y+p.h/2;
  var dx=cx-rcx, dy=cy-rcy;
  var horizontal=Math.abs(dx)>=Math.abs(dy);
  var dw=Math.max(26, Math.min(70, (horizontal?p.h:p.w)*0.34));
  var g='', hx, hy, tx, ty, ex, ey, sweep;
  if(horizontal){
    var ex0=dx>0 ? p.x+p.w : p.x;            // edge x (toward centre)
    var into=dx>0 ? -1 : 1;                   // swing direction into the room
    var y0=rcy-dw/2;
    g+='<line x1="'+ex0+'" y1="'+y0+'" x2="'+ex0+'" y2="'+(y0+dw)+'" stroke="#f4efe6" stroke-width="9"/>'; // opening
    hx=ex0; hy=y0+dw; tx=ex0+into*dw; ty=y0+dw; ex=ex0; ey=y0;   // leaf + arc endpoints
    sweep=(into>0)?1:0;
    g+='<line x1="'+hx+'" y1="'+hy+'" x2="'+tx+'" y2="'+ty+'" stroke="'+PLAN_INK+'" stroke-width="2"/>';
    g+='<path d="M '+tx+' '+ty+' A '+dw+' '+dw+' 0 0 '+sweep+' '+ex+' '+ey+'" fill="none" stroke="'+PLAN_INK+'" stroke-width="1.6" opacity=".6"/>';
  } else {
    var ey0=dy>0 ? p.y+p.h : p.y;
    var into2=dy>0 ? -1 : 1;
    var x0=rcx-dw/2;
    g+='<line x1="'+x0+'" y1="'+ey0+'" x2="'+(x0+dw)+'" y2="'+ey0+'" stroke="#f4efe6" stroke-width="9"/>';
    hx=x0+dw; hy=ey0; tx=x0+dw; ty=ey0+into2*dw; ex=x0; ey=ey0;
    sweep=(into2>0)?0:1;
    g+='<line x1="'+hx+'" y1="'+hy+'" x2="'+tx+'" y2="'+ty+'" stroke="'+PLAN_INK+'" stroke-width="2"/>';
    g+='<path d="M '+tx+' '+ty+' A '+dw+' '+dw+' 0 0 '+sweep+' '+ex+' '+ey+'" fill="none" stroke="'+PLAN_INK+'" stroke-width="1.6" opacity=".6"/>';
  }
  return g;
}
function planSVG(labels){
  var W=1000, H=Math.round(1000*state.pd/state.pw);
  var placed=layoutFloor(floorsData()[Math.min(state.floorView, state.floorsN-1)], W, H);
  // Built-footprint bounding box (for the outer wall + door placement).
  var minX=W, minY=H, maxX=0, maxY=0;
  placed.forEach(function(p){
    if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y;
    if(p.x+p.w>maxX)maxX=p.x+p.w; if(p.y+p.h>maxY)maxY=p.y+p.h;
  });
  if(!placed.length){ minX=minY=0; maxX=W; maxY=H; }
  var cx=(minX+maxX)/2, cy=(minY+maxY)/2;

  var s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="background:#eee6d6">';
  s+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#eee6d6"/>';
  // plot boundary (dashed setback line)
  s+='<rect x="8" y="8" width="'+(W-16)+'" height="'+(H-16)+'" fill="none" stroke="#b7a888" stroke-width="2" stroke-dasharray="10 8"/>';
  // room fills (muted wash) — walls read from the strokes, not the blocks
  placed.forEach(function(p){
    s+='<rect x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'" fill="'+p.room.color+'" fill-opacity=".28" stroke="'+PLAN_INK+'" stroke-width="3"/>';
  });
  // thick outer wall around the whole footprint
  s+='<rect x="'+minX+'" y="'+minY+'" width="'+(maxX-minX)+'" height="'+(maxY-minY)+'" fill="none" stroke="'+PLAN_WALL+'" stroke-width="9"/>';
  // per-room doors + stair treads
  placed.forEach(function(p){
    s+=planDoor(p, cx, cy);
    if(p.room.id==='stairs' || /stair/i.test(p.room.label||'')){
      var n=Math.max(4, Math.round(Math.min(p.w,p.h)/26)), vert=p.h>=p.w;
      for(var i=1;i<n;i++){
        if(vert){ var yy=p.y+p.h*i/n; s+='<line x1="'+(p.x+6)+'" y1="'+yy+'" x2="'+(p.x+p.w-6)+'" y2="'+yy+'" stroke="'+PLAN_INK+'" stroke-width="1.6"/>'; }
        else { var xx=p.x+p.w*i/n; s+='<line x1="'+xx+'" y1="'+(p.y+6)+'" x2="'+xx+'" y2="'+(p.y+p.h-6)+'" stroke="'+PLAN_INK+'" stroke-width="1.6"/>'; }
      }
    }
  });
  // main entry on the facing edge (bolder opening in the outer wall)
  var facing=String(state.facing||'North');
  var mw=Math.min(120,(maxX-minX)*0.3), mh=Math.min(120,(maxY-minY)*0.3);
  if(facing==='North'){ s+='<line x1="'+(cx-mw/2)+'" y1="'+minY+'" x2="'+(cx+mw/2)+'" y2="'+minY+'" stroke="#eee6d6" stroke-width="12"/>'; }
  else if(facing==='South'){ s+='<line x1="'+(cx-mw/2)+'" y1="'+maxY+'" x2="'+(cx+mw/2)+'" y2="'+maxY+'" stroke="#eee6d6" stroke-width="12"/>'; }
  else if(facing==='East'){ s+='<line x1="'+maxX+'" y1="'+(cy-mh/2)+'" x2="'+maxX+'" y2="'+(cy+mh/2)+'" stroke="#eee6d6" stroke-width="12"/>'; }
  else { s+='<line x1="'+minX+'" y1="'+(cy-mh/2)+'" x2="'+minX+'" y2="'+(cy+mh/2)+'" stroke="#eee6d6" stroke-width="12"/>'; }
  // labels for every room (scaled to cell; hidden only when truly tiny)
  if(labels) placed.forEach(function(p){
    if(p.w<70 || p.h<52) return;
    var fs=Math.max(15, Math.min(28, p.w/9));
    s+='<text x="'+(p.x+p.w/2)+'" y="'+(p.y+p.h/2-2)+'" text-anchor="middle" font-family="IBM Plex Sans" font-size="'+fs+'" font-weight="600" fill="'+PLAN_INK+'">'+esc(p.room.label)+'</text>';
    s+='<text x="'+(p.x+p.w/2)+'" y="'+(p.y+p.h/2+fs+2)+'" text-anchor="middle" font-family="IBM Plex Mono" font-size="'+(fs*0.72)+'" fill="rgba(58,51,42,.75)">'+Math.round(p.room.area)+' m²</text>';
  });
  // north arrow (top-right)
  s+='<g transform="translate('+(W-56)+',52)"><line x1="0" y1="26" x2="0" y2="-20" stroke="'+PLAN_INK+'" stroke-width="3"/><path d="M 0 -28 L 8 -12 L 0 -18 L -8 -12 Z" fill="'+PLAN_INK+'"/><text x="0" y="44" text-anchor="middle" font-family="IBM Plex Sans" font-size="20" font-weight="700" fill="'+PLAN_INK+'">N</text></g>';
  s+='</svg>';
  return s;
}

/* ============================ VIEW HELPERS ============================ */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function nf(n){ return n.toLocaleString('en-IN'); }
function floorName(i,N){ return i===0?'Ground floor':(i===N-1?'Top floor':'Floor '+i); }
function floorTag(i){ return i===0?'G':'F'+i; }

/* ============================ RENDER: GALLERY ============================ */
function navBar(showBack, backLabel){
  var h='<header class="nav"><div class="brand" data-act="gotogallery" style="cursor:pointer"><span class="dot">◆</span> Ghar</div>';
  h+='<div class="steps">'
    + '<span class="st '+(state.step==='gallery'||state.step==='detail'?'on':'done')+'" data-act="gotogallery">Designs</span>'
    + '<span class="st '+(state.step==='plot'||state.step==='rooms'||state.step==='layout'?'on':'')+'">Builder</span>'
    + '</div><div class="navspace"></div>';
  if(showBack) h+='<button class="navback" data-act="'+(backLabel==='designs'?'gotogallery':'back')+'">‹ '+(backLabel==='designs'?'All designs':'Back')+'</button>';
  h+='</header>';
  return h;
}

function renderGallery(){

  var h='';

  /* ---------- LANDING ---------- */

  h+='<div class="landing">';

  /* nav */
  h+='<header class="landnav">';
  h+='<div class="landbrand">Gh<span>a</span>r</div>';
  h+='<div class="landspace"></div>';
  h+='<button class="landlink" data-act="scrollhomes">Explore homes</button>';
  h+='<button class="landcta" data-act="startinterview">Design my home →</button>';
  h+='</header>';

  /* hero */
  h+='<section class="landhero">';

  /*
   * Decorative architectural visuals.
   * They use two of our own generated elevations,
   * so there are no external image dependencies.
   */
  h+='<div class="heroBg" style="background-image:url('+HERO+')"></div>';

  h+='<div class="landeyebrow">✦ MADE FOR INDIAN HOMES</div>';

  h+='<h1>Your plot.<br>Your family. Your home.</h1>';

  h+='<p>'
    +'Design practical Indian homes around your plot size, room needs and way of living. '
    +'Explore ready homes first, then customise one or start from your own plot.'
    +'</p>';

  h+='<div class="heroactions">';
  h+='<button class="heroPrimary" data-act="startinterview">Guided discovery →</button>';
  h+='<button class="heroSecondary" data-act="scrollhomes">Explore ready homes</button>';
  h+='<button class="heroSecondary" data-act="startblank">Start with my plot</button>';
  h+='</div>';

  h+='<div class="plotstrip">'
    +'20×30 &nbsp;•&nbsp; 30×40 &nbsp;•&nbsp; 30×50 &nbsp;•&nbsp; 40×60 '
    +'&nbsp;•&nbsp; MULTI-FLOOR &nbsp;•&nbsp; VAASTU-AWARE'
    +'</div>';

  h+='</section>';

  /* ---------- READY DESIGNS ---------- */

  h+='<section class="readySection" id="readyHomes">';

  h+='<div class="readyHead">';
  h+='<div class="readyKicker">FIVE READY HOMES</div>';
  h+='<h2>Start with a home you can imagine living in.</h2>';
  h+='<p>'
    +'Each home comes with a complete room programme, multiple floors '
    +'and an editable layout. Hover to peek at its floor plan.'
    +'</p>';
  h+='</div>';

  h+='<div class="showcaseWrap">';
  h+='<button class="scrollArrow prev" data-act="scrollcards" data-dir="-1" aria-label="Previous homes">‹</button>';
  h+='<button class="scrollArrow next" data-act="scrollcards" data-dir="1" aria-label="Next homes">›</button>';
  h+='<div class="designShowcase" id="designShowcase">';

  DESIGNS.forEach(function(d,idx){

    var fLabel=d.floorsN<=1 ? 'G' : 'G + '+(d.floorsN-1);

    var total=withConfig(d,function(){
      return totalArea();
    });

    /*
     * Generate ground-floor preview using the existing layout engine.
     * withConfig() prevents this from altering the live builder state.
     */
    var groundPlan=withConfig(d,function(){
      ensureLayout();
      state.floorView=0;
      return planSVG(false);
    });

    var elevation=cardElevation(d);

    /* work out rough bedroom count for display */
    var beds=0;
    if(d.rooms.master) beds+=d.rooms.master.count;
    if(d.rooms.bedroom) beds+=d.rooms.bedroom.count;
    if(d.rooms.guest) beds+=d.rooms.guest.count;

    h+='<button class="designCard" '
      +'data-act="opendesign" '
      +'data-id="'+d.id+'">';

      h+='<div class="designVisual">';

        h+='<div class="planPeek">HOVER · FLOOR PLAN</div>';

        h+='<div class="designElevation">'
          +elevation+
        '</div>';

        h+='<div class="designPlan">'
          +groundPlan+
        '</div>';

      h+='</div>';

      h+='<div class="designInfo">';

        h+='<div class="designNumber">'
          +'HOME '+String(idx+1).padStart(2,'0')
          +'</div>';

        h+='<div class="designTitle">'
          +esc(d.name)
          +'</div>';

        h+='<div class="designTag">'
          +esc(d.tag)
          +'</div>';

        h+='<div class="designFacts">';

          h+='<span class="factpill">'
            +d.pw+'×'+d.pd+' ft'
            +'</span>';

          h+='<span class="factpill">'
            +beds+' BHK'
            +'</span>';

          h+='<span class="factpill">'
            +d.facing+' facing'
            +'</span>';

          h+='<span class="factpill">'
            +fLabel
            +'</span>';

          h+='<span class="factpill">'
            +nf(total)+' m²'
            +'</span>';

        h+='</div>';

        h+='<div class="exploreRow">'
          +'<span>Explore this home</span>'
          +'<span>→</span>'
          +'</div>';

      h+='</div>';

    h+='</button>';

  });

  h+='</div>';   // .designShowcase
  h+='</div>';   // .showcaseWrap

  /* ---------- YOUR VARIATIONS (session-only refined homes) ---------- */

  if(state.userDesigns && state.userDesigns.length){

    h+='<div class="readyHead" style="margin-top:52px">';
    h+='<div class="readyKicker">YOUR VARIATIONS</div>';
    h+='<h2>Homes you refined.</h2>';
    h+='<p>Variations you created by answering a few more questions — each one is the same '
      +'home with your change painted in. They live in this session.</p>';
    h+='</div>';

    h+='<div class="showcaseWrap"><div class="designShowcase">';

    state.userDesigns.forEach(function(d){
      var fLabel=d.floorsN<=1 ? 'G' : 'G + '+(d.floorsN-1);
      var beds=0;
      if(d.rooms){
        if(d.rooms.master) beds+=d.rooms.master.count;
        if(d.rooms.bedroom) beds+=d.rooms.bedroom.count;
        if(d.rooms.guest) beds+=d.rooms.guest.count;
      }
      var painting=(d._fetching && d._fetching.front) && !hasRender(d,'front');

      h+='<button class="designCard" data-act="opendesign" data-id="'+d.id+'">';
        h+='<div class="designVisual"><div class="designElevation">'+cardElevation(d);
        if(painting){
          h+='<div class="elevBusy"><span class="aispin" style="border-color:rgba(0,0,0,.15);border-top-color:#b85f3d"></span> Painting…</div>';
        }
        h+='</div></div>';
        h+='<div class="designInfo">';
          h+='<div class="designNumber">VARIATION</div>';
          h+='<div class="designTitle">'+esc(d.name)+'</div>';
          h+='<div class="designTag">'
            +esc(d._refineChanges && d._refineChanges.length ? d._refineChanges.join(' · ') : 'Your custom variation')
            +'</div>';
          h+='<div class="designFacts">';
            h+='<span class="factpill">'+d.pw+'×'+d.pd+' ft</span>';
            h+='<span class="factpill">'+beds+' BHK</span>';
            h+='<span class="factpill">'+d.facing+' facing</span>';
            h+='<span class="factpill">'+fLabel+'</span>';
          h+='</div>';
          h+='<div class="exploreRow"><span>Open this variation</span><span>→</span></div>';
        h+='</div>';
      h+='</button>';
    });

    h+='</div></div>';
  }

  /* ---------- BLANK DESIGN CTA ---------- */

  h+='<div class="ownDesign">';

    h+='<div>';
      h+='<h3>Already know your plot?</h3>';
      h+='<p>'
        +'Start from scratch with your own dimensions, facing, '
        +'shape, floors and room requirements.'
        +'</p>';
    h+='</div>';

    h+='<button data-act="startblank">'
      +'Start with my plot →'
      +'</button>';

  h+='</div>';

  h+='</section>';

  h+='</div>';

  document.getElementById('app').innerHTML=h;
}

function renderDetail(){

  var d=designOf(state.design);

  if(!d){
    state.step='gallery';
    return renderGallery();
  }

  var fLabel=d.floorsN<=1
    ? 'G'
    : 'G + '+(d.floorsN-1);

  var total=withConfig(d,function(){
    return totalArea();
  });

  var capacity=withConfig(d,function(){
    return capacityM2();
  });

  var utilisation=Math.round(total/capacity*100);

  var beds=0;

  if(d.rooms.master){
    beds+=d.rooms.master.count;
  }

  if(d.rooms.bedroom){
    beds+=d.rooms.bedroom.count;
  }

  if(d.rooms.guest){
    beds+=d.rooms.guest.count;
  }


  /* generate every floor plan without touching the user's live state */

  var floorPlans=withConfig(d,function(){

    ensureLayout();

    var out=[];
    var N=state.floorsN;
    var floorData=floorsData();

    for(var i=0;i<N;i++){

      state.floorView=i;

      out.push({
        i:i,
        name:floorName(i,N),
        svg:planSVG(true),
        rooms:floorData[i].map(function(r){
          return r.label;
        })
      });

    }

    return out;
  });


  var h=navBar(true,'designs');


  /* ---------- HEADER ---------- */

  h+='<section class="designDetailHero">';

    h+='<div class="eyebrow">READY HOME · '+d.pw+'×'+d.pd+' FT</div>';

    h+='<h1>'
      +esc(d.name)
      +'</h1>';

    h+='<p>'
      +esc(d.tag)
      +' · '
      +beds+' BHK'
      +' · '
      +fLabel
      +' · '
      +SHAPES[d.shape].label
      +' · '
      +d.facing+' facing.'
      +'</p>';

  h+='</section>';


  h+='<div class="gallery">';

  h+='<div class="detailwrap">';


  /* =====================================================
     MAIN CONTENT
     ===================================================== */

  h+='<section>';


    /* elevation carousel — front → left → rear → right; swipe or tap a dot (issue #7) */

    var ELEV_VIEWS=[['front','Front'],['left','Left'],['back','Rear'],['right','Right']];
    var elevLabels={front:'front',back:'rear',left:'left side',right:'right side'};

    h+='<div class="elevCarousel" id="elevCarousel">';
    ELEV_VIEWS.forEach(function(e){
      var v=e[0];
      h+='<div class="elevSlide" data-view="'+v+'">';
      h+='<div class="elevCaption">'+e[1]+' elevation</div>';
      h+='<div class="detailMainVisual">';
      h+=detailElevation(d,v);
      var painting=(state.elevBusy===v) || (d._fetching && d._fetching[v]);
      if(painting && !hasRender(d,v)){
        h+='<div class="elevBusy"><span class="aispin" style="border-color:rgba(0,0,0,.15);border-top-color:#b85f3d"></span>'
          +' Painting the '+(elevLabels[v]||v)+' elevation…</div>';
      }
      h+='</div></div>';
    });
    h+='</div>';

    h+='<div class="elevDots">';
    ELEV_VIEWS.forEach(function(e){
      h+='<button class="elevDot '+(state.elev===e[0]?'on':'')+'" data-act="elev" data-v="'+e[0]+'" '
        +'aria-label="'+e[1]+' elevation" title="'+e[1]+'"></button>';
    });
    h+='</div>';

    if(state.elevError && !state.elevBusy){
      h+='<div class="aierr" style="margin-top:10px">⚠ '+esc(state.elevError)+'</div>';
    }

    // Advisory consistency note — the views were painted as one sheet, but a diffusion model
    // can still let panels drift. Show a gentle heads-up; never blocks (validation decision).
    if(d._viewCheck && d._viewCheck.consistent===false){
      h+='<div class="elevNote">△ '
        +esc(d._viewCheck.note || 'These views may differ slightly — regenerate for a closer match.')
        +'</div>';
    }


    /* design notes — how this home honors the brief/changes + what was adjusted.
       Populated after a render is generated (guided choose / refine); starters skip it. */
    if(d._notesFetching || (d._notes && ((d._notes.honored||[]).length || (d._notes.compromises||[]).length))){
      h+='<div class="designNotes">';
      h+='<div class="notesTitle">Why this home fits '+(d._variationOf?'your changes':'your brief')+'</div>';
      if(d._notesFetching && !d._notes){
        h+='<p class="ivhint" style="margin:8px 0 0"><span class="aispin" style="border-color:rgba(0,0,0,.15);border-top-color:#b85f3d"></span> Writing your design notes…</p>';
      } else {
        if((d._notes.honored||[]).length){
          h+='<div class="notesGroup"><div class="notesHead">✓ Taken from what you asked for</div><ul class="notesList">';
          d._notes.honored.forEach(function(t){ h+='<li>'+esc(t)+'</li>'; });
          h+='</ul></div>';
        }
        if((d._notes.compromises||[]).length){
          h+='<div class="notesGroup"><div class="notesHead adj">△ What we had to adjust</div><ul class="notesList">';
          d._notes.compromises.forEach(function(t){ h+='<li>'+esc(t)+'</li>'; });
          h+='</ul></div>';
        }
      }
      h+='</div>';
    }


    /* floor plans */

    h+='<div class="floorSection">';

      h+='<div class="sectionTitle">Explore every floor.</div>';

      h+='<div class="sectionSub">'
        +'These layouts are generated from this home’s actual room programme.'
        +'</div>';


      h+='<div class="floorPlanGrid">';


      floorPlans.forEach(function(fp){

        h+='<article class="floorPlanCard">';

          h+='<div class="floorPlanName">'
            +floorTag(fp.i)
            +' · '
            +fp.name
            +'</div>';

          h+='<div class="floorPlanSvg">'
            +fp.svg
            +'</div>';

          h+='<div class="floorPlanRooms">'
            +esc(fp.rooms.join(' · '))
            +'</div>';

        h+='</article>';

      });


      h+='</div>';

    h+='</div>';


  h+='</section>';


  /* =====================================================
     SIDEBAR
     ===================================================== */

  h+='<aside class="sidebar">';


    /* design facts */

    h+='<div class="summary">';

      h+='<div class="slabel">THIS HOME</div>';

      h+='<div class="sbig">'
        +nf(total)
        +' m²'
        +'</div>';

      h+='<div style="font:400 12px/1.55 \'IBM Plex Sans\';'
        +'color:#c8bda8;margin-top:8px">'
        +d.pw+'×'+d.pd+' ft plot'
        +' · '
        +fLabel
        +' · '
        +utilisation+'% planned'
        +'</div>';

    h+='</div>';


    /* quick facts */

    h+='<div class="panel" style="margin-top:14px">';

      h+='<div style="font:700 15px \'Bricolage Grotesque\';margin-bottom:12px">'
        +'At a glance'
        +'</div>';

      h+='<div class="statgrid">';

        h+='<div class="stat">'
          +'<div class="k">BEDROOMS</div>'
          +'<div class="v">'+beds+'</div>'
          +'</div>';

        h+='<div class="stat">'
          +'<div class="k">FACING</div>'
          +'<div class="v">'+d.facing+'</div>'
          +'</div>';

        h+='<div class="stat">'
          +'<div class="k">SHAPE</div>'
          +'<div class="v">'+SHAPES[d.shape].label+'</div>'
          +'</div>';

        h+='<div class="stat">'
          +'<div class="k">FLOORS</div>'
          +'<div class="v">'+fLabel+'</div>'
          +'</div>';

      h+='</div>';

    h+='</div>';


    /* room programme */

    h+='<div class="panel">';

      h+='<div style="font:700 15px \'Bricolage Grotesque\';margin-bottom:12px">'
        +'What’s inside'
        +'</div>';

      h+='<div class="tiles">';

      Object.keys(d.rooms).forEach(function(id){

        var r=roomOf(id);
        var e=d.rooms[id];

        if(!r) return;

        h+='<div class="tile" style="background:'+r.color+'">';

          h+='<div style="font-size:20px">'
            +r.icon
            +'</div>';

          h+='<div style="font:600 12px \'IBM Plex Sans\';'
            +'margin-top:auto;padding-top:8px;line-height:1.2">'
            +(e.count>1 ? e.count+'× ' : '')
            +r.label
            +'</div>';

          h+='<div style="font:500 10px \'IBM Plex Mono\';'
            +'color:rgba(255,255,255,.85);margin-top:3px">'
            +e.size
            +' · '
            +Math.round(r.sizes[e.size]*e.count)
            +' m²'
            +'</div>';

        h+='</div>';

      });

      h+='</div>';

    h+='</div>';


    /* Vaastu explanation */

    var vaastuText='';

    if(d.facing==='North'){
      vaastuText=
        'North-facing entrance, with the kitchen intended toward the south-east '
        +'and the primary bedroom toward the south-west.';
    }
    else if(d.facing==='East'){
      vaastuText=
        'East-facing entrance, with the kitchen intended toward the south-east '
        +'and the primary bedroom toward the south-west.';
    }
    else{
      vaastuText=
        d.facing+'-facing plot, while retaining a south-east kitchen '
        +'and south-west primary-bedroom intent internally.';
    }

    h+='<div class="vaastuCard">';

      h+='<div class="vaastuTitle">🪔 Vaastu intent</div>';

      h+='<div class="vaastuText">'
        +vaastuText
        +'</div>';

    h+='</div>';


    /* actions */

    h+='<div class="panel">';

      h+='<button class="ebtn" '
        +'data-act="usedesign" '
        +'data-id="'+d.id+'" '
        +'style="width:100%;background:#12100d;color:#fff;'
        +'border-color:#12100d;padding:14px;font-size:14px">'
        +'Use this home →'
        +'</button>';

      h+='<button class="ebtn" '
        +'data-act="editdesign" '
        +'data-id="'+d.id+'" '
        +'style="width:100%;margin-top:9px;padding:14px;font-size:14px">'
        +'✎ Customise this design'
        +'</button>';

      // Refine ANY home by answering a few "what to change" questions — the new images
      // extend the current render (same house, applied change) and save as a variation.
      h+='<button class="ebtn" '
        +'data-act="refinedesign" '
        +'data-id="'+d.id+'" '
        +'style="width:100%;margin-top:9px;padding:14px;font-size:14px">'
        +'↻ Refine by answering questions'
        +'</button>';

      // Guided-discovery homes (id "dir_…") can jump back to the editable brief and
      // re-answer, then regenerate — the render loop for issue #6.
      if(d.id && d.id.indexOf('dir_')===0){
        h+='<button class="ebtn" '
          +'data-act="backtobrief" '
          +'style="width:100%;margin-top:9px;padding:14px;font-size:14px">'
          +'↺ Change my answers'
          +'</button>';
      }

      h+='<div style="font:400 11px/1.5 \'IBM Plex Sans\';'
        +'color:#8a8378;margin-top:12px;text-align:center">'
        +'Use it directly or change the plot, rooms and layout in the builder.'
        +'</div>';

    h+='</div>';


  h+='</aside>';


  h+='</div>';
  h+='</div>';


  document.getElementById('app').innerHTML=h;
  wireElevCarousel(d);
}

/* Position the elevation carousel on the active view and track swipes → dots + lazy paint. */
function wireElevCarousel(d){
  var car=document.getElementById('elevCarousel'); if(!car) return;
  var views=['front','left','back','right'];
  var idx=views.indexOf(state.elev); if(idx<0) idx=0;
  car.scrollLeft=idx*car.clientWidth;              // snap to the active slide (no animation)
  var t;
  car.addEventListener('scroll', function(){
    clearTimeout(t);
    t=setTimeout(function(){
      var i=Math.round(car.scrollLeft/Math.max(1,car.clientWidth));
      var v=views[Math.max(0,Math.min(views.length-1,i))];
      if(v===state.elev) return;
      state.elev=v; state.elevError=null;
      var dots=car.parentNode.querySelectorAll('.elevDot');
      for(var j=0;j<dots.length;j++){ dots[j].classList.toggle('on', dots[j].getAttribute('data-v')===v); }
      var ed=designOf(state.design);
      if(ed) fetchElevation(ed, v);               // no-op for cached / offline
    }, 120);
  });
}

/* ============================ RENDER ============================ */
