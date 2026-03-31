import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';
import { sendNotification } from './push.js';

const PAGE = 30;

const heartOutline = `<svg class="heart-outline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const heartFilled  = `<svg class="heart-filled"  width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const commentIcon  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

export async function loadFeed() {
  try {
    const session  = await requireAuth();
    const userId   = session.user.id;
    let   tab      = 'all';
    let   follows  = new Set();
    let   offset   = 0;
    let   loading  = false;
    let   hasMore  = true;

    async function loadFollows() {
      const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
      follows = new Set((data || []).map(r => r.following_id));
    }

    async function fetchPage(append) {
      if (loading) return;
      const list = document.getElementById('feedList');

      if (!append) {
        list.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
        offset  = 0;
        hasMore = true;
      }

      if (tab === 'following' && follows.size === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>You're not following anyone yet.<br>Switch to All Brews to discover people.</p></div>`;
        hasMore = false;
        return;
      }

      loading = true;

      let query = supabase
        .from('coffee_logs')
        .select('id, user_id, log_type, art_style, cafe_name, cafe_location, art_rating, flavour_rating, notes, photo_url, created_at, bean_id, beans')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1);

      if (tab === 'following') query = query.in('user_id', [...follows]);

      const { data: logs, error } = await query;

      loading = false;

      if (!append) list.innerHTML = '';

      if (error || !logs || logs.length === 0) {
        if (!append) list.innerHTML = `<div class="empty-state"><div class="empty-icon">☕</div><p>No brews here yet.</p></div>`;
        hasMore = false;
        return;
      }

      const logIds  = logs.map(l => l.id);
      const userIds = [...new Set(logs.map(l => l.user_id))];
      const beanIds = [...new Set(logs.map(l => l.bean_id).filter(Boolean))];

      // Batch fetch profiles, beans, likes, comments in parallel
      const [
        { data: profiles },
        { data: beansData },
        { data: likesData },
        { data: commentsData },
        { data: ratingsData },
      ] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', userIds),
        beanIds.length > 0
          ? supabase.from('beans').select('id, name, roast_date').in('id', beanIds)
          : Promise.resolve({ data: [] }),
        supabase.from('likes').select('log_id, user_id').in('log_id', logIds),
        supabase.from('comments').select('log_id').in('log_id', logIds),
        supabase.from('ratings').select('log_id, score').in('log_id', logIds),
      ]);

      const profileMap      = {};
      const beanMap         = {};
      const likeCountMap    = {};
      const commentCountMap = {};
      const avgRatingMap    = {};
      const userLikedSet    = new Set();

      (profiles    || []).forEach(p => { profileMap[p.id] = p; });
      (beansData   || []).forEach(b => { beanMap[b.id]    = b; });
      (likesData   || []).forEach(l => {
        likeCountMap[l.log_id] = (likeCountMap[l.log_id] || 0) + 1;
        if (l.user_id === userId) userLikedSet.add(l.log_id);
      });
      (commentsData || []).forEach(c => {
        commentCountMap[c.log_id] = (commentCountMap[c.log_id] || 0) + 1;
      });

      // Compute avg rating per log
      const ratingAccum = {};
      (ratingsData || []).forEach(r => {
        if (!ratingAccum[r.log_id]) ratingAccum[r.log_id] = { sum: 0, count: 0 };
        ratingAccum[r.log_id].sum   += parseFloat(r.score);
        ratingAccum[r.log_id].count += 1;
      });
      Object.entries(ratingAccum).forEach(([id, { sum, count }]) => {
        avgRatingMap[id] = { avg: (sum / count).toFixed(1), count };
      });

      logs.forEach(log => renderCard(log, list, profileMap, beanMap, likeCountMap, commentCountMap, userLikedSet, avgRatingMap));

      offset  += logs.length;
      hasMore  = logs.length === PAGE;
    }

    function renderCard(log, container, profileMap, beanMap, likeCountMap, commentCountMap, userLikedSet, avgRatingMap) {
      const profile       = profileMap[log.user_id] || {};
      const username      = profile.username || profile.full_name || 'Barista';
      const isOwn         = log.user_id === userId;
      const date          = new Date(log.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
      const bean          = log.bean_id ? beanMap[log.bean_id] : null;
      const followingThis = follows.has(log.user_id);
      const liked         = userLikedSet.has(log.id);
      const likeCount     = likeCountMap[log.id]    || 0;
      const commentCount  = commentCountMap[log.id] || 0;
      const ratingInfo    = avgRatingMap?.[log.id];

      const card = document.createElement('div');
      card.className = 'brew-card';

      const header = `
        <div class="brew-card-header">
          <img class="brew-avatar" src="${esc(profile.avatar_url || '')}" alt=""
            onerror="this.style.background='var(--border)';this.src=''"
            data-uid="${esc(log.user_id)}" />
          <div>
            <div class="brew-username" data-uid="${esc(log.user_id)}">${esc(username)}</div>
            <div class="brew-date">${date}</div>
          </div>
          ${!isOwn ? `
            <button class="follow-btn ${followingThis ? 'following' : ''}" data-uid="${esc(log.user_id)}">
              ${followingThis ? 'Following' : 'Follow'}
            </button>` : ''}
        </div>`;

      const photo = log.photo_url
        ? `<img class="brew-photo" src="${esc(log.photo_url)}" alt="" loading="lazy" data-id="${esc(log.id)}" />`
        : `<div class="brew-photo-placeholder" data-id="${esc(log.id)}"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;

      const actions = `
        <div class="card-actions">
          <button class="like-btn ${liked ? 'liked' : ''}" data-log-id="${esc(log.id)}">
            ${heartOutline}${heartFilled}
            <span class="like-count">${likeCount}</span>
          </button>
          <button class="comment-btn" data-id="${esc(log.id)}">
            ${commentIcon}
            <span>${commentCount}</span>
          </button>
          ${ratingInfo ? `<span class="card-avg-rating" data-id="${esc(log.id)}">★ ${ratingInfo.avg} <span style="color:var(--muted);font-weight:400">(${ratingInfo.count})</span></span>` : ''}
        </div>`;

      if (log.log_type === 'beans') {
        let roastLine = '';
        if (bean?.roast_date) {
          const days = Math.floor((new Date(log.created_at) - new Date(bean.roast_date)) / 86400000);
          roastLine = `<div class="brew-date" style="margin-top:2px">Roasted ${days} day${days !== 1 ? 's' : ''} before post</div>`;
        }
        card.innerHTML = `
          ${header}${photo}
          <div class="brew-card-footer">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="brew-style-badge" style="background:var(--text);color:var(--bg)">New bag</span>
              <span style="font-size:0.9rem; font-weight:600">${esc(log.beans || '')}</span>
            </div>
            ${roastLine}
            ${log.notes ? `<div class="brew-notes">${esc(log.notes)}</div>` : ''}
            ${actions}
          </div>`;
      } else {
        let roastLine = '';
        if (log.log_type !== 'cafe' && bean?.roast_date) {
          const days = Math.floor((new Date(log.created_at) - new Date(bean.roast_date)) / 86400000);
          if (days >= 0) roastLine = `<div class="brew-date" style="margin-top:2px">${days} day${days !== 1 ? 's' : ''} from roast</div>`;
        }
        card.innerHTML = `
          ${header}${photo}
          <div class="brew-card-footer">
            ${log.log_type === 'cafe'
              ? `${log.cafe_name ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="brew-style-badge">${esc(log.cafe_name)}</span>${log.drink_order ? `<span class="brew-style-badge">${esc(log.drink_order)}</span>` : ''}${log.cafe_location ? `<span style="font-size:0.78rem;color:var(--muted)">${esc(log.cafe_location)}</span>` : ''}</div>` : ''}`
              : `${log.art_style ? `<div><span class="brew-style-badge">${esc(log.art_style)}</span></div>` : ''}`}
            ${roastLine}
            ${(log.art_rating || log.flavour_rating) ? `
              <div class="brew-ratings">
                ${log.art_rating     ? `<span>${log.log_type === 'cafe' ? 'Latte art' : 'Art'} ${log.art_rating}/5</span>` : ''}
                ${log.flavour_rating ? `<span>${log.log_type === 'cafe' ? 'Coffee'    : 'Flavour'} ${log.flavour_rating}/5</span>` : ''}
              </div>` : ''}
            ${log.notes ? `<div class="brew-notes">${esc(log.notes)}</div>` : ''}
            ${actions}
          </div>`;
      }

      container.appendChild(card);

      card.querySelectorAll('[data-id]').forEach(el => {
        let lastTap = 0;
        el.addEventListener('touchend', e => {
          const now = Date.now();
          if (now - lastTap < 300) {
            e.preventDefault();
            const likeBtn = card.querySelector('.like-btn');
            if (likeBtn && !likeBtn.classList.contains('liked')) toggleLike(likeBtn, log.id);
            showHeartBurst(el);
          } else {
            lastTap = now;
          }
        });
        el.addEventListener('click', () => window.location.href = `/log-detail.html?id=${el.dataset.id}`);
      });

      card.querySelectorAll('[data-uid]').forEach(el => {
        el.addEventListener('click', () => window.location.href = `/user.html?id=${el.dataset.uid}`);
      });

      const followBtn = card.querySelector('.follow-btn');
      if (followBtn) {
        followBtn.addEventListener('click', e => {
          e.stopPropagation();
          toggleFollow(followBtn, log.user_id);
        });
      }

      const likeBtn = card.querySelector('.like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', e => {
          e.stopPropagation();
          toggleLike(likeBtn, log.id);
        });
      }

      const commentBtn = card.querySelector('.comment-btn');
      if (commentBtn) {
        commentBtn.addEventListener('click', e => {
          e.stopPropagation();
          window.location.href = `/log-detail.html?id=${log.id}#comments`;
        });
      }

      const avgRatingEl = card.querySelector('.card-avg-rating');
      if (avgRatingEl) {
        avgRatingEl.style.cursor = 'pointer';
        avgRatingEl.addEventListener('click', e => {
          e.stopPropagation();
          window.location.href = `/log-detail.html?id=${log.id}#rate`;
        });
      }
    }

    async function toggleLike(btn, logId) {
      const isLiked   = btn.classList.contains('liked');
      const countEl   = btn.querySelector('.like-count');
      const newCount  = Math.max(0, parseInt(countEl.textContent) + (isLiked ? -1 : 1));

      // Optimistic update
      btn.classList.toggle('liked', !isLiked);
      countEl.textContent = newCount;

      if (isLiked) {
        await supabase.from('likes').delete().eq('user_id', userId).eq('log_id', logId);
      } else {
        await supabase.from('likes').insert({ user_id: userId, log_id: logId });
        // Notify post owner (skip if liking own post)
        const { data: log } = await supabase.from('coffee_logs').select('user_id').eq('id', logId).single();
        if (log && log.user_id !== userId) {
          const { data: liker } = await supabase.from('profiles').select('full_name, username').eq('id', userId).single();
          const name = liker?.full_name || liker?.username || 'Someone';
          sendNotification(log.user_id, '❤️ New like', `${name} liked your post`, `/log-detail.html?id=${logId}`);
        }
      }
    }

    async function toggleFollow(btn, targetId) {
      btn.disabled = true;
      const isFollowing = follows.has(targetId);
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
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
      fetchPage(false);
    };

    await loadFollows();
    await fetchPage(false);

    const sentinel = document.getElementById('feedSentinel');
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        fetchPage(true);
      }
    }, { rootMargin: '300px' });
    observer.observe(sentinel);

  } catch (err) {
    console.error('Feed load error:', err);
    const list = document.getElementById('feedList');
    if (list) list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Couldn't load the feed.<br>Please refresh the page.</p></div>`;
  }
}

function showHeartBurst(el) {
  const rect   = el.getBoundingClientRect();
  const heart  = document.createElement('span');
  heart.textContent = '❤️';
  heart.className   = 'heart-burst';
  heart.style.cssText = `
    left: ${rect.left + rect.width  / 2 - 40}px;
    top:  ${rect.top  + rect.height / 2 - 40}px;
    position: fixed;
  `;
  document.body.appendChild(heart);
  heart.addEventListener('animationend', () => heart.remove());
}
