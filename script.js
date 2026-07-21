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
const KEY_PENDING_FRIEND = 'be:pendingFriend';

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
window.__SEED_IDS = new Set(SEED_PLACES.map(p=>p.id));

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

const KEY_SPINS = 'be:spins';
const Spins = {
  all(){ return loadJSON(KEY_SPINS, []); },
  add(s){ const l=this.all(); l.push(s); saveJSON(KEY_SPINS,l); emit('data:change'); return s; },
  update(id, patch){
    const l=this.all(); const i=l.findIndex(x=>x.id===id);
    if(i<0) return null;
    l[i] = { ...l[i], ...patch };
    saveJSON(KEY_SPINS, l); emit('data:change');
    return l[i];
  },
  byId(id){ return this.all().find(s=>s.id===id) || null; },
  pending(){
    // a spin is "pending" if locked but not yet super-rated
    return this.all().find(s => s.lockedAt && !s.superRatedAt) || null;
  },
  remove(id){ saveJSON(KEY_SPINS, this.all().filter(s=>s.id!==id)); emit('data:change'); },
  count(){ return this.all().length; },
  countCompleted(){ return this.all().filter(s=>s.superRatedAt).length; }
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

/* ============================================================
   CLOUD SYNC (Supabase) — offline-first.
   localStorage stays the synchronous source for rendering;
   this layer pulls/merges on sign-in & realtime, pushes on edit.
   No-ops entirely when window.Cloud.enabled is false.
   ============================================================ */
const Sync = (function(){
  const C = window.Cloud || { enabled:false };
  let me=null, profileRow=null, ready=false, pushT=null;
  const cloud=()=>C.enabled;

  function setStatus(s){
    const el=document.querySelector('[data-sync-status]');
    if(el) el.textContent = s==='syncing'?'⟳ syncing…':s==='cloud'?'☁ synced across devices':'● offline';
    document.body.dataset.sync=s;
  }

  async function ensureProfile(user){
    me=user;
    profileRow=await C.DB.getProfile(user.id);
    if(!profileRow){ openModal('handle'); return false; }
    Profile.set({ name:profileRow.name, handle:profileRow.handle, id:user.id, cloud:true, joinedAt:new Date().toISOString() });
    return true;
  }
  async function saveProfile(name, handle){
    if(!me) return false;
    handle=slugify(handle||name);
    if(!handle){ Toast.show('Pick a handle'); return false; }
    if(await C.DB.handleTaken(handle, me.id)){ Toast.show('Handle <em>@'+esc(handle)+'</em> is taken'); return false; }
    const err=await C.DB.upsertProfile({ id:me.id, name, handle });
    if(err){ Toast.show('Could not save profile'); return false; }
    profileRow={ id:me.id, name, handle };
    Profile.set({ name, handle, id:me.id, cloud:true, joinedAt:new Date().toISOString() });
    await pull();
    C.Realtime.subscribe(onRealtime);
    return true;
  }

  function localEntryRows(){
    return Object.entries(Entries.all())
      .filter(([,e])=>e.rating||e.note||e.photo||(e.dishes&&e.dishes.length))
      .map(([pid,e])=>({ user_id:me.id, place_id:pid, rating:e.rating||0,
        note:e.note||'', visited_at:e.visitedAt||null,
        photo_url:(e.photo&&/^https?:/.test(e.photo))?e.photo:null,
        dishes:e.dishes||null, super_rated:!!e.superRated,
        updated_at:e.updatedAt||new Date().toISOString() }));
  }

  async function pull(){
    if(!cloud()||!me) return;
    setStatus('syncing');
    try{
      // places (union into local custom)
      const cp=await C.DB.listPlaces();
      const lc=Places.custom(); const seen=new Set(lc.map(p=>p.id));
      cp.forEach(p=>{ if(!seen.has(p.id)&&!window.__SEED_IDS.has(p.id))
        lc.push({id:p.id,name:p.name,hood:p.hood,cuisine:p.cuisine,dish:p.dish,lat:p.lat,lng:p.lng,custom:true}); });
      localStorage.setItem(KEY_PLACES, JSON.stringify(lc));
      // my entries (cloud authoritative, but keep strictly-newer local edits)
      const ce=await C.DB.listMyEntries(me.id), local=Entries.all(), merged={};
      ce.forEach(r=>{ merged[r.place_id]={ rating:Number(r.rating)||0, note:r.note||'',
        photo:r.photo_url||null, visitedAt:r.visited_at||'', createdAt:r.updated_at, updatedAt:r.updated_at }; });
      Object.entries(local).forEach(([pid,e])=>{ const c=merged[pid];
        if(!c||new Date(e.updatedAt||0)>new Date(c.updatedAt||0)) merged[pid]=e; });
      localStorage.setItem(KEY_ENTRIES, JSON.stringify(merged));
      // wishlist (union)
      const wl=await C.DB.listWishlist(me.id);
      const u=Array.from(new Set([...(loadJSON(KEY_WISHLIST,[])), ...wl]));
      localStorage.setItem(KEY_WISHLIST, JSON.stringify(u));
      // friends + their entries
      const fr=await C.DB.listFriends(me.id), objs=[];
      for(const f of fr){
        const fe=await C.DB.listFriendEntries(f.id), en={};
        fe.forEach(r=>{ en[r.place_id]={
          rating:Number(r.rating)||0, note:r.note||'',
          visitedAt:r.visited_at||'', updatedAt:r.updated_at,
          dishes:r.dishes||null, superRated:!!r.super_rated
        }; });
        objs.push({ name:f.name, handle:f.handle, uid:f.id, entries:en, places:[], wishlist:[], addedAt:new Date().toISOString(), cloud:true });
      }
      const keep=loadJSON(KEY_FRIENDS,[]).filter(x=>!x.cloud);
      localStorage.setItem(KEY_FRIENDS, JSON.stringify([...keep,...objs]));
      ready=true; setStatus('cloud');
      document.dispatchEvent(new CustomEvent('data:change'));
      processPendingFriend();
    }catch(err){ console.error('[Sync.pull] failed:', err); setStatus('cloud'); }
  }

  function schedulePush(){ if(!cloud()||!me||!ready) return; clearTimeout(pushT); pushT=setTimeout(push,900); }
  async function push(){
    if(!cloud()||!me||!ready) return;
    setStatus('syncing');
    try{
      const rows=localEntryRows();
      const entriesErr=await C.DB.upsertEntries(rows);
      if(entriesErr) console.error('[Sync.push] upsertEntries failed:', entriesErr);
      await C.DB.deleteEntriesExcept(me.id, rows.map(r=>r.place_id));
      const cps=Places.custom().map(p=>({ id:p.id,name:p.name,hood:p.hood,
        cuisine:p.cuisine||null,dish:p.dish||null,lat:p.lat??null,lng:p.lng??null,created_by:me.id }));
      if(cps.length) await C.DB.upsertPlaces(cps);
      await C.DB.setWishlist(me.id, loadJSON(KEY_WISHLIST,[]));
      setStatus('cloud');
    }catch(err){ console.error('[Sync.push] failed:', err); setStatus('cloud'); }
  }

  async function uploadPendingPhoto(placeId, dataURL){
    if(!cloud()||!me) return dataURL;
    const url=await C.Storage.uploadPhoto(me.id, placeId, dataURL);
    return url||dataURL;
  }

  async function addFriendByHandle(h){
    if(!cloud()||!me){ Toast.show('Sign in to add friends by handle'); return false; }
    const prof=await C.DB.findByHandle(h.replace(/^@/,'').trim());
    if(!prof){ Toast.show('No eater with that handle'); return false; }
    if(prof.id===me.id){ Toast.show("That's your own handle"); return false; }
    const err=await C.DB.addFriend(me.id, prof.id);
    if(err){ Toast.show('Could not add friend'); return false; }
    Toast.show(esc(prof.name.split(' ')[0])+' added · syncing their logbook');
    await pull();
    return true;
  }
  async function removeFriendCloud(handle){
    if(!cloud()||!me) return;
    const f=loadJSON(KEY_FRIENDS,[]).find(x=>x.handle===handle&&x.cloud);
    if(f&&f.uid) await C.DB.removeFriend(me.id, f.uid);
  }

  /* a #addfriend= link opened before sign-in stashes its handle here;
     once a session lands, the next successful pull() picks it up. */
  async function processPendingFriend(){
    if(!cloud()||!me) return;
    const h=localStorage.getItem(KEY_PENDING_FRIEND);
    if(!h) return;
    localStorage.removeItem(KEY_PENDING_FRIEND);
    await addFriendByHandle(h);
  }

  function onRealtime(payload){
    const uid=payload&&((payload.new&&payload.new.user_id)||(payload.old&&payload.old.user_id));
    if(uid&&me&&uid===me.id) return;        // ignore our own write echo (prevents loop)
    clearTimeout(pushT); setTimeout(pull,600);
  }

  /* Pull the public places catalogue — runs without auth, so the
     spin pool is large even before sign-in. Merges by id; never
     touches seed places. */
  async function pullPublicPlaces(){
    if(!cloud()) return;
    try{
      const cp = await C.DB.listPlaces();
      if(!cp || !cp.length) return;
      const lc = Places.custom();
      const seen = new Set(lc.map(p=>p.id));
      let added = 0;
      cp.forEach(p=>{
        if(!seen.has(p.id) && !window.__SEED_IDS.has(p.id)){
          lc.push({ id:p.id, name:p.name, hood:p.hood, cuisine:p.cuisine, dish:p.dish, lat:p.lat, lng:p.lng, custom:true });
          added++;
        }
      });
      if(added){
        localStorage.setItem(KEY_PLACES, JSON.stringify(lc));
        document.dispatchEvent(new CustomEvent('data:change'));
      }
    }catch(e){ /* silent — offline-first */ }
  }

  async function boot(){
    if(!cloud()){ setStatus('offline'); return; }
    setStatus('offline');
    // public catalogue first (no auth needed)
    pullPublicPlaces();
    C.Auth.onChange(async (evt,sess)=>{
      if(sess&&sess.user){
        const ok=await ensureProfile(sess.user);
        if(ok){ await pull(); C.Realtime.subscribe(onRealtime); }
        renderAll();
      } else if(evt==='SIGNED_OUT'){
        me=null; profileRow=null; ready=false;
        Profile.clear(); setStatus('offline'); renderAll();
      }
    });
    const sess=await C.Auth.session();
    if(sess&&sess.user){
      const ok=await ensureProfile(sess.user);
      if(ok){ await pull(); C.Realtime.subscribe(onRealtime); }
      renderAll();
    }
  }

  return { boot, pull, schedulePush, saveProfile, addFriendByHandle,
           removeFriendCloud, uploadPendingPhoto, isCloud:cloud, hasSession:()=>!!me };
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

/* Detailed aggregation for the restaurant page — collects every entry
   for this place (yours + friends), groups dishes, finds extremes. */
function placeAggregate(placeId){
  const all=[];
  const mine=Entries.get(placeId);
  if(mine&&(mine.rating||(mine.dishes&&mine.dishes.length))){
    all.push({ by:'you', rating:mine.rating, note:mine.note,
      dishes:mine.dishes||[], when:mine.updatedAt||mine.createdAt||mine.visitedAt,
      superRated:!!mine.superRated, isMine:true });
  }
  Friends.all().forEach(f=>{
    const e=(f.entries||{})[placeId];
    if(e&&(e.rating||(e.dishes&&e.dishes.length))){
      all.push({ by:f.name, byHandle:f.handle, rating:e.rating, note:e.note,
        dishes:e.dishes||[], when:e.updatedAt||e.visitedAt,
        superRated:!!e.superRated, isMine:false });
    }
  });

  const ratings=all.filter(x=>x.rating).map(x=>x.rating);
  const avg=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0;
  const networkOnly=all.filter(x=>!x.isMine&&x.rating).map(x=>x.rating);
  const networkAvg=networkOnly.length?networkOnly.reduce((a,b)=>a+b,0)/networkOnly.length:0;

  // dish-level aggregation: group by case-insensitive dish name
  const dishMap={};
  all.forEach(x=>(x.dishes||[]).forEach(d=>{
    if(!d||!d.name||!d.rating) return;
    const key=d.name.toLowerCase().trim();
    if(!key) return;
    if(!dishMap[key]) dishMap[key]={ name:d.name.trim(), ratings:[] };
    dishMap[key].ratings.push(Number(d.rating));
  }));
  const dishes=Object.values(dishMap).map(d=>({
    name:d.name,
    avg:Math.round(d.ratings.reduce((a,b)=>a+b,0)/d.ratings.length*10)/10,
    count:d.ratings.length
  })).sort((a,b)=>b.avg-a.avg);

  return {
    count:ratings.length,
    avg:Math.round(avg*10)/10,
    networkCount:networkOnly.length,
    networkAvg:Math.round(networkAvg*10)/10,
    dishes,
    reviews:all.sort((a,b)=>new Date(b.when||0)-new Date(a.when||0))
  };
}

function timeAgo(date){
  if(!date) return '';
  const d=new Date(date);
  if(isNaN(d)) return '';
  const s=(Date.now()-d.getTime())/1000;
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+' min ago';
  if(s<86400) return Math.floor(s/3600)+' hr ago';
  if(s<86400*7) return Math.floor(s/86400)+' days ago';
  if(s<86400*30) return Math.floor(s/86400/7)+' wk ago';
  if(s<86400*365) return Math.floor(s/86400/30)+' mo ago';
  return Math.floor(s/86400/365)+' yr ago';
}

function openPlaceDetail(placeId){
  const p=Places.byId(placeId); if(!p) return;
  const ag=placeAggregate(placeId);
  const mine=Entries.get(placeId);
  const body=document.querySelector('[data-place-body]');
  if(!body) return;

  // "loved for / weakest on" callouts — only when we have enough variance
  let callouts='';
  if(ag.dishes.length>=2){
    const best=ag.dishes[0], worst=ag.dishes[ag.dishes.length-1];
    if(best.avg-worst.avg>=0.6){
      callouts=`<div class="pd-callouts">
        <div class="pd-callout loved">Loved for the <em>${esc(best.name)}</em> · ★ ${fmt(best.avg)}</div>
        <div class="pd-callout weak">Weakest on <em>${esc(worst.name)}</em> · ★ ${fmt(worst.avg)}</div>
      </div>`;
    } else {
      callouts=`<div class="pd-callouts"><div class="pd-callout loved">Top dish: <em>${esc(best.name)}</em> · ★ ${fmt(best.avg)}</div></div>`;
    }
  } else if(ag.dishes.length===1){
    callouts=`<div class="pd-callouts"><div class="pd-callout loved">Best dish: <em>${esc(ag.dishes[0].name)}</em> · ★ ${fmt(ag.dishes[0].avg)}</div></div>`;
  }

  const lastNet=ag.reviews.find(r=>!r.isMine);
  const recentBlurb=lastNet&&lastNet.when
    ? `Last reviewed by your network <em>${esc(timeAgo(lastNet.when))}</em>`
    : '';

  const onWish=Wishlist.has(placeId);

  body.innerHTML=`
    <div class="pd-header">
      <div class="pd-meta">${esc(p.hood)}${p.cuisine?' · '+esc(p.cuisine):''}</div>
      <h2 id="pd-title">${esc(p.name)}</h2>
      ${p.dish?`<div class="pd-dish-tag">Known for: <em>${esc(p.dish)}</em></div>`:''}
    </div>

    <div class="pd-stats">
      <div class="pd-stat ${ag.networkCount?'has-data':'no-data'}">
        <div class="pd-stat-num">${ag.networkCount?fmt(ag.networkAvg):'—'}</div>
        <div class="pd-stat-lbl">your network</div>
        <div class="pd-stat-sub">${ag.networkCount?`${ag.networkCount} friend${ag.networkCount===1?'':'s'}`:'no friends rated yet'}</div>
      </div>
      <div class="pd-stat ${ag.count?'has-data':'no-data'}">
        <div class="pd-stat-num">${ag.count?fmt(ag.avg):'—'}</div>
        <div class="pd-stat-lbl">all in</div>
        <div class="pd-stat-sub">${ag.count?`${ag.count} ${ag.count===1?'rating':'ratings'}`:'no ratings yet'}</div>
      </div>
      <div class="pd-stat your-stat">
        <div class="pd-stat-num">${mine&&mine.rating?fmt(mine.rating):'—'}</div>
        <div class="pd-stat-lbl">your rating</div>
        <div class="pd-stat-sub"><button type="button" class="link-btn" data-edit-entry="${esc(placeId)}">${mine&&mine.rating?'Edit ↗':'Rate this ↗'}</button></div>
      </div>
    </div>

    ${callouts}
    ${recentBlurb?`<div class="pd-recent">${recentBlurb}</div>`:''}

    <div class="pd-actions">
      <button type="button" class="pd-act" data-wish="${esc(placeId)}">${onWish?'★ Wishlisted':'☆ Add to wishlist'}</button>
      <button type="button" class="pd-act" data-edit-entry="${esc(placeId)}">${mine?'Edit your review':'Add note &amp; photo'}</button>
    </div>

    ${ag.dishes.length?`
      <div class="pd-section">
        <h3>By the dish</h3>
        <div class="pd-dishes">
          ${ag.dishes.map(d=>`
            <div class="pd-dish-row">
              <span class="pd-dish-name">${esc(d.name)}</span>
              <span class="pd-dish-stars"><span class="rating"><span class="rate-bg">★★★★★</span><span class="rate-fg" style="width:${(d.avg/5)*100}%">★★★★★</span></span></span>
              <span class="pd-dish-avg">${fmt(d.avg)}</span>
              <span class="pd-dish-count">${d.count} ${d.count===1?'review':'reviews'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `:''}

    ${ag.reviews.length?`
      <div class="pd-section">
        <h3>Recent reviews <span class="pd-section-count">${ag.reviews.length}</span></h3>
        <div class="pd-reviews">
          ${ag.reviews.slice(0,8).map(r=>`
            <div class="pd-review${r.isMine?' is-mine':''}">
              <div class="pd-review-head">
                <span class="pd-review-by"><b>${esc(r.by)}</b>${r.byHandle?` <span class="pd-review-handle">@${esc(r.byHandle)}</span>`:''}</span>
                ${r.rating?`<span class="pd-review-rating">★ ${fmt(r.rating)}</span>`:''}
                ${r.when?`<span class="pd-review-when">${esc(timeAgo(r.when))}</span>`:''}
                ${r.superRated?`<span class="super-badge inline">✦</span>`:''}
              </div>
              ${r.note?`<div class="pd-review-note">"${esc(r.note)}"</div>`:''}
              ${r.dishes&&r.dishes.length?`<div class="pd-review-dishes">${r.dishes.map(d=>`<span class="dish-pill"><b>${esc(d.name)}</b> ${fmt(d.rating)}★</span>`).join('')}</div>`:''}
            </div>
          `).join('')}
        </div>
      </div>
    `:`<div class="pd-empty">No ratings yet — be the first to log a plate here.</div>`}
  `;
  openModal('place');
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
let state = { tab:'all', q:'', cuisine:'', minRating:0, sort:'default', showAll:false };

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
  const aggLine = (state.tab==='friends')
    ? `<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${Friends.all().filter(f=>friendRating(f,p.id)).length} friend(s)</span>`
    : (ag.count?`<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${ag.count} rating${ag.count===1?'':'s'}</span>`
                :`<span class="agg unrated">Unrated</span>`);

  // Photo block: ONLY render when there's a real photo. No more empty gradients.
  const photoBlock = photo ? `
    <div class="card-photo" style="background-image:url(${photo})">
      ${recs.length?`<span class="rec-badge">◦ ${esc(recs[0])} recommends</span>`:''}
    </div>` : '';

  // Wishlist button only when relevant: tab-aware
  const wishBtn = (state.tab==='wishlist' || onWish)
    ? `<button class="card-wish${onWish?' on':''}" data-wish="${p.id}" type="button">${onWish?'★ Wishlisted':'☆ Wishlist'}</button>`
    : `<button class="card-wish ghost" data-wish="${p.id}" type="button">☆ Wishlist</button>`;

  return `
  <div class="log-card${photo?' has-photo':' text-led'}" data-place-id="${p.id}" data-cz="${esc(p.cuisine||'Other')}">
    ${photoBlock}
    <div class="card-body">
      <div class="card-eyebrow">${esc(p.hood)}${p.cuisine?` · <span class="cz">${esc(p.cuisine)}</span>`:''}</div>
      <button type="button" class="name name-btn" data-place-detail="${esc(p.id)}">${esc(p.name)}</button>
      ${p.dish?`<div class="card-dish-tag">${esc(p.dish)}</div>`:''}
      <div class="row">${aggLine}${e&&e.superRated?'<span class="super-badge" title="Adventurous Visit — spun &amp; verified">✦ Adventurous</span>':''}${!photo&&recs.length?`<span class="rec-inline">◦ ${esc(recs[0])} recommends</span>`:''}</div>
      ${e&&e.note?`<div class="card-note">"${esc(e.note)}"</div>`:''}
      ${e&&e.dishes&&e.dishes.length?`<div class="dish-list">${e.dishes.map(d=>`<span class="dish-pill"><b>${esc(d.name)}</b> ${fmt(d.rating)}★</span>`).join('')}</div>`:''}
      ${e&&e.visitedAt?`<div class="card-date">Visited ${esc(new Date(e.visitedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</div>`:''}
      <div class="your-rate-row">
        <span class="lbl">${mine?'Your rating · <b>'+fmt(mine)+'/5</b>':'Your rating'}</span>
        <div class="rate" data-max="5" data-value="${mine}" data-place-id="${p.id}" tabindex="0" role="slider" aria-label="Rate ${esc(p.name)}">
          <span class="rate-bg">★★★★★</span><span class="rate-fg" style="width:${(mine/5)*100}%">★★★★★</span><span class="rate-hov" style="width:0%">★★★★★</span>
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="card-edit" data-edit-entry="${p.id}">${e?'Edit note &amp; date':'Add note &amp; photo'}</button>
        ${wishBtn}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   Calendar timeline view — for "Rated by you" tab
   Groups entries by month, dateline left rail, typography-led.
   ============================================================ */
function renderDiary(list){
  const grid=document.querySelector('[data-log-grid]');
  if(!grid) return;

  const groups={};
  list.forEach(p=>{
    const e=Entries.get(p.id);
    if(!e||(!e.rating&&!(e.note||'').trim())) return;
    const when=e.visitedAt||e.updatedAt||e.createdAt;
    if(!when) return;
    const d=new Date(when); if(isNaN(d)) return;
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!groups[k]) groups[k]={ date:d, items:[] };
    groups[k].items.push({ place:p, entry:e, when:d });
  });

  const monthKeys=Object.keys(groups).sort().reverse();
  monthKeys.forEach(k=>groups[k].items.sort((a,b)=>b.when-a.when));

  if(!monthKeys.length){
    grid.innerHTML='';
    document.querySelector('[data-log-empty]').hidden=false;
    document.querySelector('[data-log-empty]').innerHTML=
      'Nothing rated yet — switch to <b>All places</b> and start tasting.';
    grid.hidden=true;
    return;
  }
  document.querySelector('[data-log-empty]').hidden=true;
  grid.hidden=false;

  grid.innerHTML=monthKeys.map(k=>{
    const g=groups[k];
    const monthLabel=g.date.toLocaleString(undefined,{month:'long',year:'numeric'}).toUpperCase();
    return `
      <section class="diary-month">
        <header class="diary-month-head">
          <h3>${esc(monthLabel)}</h3>
          <span class="diary-month-count">${g.items.length} plate${g.items.length===1?'':'s'}</span>
        </header>
        ${g.items.map(diaryEntry).join('')}
      </section>`;
  }).join('');

  grid.querySelectorAll('.rate').forEach(r=>initRating(r));
}

function diaryEntry(it){
  const p=it.place, e=it.entry, d=it.when;
  const onWish=Wishlist.has(p.id);
  const recs=recommenders(p.id);
  const photo=e.photo;
  return `
    <article class="diary-entry">
      <div class="diary-date">
        <span class="dd-day">${d.getDate()}</span>
        <span class="dd-mo">${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span>
        <span class="dd-wd">${d.toLocaleString(undefined,{weekday:'short'}).toUpperCase()}</span>
      </div>
      <div class="diary-body">
        <div class="diary-eyebrow">${esc(p.hood)}${p.cuisine?' · '+esc(p.cuisine):''}</div>
        <button type="button" class="diary-name" data-place-detail="${esc(p.id)}">${esc(p.name)}</button>
        ${p.dish?`<div class="diary-known-for">Known for: <em>${esc(p.dish)}</em></div>`:''}
        ${e.rating?`<div class="diary-rating">
          <span class="rating"><span class="rate-bg">★★★★★</span><span class="rate-fg" style="width:${(e.rating/5)*100}%">★★★★★</span></span>
          <span class="diary-rating-num">★ ${fmt(e.rating)} / 5</span>
          ${e.superRated?'<span class="super-badge inline">✦ Adventurous</span>':''}
        </div>`:''}
        ${photo?`<div class="diary-photo" style="background-image:url(${photo})"></div>`:''}
        ${e.note?`<div class="diary-note">"${esc(e.note)}"</div>`:''}
        ${e.dishes&&e.dishes.length?`<div class="dish-list">${e.dishes.map(dd=>`<span class="dish-pill"><b>${esc(dd.name)}</b> ${fmt(dd.rating)}★</span>`).join('')}</div>`:''}
        ${recs.length?`<div class="diary-rec">Also recommended by <b>${esc(recs[0])}</b>.</div>`:''}
        <div class="diary-actions">
          <button type="button" data-edit-entry="${esc(p.id)}">Edit</button>
          <button type="button" data-place-detail="${esc(p.id)}">View page</button>
          <button type="button" data-wish="${esc(p.id)}">${onWish?'★ On wishlist':'☆ Wishlist'}</button>
        </div>
      </div>
    </article>`;
}

/* ============================================================
   Browse home — the search-first lobby for the All Places tab.
   Replaces the wall of 9k cards with a typographic landing that
   nudges meaningful paths: friend recs, your wishlist, the spin.
   ============================================================ */
function bhCard(p, blurb){
  return `<button type="button" class="bh-card" data-place-detail="${esc(p.id)}" data-cz="${esc(p.cuisine||'Other')}">
    <div class="bh-eyebrow">${esc(p.hood)}${p.cuisine?' · '+esc(p.cuisine):''}</div>
    <div class="bh-name">${esc(p.name)}</div>
    <div class="bh-blurb">${esc(blurb)}</div>
  </button>`;
}

function renderBrowseHome(){
  const reg=Places.registry();
  const total=reg.length;
  const friends=Friends.all();

  // Places at least one friend rated >=4 that you haven't rated yourself
  const friendLoved=reg
    .filter(p=>!Entries.rating(p.id))
    .map(p=>{
      let best=0, who=null;
      friends.forEach(f=>{ const r=friendRating(f,p.id); if(r>best){ best=r; who=f; } });
      return { p, fr:best, who };
    })
    .filter(x=>x.fr>=4 && x.who)
    .sort((a,b)=>b.fr-a.fr)
    .slice(0,4);

  // Your wishlist (up to 4)
  const wishlist=Wishlist.all()
    .map(id=>Places.byId(id))
    .filter(Boolean)
    .slice(0,4);

  // Header copy
  let intro;
  if(!Profile.get()){
    intro=`<p class="bh-sub">Sign in, then type a name, area or cuisine above to start your logbook.</p>`;
  } else if(!Entries.count()){
    intro=`<p class="bh-sub">Type a name, area or cuisine above to find your first plate.</p>`;
  } else {
    intro=`<p class="bh-sub">Type a name, area or cuisine above. Or pick a way in below.</p>`;
  }

  return `
    <div class="browse-home">
      <h3 class="bh-h3">
        Search Bengaluru's <em>${total.toLocaleString()}</em><br/>restaurants.
      </h3>
      ${intro}

      ${friendLoved.length?`
        <div class="bh-section">
          <div class="bh-head">
            <span class="bh-lbl">Loved by your friends</span>
            <button type="button" class="link-btn" data-tab="friends">All friend ratings →</button>
          </div>
          <div class="bh-grid">
            ${friendLoved.map(x=>bhCard(x.p, '★ '+fmt(x.fr)+' from '+esc(x.who.name.split(' ')[0]))).join('')}
          </div>
        </div>
      `:''}

      ${wishlist.length?`
        <div class="bh-section">
          <div class="bh-head">
            <span class="bh-lbl">On your wishlist</span>
            <button type="button" class="link-btn" data-tab="wishlist">Full wishlist →</button>
          </div>
          <div class="bh-grid">
            ${wishlist.map(p=>bhCard(p,'Want to try')).join('')}
          </div>
        </div>
      `:''}

      <div class="bh-cta">
        <span class="bh-cta-lbl">Decide for you?</span>
        <button type="button" class="bh-cta-btn" data-spin-open>🫓 Spin the Dosa</button>
      </div>
    </div>
  `;
}

function renderLogbook(){
  const grid=document.querySelector('[data-log-grid]');
  const empty=document.querySelector('[data-log-empty]');
  const title=document.querySelector('[data-logbook-title]');
  if(!grid) return;

  if(state.tab==='mine')      title.innerHTML='Plates <em>you</em> have rated.';
  else if(state.tab==='wishlist') title.innerHTML='Places you <em>want</em> to try.';
  else if(state.tab==='friends')  title.innerHTML='What your <em>friends</em> have tasted.';
  else                        title.innerHTML='Every plate in the city, <em>your</em> verdict.';

  // Search-first behaviour for the All Places tab: don't paint the wall.
  const noQuery = !state.q && !state.cuisine && !state.minRating;
  if(state.tab==='all' && noQuery){
    grid.classList.remove('diary-mode');
    grid.hidden=true;
    empty.hidden=false;
    empty.innerHTML=renderBrowseHome();
    return;
  }

  const list=visiblePlaces();

  if(!list.length){
    grid.hidden=true; empty.hidden=false;
    let msg = state.q||state.cuisine||state.minRating
      ? 'Nothing matches those filters. <button type="button" class="link-btn" data-clear-filters>Clear filters</button>'
      : state.tab==='mine' ? 'Nothing rated yet — switch to <b>All places</b> and start tasting.'
      : state.tab==='wishlist' ? 'Wishlist is empty — hit <b>☆ Wishlist</b> on any place you want to try.'
      : state.tab==='friends' ? 'No friend ratings yet — add a code in <b>Friends &amp; Sharing</b> below.'
      : 'No places yet.';
    empty.innerHTML=msg;
  } else if (state.tab === 'mine') {
    // Calendar timeline view for your rated places
    grid.classList.add('diary-mode');
    renderDiary(list);
    return;
  } else {
    empty.hidden=true; grid.hidden=false;
    grid.classList.remove('diary-mode');
    // Render cap: with ~7k places in the catalogue, painting them all
    // freezes the browser. Show the first N; surface a "more" footer.
    const CAP = state.showAll ? Infinity : 120;
    const visible = list.slice(0, CAP);
    let html = visible.map(placeCard).join('');
    if (list.length > visible.length){
      html += `<div class="grid-more"><span>Showing <b>${visible.length}</b> of <b>${list.length.toLocaleString()}</b> places</span>
        <button type="button" class="link-btn" data-show-all>Show all →</button>
        <span class="muted">or use the <b>search</b> and <b>filters</b> above to narrow</span></div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.rate').forEach(r=>initRating(r));
    grid.querySelectorAll('[data-like]').forEach(initLike);
  }
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

/* Compact follow row: "Following: @alice @bob · 3 of your friends" */
function renderFollowRow(){
  const row=document.querySelector('[data-follow-row]'); if(!row) return;
  const fr=Friends.all();
  if(!fr.length){ row.hidden=true; row.innerHTML=''; return; }
  row.hidden=false;
  row.innerHTML=`
    <span class="fr-lbl">Following</span>
    <div class="fr-chips">
      ${fr.map(f=>{
        const init=(f.name||'?').trim().charAt(0).toUpperCase();
        return `<span class="fr-chip" title="${esc(f.name)}">
          <span class="fr-av">${esc(init)}</span>
          <span class="fr-handle">@${esc(f.handle)}</span>
          <button type="button" class="fr-x" data-friend-remove="${esc(f.handle)}" aria-label="Unfollow ${esc(f.handle)}" title="Unfollow">×</button>
        </span>`;
      }).join('')}
    </div>
    <span class="fr-count">${fr.length} ${fr.length===1?'friend':'friends'}</span>`;
}

/* The activity feed — every friend's entries, chronologically. */
function renderActivityFeed(){
  const wrap=document.querySelector('[data-activity-feed]'); if(!wrap) return;
  const fr=Friends.all();
  if(!fr.length){
    wrap.innerHTML=`<div class="empty-state">No friends followed yet. Add an <b>@handle</b> below to see what they're eating.</div>`;
    return;
  }
  // flatten all friend entries
  const items=[];
  fr.forEach(f=>{
    const entries=f.entries||f.ratings||{};
    Object.entries(entries).forEach(([pid,e])=>{
      // entries can be a number (v1 ratings dict) or object (v2 entries)
      const obj=(typeof e==='number')?{rating:e}:e;
      if(!obj.rating && !(obj.note||'').trim() && !(obj.dishes&&obj.dishes.length)) return;
      items.push({
        friend:f, placeId:pid,
        rating:obj.rating||0, note:obj.note||'',
        dishes:obj.dishes||[], superRated:!!obj.superRated,
        when:obj.updatedAt||obj.visitedAt||f.addedAt
      });
    });
  });
  if(!items.length){
    wrap.innerHTML=`<div class="empty-state">Your friends haven't rated anything yet. Check back when they do.</div>`;
    return;
  }
  items.sort((a,b)=>new Date(b.when||0)-new Date(a.when||0));

  wrap.innerHTML=items.slice(0,30).map(it=>{
    const p=Places.byId(it.placeId);
    const pName=p?p.name:it.placeId.replace(/-/g,' ');
    const init=(it.friend.name||'?').trim().charAt(0).toUpperCase();
    const action=it.rating?`rated`:`logged`;
    const placeBtn=p?`<button type="button" class="af-place" data-place-detail="${esc(it.placeId)}">${esc(pName)}</button>`:`<span class="af-place">${esc(pName)}</span>`;
    return `<article class="af-item">
      <span class="af-av">${esc(init)}</span>
      <div class="af-body">
        <div class="af-line">
          <b>${esc(it.friend.name.split(' ')[0])}</b> ${action} ${placeBtn}
          ${it.rating?`<span class="af-rating">★ ${fmt(it.rating)}</span>`:''}
          ${it.superRated?`<span class="super-badge inline">✦</span>`:''}
        </div>
        <div class="af-meta">
          <span class="af-handle">@${esc(it.friend.handle)}</span>
          ${it.when?`<span class="af-when">${esc(timeAgo(it.when))}</span>`:''}
          ${p?`<span class="af-hood">${esc(p.hood)}${p.cuisine?' · '+esc(p.cuisine):''}</span>`:''}
        </div>
        ${it.note?`<div class="af-note">"${esc(it.note)}"</div>`:''}
        ${it.dishes&&it.dishes.length?`<div class="af-dishes">${it.dishes.slice(0,4).map(d=>`<span class="dish-pill"><b>${esc(d.name)}</b> ${fmt(d.rating)}★</span>`).join('')}</div>`:''}
      </div>
    </article>`;
  }).filter(Boolean).join('');

  if(items.length>30){
    wrap.insertAdjacentHTML('beforeend',
      `<div class="af-more">Showing the most recent <b>30</b> of <b>${items.length}</b> · keep rating to see more</div>`);
  }
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
function shareLink(){
  // cloud users get a tiny live-follow link (handle only, always current);
  // offline users get the full data-snapshot code since there's no server to look up.
  if(Sync.isCloud()&&Sync.hasSession()){
    const p=Profile.get(); if(!p||!p.handle) return null;
    return `${location.origin}${location.pathname}#addfriend=${encodeURIComponent(p.handle)}`;
  }
  const c=shareCode(); return c?`${location.origin}${location.pathname}#friend=${c}`:null;
}
function renderShare(){
  const i=document.querySelector('[data-share-link]'); const h=document.querySelector('[data-share-hint]');
  const l=shareLink();
  const live=Sync.isCloud()&&Sync.hasSession();
  if(l){ i.value=l; if(h) h.textContent=live
      ? 'Anyone signed in who opens this link follows you live — always up to date.'
      : 'Anyone who opens this link adds your logbook to their Friends feed.'; }
  else { i.value='Sign in to generate your link'; if(h) h.textContent='You need a profile before you can share.'; }
}
function importCode(raw){
  if(!raw) return;
  let code=raw.trim();
  const af=code.match(/#addfriend=([^&\s]+)/);
  if(af){
    const h=decodeURIComponent(af[1]);
    if(Sync.isCloud()&&Sync.hasSession()){ Sync.addFriendByHandle(h); }
    else { localStorage.setItem(KEY_PENDING_FRIEND,h); Toast.show('Sign in to follow <em>@'+esc(h)+'</em>'); openModal('signin'); }
    return;
  }
  const m=code.match(/#friend=([^&\s]+)/); if(m) code=m[1];
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
  state.tab='friends'; syncToolbarUI(); renderAll();
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
    if(m.dataset.modal!=='handle')
      m.addEventListener('click',e=>{ if(e.target===m) closeModal(m); });
    const x=m.querySelector('[data-modal-close]'); if(x) x.addEventListener('click',()=>closeModal(m));
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape')
    document.querySelectorAll('[data-modal]:not([hidden])').forEach(m=>{ if(m.dataset.modal!=='handle') closeModal(m); }); });

  // populate cuisine selects
  const opts=CUISINES.map(c=>`<option value="${c}">${c}</option>`).join('');
  const cz=document.querySelector('[data-cuisine-select]'); if(cz) cz.innerHTML=opts;
  const fcz=document.querySelector('[data-filter-cuisine]');
  if(fcz) fcz.innerHTML='<option value="">All cuisines</option>'+opts;

  // cloud sign-in (email magic-link)
  const sf=document.querySelector('[data-signin-form]');
  sf && sf.addEventListener('submit', async e=>{ e.preventDefault();
    const email=(new FormData(sf).get('email')||'').toString().trim();
    if(!email || !(window.Cloud&&window.Cloud.enabled)) return;
    const btn=sf.querySelector('button'); if(btn) btn.disabled=true;
    const { error }=await window.Cloud.Auth.signInEmail(email);
    if(btn) btn.disabled=false;
    if(error){ Toast.show('Could not send link — check the email'); return; }
    sf.reset(); closeModal(sf.closest('[data-modal]'));
    Toast.show('Check <em>'+esc(email)+'</em> for your sign-in link ✉');
  });

  // offline sign-in (local name + handle)
  const lf=document.querySelector('[data-signin-form-local]');
  lf && lf.addEventListener('submit',e=>{ e.preventDefault();
    const fd=new FormData(lf); const name=(fd.get('name')||'').toString().trim();
    let h=(fd.get('handle')||'').toString().trim(); if(!name) return;
    Profile.set({name,handle:slugify(h||name),joinedAt:new Date().toISOString()});
    lf.reset(); closeModal(lf.closest('[data-modal]'));
    Toast.show('Welcome, <em>'+esc(name.split(' ')[0])+'</em> · start rating →');
  });

  // cloud handle setup (after first magic-link sign-in)
  const hf=document.querySelector('[data-handle-form]');
  hf && hf.addEventListener('submit', async e=>{ e.preventDefault();
    const fd=new FormData(hf);
    const name=(fd.get('name')||'').toString().trim();
    const handle=(fd.get('handle')||'').toString().trim();
    if(!name||!handle) return;
    const btn=hf.querySelector('button'); if(btn) btn.disabled=true;
    const ok=await Sync.saveProfile(name, handle);
    if(btn) btn.disabled=false;
    if(ok){ hf.reset(); closeModal(hf.closest('[data-modal]'));
      Toast.show('Welcome, <em>'+esc(name.split(' ')[0])+'</em> · synced to the cloud ☁'); renderAll(); }
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
    state.tab=fd.get('wishlist')?'wishlist':'all'; syncToolbarUI(); renderAll();
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
  ef && ef.addEventListener('submit', async e=>{ e.preventDefault();
    const id=ef.placeId.value;
    const rating=parseFloat(document.querySelector('.entry-rate').dataset.value||'0')||0;
    const patch={ rating, note:ef.note.value.trim(), visitedAt:ef.visitedAt.value||'' };
    if(pendingPhoto!==undefined){
      let ph=pendingPhoto; // null clears, string sets
      if(ph && /^data:/.test(ph) && Sync.isCloud() && Sync.hasSession()){
        Toast.show('Uploading photo…');
        ph=await Sync.uploadPendingPhoto(id, ph);
      }
      patch.photo=ph;
    }
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
  so && so.addEventListener('click',()=>{ dd.hidden=true;
    if(Sync.isCloud()){ window.Cloud.Auth.signOut(); }
    Profile.clear(); Toast.show('Signed out · local cache kept on this device'); });
}

/* ============================================================
   SPIN THE DOSA
   Weighted random pick → lock → check-in → super-rating.
   Works fully offline; super-ratings sync via the existing
   Entries.set() path (which Sync already pushes).
   ============================================================ */
const SpinUI = (function(){
  let cycleT=null, pickedId=null, currentSpinId=null, currentVerify=null, currentBillURL=null;
  let geoCoords=null;

  /* ---------- math: distance + weighted pick ---------- */
  function haversineKm(lat1,lng1,lat2,lng2){
    const R=6371, toRad=d=>d*Math.PI/180;
    const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
    const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }
  function userCuisineStats(){
    // avg AND count per cuisine, so we can gate on confidence
    const e=Entries.all(); const sum={}, n={};
    Object.entries(e).forEach(([pid,ent])=>{
      const p=Places.byId(pid); if(!p||!p.cuisine||!ent.rating) return;
      sum[p.cuisine]=(sum[p.cuisine]||0)+ent.rating; n[p.cuisine]=(n[p.cuisine]||0)+1;
    });
    const out={};
    Object.keys(sum).forEach(c=>out[c]={ avg:sum[c]/n[c], n:n[c] });
    return out;
  }
  function maxFriendRating(placeId){
    let best=0;
    Friends.all().forEach(f=>{
      const v=(f.entries||{})[placeId]?.rating || (f.ratings||{})[placeId] || 0;
      if(v>best) best=v;
    });
    return best;
  }
  function candidateCount(cuisine){
    const mine = Entries.all();
    return Places.registry()
      .filter(p => !cuisine || p.cuisine === cuisine)
      .filter(p => !mine[p.id]?.superRated)
      .length;
  }

  function pickPlace(opts){
    const cuisine = opts.cuisine || '';
    const wishlist = new Set(Wishlist.all());
    const stats = userCuisineStats();
    const reg = Places.registry().filter(p => !cuisine || p.cuisine === cuisine);
    const mine = Entries.all();
    const candidates = reg.filter(p => !mine[p.id]?.superRated);
    if(!candidates.length) return { place:null, reasons:[], note:'empty' };

    // -------- personalization confidence gate --------
    // With too little data, weighted picks just bias toward whatever single
    // signal exists (e.g. one wishlisted bakery). Keep it uniform until the
    // signals are real.
    const ratedCount    = Object.values(mine).filter(x=>x.rating).length;
    const wishlistCount = wishlist.size;
    const friendsWithData = Friends.all().filter(f =>
      Object.keys(f.entries || f.ratings || {}).length).length;

    const enoughSignal = ratedCount >= 3 || friendsWithData >= 1 || wishlistCount >= 3;
    const smallSet     = candidates.length <= 3;

    if (smallSet || !enoughSignal){
      // Pure uniform — no fake personalization on thin data
      const place = candidates[Math.floor(Math.random()*candidates.length)];
      return {
        place, reasons:[],
        note: smallSet ? 'small-set' : 'cold-start',
        candidateCount: candidates.length
      };
    }

    // -------- weighted personalization (data-rich path) --------
    const weighted = candidates.map(p => {
      let w = 1, why = [];
      if(geoCoords && p.lat && p.lng){
        const d = haversineKm(geoCoords.lat, geoCoords.lng, p.lat, p.lng);
        if(d < 5){ w *= 1.5; why.push('only '+d.toFixed(1)+' km away'); }
        else if(d > 15) w *= 0.6;
      }
      // cuisine affinity — only with ≥3 ratings in this cuisine
      const cs = p.cuisine && stats[p.cuisine];
      if(cs && cs.n >= 3 && cs.avg >= 4){ w *= 1.5; why.push('you usually love '+p.cuisine.toLowerCase()); }
      else if(cs && cs.n >= 3 && cs.avg >= 3) w *= 1.15;
      // friend boost — only kicks in if a friend actually rated this place
      const fr = maxFriendRating(p.id);
      if(fr >= 4){ w *= 1.6; why.push('a friend rated it '+fr.toFixed(1)+'★'); }
      else if(fr >= 3) w *= 1.15;
      // wishlist — modest (was 2.0×, now 1.4×)
      if(wishlist.has(p.id)){ w *= 1.4; why.push('on your wishlist'); }
      // novelty: downweight things you've already rated normally
      if(mine[p.id]?.rating && !mine[p.id]?.superRated) w *= 0.45;
      return { p, w, why };
    });

    const total = weighted.reduce((s,x)=>s+x.w, 0);
    let r = Math.random() * total;
    for(const item of weighted){
      r -= item.w;
      if(r <= 0) return { place:item.p, reasons:item.why, note:'personalized', candidateCount: candidates.length };
    }
    const last = weighted[weighted.length-1];
    return { place:last.p, reasons:last.why, note:'personalized', candidateCount: candidates.length };
  }

  /* ---------- DOM helpers ---------- */
  function $(sel){ return document.querySelector(sel); }
  function showStep(n){
    document.querySelectorAll('[data-spin-step]').forEach(el=>{ el.hidden = el.dataset.spinStep !== String(n); });
  }

  /* ---------- step 1: pre-spin ---------- */
  function open(){
    pickedId=null; currentSpinId=null; currentVerify=null; currentBillURL=null;
    openModal('spin');
    showStep(1);
    renderCuisineChips();
    renderSpinPool();
    // restore geo state
    const gb=$('[data-spin-geo]'); if(gb) gb.checked = !!geoCoords;
    const gs=$('[data-spin-geo-status]');
    if(gs) gs.textContent = geoCoords ? '📍 Location ready' : '';
  }
  function renderCuisineChips(){
    const wrap=$('[data-spin-cuisines]'); if(!wrap) return;
    if(wrap.dataset.populated) return;
    const chips = ['Any', ...CUISINES].map(c=>{
      const val = c==='Any' ? '' : c;
      const on  = c==='Any' ? ' on' : '';
      return `<button type="button" class="chip${on}" data-cuisine="${esc(val)}">${esc(c)}</button>`;
    }).join('');
    wrap.innerHTML = chips;
    wrap.dataset.populated = '1';
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      wrap.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      renderSpinPool();
    });
  }

  function renderSpinPool(){
    const el = document.querySelector('[data-spin-pool]');
    const btn = document.querySelector('[data-spin-start]');
    if(!el) return;
    const n = candidateCount(readCuisine());
    if(btn) btn.disabled = (n === 0);
    if(n === 0)
      el.innerHTML = `<span class="empty">No places match this cuisine · <button class="link-btn" type="button" data-spin-add>add one →</button></span>`;
    else if(n === 1)
      el.innerHTML = `<span class="thin">Only 1 place in the pool · spin will always land there. <button class="link-btn" type="button" data-spin-add>Add another →</button></span>`;
    else if(n <= 3)
      el.innerHTML = `<span class="thin">${n} places in the pool · variety mode (no personalization) · <button class="link-btn" type="button" data-spin-add>add more →</button></span>`;
    else
      el.innerHTML = `<span>${n} places in the spin pool</span>`;
  }
  function readCuisine(){
    const on = document.querySelector('[data-spin-cuisines] .chip.on');
    return on ? on.dataset.cuisine : '';
  }
  function maybeGetGeo(cb){
    const gb=$('[data-spin-geo]');
    if(!gb || !gb.checked){ geoCoords=null; cb(); return; }
    if(geoCoords) return cb();
    if(!('geolocation' in navigator)){ Toast.show('Location not available'); cb(); return; }
    const gs=$('[data-spin-geo-status]'); if(gs) gs.textContent = '⟳ getting location…';
    navigator.geolocation.getCurrentPosition(
      p => { geoCoords = { lat:p.coords.latitude, lng:p.coords.longitude }; if(gs) gs.textContent='📍 Location ready'; cb(); },
      ()=> { geoCoords=null; if(gs) gs.textContent='📍 Location denied'; cb(); },
      { enableHighAccuracy:true, timeout:6000, maximumAge:120000 }
    );
  }

  /* ---------- step 2: cycle + result ---------- */
  function startSpin(){
    const cuisine = readCuisine();
    maybeGetGeo(()=>{
      const result = pickPlace({ cuisine });
      if(!result.place){ Toast.show('No places to spin — add some first!'); return; }
      pickedId = result.place.id;
      showStep(2);
      runCycler(cuisine, ()=>showResult(result.place, result.reasons, result.note, result.candidateCount));
    });
  }
  function runCycler(cuisine, done){
    const cycler = $('[data-spin-cycler]'); const stage=$('[data-spin-stage]');
    const result = $('[data-spin-result]');
    if(stage) stage.hidden = false; if(result) result.hidden = true;
    const reg = Places.registry().filter(p => !cuisine || p.cuisine===cuisine);
    let i=0, delay=60, total=0;
    function tick(){
      const p = reg[Math.floor(Math.random()*reg.length)];
      if(cycler) cycler.textContent = p ? p.name : '—';
      total += delay;
      delay = Math.min(260, delay + 14); // decelerate
      if(total < 1400){ cycleT = setTimeout(tick, delay); }
      else { clearTimeout(cycleT); cycleT=null; done(); }
    }
    tick();
  }
  function showResult(place, reasons, note, candCount){
    const stage=$('[data-spin-stage]'), result=$('[data-spin-result]');
    if(stage) stage.hidden=true; if(result) result.hidden=false;
    $('[data-spin-place-name]').textContent = place.name;
    $('[data-spin-place-meta]').innerHTML =
      esc(place.hood) + ' · ' + esc(place.cuisine||'—') +
      (place.dish ? ' · <em>'+esc(place.dish)+'</em>' : '') +
      (geoCoords&&place.lat&&place.lng ? ' · ' + haversineKm(geoCoords.lat,geoCoords.lng,place.lat,place.lng).toFixed(1)+' km' : '');
    const ag = aggregate(place.id);
    $('[data-spin-friend-signal]').innerHTML = ag.count
      ? `<b>★ ${fmt(ag.avg)}</b> · ${ag.count} ${ag.count===1?'rating':'ratings'} from you + friends`
      : '<span class="muted">No ratings yet · be the first</span>';
    // honest copy keyed to data confidence
    const whyEl = $('[data-spin-why]');
    if (note === 'personalized' && reasons.length){
      whyEl.innerHTML = 'Why this? ' + reasons.slice(0,2).map(r=>`<em>${esc(r)}</em>`).join(' · ');
    } else if (note === 'small-set'){
      whyEl.innerHTML = (candCount===1)
        ? `<span class="muted">Only place in the pool — <button type="button" class="link-btn" data-spin-add>add another →</button></span>`
        : `<span class="muted">Variety mode · only ${candCount} places match this cuisine.</span>`;
    } else if (note === 'cold-start'){
      whyEl.innerHTML = '<span class="muted">A fresh random pick — rate a few places and the spin starts learning your taste.</span>';
    } else {
      whyEl.innerHTML = '';
    }
  }
  function lockIn(){
    const place = Places.byId(pickedId); if(!place) return;
    const spin = Spins.add({
      id: 'sp_' + Math.random().toString(36).slice(2,10),
      placeId: place.id, cuisine: readCuisine(),
      spunAt: new Date().toISOString(),
      lockedAt: new Date().toISOString()
    });
    currentSpinId = spin.id;
    showStep(3);
    paintCheckin(place);
    Toast.show("Locked in · <em>" + esc(place.name) + "</em>");
  }

  /* ---------- step 3: check-in ---------- */
  function paintCheckin(place){
    $('[data-spin-locked-name]').textContent = place.name + ' · ' + place.hood;
    const sub = $('[data-spin-gps-sub]');
    if(sub) sub.textContent = place.lat ? 'Verify by GPS (within ~250 m)' : 'No coords — GPS unavailable for this spot';
    $('[data-spin-bill-preview]').hidden = true;
    $('[data-spin-bill-preview]').innerHTML = '';
    currentVerify = null; currentBillURL = null;
  }
  async function handleBill(file){
    if(!file) return;
    const dataURL = await new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);
    });
    const compact = await compressImageDataURL(dataURL, 1200, 0.78);
    currentBillURL = compact;
    currentVerify = 'photo';
    const prev = $('[data-spin-bill-preview]');
    prev.hidden = false;
    prev.innerHTML = `<img alt="Bill" src="${compact}"/><span class="verified">✓ Photo attached · verified</span>
      <button type="button" class="link-btn" data-spin-go-rate>Continue to super-rating →</button>`;
  }
  function checkGPS(){
    const spin = Spins.byId(currentSpinId); if(!spin) return;
    const place = Places.byId(spin.placeId);
    if(!place || !place.lat || !place.lng){ Toast.show('No coords for this place'); return; }
    if(!('geolocation' in navigator)){ Toast.show('Location not available'); return; }
    Toast.show('Checking your location…');
    navigator.geolocation.getCurrentPosition(p=>{
      const d = haversineKm(p.coords.latitude, p.coords.longitude, place.lat, place.lng);
      if(d <= 0.25){
        currentVerify='gps';
        Toast.show('✓ You\'re at <em>'+esc(place.name)+'</em> · verified');
        goToSuperRate();
      } else {
        Toast.show("Hmm, ~"+d.toFixed(1)+" km away · keep going or skip verify");
      }
    }, ()=> Toast.show('Could not read location'), { enableHighAccuracy:true, timeout:7000 });
  }
  function checkManual(){
    currentVerify = 'manual';
    goToSuperRate();
  }

  /* ---------- step 4: super-rating ---------- */
  function goToSuperRate(){
    const spin = Spins.byId(currentSpinId); if(!spin) return;
    const place = Places.byId(spin.placeId);
    Spins.update(spin.id, { checkedInAt: new Date().toISOString(), verifiedBy: currentVerify, billUrl: currentBillURL });
    showStep(4);
    paintSuperForm(place);
  }
  function paintSuperForm(place){
    const wrap = $('[data-spin-rated-name]'); if(wrap) wrap.textContent = place.name + ' · ' + place.hood;
    const form = $('[data-super-form]'); if(form){ form.placeId.value = place.id; form.note.value = ''; }
    // dish rows
    const dr = $('[data-dish-rows]');
    if(dr){
      dr.innerHTML = dishRow(place.dish || '') + dishRow('');
      dr.querySelectorAll('.rate').forEach(initRating);
    }
    // overall rate
    const ov = document.querySelector('.super-rate[data-super="overall"]');
    if(ov){ ov.dataset.value='0'; const fg=ov.querySelector('.rate-fg'); if(fg) fg.style.width='0%'; ov.dataset.inited=''; initRating(ov); }
    // hide verify chip if manual
    const vb = document.querySelector('[data-spin-verified-by]');
    if(vb) vb.textContent = currentVerify==='photo' ? 'Verified by bill photo'
      : currentVerify==='gps' ? 'Verified by location'
      : 'Unverified · normal review';
  }
  function dishRow(name){
    return `<div class="dish-row">
      <input type="text" class="dish-name" placeholder="What you ate" maxlength="40" value="${esc(name)}" />
      <div class="rate mini super-rate" data-max="5" data-value="0" tabindex="0" role="slider">
        <span class="rate-bg">★★★★★</span>
        <span class="rate-fg" style="width:0%">★★★★★</span>
        <span class="rate-hov" style="width:0%">★★★★★</span>
      </div>
      <button type="button" class="dish-remove" aria-label="Remove">×</button>
    </div>`;
  }
  function addDishRow(){
    const dr = $('[data-dish-rows]'); if(!dr) return;
    if(dr.querySelectorAll('.dish-row').length >= 5){ Toast.show('Max 5 dishes'); return; }
    dr.insertAdjacentHTML('beforeend', dishRow(''));
    dr.querySelectorAll('.rate').forEach(initRating);
  }
  function removeDishRow(btn){
    const row = btn.closest('.dish-row'); if(row) row.remove();
  }
  function saveSuper(form){
    const placeId = form.placeId.value;
    const overall = parseFloat(document.querySelector('.super-rate[data-super="overall"]').dataset.value||'0')||0;
    if(!overall){ Toast.show('Set an overall rating first'); return; }
    const dishes = [];
    form.querySelectorAll('.dish-row').forEach(r=>{
      const name=r.querySelector('.dish-name').value.trim();
      const rate=parseFloat(r.querySelector('.rate').dataset.value||'0')||0;
      if(name && rate) dishes.push({ name, rating: rate });
    });
    const note = form.note.value.trim();
    const isSuper = currentVerify === 'photo' || currentVerify === 'gps';
    const patch = {
      rating: overall, note, dishes, superRated: isSuper,
      spinId: currentSpinId, visitedAt: new Date().toISOString().slice(0,10)
    };
    Entries.set(placeId, patch);
    Spins.update(currentSpinId, { superRatedAt: new Date().toISOString() });
    closeModal(document.querySelector('[data-modal="spin"]'));
    Toast.show(isSuper
      ? '✦ <em>Adventurous Visit</em> saved · the dosa was kind'
      : 'Review saved · spin in for the badge next time');
  }

  /* ---------- pending banner ---------- */
  function renderPendingBanner(){
    const banner = document.querySelector('[data-pending-spin]');
    if(!banner) return;
    const pend = Spins.pending();
    if(!pend){ banner.hidden = true; return; }
    const p = Places.byId(pend.placeId);
    if(!p){ banner.hidden = true; return; }
    banner.hidden = false;
    banner.innerHTML = `<span class="ps-ico">🫓</span>
      <div class="ps-text">Your spin is live: <b>${esc(p.name)}</b> · ${esc(p.hood)} —
        ${ pend.checkedInAt ? '<em>finish your super-rating</em>' : '<em>check in when you\'re there</em>' }</div>
      <button type="button" class="ps-go" data-resume-spin>Resume →</button>
      <button type="button" class="ps-x" data-cancel-spin aria-label="Cancel spin">×</button>`;
  }
  function resume(){
    const pend = Spins.pending(); if(!pend){ open(); return; }
    currentSpinId = pend.id;
    currentVerify = pend.verifiedBy || null;
    currentBillURL = pend.billUrl || null;
    pickedId = pend.placeId;
    openModal('spin');
    const place = Places.byId(pend.placeId);
    if(!pend.checkedInAt){ showStep(3); paintCheckin(place); }
    else { showStep(4); paintSuperForm(place); }
  }
  function cancel(){
    const pend = Spins.pending(); if(!pend) return;
    Spins.remove(pend.id);
    Toast.show('Spin cancelled');
  }

  /* ---------- wire up DOM ---------- */
  function init(){
    document.addEventListener('click', e=>{
      const t = e.target;
      if(t.closest('[data-spin-open]')){ e.preventDefault(); open(); return; }
      if(t.closest('[data-resume-spin]')){ e.preventDefault(); resume(); return; }
      if(t.closest('[data-cancel-spin]')){ e.preventDefault(); cancel(); return; }
      if(t.closest('[data-spin-start]')){ e.preventDefault(); startSpin(); return; }
      if(t.closest('[data-spin-again]')){ e.preventDefault(); startSpin(); return; }
      if(t.closest('[data-spin-lock]')){ e.preventDefault(); lockIn(); return; }
      if(t.closest('[data-spin-gps]')){ e.preventDefault(); checkGPS(); return; }
      if(t.closest('[data-spin-manual]')){ e.preventDefault(); checkManual(); return; }
      if(t.closest('[data-spin-go-rate]')){ e.preventDefault(); goToSuperRate(); return; }
      if(t.closest('[data-spin-add]')){
        e.preventDefault();
        closeModal(document.querySelector('[data-modal="spin"]'));
        openModal('addplace');
        return;
      }
      if(t.closest('[data-add-dish]')){ e.preventDefault(); addDishRow(); return; }
      if(t.matches('.dish-remove')){ e.preventDefault(); removeDishRow(t); return; }
    });
    const bill = document.querySelector('[data-spin-bill]');
    if(bill) bill.addEventListener('change', e=>handleBill(e.target.files[0]));
    const form = document.querySelector('[data-super-form]');
    if(form) form.addEventListener('submit', e=>{ e.preventDefault(); saveSuper(form); });
  }

  return { init, renderPendingBanner };
})();

/* ---------- toolbar ---------- */
function syncToolbarUI(){
  document.querySelectorAll('[data-logbook-filters] [data-tab]').forEach(a=>a.classList.toggle('on',a.dataset.tab===state.tab));
}
function initToolbar(){
  const s=document.querySelector('[data-search]');
  s && s.addEventListener('input',()=>{ state.q=s.value.trim(); state.showAll=false; renderLogbook(); });
  const fc=document.querySelector('[data-filter-cuisine]');
  fc && fc.addEventListener('change',()=>{ state.cuisine=fc.value; state.showAll=false; renderLogbook(); });
  const fr=document.querySelector('[data-filter-rating]');
  fr && fr.addEventListener('change',()=>{ state.minRating=parseFloat(fr.value)||0; state.showAll=false; renderLogbook(); });
  const so=document.querySelector('[data-sort]');
  so && so.addEventListener('change',()=>{ state.sort=so.value; renderLogbook(); });
}

/* ---------- global click/actions ---------- */
function initActions(){
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-add-place],[data-signin],[data-share-open],[data-share-copy],[data-friend-add],[data-friend-remove],[data-compare],[data-tab],[data-edit-entry],[data-wish],[data-print],[data-clear-filters],[data-show-all],[data-place-detail],a[href^="#"]');
    if(!t) return;

    if(t.matches('[data-friend-remove]')){ e.preventDefault(); Sync.removeFriendCloud(t.dataset.friendRemove); Friends.remove(t.dataset.friendRemove); Toast.show('Friend removed'); return; }
    if(t.matches('[data-compare]')){ e.preventDefault(); openCompare(t.dataset.compare); return; }
    if(t.matches('[data-place-detail]')){ e.preventDefault(); openPlaceDetail(t.dataset.placeDetail); return; }
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
      state.q=state.cuisine=''; state.minRating=0; state.sort='default'; state.showAll=false;
      const sb=document.querySelector('[data-search]'); if(sb) sb.value='';
      const fc=document.querySelector('[data-filter-cuisine]'); if(fc) fc.value='';
      const frt=document.querySelector('[data-filter-rating]'); if(frt) frt.value='0';
      const so=document.querySelector('[data-sort]'); if(so) so.value='default';
      renderLogbook(); return; }
    if(t.hasAttribute('data-show-all')){ e.preventDefault();
      state.showAll = true; renderLogbook(); return; }
    if(t.hasAttribute('data-share-open')){ e.preventDefault();
      const dd=document.querySelector('[data-profile-dropdown]'); if(dd) dd.hidden=true;
      location.hash='friends';
      setTimeout(()=>{ const i=document.querySelector('[data-share-link]'); if(i){i.focus();i.select();} },300); return; }
    if(t.hasAttribute('data-share-copy')){ e.preventDefault();
      const l=shareLink(); if(!l){ openModal('signin'); Toast.show('Sign in to get a share link'); return; }
      navigator.clipboard?.writeText(l).then(()=>Toast.show('Share link copied · send it to a friend'),
        ()=>{ const i=document.querySelector('[data-share-link]'); i.select(); document.execCommand('copy'); Toast.show('Share link copied'); }); return; }
    if(t.hasAttribute('data-friend-add')){ e.preventDefault();
      const v=document.querySelector('[data-friend-input]').value.trim();
      if(Sync.isCloud() && Sync.hasSession() && v && !/#friend=/.test(v) && /^@?[a-z0-9._-]{2,30}$/i.test(v)){
        Sync.addFriendByHandle(v).then(ok=>{ if(ok){ const fi=document.querySelector('[data-friend-input]'); if(fi) fi.value=''; } });
      } else { importCode(v); }
      return; }
    if(t.hasAttribute('data-tab')){ e.preventDefault(); state.tab=t.dataset.tab; state.showAll=false; syncToolbarUI(); renderLogbook();
      location.hash='logbook'; return; }

    if(t.hasAttribute('data-nav')){ e.preventDefault();
      if(isMobile()){ location.hash=t.dataset.nav; }
      else { const el=document.getElementById(t.dataset.nav); if(el) el.scrollIntoView({behavior:'smooth'}); }
      return; }

    const href=t.getAttribute('href');
    if(href&&href.length>1&&href.startsWith('#')){
      e.preventDefault();
      if(isMobile()){ location.hash=href.slice(1); }
      else { const el=document.getElementById(href.slice(1)); if(el) el.scrollIntoView({behavior:'smooth'}); }
    }
  });
  const fi=document.querySelector('[data-friend-input]');
  fi && fi.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); importCode(fi.value); } });
}

