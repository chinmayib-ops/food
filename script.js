/* ============================================================
   Bengaluru Eats — static, client-side logbook
   Profile + ratings + custom places + friends (share codes).
   Everything persists to localStorage. No backend.
   ============================================================ */

const KEY_PROFILE = 'be:profile';
const KEY_RATINGS = 'be:ratings';
const KEY_PLACES  = 'be:places';
const KEY_FRIENDS = 'be:friends';

const FEATURED_ID = 'brahmins-coffee-bar';

/* ---------- seed places (real Bengaluru spots, unrated) ---------- */
const SEED_PLACES = [
  { id:'brahmins-coffee-bar', name:"Brahmin's Coffee Bar", hood:'Basavanagudi',     dish:'Filter Coffee & Idli' },
  { id:'vidyarthi-bhavan',    name:'Vidyarthi Bhavan',      hood:'Gandhi Bazaar',    dish:'Benne Masala Dosa' },
  { id:'mtr',                 name:'Mavalli Tiffin Rooms',  hood:'Lalbagh',          dish:'Rava Idli' },
  { id:'ctr-shri-sagar',      name:'CTR (Shri Sagar)',      hood:'Malleshwaram',     dish:'Benne Dosa' },
  { id:'taaza-thindi',        name:'Taaza Thindi',          hood:'Banashankari',     dish:'Idli & Set Dosa' },
  { id:'corner-house',        name:'Corner House',          hood:'Residency Road',   dish:'Death by Chocolate' },
  { id:'koshys',              name:"Koshy's",               hood:"St. Mark's Road",  dish:'Mutton Cutlet' },
  { id:'airlines-hotel',      name:'Airlines Hotel',        hood:'Lavelle Road',     dish:'Filter Coffee' },
  { id:'empire-restaurant',   name:'Empire Restaurant',     hood:'Koramangala',      dish:'Butter Chicken' },
  { id:'truffles',            name:'Truffles',              hood:'Koramangala',      dish:'Burgers' },
  { id:'third-wave',          name:'Third Wave Coffee',     hood:'Indiranagar',      dish:'Flat White' },
  { id:'albert-bakery',       name:'Albert Bakery',         hood:'Frazer Town',      dish:'Mutton Samosa' },
];

