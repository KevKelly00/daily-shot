import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';

export async function loadUserProfile() {
  try {
    const session       = await requireAuth();
    const currentUserId = session.user.id;

    const targetId = new URLSearchParams(window.location.search).get('id');
    if (!targetId) { window.location.href = '/feed.html'; return; }

    // Own profile → redirect to settings page
    if (targetId === currentUserId) {
      window.location.href = '/profile.html';
      return;
    }

    const [
      { data: profile },
      { count: brewCount },
      { count: followerCount },
      { count: followingCount },
      { data: followRow }
    ] = await Promise.all([
      supabase.from('profiles').select('username, full_name, avatar_url, bio').eq('id', targetId).single(),
      supabase.from('coffee_logs').select('*', { count: 'exact', head: true }).eq('user_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId),
      supabase.from('follows').select('follower_id').eq('follower_id', currentUserId).eq('following_id', targetId).maybeSingle(),
    ]);

    if (!profile) { window.location.href = '/feed.html'; return; }

    let isFollowing     = !!followRow;
    let currentFollowers = followerCount ?? 0;

    const displayName = profile.full_name || profile.username || 'Barista';

    document.getElementById('navName').textContent    = displayName;
    document.getElementById('userName').textContent   = displayName;
    document.getElementById('userUsername').textContent = profile.username ? `@${profile.username}` : '';
    document.getElementById('userBio').textContent    = profile.bio || '';
    document.getElementById('statBrews').textContent     = brewCount     ?? 0;
    document.getElementById('statFollowers').textContent = currentFollowers;
    document.getElementById('statFollowing').textContent = followingCount ?? 0;

    if (profile.avatar_url) {
      document.getElementById('userAvatar').src = profile.avatar_url;
    }

    // Follow button
    const followBtn = document.getElementById('followBtn');
    renderFollowBtn(followBtn, isFollowing);

    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId);
        isFollowing = false;
        currentFollowers--;
      } else {
        await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetId });
        isFollowing = true;
        currentFollowers++;
      }
      document.getElementById('statFollowers').textContent = currentFollowers;
      renderFollowBtn(followBtn, isFollowing);
      followBtn.disabled = false;
    });

    // Followers / following modal
    window.showUserList = async function(type) {
      const overlay  = document.getElementById('userListOverlay');
      const title    = document.getElementById('userListTitle');
      const itemsEl  = document.getElementById('userListItems');
      title.textContent = type === 'followers' ? 'Followers' : 'Following';
      itemsEl.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
      overlay.classList.add('open');

      const col   = type === 'followers' ? 'follower_id'  : 'following_id';
      const match = type === 'followers' ? 'following_id' : 'follower_id';
      const { data: rows } = await supabase.from('follows').select(col).eq(match, targetId);
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
          <img src="${esc(p.avatar_url || '')}" alt="" onerror="this.style.background='var(--border)';this.removeAttribute('src')" />
          <div>
            <div class="user-list-item-name">${esc(name)}</div>
            ${p.username ? `<div class="user-list-item-username">@${esc(p.username)}</div>` : ''}
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

    // Photo grid
    const { data: logs } = await supabase
      .from('coffee_logs')
      .select('id, photo_url, log_type')
      .eq('user_id', targetId)
      .order('created_at', { ascending: false });

    const grid = document.getElementById('photoGrid');
    grid.innerHTML = '';

    if (!logs || logs.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">📷</div>
          <p>No brews yet.</p>
        </div>`;
      return;
    }

    logs.forEach(log => {
      const item = document.createElement('div');
      item.addEventListener('click', () => window.location.href = `/log-detail.html?id=${log.id}`);

      if (log.photo_url) {
        item.className = 'photo-grid-item';
        const img = document.createElement('img');
        img.src     = log.photo_url;
        img.loading = 'lazy';
        item.appendChild(img);
      } else {
        item.className = 'photo-grid-placeholder';
        item.textContent = '☕';
      }
      grid.appendChild(item);
    });

  } catch (err) {
    console.error('User profile error:', err);
    window.location.href = '/feed.html';
  }
}

function renderFollowBtn(btn, isFollowing) {
  btn.textContent = isFollowing ? 'Following' : 'Follow';
  btn.className   = isFollowing ? 'btn btn-ghost' : 'btn btn-primary';
  btn.style.width = 'auto';
  btn.style.padding = '8px 28px';
}
