# Build Tracker

Private internal dashboard for the travel brand portfolio: where each of the ~100 brand sites is in the pipeline, what's blocking it, what's left before launch, and the prompt each site was built from. Built on the same stack as TravelPorts so it can be folded in later.

## What's built so far

| Phase | Status | What it covers |
| --- | --- | --- |
| 1. Foundation | **Done** | Database, team login, brands table, brand create/edit, brand detail with build phases, activity log, team settings |
| 2. Overview + pipeline board | **Done** | World map shaded by stage, kanban board with drag-and-drop (Live gated by the checklist) |
| 3. Checklist, notes, blockers | **Done** | Tick checklist items, add notes and blockers, edit the checklist template |
| 4. Prompts | Next | Prompt versions, diffs, templates, generator |
| 5. CSV import/export, bulk edit | Planned | |
| 6. Integrations | Planned | Vercel, GitHub, uptime, PageSpeed (each optional) |

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- Postgres via Drizzle ORM. Schema lives in `src/db/schema.ts`, SQL migrations in `drizzle/`
- Zod for validation, Radix UI primitives for components
- Login: each person has their own login. The sign-in page shows everyone who has one (today Benjamin and Sevo Widodo); you pick your name and type your password. Passwords are stored only as scrypt hashes in the `member_logins` table. Team members without a login (added in Settings) appear in owner dropdowns but cannot sign in.
- Never indexed: login required, `robots.txt` disallows everything, every response carries `X-Robots-Tag: noindex`

## Hosting (Vercel)

The app is deployed from this repository to the Vercel project **build-tracker** on the "Benjamin - Sevo" team: https://build-tracker-benjamin-sevo.vercel.app. Every push to GitHub deploys automatically.

Two one-time settings live in the Vercel project, not in this repo:

1. **Database.** Project → *Storage* → *Create Database* → **Neon** → connect to build-tracker. This adds `DATABASE_URL` (the app also accepts `POSTGRES_URL`). Until it exists the app runs in **demo mode** (sample data, nothing saved). After adding it, *Deployments → Redeploy*. On first start the app creates its tables and loads the five starter brands.
2. **Session secret.** Project → *Settings → Environment Variables* → `SESSION_SECRET` (a long random string) signs the login cookie. Without it (or the older `DASHBOARD_PASSWORD`) the tracker stays locked. Changing it signs everyone out.

Vercel's own login screen (*Settings → Deployment Protection → Vercel Authentication*) is **off**, so anyone with the link reaches the tracker's sign-in page without a Vercel account. The tracker's own passwords protect the data.

## Auto-sync with Vercel and GitHub

The tracker finds brands on its own. Every Vercel project on the team and every GitHub repo on the account is checked:

- **Already a brand?** Links (repo, Vercel project, staging URL, custom domain) are filled in where empty, and the latest deploy and commit message show on the brand page. Brands still at Idea, Named or Prompt ready move to **Building** once build activity appears. Sync never moves a brand further than that and never overwrites what someone typed.
- **New and the country is clear?** It's added as a brand at Building. The country comes from the repo or project name (`costa-rica`, `bhutan`), or from the repo's README and CLAUDE.md when one country clearly dominates (Escale Voyages → Benin).
- **Country unclear?** It waits in *Settings → Auto-sync → Needs a country*, where you pick a country or ignore it.

It runs in the background every minute while someone has the tracker open (open pages also refresh themselves), nightly via Vercel Cron, and on demand with *Sync now*. On Vercel's Hobby plan cron can only run once a day, so with nobody on the site new projects appear by the next morning at the latest.

Settings it reads (Vercel project → Settings → Environment Variables):

| Variable | Needed | What it is |
| --- | --- | --- |
| `VERCEL_TOKEN` | yes | Vercel access token (vercel.com → Account Settings → Tokens), scoped to the team |
| `VERCEL_TEAM_ID` | yes | The team id, e.g. `team_…` |
| `GITHUB_OWNER` | optional | GitHub account to scan for repos without a Vercel project. Defaults to the owner of the linked repos |
| `GITHUB_TOKEN` | optional | GitHub token (read-only). Adds private repos and avoids GitHub's anonymous rate limit |
| `CRON_SECRET` | yes, for the nightly run | Any long random string; Vercel Cron sends it automatically |

## Running locally

```bash
npm install
npm run dev
```

With no `DATABASE_URL` the app uses an embedded Postgres saved to `./.pglite`, so no setup is needed. Copy `.env.example` to `.env.local` to point at a real database.

Checks: `npm run check` runs lint, typecheck and unit tests. `npm run build` does a production build.

## How the data is organised

Everything hangs off **brands**. Each brand has 5 **build phases** and a copy of the **launch checklist** (both created automatically), plus **prompts** (every version kept), **notes**, **blockers** and an **activity log**. Pipeline **stages**, **regions** and the **checklist template** are tables, not hard-coded, so they can be edited in Settings.

Every brand has a **brand type**:

- **Country**: one country (Nusa & Co. → Indonesia). Its *markets covered* is that country.
- **Region**: several countries under one brand (Aravia → Arab world: UAE, Saudi Arabia, Oman, Qatar, Jordan, Bahrain, Egypt). Each market is shaded on the world map.
- **Niche**: built around an activity rather than a place (for example scuba diving). *Markets covered* lists the activity. Niche brands don't appear on the map.

**Map (home page)**: signing in opens a full-screen globe. Countries are blue by status (Live, In progress, Planned) or by pipeline stage; drag to spin, scroll or pinch to zoom, and search a country or brand to fly to it. The menu at the top right opens every other page; the old dashboard is at `/overview`.

You can filter by type on the Brands table and the Pipeline board. The Overview shows the count per type. Auto-sync adds new projects as Country brands; switch the type on the brand's Edit page or when reviewing an unclear project in Settings.

**Comments** (stored in the `notes` table): anyone signed in can comment on a brand from its *Comments & blockers* tab. The author or an owner can edit or delete a comment, and anyone can mark it done (or reopen it). Each comment has a **reply** thread (`note_replies` table); replies can be edited or deleted the same way and notify the other person through the bell. Open comments show on the Overview, as a count on the Brands table and Pipeline cards, and in the brand's activity log.

**Notifications**: the bell next to *Build Tracker* in the sidebar shows what the other person did (comments, done/reopened, blockers, stage changes) plus projects auto-sync found. Your own actions never notify you. The red number is what's new since you last opened the bell; opening it marks everything read (stored per person in `team_members.notifications_seen_at`).

**Countries** (`/countries`): brands against the goal of 100, countries covered (own brand or a region brand's markets) and live, a map with planned countries shaded pink, the *Work on next* plan (`planned_countries` table: wave, why, status Up next / Not started / Skipped; a country shows its brand's stage automatically once a country brand for it exists), and every covered country with the brands behind it.

Two flags on a stage drive the rules: `counts_as_live` feeds the "N / 100 live" number (Live and Migrated), and `requires_checklist` stops a brand entering that stage until every required checklist item is ticked.

Roles: **owner** manages the team and settings, **editor** changes brands, **viewer** only looks.

## Changing the database schema

Edit `src/db/schema.ts`, run `npm run db:generate` to produce a new SQL file in `drizzle/`, commit both. Migrations run automatically on the next deploy.