/* ---------- utilities ---------- */
function slugify(str){
  return (str || '')
    .toLowerCase().replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function loadJSON(key, fb){
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fb; }
  catch { return fb; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function fmt(n){ return (n % 1 === 0) ? String(n) : n.toFixed(1); }
function esc(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* UTF-8 safe base64 (handles ★, ·, accented names) */
function b64encode(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64decode(b64){
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- stores ---------- */
const Profile = {
  get(){ return loadJSON(KEY_PROFILE, null); },
  set(p){ saveJSON(KEY_PROFILE, p); emit('profile:change'); },
  clear(){ localStorage.removeItem(KEY_PROFILE); emit('profile:change'); }
};
const Ratings = {
  all(){ return loadJSON(KEY_RATINGS, {}); },
  get(id){ return this.all()[id] || 0; },
  set(id, val){
    const r = this.all();
    if (!val) delete r[id]; else r[id] = val;
    saveJSON(KEY_RATINGS, r);
    emit('data:change');
  },
  count(){ return Object.keys(this.all()).length; }
};
const Places = {
  custom(){ return loadJSON(KEY_PLACES, []); },
  add(p){
    const list = this.custom();
    if (!list.some(x => x.id === p.id) && !SEED_PLACES.some(x => x.id === p.id)){
      list.push(p); saveJSON(KEY_PLACES, list); emit('data:change');
    }
    return p.id;
  },
  /* full registry: seeds + custom + any place a friend brought */
  registry(){
    const map = new Map();
    SEED_PLACES.forEach(p => map.set(p.id, p));
    this.custom().forEach(p => map.set(p.id, p));
    Friends.all().forEach(f => (f.places || []).forEach(p => {
      if (!map.has(p.id)) map.set(p.id, p);
    }));
    return [...map.values()];
  },
  byId(id){ return this.registry().find(p => p.id === id) || null; }
};
const Friends = {
  all(){ return loadJSON(KEY_FRIENDS, []); },
  add(friend){
    const list = this.all();
    const i = list.findIndex(f => f.handle === friend.handle);
    if (i >= 0) list[i] = friend; else list.push(friend);
    saveJSON(KEY_FRIENDS, list);
    emit('data:change');
    return i < 0;
  },
  remove(handle){
    saveJSON(KEY_FRIENDS, this.all().filter(f => f.handle !== handle));
    emit('data:change');
  },
  count(){ return this.all().length; }
};

function emit(name, detail){ document.dispatchEvent(new CustomEvent(name, { detail })); }

/* ---------- aggregate rating across you + friends ---------- */
function aggregate(placeId){
  const vals = [];
  const raters = [];
  const mine = Ratings.get(placeId);
  if (mine){ vals.push(mine); raters.push('you'); }
  Friends.all().forEach(f => {
    const v = (f.ratings || {})[placeId];
    if (v){ vals.push(v); raters.push(f.name); }
  });
  if (!vals.length) return { avg:0, count:0, raters:[] };
  const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
  return { avg: Math.round(avg*10)/10, count: vals.length, raters };
}

/* ---------- toast ---------- */
const Toast = (() => {
  const el = document.querySelector('[data-toast]');
  let t = null;
  return {
    show(msg){
      if (!el) return;
      el.innerHTML = msg; el.hidden = false;
      requestAnimationFrame(() => el.classList.add('show'));
      clearTimeout(t);
      t = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { el.hidden = true; }, 280);
      }, 2600);
    }
  };
})();

/* ---------- rating widget ---------- */
function initRating(rate){
  if (rate.dataset.inited === '1') return;
  rate.dataset.inited = '1';
  const max = parseInt(rate.dataset.max || '5', 10);
  const fg  = rate.querySelector('.rate-fg');
  const hov = rate.querySelector('.rate-hov');
  const placeId = rate.dataset.placeId;
  const dock = rate.closest('.rate-dock');
  const valEl = dock ? dock.querySelector('.your-value') : null;
  const row = rate.closest('.your-rate-row');
  const rowLbl = row ? row.querySelector('.lbl') : null;

  function stepsAt(clientX){
    const r = rate.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    return Math.max(1, Math.min(max*2, Math.ceil(x / (r.width/(max*2)))));
  }
  function paintHover(s){ if (hov) hov.style.width = (s/(max*2))*100 + '%'; }
  function paintValue(v){
    rate.dataset.value = String(v);
    fg.style.width = (v/max)*100 + '%';
    if (valEl) valEl.innerHTML = v
      ? fmt(v) + ' <span style="font-family:var(--ff-mono);font-size:10px;letter-spacing:.22em;color:var(--ink-soft);font-style:normal;">/ 5 — saved</span>'
      : '<span class="unset">tap to rate</span>';
    if (rowLbl) rowLbl.innerHTML = v ? 'Your rating · <b>' + fmt(v) + '/5</b>' : 'Your rating';
  }
  function commit(v){
    if (!Profile.get()){
      openModal('signin');
      Toast.show('Create a profile first to <em>rate</em>');
      paintHover(0);
      return;
    }
    if (placeId) Ratings.set(placeId, v);
    paintValue(v);
    if (v) Toast.show('Rated <em>' + fmt(v) + '/5</em> · saved to your logbook');
  }
  if (placeId){ const s = Ratings.get(placeId); if (s) paintValue(s); }

  rate.addEventListener('mousemove', e => paintHover(stepsAt(e.clientX)));
  rate.addEventListener('mouseleave', () => paintHover(0));
  rate.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); commit(stepsAt(e.clientX)/2); });
  rate.addEventListener('touchstart', e => {
    if (e.touches[0]){ e.stopPropagation(); commit(stepsAt(e.touches[0].clientX)/2); }
  }, { passive:true });
  rate.addEventListener('keydown', e => {
    let steps = Math.round(parseFloat(rate.dataset.value || '0') * 2);
    if (e.key === 'ArrowRight') steps = Math.min(max*2, steps+1);
    else if (e.key === 'ArrowLeft') steps = Math.max(0, steps-1);
    else return;
    e.preventDefault(); commit(steps/2);
  });
}

