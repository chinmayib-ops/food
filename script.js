/* ============================================================
   Bengaluru Eats — static, client-side logbook (v2)
   Profile · rich entries (rating/note/photo/date) · custom
   places · wishlist · friends (share codes) · map · stats.
   All localStorage. No backend. Data layer is isolated so a
   real backend can replace the *Store objects later.
   ============================================================ */

const KEY_PROFILE  = 'be:profile';
const KEY_ENTRIES  = 'be:entries';
const KEY_RATINGS  = 'be:ratings';   // legacy (v1) — migrated
const KEY_PLACES   = 'be:places';
const KEY_WISHLIST = 'be:wishlist';
const KEY_FRIENDS  = 'be:friends';

const FEATURED_ID = 'brahmins-coffee-bar';

const CUISINES = ['South Indian','North Indian','Street Food','Café','Bakery',
  'Biryani','Chinese','Continental','Desserts','Seafood','Other'];

/* ---------- seed places (real Bengaluru spots, unrated) ---------- */
const SEED_PLACES = [
  { id:'brahmins-coffee-bar', name:"Brahmin's Coffee Bar", hood:'Basavanagudi',    cuisine:'South Indian', dish:'Filter Coffee & Idli', lat:12.9430, lng:77.5730 },
  { id:'vidyarthi-bhavan',    name:'Vidyarthi Bhavan',     hood:'Gandhi Bazaar',   cuisine:'South Indian', dish:'Benne Masala Dosa',    lat:12.9421, lng:77.5712 },
  { id:'mtr',                 name:'Mavalli Tiffin Rooms', hood:'Lalbagh',         cuisine:'South Indian', dish:'Rava Idli',            lat:12.9507, lng:77.5848 },
  { id:'ctr-shri-sagar',      name:'CTR (Shri Sagar)',     hood:'Malleshwaram',    cuisine:'South Indian', dish:'Benne Dosa',           lat:13.0028, lng:77.5710 },
  { id:'taaza-thindi',        name:'Taaza Thindi',         hood:'Banashankari',    cuisine:'South Indian', dish:'Idli & Set Dosa',      lat:12.9255, lng:77.5468 },
  { id:'corner-house',        name:'Corner House',         hood:'Residency Road',  cuisine:'Desserts',     dish:'Death by Chocolate',   lat:12.9716, lng:77.6050 },
  { id:'koshys',              name:"Koshy's",              hood:"St. Mark's Road", cuisine:'Continental',  dish:'Mutton Cutlet',        lat:12.9740, lng:77.6030 },
  { id:'airlines-hotel',      name:'Airlines Hotel',       hood:'Lavelle Road',    cuisine:'Café',         dish:'Filter Coffee',        lat:12.9719, lng:77.5970 },
  { id:'empire-restaurant',   name:'Empire Restaurant',    hood:'Koramangala',     cuisine:'North Indian', dish:'Butter Chicken',       lat:12.9352, lng:77.6245 },
  { id:'truffles',            name:'Truffles',             hood:'Koramangala',     cuisine:'Continental',  dish:'Burgers & Steaks',     lat:12.9352, lng:77.6190 },
  { id:'third-wave',          name:'Third Wave Coffee',    hood:'Indiranagar',     cuisine:'Café',         dish:'Flat White',           lat:12.9719, lng:77.6412 },
  { id:'albert-bakery',       name:'Albert Bakery',        hood:'Frazer Town',     cuisine:'Bakery',       dish:'Mutton Samosa',        lat:12.9981, lng:77.6190 },
];

/* neighbourhood centroids — used to place custom spots on the map */
const HOODS = {
  'indiranagar':[12.9719,77.6412],'koramangala':[12.9352,77.6245],'jayanagar':[12.9250,77.5938],
  'basavanagudi':[12.9421,77.5712],'gandhi bazaar':[12.9421,77.5712],'malleshwaram':[13.0028,77.5710],
  'whitefield':[12.9698,77.7499],'banashankari':[12.9255,77.5468],'jp nagar':[12.9100,77.5850],
  'btm':[12.9166,77.6101],'marathahalli':[12.9569,77.7011],'hsr':[12.9116,77.6474],
  'frazer town':[12.9981,77.6190],'mg road':[12.9756,77.6050],'brigade road':[12.9719,77.6090],
  'lavelle road':[12.9719,77.5970],'residency road':[12.9716,77.6050],'rajajinagar':[12.9981,77.5550],
  'vijayanagar':[12.9630,77.5300],'electronic city':[12.8452,77.6602],'sarjapur':[12.9006,77.6874],
  'bellandur':[12.9304,77.6784],'ulsoor':[12.9820,77.6200],'shivaji nagar':[12.9854,77.6050],
  'cooke town':[13.0030,77.6230],'cunningham road':[12.9869,77.5947],"st. mark's road":[12.9740,77.6030],
  'lalbagh':[12.9507,77.5848],'church street':[12.9750,77.6060],'commercial street':[12.9830,77.6090],
};
const CITY_CENTER = [12.9716, 77.5946];

