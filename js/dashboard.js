import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';

export async function loadDashboard() {
  const session = await requireAuth();
  const userId = session.user.id;

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
  // Brew count
  const { count: total } = await supabase
    .from('coffee_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  setText('statTotal', total ?? 0);

  // This week count
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: thisWeek } = await supabase
    .from('coffee_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString());

  setText('statWeek', thisWeek ?? 0);

  // Avg art rating + most poured style — bounded to last 100
  const { data: recent } = await supabase
    .from('coffee_logs')
    .select('art_rating, art_style')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!recent || recent.length === 0) {
    setText('statRating', '—');
    setText('statMethod', '—');
    return;
  }

  const rated = recent.filter(l => l.art_rating);
  const avg = rated.length
    ? (rated.reduce((s, l) => s + parseFloat(l.art_rating), 0) / rated.length).toFixed(1)
    : '—';
  setText('statRating', avg);

  const styles = recent.map(l => l.art_style).filter(Boolean);
  const freq = styles.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const fav = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || '—';
  setText('statMethod', fav);
}

async function loadRecentLogs(userId) {
  const container = document.getElementById('recentLogs');
  if (!container) return;

  const { data: logs, error } = await supabase
    .from('coffee_logs')
    .select('id, art_style, art_rating, flavour_rating, beans, photo_url, created_at')
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
    const date = new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const meta = [log.art_style, log.beans].filter(Boolean).join(' · ');
    const artStr = log.art_rating     ? `Art ${log.art_rating}` : '';
    const flvStr = log.flavour_rating ? `Flavour ${log.flavour_rating}` : '';
    const ratings = [artStr, flvStr].filter(Boolean).join('  ·  ');

    const thumb = log.photo_url
      ? `<img class="log-thumb" src="${esc(log.photo_url)}" alt="" loading="lazy" />`
      : `<div class="log-thumb-placeholder">☕</div>`;

    const card = document.createElement('div');
    card.className = 'log-card';
    card.innerHTML = `
      ${thumb}
      <div class="log-info">
        <div class="log-title">${esc(log.art_style || 'Brew')}</div>
        <div class="log-meta">${esc(meta || date)}${meta ? ' · ' + date : ''}</div>
        ${ratings ? `<div class="log-rating" style="font-size:0.82rem; margin-top:4px; color:var(--muted)">${ratings}</div>` : ''}
      </div>`;
    container.appendChild(card);
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
