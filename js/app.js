"use strict";
/* Ghar — App shell: render() dispatcher, delegated click/drag handlers, history sync, and the bootstrap render() call (must load LAST).
   Loaded as a plain <script> (shared global scope, no bundler). See ghar-prototype.html
   for load order. Part of the modular split of the former single-file prototype. */

function render(){
  var s=state;
  if(s.step==='gallery'){ renderGallery(); return; }
  if(s.step==='detail'){ renderDetail(); return; }
  if(s.step==='interview'){ renderInterview(); return; }
  if(s.step==='brief'){ renderBrief(); return; }
  if(s.step==='directions'){ renderDirections(); return; }
  var isPlot=s.step==='plot', isRooms=s.step==='rooms', isLayout=s.step==='layout';
  if(isLayout) ensureLayout();

  var total=totalArea(), cap=capacityM2(), used=Math.min(100,Math.round(total/cap*100));
  var free=Math.round(cap-total), full=free<0.5;
  var rc=roomCount(), hasRooms=activeRooms().length>0;
  var fLabel=s.floorsN<=1?'G':'G + '+(s.floorsN-1);
  var footprint=footprintM2(), coverage=Math.round(footprint/plotAreaM2()*100);

  var eyebrow,title,sub;
  if(isPlot){ eyebrow='STEP 1 · YOUR PLOT'; title='Start with your plot.'; sub='Set your plot size, facing, footprint and floors first. Ghar works out the total built-up area you have to play with — every room you add later must fit inside it.'; }
  else if(isRooms){ eyebrow='STEP 2 · YOUR ROOMS'; title='Fill your plot with rooms.'; sub='Add the rooms you want within your '+Math.round(cap)+' m² budget. Ghar stops you the moment a room would overflow the plot.'; }
  else { eyebrow='STEP 3 · DESIGN THE LAYOUT'; title='Arrange your rooms.'; sub='Ghar auto-fits every room into your footprint. Drag to swap, tap to select, then resize, reorder, move floors or delete — a live 2D plan.'; }

  var ctaEnabled = isPlot ? true : isRooms ? (rc>0 && !full) : true;
  var ctaLabel = isPlot ? ('Continue to rooms · '+Math.round(cap)+' m² budget')
               : isRooms ? (rc>0?'Design the layout · '+rc+' rooms':'Add a room to start')
               : 'Looks good ✓';

  var h='';
  /* nav */
  h+='<header class="nav"><div class="brand" data-act="gotogallery" style="cursor:pointer"><span class="dot">◆</span> Ghar</div>';
  h+='<div class="steps">'
    + '<span class="st '+(isPlot?'on':'done')+'" data-act="step" data-v="plot">1 · Plot</span>'
    + '<span class="st '+(isRooms?'on':(isLayout?'done':''))+'" data-act="step" data-v="rooms">2 · Rooms</span>'
    + '<span class="st '+(isLayout?'on':'')+'" data-act="step" data-v="layout">3 · Layout</span>'
    + '</div><div class="navspace"></div>';
  h+='<button class="navback" data-act="'+(isPlot?'gotogallery':'back')+'">‹ '+(isPlot?'Designs':'Back')+'</button>';
  h+='<button class="navcta '+(ctaEnabled?'':'off')+'" data-act="next">'+esc(ctaLabel)+'</button></header>';

  h+='<div class="hero"><div class="eyebrow">'+eyebrow+'</div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div>';
  h+='<main class="workspace"><section>';

  /* ---------- STEP 1 · PLOT ---------- */
  if(isPlot){
    h+='<div class="field"><div class="flabel">Plot size</div><div class="presets">';
    [[20,30],[30,40],[30,50],[40,60],[50,80],[40,40]].forEach(function(p){
      var on=s.pw===p[0]&&s.pd===p[1];
      h+='<button class="preset '+(on?'on':'')+'" data-act="plot" data-w="'+p[0]+'" data-d="'+p[1]+'"><div class="pd">'+p[0]+'×'+p[1]+' ft</div><div class="ps">'+Math.round(p[0]*p[1]*0.092903)+' m² plot</div></button>';
    });
    h+='</div></div>';
    h+='<div class="field"><div class="flabel">Entrance facing</div><div class="facings">';
    [['North','↑'],['East','→'],['South','↓'],['West','←']].forEach(function(f){
      h+='<button class="facing '+(s.facing===f[0]?'on':'')+'" data-act="facing" data-v="'+f[0]+'"><div style="font:600 18px \'IBM Plex Sans\'">'+f[1]+'</div><div style="font:500 11px \'IBM Plex Sans\';margin-top:3px">'+f[0]+'</div></button>';
    });
    h+='</div></div>';
    h+='<div class="field"><div class="flabel">Footprint shape</div><div class="shapepick">';
    Object.keys(SHAPES).forEach(function(k){
      var sh=SHAPES[k], on=s.shape===k, prev='';
      sh.rects.forEach(function(r){ prev+='<div style="position:absolute;left:'+(r[0]*100)+'%;top:'+(r[1]*100)+'%;width:'+(r[2]*100)+'%;height:'+(r[3]*100)+'%;background:'+(on?'#e8833a':'#d8cdb9')+';border-radius:3px"></div>'; });
      h+='<button class="shapeopt '+(on?'on':'')+'" data-act="shape" data-v="'+k+'"><div class="shapeprev">'+prev+'</div><div style="font:600 13px \'IBM Plex Sans\'">'+sh.label+'</div><div style="font:400 10px \'IBM Plex Mono\';color:#9a9082;margin-top:2px">'+sh.sub+'</div></button>';
    });
    h+='</div></div>';
    h+='<div class="field" style="margin-bottom:0"><div class="flabel">Floors (compact plots stack up)</div>';
    h+='<div class="stepper"><button class="btn '+(s.floorsN>1?'':'off')+'" data-act="decfloor">−</button><div style="text-align:center;min-width:96px"><div style="font:700 20px \'Bricolage Grotesque\'">'+fLabel+'</div><div style="font:400 10px \'IBM Plex Mono\';color:#9a9082">'+s.floorsN+' levels</div></div><button class="btn '+(s.floorsN<4?'':'off')+'" data-act="incfloor">+</button></div>';
    h+='<div class="infocard" style="background:#eef3fb;border:1px solid #d3e0f2"><span style="font-size:16px">🏗️</span><div style="font:400 11.5px/1.55 \'IBM Plex Sans\';color:#4a5b74">Ghar assumes a <b>flat RCC roof</b> — the Indian norm for its low cost, usable terrace and easy future extension. Municipal setbacks are reserved on all sides, giving <b>'+coverage+'% ground coverage</b>.</div></div>';
    h+='</div>';
  }

  /* ---------- STEP 2 · ROOMS ---------- */
  if(isRooms){
    h+='<div class="tabs">';
    CATS.forEach(function(c){ h+='<button class="tab '+(s.cat===c.key?'on':'')+'" data-act="cat" data-v="'+c.key+'">'+c.label+'</button>'; });
    h+='</div><div class="grid">';
    CATALOG.filter(function(r){ return r.cat===s.cat; }).forEach(function(r){
      var e=state.rooms[r.id], count=e?e.count:0, size=e?e.size:'M', on=count>0;
      var atMax=count>=r.max, addBlocked=!canAdd(r) && !atMax;
      var meta = on ? (r.sizes[size]+' m² each · '+Math.round(r.sizes[size]*count)+' m² total')
                    : ('S '+r.sizes.S+' · M '+r.sizes.M+' · L '+r.sizes.L+' m²');
      h+='<div class="card'+(on?' on':'')+'" style="'+(on?'border-color:'+r.color+';box-shadow:0 6px 18px -12px '+r.color:'')+'">';
      h+='<div class="cardhead"><div class="ric'+(on?' on':'')+'" style="'+(on?'background:'+r.color:'')+'">'+r.icon+'</div>';
      h+='<div class="cbody"><div style="display:flex;align-items:center;gap:7px"><div class="cname">'+r.label+'</div>'
        +(atMax?'<span class="maxb">MAX</span>':(addBlocked?'<span class="fullb">PLOT FULL</span>':''))+'</div><div class="cmeta">'+meta+'</div></div>';
      var incTitle=atMax?('You can have at most '+r.max+' '+r.label.toLowerCase()+(r.max>1?'':'')+' — that’s the sensible limit for this room.')
                        :(addBlocked?'Your plot is full. Shrink or remove a room to make space for more.':'');
      h+='<div class="counter"><button class="btn '+(count>0?'':'off')+'" data-act="dec" data-v="'+r.id+'">−</button><span class="cnt">'+count+'</span>'
        +'<button class="btn '+(atMax||addBlocked?'off':'')+'"'+(incTitle?' title="'+esc(incTitle)+'" aria-disabled="true"':'')+' data-act="inc" data-v="'+r.id+'">+</button></div></div>';
      if(on){
        h+='<div class="sizes">';
        ['S','M','L'].forEach(function(z){
          var zon=size===z, ok=canSize(r,z);
          var szTitle=ok?'':('Not enough space on your plot for a '+({S:'small',M:'medium',L:'large'}[z]||z)+' '+r.label.toLowerCase()+'. Free up space first.');
          h+='<button class="sz '+(ok?'':'off')+'"'+(ok?'':' title="'+esc(szTitle)+'" aria-disabled="true"')+' data-act="size" data-v="'+r.id+'" data-z="'+z+'" style="'+(zon?'background:'+r.color+';color:#fff':'')+'"><b>'+z+'</b> · '+r.sizes[z]+'m²</button>';
        });
        h+='</div>';
      }
      h+='</div>';
    });
    h+='</div>';
  }

  /* ---------- STEP 3 · LAYOUT (2D editor) ---------- */
  if(isLayout){
    var floors=floorsData(), N=floors.length;
    var fv=Math.min(s.floorView, N-1);
    var W=1000, H=Math.round(1000*s.pd/s.pw);
    var placed=layoutFloor(floors[fv], W, H);
    var compass={North:'N',East:'E',South:'S',West:'W'}[s.facing];

    h+='<div class="floortabs">';
    floors.forEach(function(fl,i){
      var a=0; fl.forEach(function(r){ a+=r.area; });
      h+='<button class="ft '+(i===fv?'on':'')+'" data-act="floorview" data-v="'+i+'">'+floorTag(i)+'<span class="fts">'+floorName(i,N).replace(' floor','')+' · '+Math.round(a)+' m²</span></button>';
    });
    h+='</div>';
    h+='<div class="edithint"><span>✋</span><b>Drag</b> a room onto another to swap · <b>tap</b> to select, then edit it in the panel →</div>';

    h+='<div class="plancanvas" style="aspect-ratio:'+s.pw+' / '+s.pd+'"><div class="compass">'+compass+'</div>';
    placed.forEach(function(p){
      var big=p.w/W>0.14 && p.h/H>0.10, selc=p.room.key===s.sel;
      h+='<div class="room'+(selc?' sel':'')+'" draggable="true" data-act="selroom" data-key="'+p.room.key+'" style="left:'+(p.x/W*100)+'%;top:'+(p.y/H*100)+'%;width:'+(p.w/W*100)+'%;height:'+(p.h/H*100)+'%;background:'+p.room.color+'"><span class="ri">'+p.room.icon+'</span>';
      if(big){ h+='<div class="rn">'+esc(p.room.label)+'</div><div class="ra">'+Math.round(p.room.area)+' m² · '+p.room.size+'</div>'; }
      h+='</div>';
    });
    h+='</div>';

    var zones={}; floors[fv].forEach(function(r){ zones[r.cat]=true; });
    h+='<div class="legend">';
    Object.keys(ZONE).forEach(function(k){ if(zones[k]) h+='<div class="lg"><span class="sw" style="background:'+ZONE[k][1]+'"></span>'+ZONE[k][0]+'</div>'; });
    h+='</div>';

    h+='<div class="statgrid" style="grid-template-columns:1fr 1fr 1fr">';
    h+='<div class="stat"><div class="k">THIS FLOOR</div><div class="v">'+floors[fv].length+' rooms</div></div>';
    h+='<div class="stat"><div class="k">BUILT-UP · '+fLabel+'</div><div class="v">'+nf(total)+' m²</div></div>';
    h+='<div class="stat"><div class="k">OF '+Math.round(cap)+' M² BUDGET</div><div class="v">'+used+'%</div></div>';
    h+='</div>';
  }

  h+='</section>';

  /* ---------- SIDEBAR ---------- */
  h+='<aside class="sidebar">';

  if(isPlot){
    h+='<div class="summary"><div class="slabel">TOTAL BUILT-UP BUDGET</div><div class="sbig">'+Math.round(cap)+' m²</div>';
    h+='<div style="font:400 12px \'IBM Plex Sans\';color:#c8bda8;margin-top:6px">'+s.pw+'×'+s.pd+' ft · '+fLabel+' · '+SHAPES[s.shape].label+'</div></div>';
    // footprint top-down preview
    var pxW,pxH,mW=300,mH=200;
    if(s.pw>=s.pd){ pxW=mW; pxH=Math.round(mW*s.pd/s.pw); } else { pxH=mH; pxW=Math.round(mH*s.pw/s.pd); }
    if(pxH>mH){ pxW=Math.round(pxW*mH/pxH); pxH=mH; }
    var inset=0.11, iw=1-inset*2;
    var pos={North:'top:4px;left:50%;transform:translateX(-50%)',South:'bottom:4px;left:50%;transform:translateX(-50%)',East:'right:4px;top:50%;transform:translateY(-50%)',West:'left:4px;top:50%;transform:translateY(-50%)'}[s.facing];
    var arrow={North:'↑',East:'→',South:'↓',West:'←'}[s.facing];
    h+='<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font:700 15px \'Bricolage Grotesque\'">Footprint</div><div style="font:500 10px \'IBM Plex Mono\';color:#8a8378;background:#eae4d7;padding:3px 8px;border-radius:6px">TOP-DOWN</div></div>';
    h+='<div class="plotwrap"><div style="position:relative;width:'+pxW+'px;height:'+pxH+'px;background:#efe7d7;border:1.5px solid #cdbb9f;border-radius:6px">';
    h+='<div style="position:absolute;left:'+(inset*100)+'%;top:'+(inset*100)+'%;right:'+(inset*100)+'%;bottom:'+(inset*100)+'%;border:1px dashed rgba(200,121,79,.55);border-radius:3px"></div>';
    SHAPES[s.shape].rects.forEach(function(r){ h+='<div style="position:absolute;left:'+((inset+r[0]*iw)*100)+'%;top:'+((inset+r[1]*iw)*100)+'%;width:'+(r[2]*iw*100)+'%;height:'+(r[3]*iw*100)+'%;background:linear-gradient(135deg,#e8833a,#c8794f);border-radius:3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)"></div>'; });
    h+='<div style="position:absolute;'+pos+';width:22px;height:22px;border-radius:50%;background:#12100d;color:#e0a458;display:flex;align-items:center;justify-content:center;font:600 12px \'IBM Plex Sans\';z-index:5">'+arrow+'</div>';
    h+='</div></div>';
    h+='<div class="statgrid"><div class="stat"><div class="k">PLOT AREA</div><div class="v">'+nf(Math.round(plotAreaM2()))+' m²</div></div><div class="stat"><div class="k">GROUND FLOOR</div><div class="v">'+nf(Math.round(footprint))+' m²</div></div><div class="stat"><div class="k">BUILT-UP · '+fLabel+'</div><div class="v">'+nf(Math.round(cap))+' m²</div></div><div class="stat"><div class="k">GROUND COVERAGE</div><div class="v">'+coverage+'%</div></div></div>';
    h+='</div>';
  }

  if(isRooms){
    var barcol = full ? 'linear-gradient(90deg,#e8833a,#ec6a86)' : (used>=85?'linear-gradient(90deg,#e0a458,#e8833a)':'linear-gradient(90deg,#5cb87a,#e0a458)');
    h+='<div class="summary"><div style="display:flex;justify-content:space-between;align-items:baseline"><div><div class="slabel">ROOMS USE</div><div class="sbig">'+nf(total)+' m²</div></div><div style="text-align:right"><div class="slabel">'+rc+' rooms</div><div style="font:600 14px \'IBM Plex Sans\';color:#fff;margin-top:3px">'+fLabel+'</div></div></div>';
    h+='<div style="display:flex;justify-content:space-between;font:400 9.5px \'IBM Plex Mono\';color:#8a7d6d;margin:16px 0 5px"><span>OF '+Math.round(cap)+' m² PLOT BUDGET</span><span>'+used+'%</span></div>';
    h+='<div class="meter"><div style="width:'+used+'%;height:100%;border-radius:5px;background:'+barcol+'"></div></div>';
    h+='<div style="font:500 11.5px \'IBM Plex Sans\';color:'+(full?'#f2a58c':'#8fce9f')+';margin-top:11px">'+(full?'⚠ Plot is full — remove or shrink a room to add more.':'✓ '+Math.max(0,free)+' m² still free on this plot.')+'</div></div>';

    h+='<div class="panel">';
    if(!hasRooms){ h+='<div class="empty"><div style="font-size:40px;margin-bottom:10px">🏠</div><div style="font:600 15px \'IBM Plex Sans\';color:#5a534a">No rooms yet</div><div style="font:400 12.5px/1.5 \'IBM Plex Sans\';margin-top:6px">Add rooms from the catalog and they\'ll show up here.</div></div>'; }
    else {
      h+='<div style="font:700 15px \'Bricolage Grotesque\';margin-bottom:13px">My rooms</div><div class="tiles">';
      activeRooms().forEach(function(r){ var e=state.rooms[r.id]; h+='<div class="tile" style="background:'+r.color+'"><div style="font-size:21px">'+r.icon+'</div><div style="font:600 12.5px \'IBM Plex Sans\';margin-top:auto;padding-top:8px;line-height:1.2">'+(e.count>1?e.count+'× ':'')+r.label+'</div><div style="font:500 10px \'IBM Plex Mono\';color:rgba(255,255,255,.85);margin-top:3px">'+e.size+' · '+Math.round(r.sizes[e.size]*e.count)+' m²</div></div>'; });
      h+='</div>';
      var za={beds:0,living:0,outdoor:0,utility:0};
      activeRooms().forEach(function(r){ za[r.cat]+=r.sizes[state.rooms[r.id].size]*state.rooms[r.id].count; });
      var mx=Math.max(1,za.beds,za.living,za.outdoor,za.utility);
      h+='<div style="font:600 12px \'IBM Plex Sans\';color:#5a534a;margin:20px 0 11px">Area by zone</div><div style="display:flex;flex-direction:column;gap:12px">';
      Object.keys(ZONE).forEach(function(k){ if(za[k]>0){ h+='<div><div style="display:flex;justify-content:space-between;font:500 12px \'IBM Plex Sans\';color:#3a352e;margin-bottom:5px"><span>'+ZONE[k][0]+'</span><span>'+Math.round(za[k])+' m²</span></div><div style="height:7px;background:#eae4d7;border-radius:4px;overflow:hidden"><div style="width:'+(za[k]/mx*100)+'%;height:100%;background:'+ZONE[k][1]+';border-radius:4px"></div></div></div>'; } });
      h+='</div>';
    }
    h+='</div>';
  }

  if(isLayout){
    // selected-room editor
    if(s.sel){
      var it=findInst(s.sel);
      if(it){ var rd=roomOf(it.id);
        h+='<div class="panel editor" style="margin-top:0"><div class="ehead"><div class="eic" style="background:'+it.color+'">'+it.icon+'</div><div><div style="font:700 16px \'Bricolage Grotesque\'">'+esc(it.label)+'</div><div style="font:400 11px \'IBM Plex Mono\';color:#9a9082">'+Math.round(it.area)+' m² · on '+floorName(it.floor,N).toLowerCase()+'</div></div></div>';
        h+='<div class="elab">SIZE</div><div class="erow">';
        ['S','M','L'].forEach(function(z){ h+='<button class="ebtn '+(it.size===z?'on':'')+'" data-act="esize" data-z="'+z+'"><b>'+z+'</b> · '+rd.sizes[z]+'m²</button>'; });
        h+='</div>';
        h+='<div class="elab">MOVE FLOOR</div><div class="erow"><button class="ebtn '+(it.floor<N-1?'':'off')+'" data-act="efloor" data-dir="1">↑ Up a floor</button><button class="ebtn '+(it.floor>0?'':'off')+'" data-act="efloor" data-dir="-1">↓ Down a floor</button></div>';
        h+='<div class="elab">REORDER ON THIS FLOOR</div><div class="erow"><button class="ebtn '+(canReorder(it.key,-1)?'':'off')+'" data-act="eorder" data-dir="-1">‹ Earlier</button><button class="ebtn '+(canReorder(it.key,1)?'':'off')+'" data-act="eorder" data-dir="1">Later ›</button></div>';
        h+='<div class="erow" style="margin-top:14px"><button class="ebtn" data-act="deselect">Done</button><button class="ebtn danger" data-act="edelete">🗑 Delete room</button></div>';
        h+='</div>';
      }
    } else {
      h+='<div class="panel" style="margin-top:0"><div style="font:700 15px \'Bricolage Grotesque\';margin-bottom:8px">Edit your plan</div><div style="font:400 12.5px/1.6 \'IBM Plex Sans\';color:#7a7264">Tap any room in the plan to resize it, move it to another floor, reorder it, or delete it. Drag one room onto another to swap their spots.</div>';
      h+='<button class="ebtn" data-act="autoarrange" style="margin-top:14px;width:100%;background:#12100d;color:#fff;border-color:#12100d">↺ Auto-arrange (reset edits)</button></div>';
    }
    // 3D massing
    var floors2=floorsData(), NN=floors2.length, gap=Math.min(26,Math.max(16,Math.round(90/NN)));
    h+='<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font:700 15px \'Bricolage Grotesque\'">Massing</div><div style="font:500 10px \'IBM Plex Mono\';color:#8a8378;background:#eae4d7;padding:3px 8px;border-radius:6px">3D · '+fLabel+'</div></div>';
    h+='<div style="height:190px;display:flex;align-items:center;justify-content:center;perspective:820px"><div style="position:relative;width:120px;height:120px;transform-style:preserve-3d;transform:rotateX(58deg) rotateZ(-42deg)">';
    for(var i=0;i<NN;i++){ var top=i===NN-1; h+='<div style="position:absolute;inset:0;border-radius:6px;background:'+(top?'linear-gradient(135deg,#e0a458,#e8833a)':'rgba(200,121,79,.85)')+';border:1px solid rgba(255,255,255,.35);box-shadow:0 6px 14px -6px rgba(0,0,0,.4);transform:translateZ('+(i*gap)+'px)"></div>'; }
    h+='</div></div><div style="font:400 11.5px/1.55 \'IBM Plex Sans\';color:#8a8378;text-align:center;margin-top:4px">Flat RCC roof · '+fLabel+' · '+s.pw+'×'+s.pd+' ft</div></div>';
    // floor stack list
    h+='<div class="panel"><div style="font:700 15px \'Bricolage Grotesque\';margin-bottom:12px">Floor stack</div>';
    for(var i=floors2.length-1;i>=0;i--){
      var names=floors2[i].map(function(r){ return r.label; }).join(', ') || '—';
      h+='<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f0e9db"><div style="font:700 12px \'IBM Plex Mono\';color:#c8794f;min-width:26px">'+floorTag(i)+'</div><div><div style="font:600 12px \'IBM Plex Sans\'">'+floorName(i,NN)+'</div><div style="font:400 11px/1.4 \'IBM Plex Sans\';color:#8a8378;margin-top:2px">'+esc(names)+'</div></div></div>';
    }
    h+='</div>';
  }

  h+='</aside></main>';

  /* mobile action bar */
  h+='<div class="mobilebar">';
  if(!isPlot) h+='<button class="mcta" data-act="back" style="flex:none;width:64px;background:#efe9dc;color:#1a1a1a">‹</button>';
  h+='<button class="mcta" data-act="next" style="background:'+(ctaEnabled?'#1a1a1a':'#d8d2c6')+';color:'+(ctaEnabled?'#fff':'#9a9082')+'">'+esc(ctaLabel)+'</button></div>';

  document.getElementById('app').innerHTML=h;
}