/* ---------- utilities ---------- */
function slugify(s){ return (s||'').toLowerCase().replace(/['']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function loadJSON(k,fb){ try{ const v=JSON.parse(localStorage.getItem(k)); return v??fb; }catch{ return fb; } }
function saveJSON(k,v){
  try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch(e){ Toast.show('Storage full — try removing a photo or two'); return false; }
}
function fmt(n){ return (n%1===0)?String(n):n.toFixed(1); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function b64encode(str){ const b=new TextEncoder().encode(str); let s=''; b.forEach(x=>s+=String.fromCharCode(x)); return btoa(s); }
function b64decode(b64){ const bin=atob(b64); const u=Uint8Array.from(bin,c=>c.charCodeAt(0)); return new TextDecoder().decode(u); }

/* ---------- stores ---------- */
const Profile = {
  get(){ return loadJSON(KEY_PROFILE,null); },
  set(p){ saveJSON(KEY_PROFILE,p); emit('profile:change'); },
  clear(){ localStorage.removeItem(KEY_PROFILE); emit('profile:change'); }
};

const Entries = {
  all(){ return loadJSON(KEY_ENTRIES,{}); },
  get(id){ return this.all()[id] || null; },
  rating(id){ const e=this.get(id); return e ? (e.rating||0) : 0; },
  /* partial update; pass {rating,note,photo,visitedAt} */
  set(id, patch){
    const all = this.all();
    const prev = all[id] || { createdAt:new Date().toISOString() };
    const next = { ...prev, ...patch, updatedAt:new Date().toISOString() };
    // an entry with no rating, note or photo is empty → delete
    if (!next.rating && !(next.note||'').trim() && !next.photo){ delete all[id]; }
    else all[id] = next;
    saveJSON(KEY_ENTRIES, all);
    emit('data:change');
  },
  remove(id){ const a=this.all(); delete a[id]; saveJSON(KEY_ENTRIES,a); emit('data:change'); },
  count(){ return Object.values(this.all()).filter(e=>e.rating).length; }
};

const Places = {
  custom(){ return loadJSON(KEY_PLACES,[]); },
  add(p){
    const list=this.custom();
    if(!list.some(x=>x.id===p.id) && !SEED_PLACES.some(x=>x.id===p.id)){
      list.push(p); saveJSON(KEY_PLACES,list); emit('data:change');
    }
    return p.id;
  },
  registry(){
    const m=new Map();
    SEED_PLACES.forEach(p=>m.set(p.id,p));
    this.custom().forEach(p=>m.set(p.id,p));
    Friends.all().forEach(f=>(f.places||[]).forEach(p=>{ if(!m.has(p.id)) m.set(p.id,p); }));
    return [...m.values()];
  },
  byId(id){ return this.registry().find(p=>p.id===id)||null; },
  coords(p){
    if(p && typeof p.lat==='number' && typeof p.lng==='number') return [p.lat,p.lng];
    const key=(p&&p.hood||'').toLowerCase().trim();
    for(const h in HOODS){ if(key.includes(h)) return HOODS[h]; }
    return null;
  }
};

const Wishlist = {
  all(){ return loadJSON(KEY_WISHLIST,[]); },
  has(id){ return this.all().includes(id); },
  toggle(id){
    let l=this.all();
    if(l.includes(id)) l=l.filter(x=>x!==id); else l.push(id);
    saveJSON(KEY_WISHLIST,l); emit('data:change');
    return l.includes(id);
  }
};

const Friends = {
  all(){ return loadJSON(KEY_FRIENDS,[]); },
  add(f){
    const l=this.all(); const i=l.findIndex(x=>x.handle===f.handle);
    if(i>=0) l[i]=f; else l.push(f);
    saveJSON(KEY_FRIENDS,l); emit('data:change'); return i<0;
  },
  remove(h){ saveJSON(KEY_FRIENDS,this.all().filter(f=>f.handle!==h)); emit('data:change'); },
  byHandle(h){ return this.all().find(f=>f.handle===h)||null; },
  count(){ return this.all().length; }
};

function emit(n,d){ document.dispatchEvent(new CustomEvent(n,{detail:d})); }

/* ---------- one-time migration: v1 ratings → v2 entries ---------- */
(function migrate(){
  const legacy = loadJSON(KEY_RATINGS,null);
  if(legacy && !localStorage.getItem(KEY_ENTRIES)){
    const e={};
    Object.entries(legacy).forEach(([id,val])=>{
      e[id]={ rating:val, note:'', photo:null, visitedAt:'', createdAt:new Date().toISOString() };
    });
    localStorage.setItem(KEY_ENTRIES, JSON.stringify(e));
  }
})();

/* ---------- aggregate (you + friends) ---------- */
function friendRating(f,id){
  const e=(f.entries||{})[id];
  if(e) return e.rating||0;
  return (f.ratings||{})[id]||0; // v1 friend code back-compat
}
function aggregate(id){
  const vals=[]; const mine=Entries.rating(id);
  if(mine) vals.push(mine);
  Friends.all().forEach(f=>{ const v=friendRating(f,id); if(v) vals.push(v); });
  if(!vals.length) return {avg:0,count:0};
  return { avg:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10, count:vals.length };
}
/* a friend who rated a place ≥4 that you haven't → recommendation */
function recommenders(id){
  if(Entries.rating(id)) return [];
  return Friends.all().filter(f=>friendRating(f,id)>=4).map(f=>f.name.split(' ')[0]);
}

/* ---------- toast ---------- */
const Toast=(()=>{ const el=document.querySelector('[data-toast]'); let t=null;
  return { show(m){ if(!el)return; el.innerHTML=m; el.hidden=false;
    requestAnimationFrame(()=>el.classList.add('show'));
    clearTimeout(t); t=setTimeout(()=>{ el.classList.remove('show');
      setTimeout(()=>{el.hidden=true;},280); },2600); } };
})();

/* ---------- image compression ---------- */
function compressImage(file, cb){
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const max=1000;
      let {width:w,height:h}=img;
      if(w>max||h>max){ const r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r); }
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      cb(c.toDataURL('image/jpeg',0.7));
    };
    img.onerror=()=>cb(null);
    img.src=e.target.result;
  };
  reader.onerror=()=>cb(null);
  reader.readAsDataURL(file);
}

