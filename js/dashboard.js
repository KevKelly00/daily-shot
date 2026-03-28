import { supabase, requireAuth } from './auth.js';

export async function loadDashboard() {
  const session = await requireAuth();
  const userId = session.user.id;

  // Set avatar
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', userId)
    .single();

  if (profile) {
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = profile.full_name || 'Barista';
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
  }

  await Promise.all([loadStats(userId), loadRecentLogs(userId)]);
}

async function loadStats(userId) {
  const { data: logs, error } = await supabase
    .from('coffee_logs')
    .select('rating, brew_method, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !logs) return;

  // Total
  setText('statTotal', logs.length);

  // This week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const thisWeek = logs.filter(l => new Date(l.created_at) >= weekAgo).length;
  setText('statWeek', thisWeek);

  // Avg rating
  const rated = logs.filter(l => l.rating);
  const avg = rated.length ? (rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1) : '—';
  setText('statRating', avg);

  // Favourite brew method
  const methods = logs.map(l => l.brew_method).filter(Boolean);
  const freq = methods.reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {});
  const fav = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || '—';
  setText('statMethod', fav);
}

async function loadRecentLogs(userId) {
  const container = document.getElementById('recentLogs');
  if (!container) return;

  const { data: logs, error } = await supabase
    .from('coffee_logs')
    .select('id, title, brew_method, rating, photo_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  container.innerHTML = '';

  if (error || !logs || logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">☕</div>
        <p>No brews logged yet.<br>Tap + to log your first coffee.</p>
      </div>`;
    return;
  }

  logs.forEach(log => {
    const stars = log.rating ? '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating) : '';
    const date  = new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const thumb = log.photo_url
      ? `<img class="log-thumb" src="${escHtml(log.photo_url)}" alt="" loading="lazy" />`
      : `<div class="log-thumb-placeholder">☕</div>`;

    const card = document.createElement('div');
    card.className = 'log-card';
    card.innerHTML = `
      ${thumb}
      <div class="log-info">
        <div class="log-title">${escHtml(log.title || 'Untitled brew')}</div>
        <div class="log-meta">${escHtml(log.brew_method || '')}${log.brew_method ? ' · ' : ''}${date}</div>
        ${stars ? `<div class="log-rating">${stars}</div>` : ''}
      </div>`;
    container.appendChild(card);
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
