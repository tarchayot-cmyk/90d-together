# 90 Days Growing Together — V1

ME → WE → US: a 90-day healthy-workplace challenge app.
Next.js 14 (App Router) + TypeScript + Tailwind + Supabase, mobile-first PWA.

## 1. Supabase setup

Create a Supabase project, then run every file in `supabase/migrations/`
**in order**, in the SQL Editor:

1. `0001_sprint1_core.sql` — campaigns, members, missions, check_ins,
   points_transactions, stickers, kindness_logs, audit_logs + RLS
2. `0002_sprint2_checkin_engine.sql` — `complete_mission()` + ME mission seed
3. `0003_sprint3_buddy_squad_kindness.sql` — buddy/squad tables, `give_kindness()`,
   `get_buddy_progress()`, `get_squad_progress()`, `assign_groups_randomly()`
4. `0004_sprint4_badges_leaderboard_tree.sql` — badges, `check_achievements()`,
   `get_leaderboard()`, `get_tree_progress()`
5. `0005_sprint5_admin_audit.sql` — `admin_get_overview()`, `admin_adjust_points()`,
   `admin_approve_checkin()` (also adds proof-approval gating to `complete_mission()`)
6. `0006_sprint6_final_tree.sql` — `get_final_tree_summary()`
7. `0007_login_employee_pin.sql` — `admin_create_member()`, `admin_reset_pin()`
   (fixed in place to include the `extensions` schema in `search_path`, so
   `crypt()`/`gen_salt()` resolve on Supabase — see `0009` below if you
   already ran an earlier copy of this file before the fix)
8. `0008_admin_crud_missions_campaign_members.sql` — `admin_upsert_mission()`,
   `admin_upsert_campaign()`, `admin_set_member_active()` — full admin CRUD
   for missions/campaign/member-status without touching Table Editor, all audited
9. `0009_fix_pgcrypto_search_path.sql` — **only needed if you ran `0007`
   before this fix and hit `function gen_salt(unknown) does not exist`.**
   Re-declares the same two functions with the corrected `search_path`.
   Fresh installs running the updated `0007` above can skip this file.
10. `0010_fix_auth_users_null_tokens.sql` — fixes a Supabase Auth (GoTrue)
    500 error on login caused by NULL token columns on manually-inserted
    `auth.users` rows. Fixes existing accounts and updates
    `admin_create_member()` so new accounts aren't affected.
11. `0011_admin_delete_checkin.sql` — `admin_delete_checkin()`: undoes a
    mistaken check-in (reverses its points/sticker, reopens that week for
    resubmission), used from `/admin/checkins`.

### Creating your first login (do this once)

The app logs in with **Employee Code + PIN**, which under the hood maps to
Supabase Auth's email+password (see `src/lib/auth.ts` for the exact mapping).
There's no public sign-up screen — accounts are admin-provisioned. To create
your very first (admin) account, run this once in the SQL Editor, after
`0007_login_employee_pin.sql`, with your own values:

```sql
select admin_create_member('EMP001', 'ผู้ดูแลระบบ', '123456', 'IT', 'super_admin');
```

That logs in at the app's `/login` screen with Employee Code `EMP001` and
PIN `123456`. From then on, that admin can create everyone else from
**Admin → Members → เพิ่มสมาชิกใหม่** in the app itself — no more SQL needed.

## 2. App setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Required env vars (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
```

Deploy to Vercel as a standard Next.js app; set the same two env vars there.

## 3. What's here

- `src/app/login/` — Employee Code + PIN sign-in; `src/app/(main)/layout.tsx`
  and `src/app/admin/layout.tsx` both redirect here automatically whenever
  there's no active session.
- `src/app/(main)/` — the participant-facing app (Home, Missions, Tree,
  Ranking, Profile, Final Tree), wrapped in a shared mobile shell with
  bottom navigation.
- `src/app/admin/` — Members (search, add member, adjust points, activate/
  deactivate, random Buddy/Squad assignment), Missions (create/edit/toggle
  active), Check-ins (browse + undo a mistaken check-in), Campaign (edit
  dates, create new), and Audit log — all gated on `role` and requiring no
  Supabase Table Editor access for day-to-day use.
- `supabase/migrations/` — every sprint's SQL, safe to re-run only once
  each (not idempotent by design, matching normal migration practice).
- PWA: `public/manifest.json`, `public/sw.js` (minimal cache-first shell,
  never intercepts Supabase traffic), `public/icons/`.

## 4. Known V1 simplifications (documented in code comments too)

- Tree/leaderboard progress formulas are deliberately rough approximations
  (see comments in `get_tree_progress()` / `admin_get_overview()`) — good
  enough for a pilot, worth revisiting with real usage data.
- Team missions (Buddy Walk, Big Step Challenge) reward individual
  participation on submission; the *team* target shown on Buddy/Squad
  cards is tracked separately by `get_buddy_progress()` / `get_squad_progress()`.
- Buddy/Squad membership is assigned by `assign_groups_randomly()`,
  triggered manually by an Admin from `/admin/members`.
- Login writes directly to Supabase's internal `auth.users` table to attach
  a PIN as a bcrypt password (see comments in `0007_login_employee_pin.sql`)
  — simple and fine for an internal pilot; a public-facing rollout should
  move this to a proper Edge Function using the Auth Admin API instead.
- Things intentionally left out of V1 (per the original spec, section 37):
  Apple Health / Google Fit, AI health analysis, in-app chat, a rewards
  store, points redemption, native iOS/Android apps.