/* ---------- rating widget ---------- */
function initRating(rate, onCommit){
  if(rate.dataset.inited==='1' && !onCommit) return;
  rate.dataset.inited='1';
  const max=parseInt(rate.dataset.max||'5',10);
  const fg=rate.querySelector('.rate-fg');
  const hov=rate.querySelector('.rate-hov');
  const placeId=rate.dataset.placeId;
  const dock=rate.closest('.rate-dock');
  const valEl=dock?dock.querySelector('.your-value'):null;
  const row=rate.closest('.your-rate-row');
  const rowLbl=row?row.querySelector('.lbl'):null;

  function stepsAt(x){ const r=rate.getBoundingClientRect();
    const px=Math.max(0,Math.min(r.width,x-r.left));
    return Math.max(1,Math.min(max*2,Math.ceil(px/(r.width/(max*2))))); }
  function paintHover(s){ if(hov) hov.style.width=(s/(max*2))*100+'%'; }
  function paintValue(v){
    rate.dataset.value=String(v);
    fg.style.width=(v/max)*100+'%';
    if(valEl) valEl.innerHTML=v?fmt(v)+' <span style="font-family:var(--ff-mono);font-size:10px;letter-spacing:.22em;color:var(--ink-soft);font-style:normal;">/ 5 — saved</span>':'<span class="unset">tap to rate</span>';
    if(rowLbl) rowLbl.innerHTML=v?'Your rating · <b>'+fmt(v)+'/5</b>':'Your rating';
  }
  function commit(v){
    if(onCommit){ paintValue(v); onCommit(v); return; }
    if(!Profile.get()){ openModal('signin'); Toast.show('Create a profile first to <em>rate</em>'); paintHover(0); return; }
    if(placeId) Entries.set(placeId,{rating:v, visitedAt:(Entries.get(placeId)?.visitedAt)||todayISO()});
    paintValue(v);
    if(v) Toast.show('Rated <em>'+fmt(v)+'/5</em> · saved');
  }
  if(placeId){ const s=Entries.rating(placeId); if(s) paintValue(s); }
  else if(rate.dataset.value){ paintValue(parseFloat(rate.dataset.value)||0); }

  rate.addEventListener('mousemove',e=>paintHover(stepsAt(e.clientX)));
  rate.addEventListener('mouseleave',()=>paintHover(0));
  rate.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); commit(stepsAt(e.clientX)/2); });
  rate.addEventListener('touchstart',e=>{ if(e.touches[0]){ e.stopPropagation(); commit(stepsAt(e.touches[0].clientX)/2);} },{passive:true});
  rate.addEventListener('keydown',e=>{
    let s=Math.round(parseFloat(rate.dataset.value||'0')*2);
    if(e.key==='ArrowRight') s=Math.min(max*2,s+1);
    else if(e.key==='ArrowLeft') s=Math.max(0,s-1);
    else return;
    e.preventDefault(); commit(s/2);
  });
  return { set:paintValue };
}

/* ---------- like buttons ---------- */
function initLike(btn){
  if(btn.dataset.inited==='1') return; btn.dataset.inited='1';
  btn.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation();
    btn.classList.toggle('on');
    btn.textContent=btn.classList.contains('on')?'♥':'♡';
  });
}

/* ============================================================
   RENDER: logbook (grid / map) with toolbar
   ============================================================ */
let state = { tab:'all', view:'grid', q:'', cuisine:'', minRating:0, sort:'default' };
let mapObj=null, mapLayer=null;

function visiblePlaces(){
  const reg=Places.registry();
  let list;
  if(state.tab==='mine')      list=reg.filter(p=>Entries.rating(p.id));
  else if(state.tab==='wishlist') list=reg.filter(p=>Wishlist.has(p.id));
  else if(state.tab==='friends')  list=reg.filter(p=>Friends.all().some(f=>friendRating(f,p.id)));
  else                        list=reg.slice();

  if(state.q){
    const q=state.q.toLowerCase();
    list=list.filter(p=>(p.name+' '+p.hood+' '+(p.cuisine||'')+' '+(p.dish||'')).toLowerCase().includes(q));
  }
  if(state.cuisine) list=list.filter(p=>(p.cuisine||'')===state.cuisine);
  if(state.minRating>0) list=list.filter(p=>Entries.rating(p.id)>=state.minRating);

  if(state.sort==='rating-desc') list.sort((a,b)=>aggregate(b.id).avg-aggregate(a.id).avg);
  else if(state.sort==='alpha')  list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(state.sort==='area')   list.sort((a,b)=>a.hood.localeCompare(b.hood)||a.name.localeCompare(b.name));
  else if(state.sort==='recent') list.sort((a,b)=>{
    const ea=Entries.get(a.id),eb=Entries.get(b.id);
    return new Date(eb?.updatedAt||0)-new Date(ea?.updatedAt||0);
  });
  return list;
}

