/* ============================================================
   Bengaluru Eats — Supabase adapter
   Exposes window.Cloud: { enabled, Auth, DB, Storage, Realtime }
   script.js stays offline-first; this is the sync/identity layer.
   ============================================================ */
(function () {
  const cfg = window.BE_CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
                     window.supabase && window.supabase.createClient);

  if (!enabled) {
    window.Cloud = { enabled: false };
    document.documentElement.classList.add('offline-mode');
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  /* ---------- AUTH ---------- */
  const Auth = {
    async user() {
      const { data } = await sb.auth.getUser();
      return data ? data.user : null;
    },
    async session() {
      const { data } = await sb.auth.getSession();
      return data ? data.session : null;
    },
    async signInEmail(email) {
      return sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
    },
    async signInGoogle() {
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
    },
    async signUpPassword(email, password) {
      return sb.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
    },
    async signInPassword(email, password) {
      return sb.auth.signInWithPassword({ email, password });
    },
    async signOut() { return sb.auth.signOut(); },
    onChange(cb) { sb.auth.onAuthStateChange((evt, sess) => cb(evt, sess)); }
  };

  /* ---------- DATABASE ---------- */
  const DB = {
    async getProfile(uid) {
      const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      return data || null;
    },
    async findByHandle(handle) {
      const { data } = await sb.from('profiles').select('id,name,handle')
        .ilike('handle', handle).maybeSingle();
      return data || null;
    },
    async handleTaken(handle, myId) {
      const { data } = await sb.from('profiles').select('id').ilike('handle', handle).maybeSingle();
      return !!(data && data.id !== myId);
    },
    async upsertProfile(p) {
      const { error } = await sb.from('profiles')
        .upsert({ id: p.id, name: p.name, handle: p.handle }, { onConflict: 'id' });
      return error;
    },

    async listMyEntries(uid) {
      const { data } = await sb.from('entries').select('*').eq('user_id', uid);
      return data || [];
    },
    async listFriendEntries(fid) {
      const { data } = await sb.from('entries').select('*').eq('user_id', fid);
      return data || [];
    },
    async upsertEntries(rows) {
      if (!rows.length) return null;
      const { error } = await sb.from('entries').upsert(rows, { onConflict: 'user_id,place_id' });
      return error;
    },
    async deleteEntriesExcept(uid, placeIds) {
      let q = sb.from('entries').delete().eq('user_id', uid);
      if (placeIds.length) q = q.not('place_id', 'in', '(' + placeIds.map(s => JSON.stringify(s)).join(',') + ')');
      const { error } = await q;
      return error;
    },

    async listPlaces() {
      // PostgREST caps SELECT at 1,000 rows per call by default.
      // Paginate via .range() so the full catalogue comes through.
      const PAGE = 1000;
      const all = [];
      let from = 0;
      while (true) {
        const { data, error } = await sb.from('places')
          .select('*')
          .range(from, from + PAGE - 1);
        if (error || !data || !data.length) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    async upsertPlaces(rows) {
      if (!rows.length) return null;
      const { error } = await sb.from('places').upsert(rows, { onConflict: 'id' });
      return error;
    },
    // crowdsourced menu photo: anyone signed-in can refresh a place's menu
    async updatePlaceMenu(placeId, url, handle) {
      const { error } = await sb.from('places')
        .update({ menu_photo_url: url, menu_updated_at: new Date().toISOString(), menu_updated_by: handle || null })
        .eq('id', placeId);
      return error;
    },
    // global aggregates (all users) — dishes, value-for-money, axis breakdown
    async placeStats(placeId) {
      const { data, error } = await sb.rpc('place_public_stats', { pid: placeId });
      if (error) {
        // PGRST202 = function not found (schema migration not run yet) — expected, stay quiet
        if (error.code !== 'PGRST202') console.error('[placeStats] failed:', error);
        return null;
      }
      return data || null;
    },

    async listWishlist(uid) {
      const { data } = await sb.from('wishlist').select('place_id').eq('user_id', uid);
      return (data || []).map(r => r.place_id);
    },
    async setWishlist(uid, placeIds) {
      await sb.from('wishlist').delete().eq('user_id', uid);
      if (placeIds.length)
        await sb.from('wishlist').insert(placeIds.map(pid => ({ user_id: uid, place_id: pid })));
    },

    async listFriends(uid) {
      const { data } = await sb.from('friendships').select('friend_id').eq('user_id', uid);
      const ids = (data || []).map(r => r.friend_id);
      if (!ids.length) return [];
      const { data: profs } = await sb.from('profiles').select('id,name,handle').in('id', ids);
      return profs || [];
    },
    async addFriend(uid, friendId) {
      const { error } = await sb.from('friendships')
        .upsert({ user_id: uid, friend_id: friendId }, { onConflict: 'user_id,friend_id' });
      return error;
    },
    async removeFriend(uid, friendId) {
      await sb.from('friendships').delete().eq('user_id', uid).eq('friend_id', friendId);
    }
  };

  /* ---------- STORAGE (dish photos) ---------- */
  function dataURLtoBlob(dataURL) {
    const [head, body] = dataURL.split(',');
    const mime = (head.match(/:(.*?);/) || [, 'image/jpeg'])[1];
    const bin = atob(body);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime });
  }
  const Storage = {
    async uploadPhoto(uid, placeId, dataURL) {
      try {
        const blob = dataURLtoBlob(dataURL);
        const path = `${uid}/${placeId}-${Date.now()}.jpg`;
        const { error } = await sb.storage.from('dish-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) return null;
        const { data } = sb.storage.from('dish-photos').getPublicUrl(path);
        return data ? data.publicUrl : null;
      } catch { return null; }
    }
  };

  /* ---------- REALTIME ---------- */
  const Realtime = {
    _ch: null,
    subscribe(cb) {
      if (this._ch) return;
      this._ch = sb.channel('be-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'places' }, cb)
        .subscribe();
    },
    unsubscribe() { if (this._ch) { sb.removeChannel(this._ch); this._ch = null; } }
  };

  window.Cloud = { enabled: true, sb, Auth, DB, Storage, Realtime };
  document.documentElement.classList.add('cloud-mode');
})();