/* ---------- boot ---------- */
/* ---------- FX: scroll-reveal + pointer tilt (no libs) ---------- */
const FX=(()=>{
  const okMotion=matchMedia('(prefers-reduced-motion: no-preference)').matches;
  const okHover=matchMedia('(hover: hover)').matches;
  const io=('IntersectionObserver' in window)&&okMotion
    ? new IntersectionObserver(es=>es.forEach(e=>{
        if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      }),{ threshold:.08 })
    : null;
  const SEL='.log-card,.bh-card,.share-card,.toc-item,.stat-cell,.af-item,.diary-entry,.list-card';
  function scan(){
    if(!io) return;
    document.querySelectorAll(SEL).forEach(el=>{
      if(el.dataset.fx) return; el.dataset.fx='1';
      el.classList.add('reveal'); io.observe(el);
    });
  }
  // NRG-style tilt — delegated, so re-rendered cards keep working
  if(okHover&&okMotion){
    const TILT='.log-card,.bh-card,.share-card,.list-card,.photo-frame';
    document.addEventListener('pointermove',e=>{
      const el=e.target.closest(TILT); if(!el) return;
      const r=el.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      el.style.transform=`perspective(700px) rotateX(${(-y*4).toFixed(2)}deg) rotateY(${(x*5).toFixed(2)}deg) translateY(-2px)`;
    },{ passive:true });
    document.addEventListener('pointerout',e=>{
      const el=e.target.closest(TILT);
      if(el&&!el.contains(e.relatedTarget)) el.style.transform='';
    });
  }
  return { scan };
})();