function placeCard(p){
  const ag=aggregate(p.id), e=Entries.get(p.id), mine=e?.rating||0;
  const onWish=Wishlist.has(p.id);
  const recs=recommenders(p.id);
  const photo=e?.photo;
  const sqStyle = photo ? ` style="background-image:url(${photo});background-size:cover;background-position:center"` : '';
  const aggLine = (state.tab==='friends')
    ? `<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${Friends.all().filter(f=>friendRating(f,p.id)).length} friend(s)</span>`
    : (ag.count?`<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${ag.count} rating${ag.count===1?'':'s'}</span>`
                :`<span class="agg unrated">Unrated · be the first</span>`);
  return `
  <div class="log-card${photo?' has-photo':''}" data-place-id="${p.id}">
    <div class="photo-sq"${sqStyle}>
      <button class="heart" data-like type="button">♡</button>
      <button class="wish-btn${onWish?' on':''}" data-wish="${p.id}" type="button" title="Want to try">${onWish?'★ Wishlisted':'☆ Wishlist'}</button>
      <span class="meal-label">${esc(p.dish||'A Bengaluru plate')}</span>
      ${recs.length?`<span class="rec-badge">◦ ${esc(recs[0])} recommends</span>`:''}
    </div>
    <div class="name">${esc(p.name)}</div>
    <div class="hood">${esc(p.hood)}${p.cuisine?` · <span class="cz">${esc(p.cuisine)}</span>`:''}</div>
    <div class="row">${aggLine}</div>
    ${e&&e.note?`<div class="card-note">“${esc(e.note)}”</div>`:''}
    ${e&&e.visitedAt?`<div class="card-date">Visited ${esc(new Date(e.visitedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</div>`:''}
    <div class="your-rate-row">
      <span class="lbl">${mine?'Your rating · <b>'+fmt(mine)+'/5</b>':'Your rating'}</span>
      <div class="rate" data-max="5" data-value="${mine}" data-place-id="${p.id}" tabindex="0" role="slider" aria-label="Rate ${esc(p.name)}">
        <span class="rate-bg">★★★★★</span><span class="rate-fg" style="width:${(mine/5)*100}%">★★★★★</span><span class="rate-hov" style="width:0%">★★★★★</span>
      </div>
    </div>
    <button type="button" class="card-edit" data-edit-entry="${p.id}">${e?'Edit note / photo / date':'Add note, photo & date'}</button>
  </div>`;
}

function renderLogbook(){
  const grid=document.querySelector('[data-log-grid]');
  const empty=document.querySelector('[data-log-empty]');
  const title=document.querySelector('[data-logbook-title]');
  const mapEl=document.querySelector('[data-map]');
  if(!grid) return;

  if(state.tab==='mine')      title.innerHTML='Plates <em>you</em> have rated.';
  else if(state.tab==='wishlist') title.innerHTML='Places you <em>want</em> to try.';
  else if(state.tab==='friends')  title.innerHTML='What your <em>friends</em> have tasted.';
  else                        title.innerHTML='Every plate in the city, <em>your</em> verdict.';

  const list=visiblePlaces();

  if(state.view==='map'){
    grid.hidden=true; empty.hidden=true; mapEl.hidden=false;
    renderMap(list);
    return;
  }
  mapEl.hidden=true;

  if(!list.length){
    grid.hidden=true; empty.hidden=false;
    let msg = state.q||state.cuisine||state.minRating
      ? 'Nothing matches those filters. <button type="button" class="link-btn" data-clear-filters>Clear filters</button>'
      : state.tab==='mine' ? 'Nothing rated yet — switch to <b>All places</b> and start tasting.'
      : state.tab==='wishlist' ? 'Wishlist is empty — hit <b>☆ Wishlist</b> on any place you want to try.'
      : state.tab==='friends' ? 'No friend ratings yet — add a code in <b>Friends &amp; Sharing</b> below.'
      : 'No places yet.';
    empty.innerHTML=msg;
  } else {
    empty.hidden=true; grid.hidden=false;
    grid.innerHTML=list.map(placeCard).join('');
    grid.querySelectorAll('.rate').forEach(r=>initRating(r));
    grid.querySelectorAll('[data-like]').forEach(initLike);
  }
}

/* ---------- map ---------- */
function renderMap(list){
  if(typeof L==='undefined'){
    document.querySelector('[data-map]').innerHTML='<div class="empty-state">Map library still loading — give it a second and toggle again.</div>';
    return;
  }
  if(!mapObj){
    mapObj=L.map('map',{scrollWheelZoom:false}).setView(CITY_CENTER,12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19, attribution:'&copy; OpenStreetMap'
    }).addTo(mapObj);
  }
  if(mapLayer) mapLayer.remove();
  mapLayer=L.layerGroup().addTo(mapObj);
  const pts=[];
  list.forEach(p=>{
    const c=Places.coords(p); if(!c) return;
    const ag=aggregate(p.id), mine=Entries.rating(p.id);
    const m=L.marker(c).addTo(mapLayer);
    m.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.hood)} · ${esc(p.cuisine||'')}<br>`+
      (mine?`Your rating: ★ ${fmt(mine)}/5`:ag.count?`Avg ★ ${fmt(ag.avg)} (${ag.count})`:'Unrated'));
    pts.push(c);
  });
  if(pts.length) mapObj.fitBounds(pts,{padding:[40,40],maxZoom:14});
  else mapObj.setView(CITY_CENTER,12);
  setTimeout(()=>mapObj.invalidateSize(),60);
}

/* ============================================================
   RENDER: stats dashboard
   ============================================================ */
function renderStats(){
  const wrap=document.querySelector('[data-stats-grid]'); if(!wrap) return;
  const entries=Object.entries(Entries.all()).filter(([,e])=>e.rating);
  const reg=Places.registry();
  const total=entries.length;
  const yr=new Date().getFullYear();
  const thisYear=entries.filter(([,e])=>{
    const d=e.visitedAt||e.createdAt; return d && new Date(d).getFullYear()===yr;
  }).length;
  const avg=total?fmt(Math.round(entries.reduce((s,[,e])=>s+e.rating,0)/total*10)/10):'—';
  const tally=(keyFn)=>{ const m={}; entries.forEach(([id])=>{ const p=reg.find(x=>x.id===id); if(!p)return; const k=keyFn(p); if(k) m[k]=(m[k]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]; };
  const topArea=tally(p=>p.hood); const topCz=tally(p=>p.cuisine);
  const cells=[
    ['Plates rated', total],
    [`Rated in ${yr}`, thisYear],
    ['Average rating', total?avg+'★':'—'],
    ['Top area', topArea?topArea[0]:'—'],
    ['Top cuisine', topCz?topCz[0]:'—'],
    ['On the wishlist', Wishlist.all().length],
  ];
  wrap.innerHTML=cells.map(([l,v])=>`<div class="stat-cell"><div class="stat-num">${esc(String(v))}</div><div class="stat-lbl">${esc(l)}</div></div>`).join('');
}

/* ============================================================
   RENDER: feature dock + meta
   ============================================================ */
function renderFeature(){
  const p=Places.byId(FEATURED_ID); if(!p) return;
  const ag=aggregate(p.id);
  const set=(s,v)=>{ const el=document.querySelector(s); if(el) el.textContent=v; };
  set('[data-feature-place]',`${p.name} · ${p.hood}`);
  set('[data-feature-avg]',ag.count?fmt(ag.avg):'—');
  set('[data-feature-count]',ag.count?`${ag.count} rating${ag.count===1?'':'s'} · you + friends`:'No ratings yet');
  set('[data-feature-label]',`${(p.dish||'').toUpperCase()} · ${p.hood.toUpperCase()}`);
  const fr=document.querySelector('[data-feature-rating] .rate-fg'); if(fr) fr.style.width=(ag.avg/5)*100+'%';
  const prof=Profile.get();
  set('[data-meta-handle]',prof?'@'+(prof.handle||slugify(prof.name)):'not signed in');
  set('[data-meta-count]',`${Entries.count()} plate${Entries.count()===1?'':'s'} rated`);
  set('[data-meta-friends]',`${Friends.count()} friend${Friends.count()===1?'':'s'}`);
}

/* ============================================================
   RENDER: friends list + comparison
   ============================================================ */
function renderFriends(){
  const wrap=document.querySelector('[data-friends-list]'); if(!wrap) return;
  const fr=Friends.all();
  if(!fr.length){ wrap.innerHTML=`<div class="empty-state">No friends added yet. Paste a friend's code above to compare logbooks.</div>`; return; }
  wrap.innerHTML=fr.map(f=>{
    const n=Object.keys(f.entries||f.ratings||{}).length;
    const init=(f.name||'?').trim().charAt(0).toUpperCase();
    return `<div class="friend-row">
      <span class="favatar">${esc(init)}</span>
      <div class="finfo">
        <div class="fname">${esc(f.name)} <span class="fhandle">@${esc(f.handle)}</span></div>
        <div class="fmeta">${n} plate${n===1?'':'s'} rated · added ${esc(new Date(f.addedAt).toLocaleDateString())}</div>
      </div>
      <button type="button" class="fcompare" data-compare="${esc(f.handle)}">Compare</button>
      <button type="button" class="fremove" data-friend-remove="${esc(f.handle)}">Remove</button>
    </div>`;
  }).join('');
}

function openCompare(handle){
  const f=Friends.byHandle(handle); if(!f) return;
  const me=Profile.get();
  document.querySelector('[data-compare-title]').innerHTML=`${esc(me?me.name.split(' ')[0]:'You')} <em>vs.</em> ${esc(f.name.split(' ')[0])}`;
  const reg=Places.registry();
  const rows=reg.map(p=>({p, mine:Entries.rating(p.id), theirs:friendRating(f,p.id)}))
    .filter(r=>r.mine||r.theirs)
    .sort((a,b)=>(b.mine+b.theirs)-(a.mine+a.theirs));
  const both=rows.filter(r=>r.mine&&r.theirs).length;
  document.querySelector('[data-compare-sub]').textContent=
    `${rows.length} place(s) between you · ${both} rated by both`;
  document.querySelector('[data-compare-body]').innerHTML=
    `<div class="cmp-row cmp-head"><span>Place</span><span>You</span><span>${esc(f.name.split(' ')[0])}</span></div>`+
    rows.map(r=>{
      const d=r.mine&&r.theirs?(r.mine-r.theirs):0;
      const tag=d>0?'<span class="cmp-up">you higher</span>':d<0?'<span class="cmp-dn">they higher</span>':(r.mine&&r.theirs?'<span class="cmp-eq">agree</span>':'');
      return `<div class="cmp-row">
        <span class="cmp-name">${esc(r.p.name)}<small>${esc(r.p.hood)}</small></span>
        <span class="cmp-v">${r.mine?'★ '+fmt(r.mine):'—'}</span>
        <span class="cmp-v">${r.theirs?'★ '+fmt(r.theirs):'—'} ${tag}</span>
      </div>`;
    }).join('');
  openModal('compare');
}

/* ============================================================
   profile UI
   ============================================================ */
function renderProfileUI(){
  const p=Profile.get();
  const chip=document.querySelector('[data-profile-menu]');
  const sf=document.querySelector('[data-signin-foot]');
  document.body.classList.toggle('signed-in',!!p);
  if(p){
    document.querySelector('[data-avatar]').textContent=(p.name||'?').trim().charAt(0).toUpperCase()||'?';
    document.querySelector('[data-profile-handle]').textContent='@'+(p.handle||slugify(p.name));
    document.querySelector('[data-profile-name]').textContent=p.name;
    document.querySelector('[data-profile-stat]').textContent=`${Entries.count()} plates rated · ${Friends.count()} friends`;
    if(chip) chip.hidden=false;
    if(sf) sf.textContent='Signed in';
  } else {
    if(chip) chip.hidden=true;
    const dd=document.querySelector('[data-profile-dropdown]'); if(dd) dd.hidden=true;
    if(sf) sf.textContent='Profile';
  }
}

/* ============================================================
   share / import (v2 payload; reads v1 too)
   ============================================================ */
function slimEntries(){
  const o={};
  Object.entries(Entries.all()).forEach(([id,e])=>{
    if(!e.rating && !(e.note||'').trim()) return;
    o[id]={ r:e.rating||0, n:(e.note||'').slice(0,400), d:e.visitedAt||'' }; // photos NOT shared (size)
  });
  return o;
}
function shareCode(){
  const p=Profile.get(); if(!p) return null;
  return b64encode(JSON.stringify({ v:2, n:p.name, h:p.handle||slugify(p.name),
    e:slimEntries(), pl:Places.custom(), wl:Wishlist.all() }));
}
function shareLink(){ const c=shareCode(); return c?`${location.origin}${location.pathname}#friend=${c}`:null; }
function renderShare(){
  const i=document.querySelector('[data-share-link]'); const h=document.querySelector('[data-share-hint]');
  const l=shareLink();
  if(l){ i.value=l; if(h) h.textContent='Anyone who opens this link adds your logbook to their Friends feed.'; }
  else { i.value='Sign in to generate your link'; if(h) h.textContent='You need a profile before you can share.'; }
}
function importCode(raw){
  if(!raw) return;
  let code=raw.trim(); const m=code.match(/#friend=([^&\s]+)/); if(m) code=m[1];
  let d; try{ d=JSON.parse(b64decode(code)); }catch{ Toast.show('That code could not be read — check &amp; retry'); return; }
  if(!d||!d.n){ Toast.show('That code is missing a profile'); return; }
  const me=Profile.get();
  if(me && d.h===(me.handle||slugify(me.name))){ Toast.show("That's your own logbook — share it with a friend instead"); return; }
  // normalise v1 (r:{id:val}) and v2 (e:{id:{r,n,d}})
  let entries={};
  if(d.e) entries=Object.fromEntries(Object.entries(d.e).map(([id,x])=>[id,{rating:x.r,note:x.n||'',visitedAt:x.d||''}]));
  else if(d.r) entries=Object.fromEntries(Object.entries(d.r).map(([id,v])=>[id,{rating:v,note:'',visitedAt:''}]));
  const friend={ name:d.n, handle:d.h||slugify(d.n), entries, places:d.pl||[], wishlist:d.wl||[], addedAt:new Date().toISOString() };
  (friend.places||[]).forEach(pl=>Places.add(pl));
  const isNew=Friends.add(friend);
  Toast.show(`${esc(friend.name.split(' ')[0])}'s logbook ${isNew?'added':'updated'} · ${Object.keys(entries).length} plates`);
  const fi=document.querySelector('[data-friend-input]'); if(fi) fi.value='';
  state.tab='friends'; state.view='grid'; syncToolbarUI(); renderAll();
  document.getElementById('logbook').scrollIntoView({behavior:'smooth'});
}

/* ============================================================
   modals
   ============================================================ */
function openModal(name){
  const m=document.querySelector(`[data-modal="${name}"]`); if(!m) return;
  if((name==='addplace'||name==='entry') && !Profile.get()){
    openModal('signin'); Toast.show('Create a profile first'); return;
  }
  m.hidden=false;
  const f=m.querySelector('input,textarea,select'); if(f) setTimeout(()=>f.focus(),30);
}
function closeModal(m){ m.hidden=true; }

let entryRateApi=null, pendingPhoto=undefined; // undefined = unchanged, null = removed
function openEntry(placeId){
  if(!Profile.get()){ openModal('signin'); Toast.show('Create a profile first to rate'); return; }
  const p=Places.byId(placeId); if(!p) return;
  const e=Entries.get(placeId)||{};
  const form=document.querySelector('[data-entry-form]');
  form.placeId.value=placeId;
  form.note.value=e.note||'';
  form.visitedAt.value=e.visitedAt||todayISO();
  document.querySelector('[data-entry-title]').innerHTML=`${esc(p.name)}`;
  document.querySelector('[data-entry-sub]').textContent=`${p.hood} · ${p.cuisine||''} — your private notes, photo & date.`;
  pendingPhoto=undefined;
  const prev=document.querySelector('[data-photo-preview]'); const img=document.querySelector('[data-photo-img]');
  if(e.photo){ img.src=e.photo; prev.hidden=false; } else { prev.hidden=true; img.removeAttribute('src'); }
  form.querySelector('[data-photo-input]').value='';
  const del=document.querySelector('[data-entry-delete]'); del.hidden=!Entries.get(placeId);
  // rating widget — clone-replace to drop any listeners from a previous open
  let rateEl=document.querySelector('.entry-rate');
  const fresh=rateEl.cloneNode(true);
  fresh.dataset.inited=''; fresh.dataset.value=String(e.rating||0);
  fresh.querySelector('.rate-fg').style.width=((e.rating||0)/5*100)+'%';
  fresh.querySelector('.rate-hov').style.width='0%';
  rateEl.replaceWith(fresh);
  const valLbl=document.querySelector('[data-entry-rateval]');
  entryRateApi=initRating(fresh,(v)=>{ valLbl.textContent=v?fmt(v)+' / 5':'not rated'; });
  entryRateApi.set(e.rating||0); valLbl.textContent=e.rating?fmt(e.rating)+' / 5':'not rated';
  openModal('entry');
}

function initModals(){
  document.querySelectorAll('[data-modal]').forEach(m=>{
    m.addEventListener('click',e=>{ if(e.target===m) closeModal(m); });
    const x=m.querySelector('[data-modal-close]'); if(x) x.addEventListener('click',()=>closeModal(m));
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('[data-modal]:not([hidden])').forEach(closeModal); });

  // populate cuisine selects
  const opts=CUISINES.map(c=>`<option value="${c}">${c}</option>`).join('');
  const cz=document.querySelector('[data-cuisine-select]'); if(cz) cz.innerHTML=opts;
  const fcz=document.querySelector('[data-filter-cuisine]');
  if(fcz) fcz.innerHTML='<option value="">All cuisines</option>'+opts;

  // sign-in
  const sf=document.querySelector('[data-signin-form]');
  sf && sf.addEventListener('submit',e=>{ e.preventDefault();
    const fd=new FormData(sf); const name=(fd.get('name')||'').toString().trim();
    let h=(fd.get('handle')||'').toString().trim(); if(!name) return;
    Profile.set({name,handle:slugify(h||name),joinedAt:new Date().toISOString()});
    sf.reset(); closeModal(sf.closest('[data-modal]'));
    Toast.show('Welcome, <em>'+esc(name.split(' ')[0])+'</em> · start rating →');
  });

  // add place
  const af=document.querySelector('[data-addplace-form]');
  af && af.addEventListener('submit',e=>{ e.preventDefault();
    const fd=new FormData(af);
    const name=(fd.get('name')||'').toString().trim();
    const hood=(fd.get('hood')||'').toString().trim();
    if(!name||!hood) return;
    let id=slugify(name+'-'+hood); if(Places.byId(id)) id+='-'+Math.random().toString(36).slice(2,5);
    const c=Places.coords({hood});
    Places.add({ id, name, hood, cuisine:(fd.get('cuisine')||'').toString(),
      dish:(fd.get('dish')||'').toString().trim(), custom:true,
      lat:c?c[0]:undefined, lng:c?c[1]:undefined });
    if(fd.get('wishlist')) Wishlist.toggle(id);
    af.reset(); closeModal(af.closest('[data-modal]'));
    state.tab=fd.get('wishlist')?'wishlist':'all'; state.view='grid'; syncToolbarUI(); renderAll();
    Toast.show('Added <em>'+esc(name)+'</em>');
    const card=document.querySelector(`.log-card[data-place-id="${id}"]`);
    card && card.scrollIntoView({behavior:'smooth',block:'center'});
  });

  // entry: photo input
  const pin=document.querySelector('[data-photo-input]');
  pin && pin.addEventListener('change',()=>{
    const file=pin.files&&pin.files[0]; if(!file) return;
    Toast.show('Compressing photo…');
    compressImage(file,(data)=>{
      if(!data){ Toast.show('Could not read that image'); return; }
      pendingPhoto=data;
      const prev=document.querySelector('[data-photo-preview]');
      document.querySelector('[data-photo-img]').src=data; prev.hidden=false;
    });
  });
  const prm=document.querySelector('[data-photo-remove]');
  prm && prm.addEventListener('click',()=>{ pendingPhoto=null;
    document.querySelector('[data-photo-preview]').hidden=true;
    const pi=document.querySelector('[data-photo-input]'); if(pi) pi.value='';
  });

  // entry: save / delete
  const ef=document.querySelector('[data-entry-form]');
  ef && ef.addEventListener('submit',e=>{ e.preventDefault();
    const id=ef.placeId.value;
    const rating=parseFloat(document.querySelector('.entry-rate').dataset.value||'0')||0;
    const patch={ rating, note:ef.note.value.trim(), visitedAt:ef.visitedAt.value||'' };
    if(pendingPhoto!==undefined) patch.photo=pendingPhoto; // null clears, string sets
    Entries.set(id,patch);
    closeModal(ef.closest('[data-modal]'));
    Toast.show('Saved <em>'+esc(Places.byId(id)?.name||'entry')+'</em>');
  });
  const ed=document.querySelector('[data-entry-delete]');
  ed && ed.addEventListener('click',()=>{ const id=document.querySelector('[data-entry-form]').placeId.value;
    Entries.remove(id); closeModal(document.querySelector('[data-modal="entry"]'));
    Toast.show('Entry deleted');
  });
}

/* ---------- profile dropdown ---------- */
function initProfileMenu(){
  const chip=document.querySelector('[data-profile-menu]');
  const dd=document.querySelector('[data-profile-dropdown]');
  if(!chip||!dd) return;
  chip.addEventListener('click',e=>{ e.stopPropagation(); dd.hidden=!dd.hidden; });
  document.addEventListener('click',e=>{ if(!dd.hidden&&!dd.contains(e.target)&&e.target!==chip) dd.hidden=true; });
  const so=document.querySelector('[data-signout]');
  so && so.addEventListener('click',()=>{ Profile.clear(); dd.hidden=true; Toast.show('Signed out · your ratings stay on this device'); });
}

/* ---------- toolbar ---------- */
function syncToolbarUI(){
  document.querySelectorAll('[data-logbook-filters] [data-tab]').forEach(a=>a.classList.toggle('on',a.dataset.tab===state.tab));
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===state.view));
}
function initToolbar(){
  const s=document.querySelector('[data-search]');
  s && s.addEventListener('input',()=>{ state.q=s.value.trim(); renderLogbook(); });
  const fc=document.querySelector('[data-filter-cuisine]');
  fc && fc.addEventListener('change',()=>{ state.cuisine=fc.value; renderLogbook(); });
  const fr=document.querySelector('[data-filter-rating]');
  fr && fr.addEventListener('change',()=>{ state.minRating=parseFloat(fr.value)||0; renderLogbook(); });
  const so=document.querySelector('[data-sort]');
  so && so.addEventListener('change',()=>{ state.sort=so.value; renderLogbook(); });
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    state.view=b.dataset.view; syncToolbarUI(); renderLogbook();
  }));
}