/* ============================ EVENTS ============================ */
var ORDER=['plot','rooms','layout'];
var app=document.getElementById('app');

app.addEventListener('click', function(ev){
  var el=ev.target.closest('[data-act]'); if(!el) return;
  var act=el.dataset.act, v=el.dataset.v;
  if(act==='scrollhomes'){
    var target=document.getElementById('readyHomes');
    if(target){ target.scrollIntoView({ behavior:'smooth', block:'start' }); }
    return;
  }
  if(act==='scrollcards'){
    var strip=document.getElementById('designShowcase');
    if(strip){
      var card=strip.querySelector('.designCard');
      var step=card ? card.getBoundingClientRect().width+22 : strip.clientWidth*0.8;
      strip.scrollBy({ left:(el.dataset.dir==='-1'?-1:1)*step, behavior:'smooth' });
    }
    return;
  }
  if(act==='gotogallery'){ state.step='gallery'; state.design=null; state.iv=freshIv(); }
  else if(act==='opendesign'){ state.design=el.dataset.id; state.elev='front'; state.step='detail'; }
  else if(act==='elev'){
    state.elev=v; state.elevError=null;
    var ed=designOf(state.design);
    if(ed) fetchElevation(ed, v);   // async; no-ops for front / cached / offline
  }
  else if(act==='startblank'){ state.step='plot'; }
  else if(act==='startinterview'){ startInterview(); return; }
  else if(act==='ivchoose'){ ivChoose(el); return; }
  else if(act==='ivcount'){ ivCount(el); return; }
  else if(act==='ivplot'){ ivPlot(el); return; }
  else if(act==='ivfacing'){ ivFacing(el); return; }
  else if(act==='ivnote'){ ivToggleNote(); return; }
  else if(act==='ivdk'){ scrapeIvInputs(); ivDontKnow(); return; }
  else if(act==='ivnext'){ scrapeIvInputs(); ivSubmitAndNext(); return; }
  else if(act==='ivback'){ ivBack(); return; }
  else if(act==='ivretry'){ var fn=state.iv.retry; state.iv.error=null; state.iv.retry=null; if(typeof fn==='function'){ fn(); } else { render(); } return; }
  else if(act==='briefedit'){ briefEdit(el); return; }
  else if(act==='generatebrief'){ generateBrief(); return; }
  else if(act==='backtointerview'){ state.step='interview'; syncHistory(); render(); return; }
  else if(act==='backtobrief'){ state.step='brief'; syncHistory(); render(); return; }
  else if(act==='toggleimprovement'){ toggleImprovement(el.dataset.id, el.dataset.imp); return; }
  else if(act==='choosedirection'){ chooseDirection(el.dataset.id); return; }
  else if(act==='refinedesign'){ startRefine(el.dataset.id); return; }
  else if(act==='usedesign'){ loadDesign(designOf(el.dataset.id)); ensureLayout(); state.step='layout'; }
  else if(act==='editdesign'){ loadDesign(designOf(el.dataset.id)); state.step='plot'; }
  else if(act==='step'){ var i=ORDER.indexOf(v), cur=ORDER.indexOf(state.step); if(i<=cur){ state.step=v; if(v==='layout') ensureLayout(); } }
  else if(act==='cat') state.cat=v;
  else if(act==='inc') incRoom(v);
  else if(act==='dec') decRoom(v);
  else if(act==='size') { if(canSize(roomOf(v),el.dataset.z)) setRoom(v,{size:el.dataset.z}); }
  else if(act==='plot'){ state.pw=+el.dataset.w; state.pd=+el.dataset.d; }
  else if(act==='facing') state.facing=v;
  else if(act==='shape') state.shape=v;
  else if(act==='incfloor') state.floorsN=Math.min(4, state.floorsN+1);
  else if(act==='decfloor') state.floorsN=Math.max(1, state.floorsN-1);
  else if(act==='floorview') state.floorView=+v;
  else if(act==='selroom') state.sel = (state.sel===el.dataset.key ? null : el.dataset.key);
  else if(act==='esize') editSize(state.sel, el.dataset.z);
  else if(act==='efloor') editFloor(state.sel, +el.dataset.dir);
  else if(act==='eorder') editReorder(state.sel, +el.dataset.dir);
  else if(act==='edelete') editDelete(state.sel);
  else if(act==='deselect') state.sel=null;
  else if(act==='autoarrange') materialize();
  else if(act==='back'){ var i=ORDER.indexOf(state.step); if(i>0){ state.step=ORDER[i-1]; state.sel=null; } else { state.step='gallery'; state.design=null; } }
  else if(act==='next'){
    var i=ORDER.indexOf(state.step);
    var can = state.step==='plot' ? true
            : state.step==='rooms' ? (roomCount()>0 && freeM2()>=-EPS)
            : false;
    if(can && i<ORDER.length-1){ state.step=ORDER[i+1]; state.sel=null; if(state.step==='layout') ensureLayout(); }
  }
  syncHistory();
  render();
});