/* ---------- like buttons ---------- */
function initLike(btn){
  if (btn.dataset.inited === '1') return;
  btn.dataset.inited = '1';
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    btn.classList.toggle('on');
    const g = btn.classList.contains('on') ? '♥' : '♡';
    if (btn.classList.contains('heart') && !btn.querySelector('.ico')){ btn.textContent = g; return; }
    const ico = btn.querySelector('.ico.heart');
    if (ico) ico.textContent = g;
    const lbl = btn.querySelector('.like-label');
    if (lbl) lbl.textContent = btn.classList.contains('on') ? 'Liked' : 'Like';
  });
}

/* ---------- render: logbook grid ---------- */
let currentTab = 'all';

function placeCard(p, mode){
  const ag = aggregate(p.id);
  const mine = Ratings.get(p.id);
  let aggLine;
  if (mode === 'friends'){
    const fr = Friends.all().filter(f => (f.ratings||{})[p.id]);
    const names = fr.map(f => esc(f.name.split(' ')[0])).join(', ');
    aggLine = `<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${fr.length} friend${fr.length===1?'':'s'}</span>
               <span class="agg-who">${names}</span>`;
  } else {
    aggLine = ag.count
      ? `<span class="agg"><b>★ ${fmt(ag.avg)}</b> · ${ag.count} rating${ag.count===1?'':'s'}</span>`
      : `<span class="agg unrated">Unrated · be the first</span>`;
  }
  return `
  <div class="log-card" data-place-id="${p.id}">
    <div class="photo-sq">
      <button class="heart" data-like type="button">♡</button>
      <span class="meal-label">${esc(p.dish || 'A Bengaluru plate')}</span>
    </div>
    <div class="name">${esc(p.name)}</div>
    <div class="hood">${esc(p.hood)}</div>
    <div class="row">${aggLine}</div>
    <div class="your-rate-row">
      <span class="lbl">${mine ? 'Your rating · <b>'+fmt(mine)+'/5</b>' : 'Your rating'}</span>
      <div class="rate" data-max="5" data-value="${mine||0}" data-place-id="${p.id}" tabindex="0" role="slider" aria-label="Rate ${esc(p.name)}">
        <span class="rate-bg">★★★★★</span>
        <span class="rate-fg" style="width:${(mine/5)*100||0}%">★★★★★</span>
        <span class="rate-hov" style="width:0%">★★★★★</span>
      </div>
    </div>
  </div>`;
}

function renderLogbook(){
  const grid  = document.querySelector('[data-log-grid]');
  const empty = document.querySelector('[data-log-empty]');
  const title = document.querySelector('[data-logbook-title]');
  if (!grid) return;

  const reg = Places.registry();
  let list = reg, msg = '';

  if (currentTab === 'mine'){
    list = reg.filter(p => Ratings.get(p.id));
    title.innerHTML = 'Plates <em>you</em> have rated.';
    msg = Profile.get()
      ? 'Nothing rated yet — switch to <b>All places</b> and start tasting.'
      : 'Create a profile, then rate your first plate.';
  } else if (currentTab === 'friends'){
    list = reg.filter(p => Friends.all().some(f => (f.ratings||{})[p.id]));
    title.innerHTML = 'What your <em>friends</em> have tasted.';
    msg = 'No friend ratings yet — add a code in <b>Friends &amp; Sharing</b> below.';
  } else {
    title.innerHTML = 'Every plate in the city, <em>your</em> verdict.';
  }

  if (!list.length){
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    empty.innerHTML = msg + (currentTab !== 'all'
      ? ' <button type="button" class="link-btn" data-tab-jump="all">View all places →</button>' : '');
  } else {
    empty.hidden = true;
    grid.hidden = false;
    grid.innerHTML = list.map(p => placeCard(p, currentTab)).join('');
    grid.querySelectorAll('.rate').forEach(initRating);
    grid.querySelectorAll('[data-like]').forEach(initLike);
  }
}