/* ---------- global click/actions ---------- */
function initActions(){
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-add-place],[data-signin],[data-share-open],[data-share-copy],[data-friend-add],[data-friend-remove],[data-compare],[data-tab],[data-edit-entry],[data-wish],[data-print],[data-clear-filters],a[href^="#"]');
    if(!t) return;

    if(t.matches('[data-friend-remove]')){ e.preventDefault(); Friends.remove(t.dataset.friendRemove); Toast.show('Friend removed'); return; }
    if(t.matches('[data-compare]')){ e.preventDefault(); openCompare(t.dataset.compare); return; }
    if(t.matches('[data-edit-entry]')){ e.preventDefault(); openEntry(t.dataset.editEntry); return; }
    if(t.matches('[data-wish]')){ e.preventDefault(); e.stopPropagation();
      const on=Wishlist.toggle(t.dataset.wish);
      Toast.show(on?'Added to wishlist':'Removed from wishlist'); return; }
    if(t.hasAttribute('data-add-place')){ e.preventDefault(); openModal('addplace'); return; }
    if(t.hasAttribute('data-signin')){ e.preventDefault(); openModal('signin'); return; }
    if(t.hasAttribute('data-print')){ e.preventDefault();
      const dd=document.querySelector('[data-profile-dropdown]'); if(dd) dd.hidden=true;
      window.print(); return; }
    if(t.hasAttribute('data-clear-filters')){ e.preventDefault();
      state.q=state.cuisine=''; state.minRating=0; state.sort='default';
      const sb=document.querySelector('[data-search]'); if(sb) sb.value='';
      const fc=document.querySelector('[data-filter-cuisine]'); if(fc) fc.value='';
      const frt=document.querySelector('[data-filter-rating]'); if(frt) frt.value='0';
      const so=document.querySelector('[data-sort]'); if(so) so.value='default';
      renderLogbook(); return; }
    if(t.hasAttribute('data-share-open')){ e.preventDefault();
      const dd=document.querySelector('[data-profile-dropdown]'); if(dd) dd.hidden=true;
      document.getElementById('friends').scrollIntoView({behavior:'smooth'});
      setTimeout(()=>{ const i=document.querySelector('[data-share-link]'); if(i){i.focus();i.select();} },500); return; }
    if(t.hasAttribute('data-share-copy')){ e.preventDefault();
      const l=shareLink(); if(!l){ openModal('signin'); Toast.show('Sign in to get a share link'); return; }
      navigator.clipboard?.writeText(l).then(()=>Toast.show('Share link copied · send it to a friend'),
        ()=>{ const i=document.querySelector('[data-share-link]'); i.select(); document.execCommand('copy'); Toast.show('Share link copied'); }); return; }
    if(t.hasAttribute('data-friend-add')){ e.preventDefault(); importCode(document.querySelector('[data-friend-input]').value); return; }
    if(t.hasAttribute('data-tab')){ e.preventDefault(); state.tab=t.dataset.tab; state.view='grid'; syncToolbarUI(); renderLogbook();
      document.getElementById('logbook').scrollIntoView({behavior:'smooth'}); return; }

    const href=t.getAttribute('href');
    if(href&&href.length>1&&href.startsWith('#')){ const el=document.getElementById(href.slice(1));
      if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth'}); } }
  });
  const fi=document.querySelector('[data-friend-input]');
  fi && fi.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); importCode(fi.value); } });
}

/* ---------- boot ---------- */
function renderAll(){ renderProfileUI(); renderFeature(); renderStats(); renderFriends(); renderShare(); renderLogbook(); }

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.rate-dock .rate').forEach(r=>initRating(r));
  initModals(); initProfileMenu(); initToolbar(); initActions();
  syncToolbarUI(); renderAll();
  if(location.hash.startsWith('#friend=')){
    const code=location.hash.slice('#friend='.length);
    history.replaceState(null,'',location.pathname+location.search);
    setTimeout(()=>importCode(code),500);
  }
});
document.addEventListener('profile:change',renderAll);
document.addEventListener('data:change',()=>{ renderProfileUI(); renderFeature(); renderStats(); renderFriends(); renderShare(); renderLogbook(); });