/* ---- browser history: keep the device Back button inside the app ---- */
var _histStep=null;
function historyToken(){
  if(state.step==='interview') return 'interview:'+state.iv.count;
  if(state.step==='detail') return 'detail:'+(state.design||'');
  if(state.step==='brief' || state.step==='directions') return state.step;
  return state.step;
}
function syncHistory(){
  var token=historyToken();
  if(token!==_histStep){
    _histStep=token;
    history.pushState({
      step:state.step, design:state.design,
      ivCount:state.iv.count, ivStep:state.step
    }, '');
  }
}
window.addEventListener('popstate', function(ev){
  var st=ev.state;
  if(st && st.step){
    state.step=st.step; state.design=st.design||null;
    if(st.step==='interview' && typeof st.ivCount==='number'){
      // Best-effort: step count only; current question restored via historyStack if available
      while(state.iv.count>st.ivCount && state.iv.historyStack.length){
        var prev=state.iv.historyStack.pop();
        state.iv.current=prev.current; state.iv.count=prev.count;
        if(prev.askedLen!=null) state.iv.asked=state.iv.asked.slice(0, prev.askedLen);
      }
    }
  } else { state.step='gallery'; state.design=null; }
  if(state.step==='layout') ensureLayout();
  _histStep=historyToken();
  state.sel=null;
  render();
});

