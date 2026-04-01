import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';
import { sendNotification } from './push.js';

function starsHtml(rating) {
  if (!rating) return '<span style="color:var(--muted)">Not rated</span>';
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
    + ` <span style="color:var(--muted);font-size:0.85rem">${rating}/5</span>`;
}

function aiSectionHtml(log, isOwner) {
  if (log.ai_rating !== null && log.ai_rating !== undefined) {
    return `
      <div class="ai-section">
        <div class="ai-section-header">
          <span>AI rating</span>
          <span class="ai-rating-score">${log.ai_rating} / 5</span>
        </div>
        ${log.ai_tips ? `<div class="ai-tips">${esc(log.ai_tips)}</div>` : ''}
      </div>`;
  }
  if (isOwner && log.photo_url) {
    return `<button class="btn-ai" id="aiRateBtn">Get AI rating</button>`;
  }
  return '';
}

export async function loadDetail() {
  const content = document.getElementById('content');

  try {
    const session = await requireAuth();
    if (!session) return;
    const userId = session.user.id;

    const logId = new URLSearchParams(window.location.search).get('id');
    if (!logId) { window.location.href = '/library.html'; return; }

    if (document.referrer.includes('/feed.html')) {
      document.getElementById('backBtn').href = '/feed.html';
    }

    const { data: log, error } = await supabase
      .from('coffee_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error || !log) { window.location.href = '/library.html'; return; }

    const [{ data: profileData }, { data: beanData }] = await Promise.all([
      supabase.from('profiles').select('username, full_name, avatar_url').eq('id', log.user_id).single(),
      log.bean_id ? supabase.from('beans').select('name, roast_date').eq('id', log.bean_id).single() : Promise.resolve({ data: null }),
    ]);

    const isOwner  = log.user_id === userId;
    const username = profileData?.username || profileData?.full_name || 'Barista';
    const avatar   = profileData?.avatar_url || '';
    const date     = new Date(log.created_at).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // Days from roast at time of brew
    let daysFromRoast = null;
    if (beanData?.roast_date) {
      const d = Math.floor((new Date(log.created_at) - new Date(beanData.roast_date)) / 86400000);
      if (d >= 0) daysFromRoast = d;
    }

    function render(currentLog) {
      // Build the badge/label for owner bar
      let ownerBadge = '';
      if (currentLog.log_type === 'beans') {
        ownerBadge = `<span class="art-badge" style="background:var(--text);color:var(--bg)">New bag</span>`;
      } else if (currentLog.log_type === 'cafe' && currentLog.cafe_name) {
        ownerBadge = `<span class="art-badge">${esc(currentLog.cafe_name)}</span>`;
      } else if (currentLog.art_style) {
        ownerBadge = `<span class="art-badge">${esc(currentLog.art_style)}</span>`;
      }

      content.innerHTML = `
        ${currentLog.photo_url
          ? `<img class="detail-photo" src="${esc(currentLog.photo_url)}" alt="Brew photo" />`
          : `<div class="detail-photo-placeholder">☕</div>`}

        <div class="owner-bar" id="ownerBar" style="cursor:pointer">
          <img class="owner-avatar" src="${esc(avatar)}" alt=""
            onerror="this.style.background='var(--border)';this.removeAttribute('src')" />
          <span class="owner-name">${esc(username)}</span>
          ${ownerBadge}
          <span class="detail-date">${date}</span>
        </div>

        <div class="detail-body">
          ${currentLog.log_type === 'cafe' && (currentLog.cafe_location || currentLog.drink_order)
            ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                ${currentLog.cafe_location ? `<span style="font-size:0.82rem;color:var(--muted)">${esc(currentLog.cafe_location)}</span>` : ''}
                ${currentLog.drink_order   ? `<span class="art-badge">${esc(currentLog.drink_order)}</span>` : ''}
               </div>`
            : ''}

          ${currentLog.log_type !== 'beans' ? `<div class="detail-grid">
            ${currentLog.log_type !== 'cafe' ? `
            <div class="detail-field">
              <span class="detail-field-label">Beans</span>
              <span class="detail-field-value">${esc(currentLog.beans || '—')}</span>
              ${daysFromRoast !== null ? `<span style="font-size:0.78rem;color:var(--muted)">${daysFromRoast} days from roast</span>` : ''}
            </div>
            <div class="detail-field">
              <span class="detail-field-label">Milk</span>
              <span class="detail-field-value">${esc(currentLog.milk || '—')}</span>
            </div>` : ''}
            <div class="detail-field">
              <span class="detail-field-label">${currentLog.log_type === 'cafe' ? 'Latte art rating' : 'Art rating'}</span>
              <div class="stars-display" style="font-size:0.95rem">${starsHtml(currentLog.art_rating)}</div>
            </div>
            <div class="detail-field">
              <span class="detail-field-label">${currentLog.log_type === 'cafe' ? 'Coffee rating' : 'Flavour rating'}</span>
              <div class="stars-display" style="font-size:0.95rem">${starsHtml(currentLog.flavour_rating)}</div>
            </div>
          </div>` : ''}

          ${currentLog.notes ? `
            <div>
              <div class="detail-field-label" style="margin-bottom:8px">Notes</div>
              <div class="detail-notes">${esc(currentLog.notes)}</div>
            </div>` : ''}

          ${(() => {
            const aiHtml = aiSectionHtml(currentLog, isOwner);
            const trashBtn = `
              <button class="btn-delete" id="deleteBtn" title="Delete brew">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>`;
            if (isOwner && aiHtml) {
              return `<div style="display:flex;gap:8px;align-items:stretch"><div style="flex:1">${aiHtml}</div>${trashBtn}</div>`;
            }
            if (isOwner) return trashBtn;
            return aiHtml;
          })()}
        </div>

        ${currentLog.log_type !== 'beans' ? `
        <div class="community-section" id="communitySection">
          <div class="your-rating-label">Community rating</div>
          <div id="communityRatingContent"><div class="loading-wrap" style="padding:8px 0"><div class="spinner"></div></div></div>
        </div>` : ''}

        <div class="comments-section" id="commentsSection">
          <div class="comments-label">Comments</div>
          <div id="commentsList"><div class="loading-wrap" style="padding:16px 0"><div class="spinner"></div></div></div>
          <div class="comment-input-row">
            <input class="input" id="commentInput" type="text" placeholder="Add a comment…" maxlength="500" />
            <button class="comment-post-btn" id="commentPostBtn">Post</button>
          </div>
        </div>`;

      // Owner bar → profile
      const ownerBar = document.getElementById('ownerBar');
      if (ownerBar) {
        ownerBar.addEventListener('click', () => {
          window.location.href = isOwner ? '/profile.html' : `/user.html?id=${log.user_id}`;
        });
      }

      // AI rating button
      const aiBtn = document.getElementById('aiRateBtn');
      if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
          aiBtn.disabled = true;
          aiBtn.textContent = 'Rating…';

          try {
            const { data: { session: s } } = await supabase.auth.getSession();
            const res = await fetch('/api/ai-rate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${s.access_token}`
              },
              body: JSON.stringify({ logId })
            });

            const json = await res.json();

            if (!res.ok) {
              if (json.error === 'not_latte_art') {
                aiBtn.textContent = 'Only works with latte art photos';
                aiBtn.disabled = true;
              } else if (json.error === 'daily_limit_reached') {
                aiBtn.textContent = 'Daily limit reached (5/day)';
                aiBtn.disabled = true;
              } else {
                aiBtn.textContent = json.error || 'Something went wrong';
                setTimeout(() => { aiBtn.textContent = 'Get AI rating'; aiBtn.disabled = false; }, 3000);
              }
              return;
            }

            // Re-render with the new data
            render({ ...currentLog, ai_rating: json.rating, ai_tips: json.tips });

          } catch (err) {
            aiBtn.textContent = 'Something went wrong';
            setTimeout(() => { aiBtn.textContent = 'Get AI rating'; aiBtn.disabled = false; }, 3000);
          }
        });
      }

      // Delete button
      if (isOwner) {
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            if (!confirm("Delete this brew? This can't be undone.")) return;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting…';

            if (currentLog.photo_url) {
              const path = currentLog.photo_url.split('/coffee-photos/')[1];
              if (path) {
                const { error: storageErr } = await supabase.storage.from('coffee-photos').remove([path]);
                if (storageErr) console.warn('Storage delete failed (orphaned photo):', storageErr.message);
              }
            }

            const { error: delError } = await supabase.from('coffee_logs').delete().eq('id', logId);
            if (delError) {
              alert('Could not delete. Please try again.');
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Delete brew';
              return;
            }
            window.location.href = '/library.html';
          });
        }
      }
    }

    async function loadCommunityRating() {
      const el = document.getElementById('communityRatingContent');
      if (!el) return;

      const { data: ratings } = await supabase
        .from('ratings')
        .select('user_id, score')
        .eq('log_id', logId);

      const myRating = (ratings || []).find(r => r.user_id === userId);
      const count    = (ratings || []).length;
      const avg      = count
        ? ((ratings.reduce((s, r) => s + parseFloat(r.score), 0)) / count).toFixed(1)
        : null;

      const canRate = !isOwner;

      el.innerHTML = `
        ${avg ? `<div class="community-avg">${avg} <span class="community-avg-sub">/ 5 &nbsp;·&nbsp; ${count} rating${count !== 1 ? 's' : ''}</span></div>` : `<div class="your-rating-value">No ratings yet.</div>`}
        ${canRate ? `
          <div>
            <div class="your-rating-label" style="margin-bottom:6px">${myRating ? 'Your rating' : 'Rate this brew'}</div>
            <div class="community-stars" id="communityStars"></div>
            <div class="your-rating-value" id="communityRatingDisplay" style="margin-top:4px">${myRating ? `${myRating.score} / 5` : '—'}</div>
            <button class="btn-rate" id="submitRatingBtn" style="margin-top:8px" ${!myRating ? '' : ''}>
              ${myRating ? 'Update rating' : 'Submit rating'}
            </button>
          </div>` : ''}`;

      if (!canRate) return;

      let selectedScore = myRating ? parseFloat(myRating.score) : null;
      const starsEl    = document.getElementById('communityStars');
      const displayEl  = document.getElementById('communityRatingDisplay');
      const submitBtn  = document.getElementById('submitRatingBtn');

      // Build star picker
      for (let i = 1; i <= 5; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'star-wrap';
        wrap.innerHTML = `
          <svg viewBox="0 0 24 24" fill="var(--border)" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z"/>
          </svg>
          <div class="half-l" data-star="${i}" data-half="0.5"></div>
          <div class="half-r" data-star="${i}" data-half="1"></div>`;
        starsEl.appendChild(wrap);
      }

      function paintStars(value) {
        starsEl.querySelectorAll('path').forEach((path, i) => {
          const n      = i + 1;
          const filled = value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0;
          if (filled === 1) {
            path.setAttribute('fill', 'var(--accent)');
          } else if (filled === 0.5) {
            const gradId = `cr-half-${n}`;
            let svg = starsEl.querySelectorAll('svg')[i];
            if (!svg.querySelector(`#${gradId}`)) {
              const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
              defs.innerHTML = `<linearGradient id="${gradId}" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" stop-color="var(--accent)"/><stop offset="50%" stop-color="var(--border)"/></linearGradient>`;
              svg.prepend(defs);
            }
            path.setAttribute('fill', `url(#${gradId})`);
          } else {
            path.setAttribute('fill', 'var(--border)');
          }
        });
        displayEl.textContent = value !== null ? `${value} / 5` : '—';
      }

      if (selectedScore) paintStars(selectedScore);

      starsEl.addEventListener('click', e => {
        const half = e.target.dataset.half;
        const star = e.target.dataset.star;
        if (!half || !star) return;
        selectedScore = parseFloat(star) - 1 + parseFloat(half);
        paintStars(selectedScore);
      });

      submitBtn.addEventListener('click', async () => {
        if (!selectedScore) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
        const { error: ratingError } = await supabase.from('ratings').upsert(
          { user_id: userId, log_id: logId, score: selectedScore },
          { onConflict: 'user_id,log_id' }
        );
        if (ratingError) {
          submitBtn.disabled = false;
          submitBtn.textContent = myRating ? 'Update rating' : 'Submit rating';
          return;
        }
        if (currentLog.user_id !== userId) {
          const { data: rater } = await supabase.from('profiles').select('full_name, username').eq('id', userId).single();
          const name = rater?.full_name || rater?.username || 'Someone';
          sendNotification(currentLog.user_id, '⭐ New rating', `${name} rated your post ${selectedScore}/5`, `/log-detail.html?id=${logId}`);
        }
        await loadCommunityRating();
        if (window.location.hash === '#rate') {
          document.getElementById('communitySection')?.scrollIntoView({ behavior: 'smooth' });
        }
      });

      if (window.location.hash === '#rate') {
        setTimeout(() => document.getElementById('communitySection')?.scrollIntoView({ behavior: 'smooth' }), 400);
      }
    }

    async function loadComments() {
      const listEl = document.getElementById('commentsList');
      if (!listEl) return;

      const { data: comments } = await supabase
        .from('comments')
        .select('id, user_id, body, created_at')
        .eq('log_id', logId)
        .order('created_at', { ascending: true });

      if (!comments || comments.length === 0) {
        listEl.innerHTML = `<div style="font-size:0.85rem;color:var(--muted)">No comments yet.</div>`;
        return;
      }

      // Batch fetch commenters' profiles
      const uids = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', uids);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      listEl.innerHTML = '';
      comments.forEach(c => {
        const p    = profileMap[c.user_id] || {};
        const name = p.username || p.full_name || 'Barista';
        const date = new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const isOwn = c.user_id === userId;

        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `
          <img class="comment-avatar" src="${esc(p.avatar_url || '')}" alt=""
            onerror="this.style.background='var(--border)';this.removeAttribute('src')" />
          <div class="comment-body">
            <div class="comment-username">${esc(name)}</div>
            <div class="comment-text">${esc(c.body)}</div>
            <div class="comment-meta">
              <span>${date}</span>
              ${isOwn ? `<button class="comment-delete" data-id="${c.id}">Delete</button>` : ''}
            </div>
          </div>`;

        const delBtn = item.querySelector('.comment-delete');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            delBtn.disabled = true;
            const { error } = await supabase.from('comments').delete().eq('id', c.id);
            if (error) { delBtn.disabled = false; return; }
            loadComments();
          });
        }

        listEl.appendChild(item);
      });
    }

    function setupCommentInput() {
      const input   = document.getElementById('commentInput');
      const postBtn = document.getElementById('commentPostBtn');
      if (!input || !postBtn) return;

      async function submitComment() {
        const body = input.value.trim();
        if (!body) return;
        postBtn.disabled = true;
        input.disabled   = true;
        const { error } = await supabase.from('comments').insert({ user_id: userId, log_id: logId, body });
        if (error) {
          postBtn.disabled = false;
          input.disabled   = false;
          postBtn.textContent = 'Failed';
          setTimeout(() => { postBtn.textContent = 'Post'; }, 2000);
          return;
        }
        if (currentLog.user_id !== userId) {
          const { data: commenter } = await supabase.from('profiles').select('full_name, username').eq('id', userId).single();
          const name = commenter?.full_name || commenter?.username || 'Someone';
          sendNotification(currentLog.user_id, '💬 New comment', `${name}: ${body.slice(0, 60)}`, `/log-detail.html?id=${logId}#comments`);
        }
        input.value      = '';
        postBtn.disabled = false;
        input.disabled   = false;
        input.focus();
        loadComments();
      }

      postBtn.addEventListener('click', submitComment);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitComment(); } });

      // Scroll to comments if hash present
      if (window.location.hash === '#comments') {
        setTimeout(() => document.getElementById('commentsSection')?.scrollIntoView({ behavior: 'smooth' }), 400);
      }
    }

    render(log);
    await Promise.all([loadCommunityRating(), loadComments()]);
    setupCommentInput();
    setupPhotoGestures();

  } catch (err) {
    console.error('Detail load error:', err);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Couldn't load this brew.<br>Please go back and try again.</p>
      </div>`;
  }
}

function setupPhotoGestures() {
  const photo = document.querySelector('.detail-photo');
  if (!photo) return;

  let initialDist = 0;
  let currentScale = 1;
  let zoomed = false;

  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  photo.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      initialDist = getDistance(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  photo.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      currentScale = Math.max(1, Math.min(4, dist / initialDist));
      photo.style.transition = 'none';
      photo.style.transform  = `scale(${currentScale})`;
      zoomed = currentScale > 1;
    }
  }, { passive: false });

  photo.addEventListener('touchend', e => {
    if (e.touches.length < 2 && zoomed) {
      photo.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
      photo.style.transform  = 'scale(1)';
      currentScale = 1;
      zoomed = false;
    }
  });
}