function renderAll(){ renderProfileUI(); renderFeature(); renderStats(); renderFollowRow(); renderActivityFeed(); renderShare(); renderLogbook(); SpinUI.renderPendingBanner(); FX.scan(); }

/* ---------- page router (mobile only) ---------- */
const PAGES = ['home','logbook','stats','friends','info'];
const isMobile = () => window.innerWidth <= 720;

function navigateTo(page){
  if(!PAGES.includes(page)) page='home';
  document.querySelectorAll('.page[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===page));
  window.scrollTo(0,0);
  // close hamburger menu
  const c=document.querySelector('.masthead .center'); if(c) c.classList.remove('open');
}
function routeFromHash(){
  const h=location.hash.slice(1)||'home';
  if(h.startsWith('friend=')||h.startsWith('addfriend=')) return;
  if(isMobile()) navigateTo(h);
  else {
    // desktop: scroll to section
    const el=document.getElementById(h);
    if(el) el.scrollIntoView({behavior:'smooth'});
  }
}
window.addEventListener('hashchange',routeFromHash);

// hamburger
document.addEventListener('click',e=>{
  if(e.target.closest('[data-hamburger]')){
    const c=document.querySelector('.masthead .center'); if(c) c.classList.add('open');
  }
  if(e.target.closest('[data-menu-close]')){
    const c=document.querySelector('.masthead .center'); if(c) c.classList.remove('open');
  }
  if(e.target.closest('[data-tb-toggle]')){
    const btn=document.querySelector('.tb-toggle');
    const tb=document.querySelector('.toolbar');
    if(btn&&tb){ btn.classList.toggle('open'); tb.classList.toggle('open'); }
  }
});
// keep page routing in sync with viewport crossing the mobile/desktop line
// (device rotation, toggling "request desktop site", resizing a window)
window.addEventListener('resize',()=>{
  if(isMobile()) routeFromHash();
  else document.querySelectorAll('.page[data-page]').forEach(el=>el.classList.add('active'));
});

document.addEventListener('DOMContentLoaded',()=>{
  if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js');
  document.querySelectorAll('.rate-dock .rate').forEach(r=>initRating(r));
  initModals(); initProfileMenu(); initToolbar(); initActions();
  syncToolbarUI(); renderAll();
  SpinUI.init();
  Sync.boot();
  if(location.hash.startsWith('#friend=')||location.hash.startsWith('#addfriend=')){
    const raw=location.hash;
    history.replaceState(null,'',location.pathname+location.search);
    setTimeout(()=>importCode(raw),500);
  }
  if(isMobile()) routeFromHash();
  else document.querySelectorAll('.page[data-page]').forEach(el=>el.classList.add('active'));
});
document.addEventListener('profile:change',renderAll);
document.addEventListener('data:change',()=>{ renderProfileUI(); renderFeature(); renderStats(); renderFollowRow(); renderActivityFeed(); renderShare(); renderLogbook(); SpinUI.renderPendingBanner(); Sync.schedulePush(); });
