import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';

export async function loadFeed() {
  try {
    const session  = await requireAuth();
    const userId   = session.user.id;
    let   tab      = 'all';
    let   follows  = new Set();

    async function loadFollows() {
      const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
      follows = new Set((data || []).map(r => r.following_id));
    }

    async function loadFeedData() {
      const list = document.getElementById('feedList');
      list.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';

      if (tab === 'following') {
        const ids = [...follows];
        if (ids.length === 0) {
          list.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>You're not following anyone yet.<br>Switch to All Brews to discover people.</p></div>`;
          return;
        }
      }

      let query = supabase
        .from('coffee_logs')
        .select('id, user_id, art_style, art_rating, flavour_rating, notes, photo_url, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

      if (tab === 'following') query = query.in('user_id', [...follows]);

      const { data: logs, error } = await query;

      const profileMap = {};
      if (logs && logs.length > 0) {
        const userIds = [...new Set(logs.map(l => l.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds);
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
      }

      list.innerHTML = '';

      if (error || !logs || logs.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">☕</div><p>No brews here yet.</p></div>`;
        return;
      }

      logs.forEach(log => renderCard(log, list, profileMap));
    }

    function renderCard(log, container, profileMap = {}) {
      const profile  = profileMap[log.user_id] || {};
      const username = profile.username || profile.full_name || 'Barista';
      const isOwn    = log.user_id === userId;
      const date     = new Date(log.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' });

      const card = document.createElement('div');
      card.className = 'brew-card';

      const followingThis = follows.has(log.user_id);

      card.innerHTML = `
        <div class="brew-card-header">
          <img class="brew-avatar" src="${esc(profile.avatar_url || '')}" alt=""
            onerror="this.style.background='var(--border)';this.src=''"
            data-uid="${esc(log.user_id)}" />
          <div>
            <div class="brew-username" data-uid="${esc(log.user_id)}">${esc(username)}</div>
            <div class="brew-date">${date}</div>
          </div>
          ${!isOwn ? `
            <button class="follow-btn ${followingThis ? 'following' : ''}"
              data-uid="${esc(log.user_id)}"
              data-username="${esc(username)}">
              ${followingThis ? 'Following' : 'Follow'}
            </button>` : ''}
        </div>
        ${log.photo_url
          ? `<img class="brew-photo" src="${esc(log.photo_url)}" alt="" loading="lazy" data-id="${esc(log.id)}" />`
          : `<div class="brew-photo-placeholder" data-id="${esc(log.id)}"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`}
        <div class="brew-card-footer">
          ${log.art_style ? `<div><span class="brew-style-badge">${esc(log.art_style)}</span></div>` : ''}
          ${(log.art_rating || log.flavour_rating) ? `
            <div class="brew-ratings">
              ${log.art_rating     ? `<span>Art ${log.art_rating}/5</span>` : ''}
              ${log.flavour_rating ? `<span>Flavour ${log.flavour_rating}/5</span>` : ''}
            </div>` : ''}
          ${log.notes ? `<div class="brew-notes">${esc(log.notes)}</div>` : ''}
        </div>`;

      container.appendChild(card);

      card.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('click', () => window.location.href = `/log-detail.html?id=${el.dataset.id}`);
      });

      const followBtn = card.querySelector('.follow-btn');
      if (followBtn) {
        followBtn.addEventListener('click', () => toggleFollow(followBtn, log.user_id));
      }
    }

    async function toggleFollow(btn, targetId) {
      btn.disabled = true;
      const isFollowing = follows.has(targetId);

      if (isFollowing) {
        await supabase.from('follows').delete()
          .eq('follower_id', userId).eq('following_id', targetId);
        follows.delete(targetId);
        btn.textContent = 'Follow';
        btn.classList.remove('following');
      } else {
        await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
        follows.add(targetId);
        btn.textContent = 'Following';
        btn.classList.add('following');
      }
      btn.disabled = false;
    }

    window.switchTab = function(t) {
      tab = t;
      document.getElementById('tabAll').classList.toggle('active', t === 'all');
      document.getElementById('tabFollowing').classList.toggle('active', t === 'following');
      loadFeedData();
    };

    await loadFollows();
    await loadFeedData();

  } catch (err) {
    console.error('Feed load error:', err);
    const list = document.getElementById('feedList');
    if (list) list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Couldn't load the feed.<br>Please refresh the page.</p></div>`;
  }
}

