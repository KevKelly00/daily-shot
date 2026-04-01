import webpush from 'web-push';

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC    = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE   = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL     = process.env.VAPID_EMAIL;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

const sbHeaders = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { target_user_id, title, body, url } = req.body;
  if (!target_user_id || !title) return res.status(400).json({ error: 'missing fields' });

  // Fetch all subscriptions for the target user
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(target_user_id)}&select=endpoint,p256dh,auth`,
    { headers: sbHeaders }
  );
  const subs = await r.json();

  if (!Array.isArray(subs) || subs.length === 0) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({ title, body: body || '', url: url || '/feed.html' });

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // Remove expired/invalid subscriptions
  const expired = subs.filter((_, i) =>
    results[i].status === 'rejected' && [404, 410].includes(results[i].reason?.statusCode)
  );
  if (expired.length > 0) {
    await Promise.all(expired.map(s =>
      fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
        { method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } }
      )
    ));
  }

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.status(200).json({ sent });
}