/* ---------- render: featured dock + meta ---------- */
function renderFeature(){
  const p = Places.byId(FEATURED_ID);
  if (!p) return;
  const ag = aggregate(p.id);
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
  set('[data-feature-place]', `${p.name} · ${p.hood}`);
  set('[data-feature-avg]', ag.count ? fmt(ag.avg) : '—');
  set('[data-feature-count]', ag.count ? `${ag.count} rating${ag.count===1?'':'s'} · you + friends` : 'No ratings yet');
  set('[data-feature-label]', `${p.dish.toUpperCase()} · ${p.hood.toUpperCase()}`);
  const fr = document.querySelector('[data-feature-rating] .rate-fg');
  if (fr) fr.style.width = (ag.avg/5)*100 + '%';

  // meta line
  const prof = Profile.get();
  set('[data-meta-handle]', prof ? '@' + (prof.handle || slugify(prof.name)) : 'not signed in');
  const rc = Ratings.count();
  set('[data-meta-count]', `${rc} plate${rc===1?'':'s'} rated`);
  const fc = Friends.count();
  set('[data-meta-friends]', `${fc} friend${fc===1?'':'s'}`);
}

/* ---------- render: friends list ---------- */
function renderFriends(){
  const wrap = document.querySelector('[data-friends-list]');
  if (!wrap) return;
  const friends = Friends.all();
  if (!friends.length){
    wrap.innerHTML = `<div class="empty-state">No friends added yet. Paste a friend's code above to compare logbooks.</div>`;
    return;
  }
  wrap.innerHTML = friends.map(f => {
    const n = Object.keys(f.ratings || {}).length;
    const init = (f.name || '?').trim().charAt(0).toUpperCase();
    return `
    <div class="friend-row">
      <span class="favatar">${esc(init)}</span>
      <div class="finfo">
        <div class="fname">${esc(f.name)} <span class="fhandle">@${esc(f.handle)}</span></div>
        <div class="fmeta">${n} plate${n===1?'':'s'} rated · added ${new Date(f.addedAt).toLocaleDateString()}</div>
      </div>
      <button type="button" class="fremove" data-friend-remove="${esc(f.handle)}">Remove</button>
    </div>`;
  }).join('');
}

/* ---------- profile UI ---------- */
function renderProfileUI(){
  const prof = Profile.get();
  const chip = document.querySelector('[data-profile-menu]');
  const signin = document.querySelector('[data-signin-foot]');
  document.body.classList.toggle('signed-in', !!prof);
  if (prof){
    const init = (prof.name || '?').trim().charAt(0).toUpperCase() || '?';
    const handle = prof.handle || slugify(prof.name);
    document.querySelector('[data-avatar]').textContent = init;
    document.querySelector('[data-profile-handle]').textContent = '@' + handle;
    document.querySelector('[data-profile-name]').textContent = prof.name;
    const rc = Ratings.count();
    document.querySelector('[data-profile-stat]').textContent =
      `${rc} plate${rc===1?'':'s'} rated · ${Friends.count()} friends`;
    if (chip) chip.hidden = false;
    if (signin) signin.textContent = 'Signed in';
  } else {
    if (chip) chip.hidden = true;
    const dd = document.querySelector('[data-profile-dropdown]');
    if (dd) dd.hidden = true;
    if (signin) signin.textContent = 'Profile';
  }
}

