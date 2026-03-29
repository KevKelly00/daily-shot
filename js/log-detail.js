import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';

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
          ${currentLog.log_type === 'cafe' && currentLog.cafe_location
            ? `<div style="font-size:0.82rem;color:var(--muted)">${esc(currentLog.cafe_location)}</div>`
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

    render(log);

  } catch (err) {
    console.error('Detail load error:', err);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Couldn't load this brew.<br>Please go back and try again.</p>
      </div>`;
  }
}
