# Build Tracker

Private internal dashboard for the travel brand portfolio: where each of the ~100 brand sites is in the pipeline, what's blocking it, what's left before launch, and the prompt each site was built from. Built on the same stack as TravelPorts so it can be folded in later.

## What's built so far

| Phase | Status | What it covers |
| --- | --- | --- |
| 1. Foundation | **Done** | Database, team login, brands table, brand create/edit, brand detail with build phases, activity log, team settings |
| 2. Overview + pipeline board | Next | World map, kanban with drag-and-drop |
| 3. Checklist, notes, blockers | Planned | Tick checklist items, add notes and blockers, edit the checklist template |
| 4. Prompts | Planned | Prompt versions, diffs, templates, generator |
| 5. CSV import/export, bulk edit | Planned | |
| 6. Integrations | Planned | Vercel, GitHub, uptime, PageSpeed (each optional) |

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- Postgres via Drizzle ORM. Schema lives in `src/db/schema.ts`, SQL migrations in `drizzle/`
- Zod for validation, Radix UI primitives for components
- Login: one shared team password (`DASHBOARD_PASSWORD`), then each person picks their name so the activity log knows who did what
- Never indexed: login required, `robots.txt` disallows everything, every response carries `X-Robots-Tag: noindex`

## Setting it up on Vercel (one-time, about 5 minutes)

1. **Import the repo.** On vercel.com click *Add New → Project*, pick this GitHub repository, leave every setting as it is, click *Deploy*. The first deploy runs in **demo mode**: you can click around with sample data but nothing is saved.
2. **Attach a database.** In the Vercel project open the *Storage* tab → *Create Database* → choose **Neon** (Postgres) → accept the defaults → *Connect* to this project for all environments. Vercel adds `DATABASE_URL` to the project automatically.
3. **Set the team password.** *Settings → Environment Variables* → add `DASHBOARD_PASSWORD` with the password your team will use. Apply to all environments.
4. **Redeploy.** *Deployments* → open the ⋯ menu on the latest deployment → *Redeploy*. On first start the app creates the tables and loads the five starter brands.
5. Open the site, enter the password, add yourself as the first team member (you become the owner).

Every push to GitHub now gets its own preview link on the pull request, and merging to the main branch updates the live site.

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
