# Build Tracker

Private internal dashboard for the travel brand portfolio: where each of the ~100 brand sites is in the pipeline, what's blocking it, what's left before launch, and the prompt each site was built from. Built on the same stack as TravelPorts so it can be folded in later.

## What's built so far

| Phase | Status | What it covers |
| --- | --- | --- |
| 1. Foundation | **Done** | Database, team login, brands table, brand create/edit, brand detail with build phases, activity log, team settings |
| 2. Overview + pipeline board | **Done** | World map shaded by stage, kanban board with drag-and-drop (Live gated by the checklist) |
| 3. Checklist, notes, blockers | Next | Tick checklist items, add notes and blockers, edit the checklist template |
| 4. Prompts | Planned | Prompt versions, diffs, templates, generator |
| 5. CSV import/export, bulk edit | Planned | |
| 6. Integrations | Planned | Vercel, GitHub, uptime, PageSpeed (each optional) |

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- Postgres via Drizzle ORM. Schema lives in `src/db/schema.ts`, SQL migrations in `drizzle/`
- Zod for validation, Radix UI primitives for components
- Login: one shared team password (`DASHBOARD_PASSWORD`), then each person picks their name so the activity log knows who did what
- Never indexed: login required, `robots.txt` disallows everything, every response carries `X-Robots-Tag: noindex`

## Hosting (Vercel)

The app is deployed from this repository to the Vercel project **build-tracker** on the "Benjamin - Sevo" team: https://build-tracker-benjamin-sevo.vercel.app. Every push to GitHub deploys automatically.

Two one-time settings live in the Vercel project, not in this repo:

1. **Database.** Project → *Storage* → *Create Database* → **Neon** → connect to build-tracker. This adds `DATABASE_URL`. Until it exists the app runs in **demo mode** (sample data, nothing saved). After adding it, *Deployments → Redeploy*. On first start the app creates its tables and loads the five starter brands.
2. **Team password.** Project → *Settings → Environment Variables* → `DASHBOARD_PASSWORD`. Change it any time, then redeploy. `SESSION_SECRET` keeps everyone signed in across password changes.

If Vercel's own login screen appears before the app's, turn it off under *Settings → Deployment Protection → Vercel Authentication*; the app has its own password gate.

## Running locally

```bash
npm install
npm run dev
```

With no `DATABASE_URL` the app uses an embedded Postgres saved to `./.pglite`, so no setup is needed. Copy `.env.example` to `.env.local` to point at a real database.

Checks: `npm run check` runs lint, typecheck and unit tests. `npm run build` does a production build.

## How the data is organised

Everything hangs off **brands**. Each brand has 5 **build phases** and a copy of the **launch checklist** (both created automatically), plus **prompts** (every version kept), **notes**, **blockers** and an **activity log**. Pipeline **stages**, **regions** and the **checklist template** are tables, not hard-coded, so they can be edited in Settings.

Two flags on a stage drive the rules: `counts_as_live` feeds the "N / 100 live" number (Live and Migrated), and `requires_checklist` stops a brand entering that stage until every required checklist item is ticked.

Roles: **owner** manages the team and settings, **editor** changes brands, **viewer** only looks.

## Changing the database schema

Edit `src/db/schema.ts`, run `npm run db:generate` to produce a new SQL file in `drizzle/`, commit both. Migrations run automatically on the next deploy.
