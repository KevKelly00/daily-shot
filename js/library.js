import { supabase, requireAuth } from './auth.js';

export async function loadLibrary() {
  const grid = document.getElementById('photoGrid');

  try {
    const session = await requireAuth();
    if (!session) return;
    const userId = session.user.id;

    const { data: logs, error } = await supabase
      .from('coffee_logs')
      .select('id, photo_url, art_style')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    grid.innerHTML = '';

    if (error || !logs || logs.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">📷</div>
          <p>No brews logged yet.<br>Tap + to log your first coffee.</p>
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
        img.alt     = log.art_style || '';
        img.loading = 'lazy';
        item.appendChild(img);
      } else {
        item.className = 'photo-grid-placeholder';
        item.textContent = '☕';
      }
      grid.appendChild(item);
    });

  } catch (err) {
    console.error('Library load error:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <p>Couldn't load your brews.<br>Please refresh the page.</p>
      </div>`;
  }
}
