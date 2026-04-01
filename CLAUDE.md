# Daily Shot — Project Guide for Claude

## What is Daily Shot?
A mobile-first PWA for logging, rating, and sharing latte art and coffee experiences. The name is a play on "espresso shot" and "photo shot" — capturing your daily coffee moment. Users log home brews, cafe visits, and new bean bags, rate them with half-star increments, and share with a community. Key differentiator: AI-powered latte art scoring via Claude.

## Tech Stack
- **Frontend:** Vanilla JS (ES6 modules, no framework, no build step)
- **Backend:** Supabase (PostgreSQL + Auth + Storage) + Vercel serverless functions
- **AI:** Anthropic Claude — used in `/api/ai-rate` to score latte art photos
- **Push notifications:** `web-push` library with VAPID keys (server-side only dep)
- **PWA:** Service worker with cache-first strategy, Web Push, manifest.json

## Project Structure
```
/               — HTML pages (index, dashboard, log, feed, library, profile, user, log-detail, pending)
/js/            — JS modules, one per feature page + shared (auth, supabase client)
/css/           — Single stylesheet
/api/           — Vercel serverless endpoints (ai-rate, notify)
/supabase/      — Supabase config
migration_*.sql — DB migrations (numbered sequentially, applied manually)
```

## Database Tables
- `profiles` — extends auth.users; `is_approved` gates access
- `coffee_logs` — core entity; `log_type` is 'home' | 'cafe' | 'beans'
- `beans` — user's bean inventory; `is_active` for archiving
- `likes`, `comments`, `ratings` — social/community features
- `follows` — follower/following relationships
- `push_subscriptions` — Web Push endpoints per user

## Key Design Decisions
- **No framework, no build tool** — keep it simple, ship HTML/JS/CSS directly
- **Mobile-first, max-width 480px** — this is a phone app
- **Supabase RLS enforces all auth/access rules** — don't bypass with service role key in frontend
- **Approval gate** — new users land on `pending.html` until `is_approved = true`
- **AI rating rate limit** — 5 per user per day (UTC), enforced server-side in `/api/ai-rate`
- **Image compression** — client-side resize to 1080px max, JPEG 0.85 before upload

## Conventions
- Each page's JS exports one load function (e.g. `loadDashboard()`, `loadFeed()`)
- Interactive handlers attached to `window` object for inline HTML event attributes
- CSS uses variables (`--bg`, `--text`, `--accent`, etc.) defined at `:root`
- Half-star ratings use unicode: `★`, `½`, `☆`
- Parallel data fetching with `Promise.all()` — don't chain sequential awaits when fetches are independent
- DB migrations are numbered (v8, v9, ... v16) and applied manually to Supabase

## What to Avoid
- Don't add npm dependencies without good reason — the only current dep is `web-push`
- Don't introduce a frontend framework or build step
- Don't add features that aren't asked for
- Don't use the Supabase service role key in frontend code
- Don't skip RLS — security is enforced at the DB layer

## Current State (as of late March 2026)
- Core features built: auth, logging, library, feed, profile, AI rating, push notifications, social (follows/likes/comments/ratings)
- Dashboard shows stats tiles, brew streak, bean inventory
- Deployed on Vercel