/* ---------- share / import ---------- */
function shareCode(){
  const p = Profile.get();
  if (!p) return null;
  const payload = {
    v:1, n:p.name, h:p.handle || slugify(p.name),
    r:Ratings.all(), pl:Places.custom()
  };
  return b64encode(JSON.stringify(payload));
}
function shareLink(){
  const c = shareCode();
  if (!c) return null;
  return `${location.origin}${location.pathname}#friend=${c}`;
}
function renderShare(){
  const input = document.querySelector('[data-share-link]');
  const hint  = document.querySelector('[data-share-hint]');
  const link = shareLink();
  if (link){
    input.value = link;
    input.removeAttribute('readonly'); input.setAttribute('readonly','');
    if (hint) hint.textContent = 'Anyone who opens this link adds your logbook to their Friends feed.';
  } else {
    input.value = 'Sign in to generate your link';
    if (hint) hint.textContent = 'You need a profile before you can share.';
  }
}
function importCode(raw){
  if (!raw) return;
  let code = raw.trim();
  const m = code.match(/#friend=([^&\s]+)/);
  if (m) code = m[1];
  let data;
  try { data = JSON.parse(b64decode(code)); }
  catch { Toast.show('That code could not be read — check & retry'); return; }
  if (!data || !data.n){ Toast.show('That code is missing a profile'); return; }

  const me = Profile.get();
  if (me && (data.h === (me.handle || slugify(me.name)))){
    Toast.show("That's your own logbook — share it with a friend instead");
    return;
  }
  const friend = {
    name: data.n,
    handle: data.h || slugify(data.n),
    ratings: data.r || {},
    places: data.pl || [],
    addedAt: new Date().toISOString()
  };
  // bring in their custom places so we can render them
  (friend.places || []).forEach(pl => Places.add(pl));
  const isNew = Friends.add(friend);
  Toast.show(`${esc(friend.name.split(' ')[0])}'s logbook ${isNew ? 'added' : 'updated'} · ${Object.keys(friend.ratings).length} plates`);
  const fi = document.querySelector('[data-friend-input]');
  if (fi) fi.value = '';
  currentTab = 'friends';
  syncTabUI();
  renderAll();
  document.getElementById('logbook').scrollIntoView({ behavior:'smooth' });
}

/* ---------- modals ---------- */
function openModal(name){
  const m = document.querySelector(`[data-modal="${name}"]`);
  if (!m) return;
  // a profile is required before adding a place
  if (name === 'addplace' && !Profile.get()){
    openModal('signin');
    Toast.show('Create a profile first to <em>add a place</em>');
    return;
  }
  m.hidden = false;
  const f = m.querySelector('input');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal(m){ m.hidden = true; }

function initModals(){
  document.querySelectorAll('[data-modal]').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m); });
    const x = m.querySelector('[data-modal-close]');
    if (x) x.addEventListener('click', () => closeModal(m));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape')
      document.querySelectorAll('[data-modal]:not([hidden])').forEach(closeModal);
  });

  const sf = document.querySelector('[data-signin-form]');
  if (sf) sf.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(sf);
    const name = (fd.get('name')||'').toString().trim();
    let handle = (fd.get('handle')||'').toString().trim();
    if (!name) return;
    handle = slugify(handle || name);
    Profile.set({ name, handle, joinedAt:new Date().toISOString() });
    sf.reset();
    closeModal(sf.closest('[data-modal]'));
    Toast.show('Welcome, <em>' + esc(name.split(' ')[0]) + '</em> · start rating →');
  });

  const af = document.querySelector('[data-addplace-form]');
  if (af) af.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(af);
    const name = (fd.get('name')||'').toString().trim();
    const hood = (fd.get('hood')||'').toString().trim();
    const dish = (fd.get('dish')||'').toString().trim();
    if (!name || !hood) return;
    let id = slugify(name + '-' + hood);
    if (Places.byId(id)) id += '-' + Math.random().toString(36).slice(2,5);
    Places.add({ id, name, hood, dish });
    af.reset();
    closeModal(af.closest('[data-modal]'));
    currentTab = 'all';
    syncTabUI();
    renderAll();
    Toast.show('Added <em>' + esc(name) + '</em> · rate it now →');
    const card = document.querySelector(`.log-card[data-place-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
  });
}

/* ---------- profile dropdown ---------- */
function initProfileMenu(){
  const chip = document.querySelector('[data-profile-menu]');
  const dd = document.querySelector('[data-profile-dropdown]');
  if (!chip || !dd) return;
  chip.addEventListener('click', e => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', e => {
    if (!dd.hidden && !dd.contains(e.target) && e.target !== chip) dd.hidden = true;
  });
  const so = document.querySelector('[data-signout]');
  if (so) so.addEventListener('click', () => {
    Profile.clear(); dd.hidden = true;
    Toast.show('Signed out · your ratings stay on this device');
  });
}

/* ---------- tabs ---------- */
function syncTabUI(){
  document.querySelectorAll('[data-logbook-filters] [data-tab]').forEach(a => {
    a.classList.toggle('on', a.dataset.tab === currentTab);
  });
}
function setTab(tab){
  currentTab = tab;
  syncTabUI();
  renderLogbook();
}

/* ---------- global link / action handler ---------- */
function initActions(){
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-add-place],[data-signin],[data-share-open],[data-share-copy],[data-friend-add],[data-friend-remove],[data-tab],[data-tab-jump],a[href^="#"]');
    if (!t) return;

    if (t.matches('[data-friend-remove]')){
      e.preventDefault();
      Friends.remove(t.dataset.friendRemove);
      Toast.show('Friend removed');
      return;
    }
    if (t.hasAttribute('data-add-place')){ e.preventDefault(); openModal('addplace'); return; }
    if (t.hasAttribute('data-signin')){ e.preventDefault(); openModal('signin'); return; }
    if (t.hasAttribute('data-share-open')){
      e.preventDefault();
      const dd = document.querySelector('[data-profile-dropdown]'); if (dd) dd.hidden = true;
      document.getElementById('friends').scrollIntoView({ behavior:'smooth' });
      setTimeout(() => { const i = document.querySelector('[data-share-link]'); if (i){ i.focus(); i.select(); } }, 500);
      return;
    }
    if (t.hasAttribute('data-share-copy')){
      e.preventDefault();
      const link = shareLink();
      if (!link){ openModal('signin'); Toast.show('Sign in to get a share link'); return; }
      navigator.clipboard?.writeText(link).then(
        () => Toast.show('Share link copied · send it to a friend'),
        () => { const i=document.querySelector('[data-share-link]'); i.select(); document.execCommand('copy'); Toast.show('Share link copied'); }
      );
      return;
    }
    if (t.hasAttribute('data-friend-add')){
      e.preventDefault();
      importCode(document.querySelector('[data-friend-input]').value);
      return;
    }
    if (t.hasAttribute('data-tab-jump')){
      e.preventDefault();
      setTab(t.dataset.tabJump);
      document.getElementById('logbook').scrollIntoView({ behavior:'smooth' });
      return;
    }
    if (t.hasAttribute('data-tab')){
      e.preventDefault();
      setTab(t.dataset.tab);
      document.getElementById('logbook').scrollIntoView({ behavior:'smooth' });
      return;
    }
    // generic in-page anchor
    const href = t.getAttribute('href');
    if (href && href.length > 1 && href.startsWith('#')){
      const target = document.getElementById(href.slice(1));
      if (target){ e.preventDefault(); target.scrollIntoView({ behavior:'smooth' }); }
    }
  });

  const fi = document.querySelector('[data-friend-input]');
  if (fi) fi.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); importCode(fi.value); }
  });
}

/* ---------- boot ---------- */
function renderAll(){
  renderProfileUI();
  renderFeature();
  renderFriends();
  renderShare();
  renderLogbook();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.rate-dock .rate').forEach(initRating);
  document.querySelectorAll('.rate-dock [data-like]').forEach(initLike);
  initModals();
  initProfileMenu();
  initActions();
  syncTabUI();
  renderAll();

  // auto-import a friend's logbook from a shared link
  if (location.hash.startsWith('#friend=')){
    const code = location.hash.slice('#friend='.length);
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => importCode(code), 400);
  }
});

document.addEventListener('profile:change', () => { renderAll(); });
document.addEventListener('data:change', () => {
  renderProfileUI(); renderFeature(); renderFriends(); renderShare();
  // re-render grid but keep current tab
  renderLogbook();
});