/* drag-to-swap in the layout editor */
app.addEventListener('dragstart', function(ev){
  var r=ev.target.closest('.room'); if(!r) return;
  state._drag=r.dataset.key; ev.dataTransfer.effectAllowed='move';
  try{ ev.dataTransfer.setData('text/plain', r.dataset.key); }catch(e){}
});
app.addEventListener('dragover', function(ev){
  var r=ev.target.closest('.room'); if(!r||!state._drag) return;
  ev.preventDefault(); ev.dataTransfer.dropEffect='move';
  if(!r.classList.contains('dragover') && r.dataset.key!==state._drag){
    var prev=app.querySelector('.room.dragover'); if(prev) prev.classList.remove('dragover');
    r.classList.add('dragover');
  }
});
app.addEventListener('drop', function(ev){
  var r=ev.target.closest('.room'); if(!r||!state._drag) return;
  ev.preventDefault(); editSwap(state._drag, r.dataset.key); state._drag=null; render();
});
app.addEventListener('dragend', function(){ state._drag=null; var p=app.querySelector('.room.dragover'); if(p) p.classList.remove('dragover'); });

/* ---------------------------------------------------------------
   Bootstrap — runs last, after every module has defined its globals.
   Seed the first history entry so the very first in-app navigation
   has something to return to, then paint the initial screen.
---------------------------------------------------------------- */
_histStep=historyToken();
history.replaceState({step:state.step, design:state.design, ivCount:state.iv.count}, '');

render();
