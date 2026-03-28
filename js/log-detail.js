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

    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', log.user_id)
      .single();

    const isOwner  = log.user_id === userId;
    const username = profileData?.username || profileData?.full_name || 'Barista';
    const avatar   = profileData?.avatar_url || '';
    const date     = new Date(log.created_at).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    content.innerHTML = `
      ${log.photo_url
        ? `<img class="detail-photo" src="${esc(log.photo_url)}" alt="Brew photo" />`
        : `<div class="detail-photo-placeholder">☕</div>`}

      <div class="owner-bar">
        <img class="owner-avatar" src="${esc(avatar)}" alt=""
          onerror="this.style.background='var(--border)';this.removeAttribute('src')" />
        <span class="owner-name">${esc(username)}</span>
        <span class="detail-date">${date}</span>
      </div>

      <div class="detail-body">
        ${log.art_style ? `<div><span class="art-badge">${esc(log.art_style)}</span></div>` : ''}

        <div class="detail-grid">
          <div class="detail-field">
            <span class="detail-field-label">Beans</span>
            <span class="detail-field-value">${esc(log.beans || '—')}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field-label">Milk</span>
            <span class="detail-field-value">${esc(log.milk || '—')}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field-label">Art rating</span>
            <div class="stars-display" style="font-size:0.95rem">${starsHtml(log.art_rating)}</div>
          </div>
          <div class="detail-field">
            <span class="detail-field-label">Flavour rating</span>
            <div class="stars-display" style="font-size:0.95rem">${starsHtml(log.flavour_rating)}</div>
          </div>
        </div>

        ${log.notes ? `
          <div>
            <div class="detail-field-label" style="margin-bottom:8px">Notes</div>
            <div class="detail-notes">${esc(log.notes)}</div>
          </div>` : ''}

        ${isOwner ? `<button class="btn btn-danger" id="deleteBtn" style="margin-top:8px">Delete brew</button>` : ''}
      </div>`;

    if (isOwner) {
      document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (!confirm("Delete this brew? This can't be undone.")) return;
        const btn = document.getElementById('deleteBtn');
        btn.disabled = true;
        btn.textContent = 'Deleting…';

        if (log.photo_url) {
          const path = log.photo_url.split('/coffee-photos/')[1];
          if (path) {
            const { error: storageErr } = await supabase.storage.from('coffee-photos').remove([path]);
            if (storageErr) console.warn('Storage delete failed (orphaned photo):', storageErr.message);
          }
        }

        const { error: delError } = await supabase.from('coffee_logs').delete().eq('id', logId);
        if (delError) {
          alert('Could not delete. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Delete brew';
          return;
        }
        window.location.href = '/library.html';
      });
    }

  } catch (err) {
    console.error('Detail load error:', err);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Couldn't load this brew.<br>Please go back and try again.</p>
      </div>`;
  }
}
