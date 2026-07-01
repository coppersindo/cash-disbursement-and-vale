# GITC — Disbursement & Vale

Standalone cash-disbursement / payroll-vale app for GITC Supply Solutions Inc.
**Fully self-contained**: its own GitHub repo, its own Supabase project, and its
own Vercel deployment. It shares nothing with the HR Recruitment app.

Stack: Vite + React + TypeScript + Tailwind + Supabase.

Screens (all role-gated — requester / encoder / approver / payroll / admin):
Request Cash · Cash Encoder · Approvals · Payroll Vale · Driver Master ·
Cash Overview · Team.

---

## 1. Database — its own Supabase project

1. Create a new project at https://supabase.com/dashboard (note the project ref).
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
3. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This builds everything from an empty DB (role enum, `profiles` + signup trigger, `garages`, `drivers`, `disbursement_*`, `payroll_weeks`, RPCs, RLS, storage bucket).
4. (Optional) run [`supabase/seed.sql`](supabase/seed.sql) after you've signed up + promoted yourself, for demo data.

Auth note: this app expects email confirmation to match your preference — new
signups land on "Awaiting access" until an admin approves them on the **Team**
screen.

## 2. Local dev

```bash
cd disbursement-app
cp .env.example .env.local     # then fill in YOUR project's URL + anon key
npm install                    # first time only
npm run dev                    # http://localhost:5173
```

Sign up once in the app, then make yourself admin + approver (SQL Editor):

```sql
update public.profiles
set approved = true, role = 'admin', disbursement_approver = true
where id = (select id from auth.users order by created_at desc limit 1);
```

## 3. GitHub — its own repo

`gh` isn't installed here, so create the repo on github.com (empty, no README),
then:

```bash
cd disbursement-app
git remote add origin git@github.com:<you>/gitc-disbursement.git
git push -u origin main
```

(The folder is already a git repo with an initial commit.)

## 4. Vercel — its own project

```bash
cd disbursement-app
npx vercel            # link/create a NEW project, e.g. "gitc-disbursement"
```

Then in the Vercel project's **Settings → Environment Variables**, add:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (your new project's values).
Finally:

```bash
npx vercel --prod
```

## Bank file formats

- **Maya** `.csv` — header `Mobile Number,Amount`; 639XXXXXXXXX mobiles; plain amounts, no thousands commas.
- **BPI BizLink** `.xls` (BIFF8) — H totals row (funding account `3531008226`), detail rows with account cells forced to text so leading zeros survive. Drop a bank-accepted template at `public/bpi-bizlink-template.xls` to inject rows into the real file instead of building from scratch. The Approvals screen has a one-time ₱1 test-file button for validation uploads.
