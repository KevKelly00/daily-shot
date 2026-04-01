import { supabase, requireAuth, signOut } from './auth.js';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from './push.js';

export async function loadProfile() {
  try {
    const session = await requireAuth();
    const user    = session.user;
    let profile   = {};

    document.getElementById('profileEmail').textContent = user.email || '';
    document.getElementById('signOutBtn').addEventListener('click', signOut);

    async function fetchProfile() {
      const [profileRes, brewsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('coffee_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      ]);

      profile = profileRes.data || {};

      const displayName = profile.full_name || profile.username || user.email;
      document.getElementById('profileName').textContent   = displayName;
      document.getElementById('profileBio').textContent    = profile.bio || '';
      document.getElementById('statBrews').textContent     = brewsRes.count     ?? 0;
      document.getElementById('statFollowers').textContent = followersRes.count ?? 0;
      document.getElementById('statFollowing').textContent = followingRes.count ?? 0;
      if (profile.avatar_url) {
        const el = document.getElementById('profileAvatar');
        el.onload = () => el.classList.add('loaded');
        el.src = profile.avatar_url;
        if (el.complete) el.classList.add('loaded');
      }
    }

    let pendingAvatarFile = null;

    window.startEdit = function() {
      document.getElementById('editName').value     = profile.full_name || '';
      document.getElementById('editUsername').value = profile.username  || '';
      document.getElementById('editBio').value      = profile.bio       || '';
      const editAvatar = document.getElementById('editAvatar');
      if (editAvatar) {
        editAvatar.onload = () => editAvatar.classList.add('loaded');
        editAvatar.src = profile.avatar_url || '';
        if (editAvatar.complete) editAvatar.classList.add('loaded');
      }
      pendingAvatarFile = null;
      document.getElementById('viewMode').style.display = 'none';
      document.getElementById('editMode').style.display = 'flex';
      document.getElementById('editError').style.display = 'none';
    };

    document.getElementById('avatarInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      pendingAvatarFile = file;
      document.getElementById('editAvatar').src = URL.createObjectURL(file);
    });

    window.cancelEdit = function() {
      document.getElementById('editMode').style.display = 'none';
      document.getElementById('viewMode').style.display = 'flex';
    };

    window.saveProfile = async function() {
      const btn      = document.getElementById('saveBtn');
      const fullName = document.getElementById('editName').value.trim();
      const username = document.getElementById('editUsername').value.trim().replace(/^@/, '');
      const bio      = document.getElementById('editBio').value.trim();

      btn.disabled = true;
      btn.textContent = 'Saving…';
      document.getElementById('editError').style.display = 'none';

      let avatarUrl = profile.avatar_url || null;
      if (pendingAvatarFile) {
        const ext  = pendingAvatarFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, pendingAvatarFile, { upsert: true, contentType: pendingAvatarFile.type });
        if (uploadErr) {
          const errEl = document.getElementById('editError');
          errEl.textContent = 'Photo upload failed. Try again.';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Save';
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: fullName || null, username: username || null, bio: bio || null, avatar_url: avatarUrl });

      if (error) {
        const msg = error.message.includes('unique') ? 'That username is already taken.' : error.message;
        const errEl = document.getElementById('editError');
        errEl.textContent = msg;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save';
        return;
      }

      await fetchProfile();
      window.cancelEdit();
      btn.disabled = false;
      btn.textContent = 'Save';
    };

    // ── Bean inventory ─────────────────────────────────────────────────────────
    async function fetchBeans() {
      const { data: beans } = await supabase
        .from('beans')
        .select('id, name, roast_date')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      const list = document.getElementById('beanList');
      list.innerHTML = '';

      if (!beans || beans.length === 0) {
        list.innerHTML = '<div class="bean-empty">No beans yet — add your current bag below.</div>';
        return;
      }

      beans.forEach(bean => {
        let roastInfo = '';
        if (bean.roast_date) {
          const days = Math.floor((Date.now() - new Date(bean.roast_date)) / 86400000);
          roastInfo = `<div class="bean-item-roast">Roasted ${days} day${days !== 1 ? 's' : ''} ago</div>`;
        }
        const item = document.createElement('div');
        item.className = 'bean-item';
        item.dataset.id = bean.id;
        item.innerHTML = `
          <div>
            <div class="bean-item-name">${escHtml(bean.name)}</div>
            ${roastInfo}
          </div>
          <button class="bean-archive-btn" title="Archive">×</button>`;
        item.querySelector('.bean-archive-btn').addEventListener('click', () => archiveBean(bean.id));
        list.appendChild(item);
      });
    }

    async function archiveBean(id) {
      const item = document.querySelector(`.bean-item[data-id="${id}"]`);
      if (item) item.style.opacity = '0.4';
      const { error } = await supabase.from('beans').update({ is_active: false }).eq('id', id);
      if (error) {
        if (item) item.style.opacity = '1';
        return;
      }
      await fetchBeans();
    }

    window.addBean = async function() {
      const input     = document.getElementById('beanInput');
      const dateInput = document.getElementById('beanRoastDate');
      const btn       = document.getElementById('beanAddBtn');
      const name      = input.value.trim();
      if (!name) return;

      btn.disabled = true;
      const row = { user_id: user.id, name };
      if (dateInput.value) row.roast_date = dateInput.value;

      const { error } = await supabase.from('beans').insert(row);
      btn.disabled = false;

      if (!error) {
        input.value     = '';
        dateInput.value = '';
        await fetchBeans();
      }
    };

    // Allow pressing Enter to add a bean
    document.getElementById('beanInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); window.addBean(); }
    });

    window.showUserList = async function(type) {
      const overlay  = document.getElementById('userListOverlay');
      const title    = document.getElementById('userListTitle');
      const itemsEl  = document.getElementById('userListItems');
      title.textContent = type === 'followers' ? 'Followers' : 'Following';
      itemsEl.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
      overlay.classList.add('open');

      const col   = type === 'followers' ? 'follower_id'  : 'following_id';
      const match = type === 'followers' ? 'following_id' : 'follower_id';
      const { data: rows } = await supabase.from('follows').select(col).eq(match, user.id);
      const ids = (rows || []).map(r => r[col]);

      if (!ids.length) {
        itemsEl.innerHTML = `<div class="empty-state" style="padding:32px 24px"><p>${type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p></div>`;
        return;
      }

      const { data: profiles } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids);
      itemsEl.innerHTML = '';
      (profiles || []).forEach(p => {
        const name = p.full_name || p.username || 'Barista';
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.innerHTML = `
          <img src="${escHtml(p.avatar_url || '')}" alt="" onerror="this.style.background='var(--border)';this.removeAttribute('src')" />
          <div>
            <div class="user-list-item-name">${escHtml(name)}</div>
            ${p.username ? `<div class="user-list-item-username">@${escHtml(p.username)}</div>` : ''}
          </div>`;
        item.addEventListener('click', () => { overlay.classList.remove('open'); window.location.href = `/user.html?id=${p.id}`; });
        itemsEl.appendChild(item);
      });
    };

    document.getElementById('userListClose').addEventListener('click', () => {
      document.getElementById('userListOverlay').classList.remove('open');
    });
    document.getElementById('userListOverlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    await fetchProfile();
    await fetchBeans();

    // Notification toggle
    if ('Notification' in window && 'PushManager' in window) {
      const notifBtn = document.getElementById('notifBtn');
      notifBtn.style.display = '';
      async function updateNotifBtn() {
        const subscribed = await isPushSubscribed();
        notifBtn.textContent = subscribed ? 'Turn off notifications' : 'Turn on notifications';
      }
      await updateNotifBtn();
      notifBtn.addEventListener('click', async () => {
        notifBtn.disabled = true;
        const subscribed = await isPushSubscribed();
        if (subscribed) { await unsubscribeFromPush(user.id); }
        else             { await subscribeToPush(user.id); }
        await updateNotifBtn();
        notifBtn.disabled = false;
      });
    }

  } catch (err) {
    console.error('Profile load error:', err);
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
