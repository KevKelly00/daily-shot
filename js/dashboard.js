import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';

const CACHE_KEY = 'daily_shot_dashboard_cache';

export async function loadDashboard() {
  const session = await requireAuth();
  const userId = session.user.id;

  // Show cached data instantly if available
  const cached = loadCache(userId);
  if (cached) applyCache(cached);

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', userId)
    .single();

  // Greeting
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const firstName = profile?.full_name?.split(' ')[0] || null;
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) greetingEl.textContent = firstName ? `${timeOfDay}, ${firstName} ☕` : `${timeOfDay} ☕`;

  // Avatar
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl && profile?.avatar_url) {
    avatarEl.onload = () => avatarEl.classList.add('loaded');
    avatarEl.src = profile.avatar_url;
    if (avatarEl.complete) avatarEl.classList.add('loaded');
  }

  await Promise.all([
    loadStats(userId),
    loadStreak(userId),
    loadBeans(userId),
  ]);
}

function loadCache(userId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj.userId === userId ? obj : null;
  } catch { return null; }
}

function applyCache(c) {
  setText('statTotal',     c.statTotal);
  setText('statWeek',      c.statWeek);
  setText('statRating',    c.statRating);
  setText('statAiBest',    c.statAiBest);
  setText('statCafes',     c.statCafes);
  setText('statRatings',   c.statRatings);
  setText('streakCurrent', c.streakCurrent);
  setText('streakBest',    c.streakBest);
  const hint = document.getElementById('streakHint');
  if (hint && c.streakHint) hint.textContent = c.streakHint;
  const beans = document.getElementById('beansList');
  if (beans && c.beansHtml) beans.innerHTML = c.beansHtml;
}

function saveCache(userId, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, ...data }));
  } catch {}
}

async function loadStats(userId) {
  const { count: total } = await supabase
    .from('coffee_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('log_type', 'home');

  setText('statTotal', total ?? 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: thisWeek } = await supabase
    .from('coffee_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString());

  setText('statWeek', thisWeek ?? 0);

  const [{ data: homeLogs }, { data: cafeLogs }] = await Promise.all([
    supabase.from('coffee_logs').select('art_rating, ai_rating').eq('user_id', userId).eq('log_type', 'home'),
    supabase.from('coffee_logs').select('cafe_name').eq('user_id', userId).eq('log_type', 'cafe').not('cafe_name', 'is', null),
  ]);

  let avg = '—', best = '—';
  if (homeLogs && homeLogs.length > 0) {
    const rated = homeLogs.filter(l => l.art_rating != null);
    avg = rated.length
      ? (rated.reduce((s, l) => s + parseFloat(l.art_rating), 0) / rated.length).toFixed(1)
      : '—';
    const aiScores = homeLogs.map(l => l.ai_rating).filter(Boolean);
    best = aiScores.length ? Math.max(...aiScores.map(parseFloat)).toFixed(1) : '—';
  }
  setText('statRating', avg);
  setText('statAiBest', best);

  const uniqueCafes = new Set((cafeLogs || []).map(l => l.cafe_name?.toLowerCase().trim()).filter(Boolean)).size;
  setText('statCafes', uniqueCafes);

  // Community ratings on user's posts
  const { data: userLogs } = await supabase
    .from('coffee_logs')
    .select('id')
    .eq('user_id', userId);

  let communityRatings = 0;
  if (userLogs && userLogs.length > 0) {
    const logIds = userLogs.map(l => l.id);
    const { count } = await supabase
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .in('log_id', logIds);
    communityRatings = count ?? 0;
  }
  setText('statRatings', communityRatings);

  mergeCache(userId, { statTotal: total ?? 0, statWeek: thisWeek ?? 0, statRating: avg, statAiBest: best, statCafes: uniqueCafes, statRatings: communityRatings });
}

async function loadStreak(userId) {
  const { data: logs } = await supabase
    .from('coffee_logs')
    .select('created_at')
    .eq('user_id', userId)
    .eq('log_type', 'home')
    .order('created_at', { ascending: false });

  if (!logs || logs.length === 0) {
    setText('streakCurrent', '0');
    setText('streakBest', '0');
    const hint = document.getElementById('streakHint');
    if (hint) hint.textContent = 'Log your first home brew!';
    mergeCache(userId, { streakCurrent: '0', streakBest: '0', streakHint: 'Log your first home brew!' });
    return;
  }

  const dateSet = new Set(logs.map(l => toDateStr(new Date(l.created_at))));
  const dates = [...dateSet].sort().reverse();

  const todayStr     = toDateStr(new Date());
  const yesterdayStr = toDateStr(offsetDays(new Date(), -1));

  let current = 0;
  if (dates[0] === todayStr || dates[0] === yesterdayStr) {
    let expected = dates[0] === todayStr ? todayStr : yesterdayStr;
    for (const d of dates) {
      if (d === expected) {
        current++;
        expected = toDateStr(offsetDays(new Date(expected + 'T12:00:00'), -1));
      } else {
        break;
      }
    }
  }

  let best = 0, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T12:00:00');
    const curr = new Date(dates[i]     + 'T12:00:00');
    const diff = Math.round((prev - curr) / 86400000);
    if (diff === 1) { run++; } else { best = Math.max(best, run); run = 1; }
  }
  best = Math.max(best, run, current);

  const hintText = current === 0
    ? 'No active streak — brew today to start one!'
    : dates[0] === todayStr
      ? (current >= best ? 'New personal best — keep going!' : "Keep it up — don't break the streak!")
      : 'Brew today to keep the streak alive!';

  setText('streakCurrent', current);
  setText('streakBest', best + ' days');
  const hint = document.getElementById('streakHint');
  if (hint) hint.textContent = hintText;

  mergeCache(userId, { streakCurrent: current, streakBest: best + ' days', streakHint: hintText });
}

async function loadBeans(userId) {
  const container = document.getElementById('beansList');
  if (!container) return;

  const { data: beans } = await supabase
    .from('beans')
    .select('id, name, roast_date')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('roast_date', { ascending: false });

  if (!beans || beans.length === 0) {
    container.innerHTML = '<div class="bean-empty">No beans in rotation yet.</div>';
    mergeCache(userId, { beansHtml: '<div class="bean-empty">No beans in rotation yet.</div>' });
    return;
  }

  const today = new Date();
  const html = beans.map(bean => {
    let daysLabel = '—', ageClass = '';
    if (bean.roast_date) {
      const days = Math.floor((today - new Date(bean.roast_date)) / 86400000);
      daysLabel = `${days}d`;
      ageClass  = days < 7 ? 'fresh' : days <= 21 ? 'peak' : 'old';
    }
    return `<div class="bean-row"><div class="bean-name">${esc(bean.name)}</div><div class="bean-age ${ageClass}">${daysLabel}</div></div>`;
  }).join('');

  container.innerHTML = html;
  mergeCache(userId, { beansHtml: html });
}

function mergeCache(userId, data) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    saveCache(userId, { ...existing, ...data });
  } catch {}
}

function toDateStr(date) {
  return date.toLocaleDateString('en-CA');
}

function offsetDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
