import { CompassIcon } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberLogins, teamMembers } from "@/db/schema";
import { isSessionSecretMissing } from "@/lib/auth/session-core";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Build Tracker" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  if (isSessionSecretMissing()) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">One more setup step</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The database is connected, but no session secret has been set, so the tracker is locked until one exists.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>Open your project on Vercel and go to <strong>Settings → Environment Variables</strong>.</li>
          <li>
            Add <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">SESSION_SECRET</code> set to a long random string.
          </li>
          <li>Go to <strong>Deployments</strong> and click <strong>Redeploy</strong> on the latest one.</li>
        </ol>
      </Shell>
    );
  }

  const db = await getDb();
  const people = await db
    .select({ id: teamMembers.id, name: teamMembers.name })
    .from(teamMembers)
    .innerJoin(memberLogins, eq(memberLogins.memberId, teamMembers.id))
    .where(eq(teamMembers.active, true))
    .orderBy(asc(teamMembers.name));

  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CompassIcon className="size-5" />
        </span>
        <div className="mt-4 text-[11px] font-medium tracking-[0.16em] text-terra uppercase">Travel portfolio</div>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">Build Tracker</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick your name and enter your password.</p>
      </div>
      <LoginForm people={people} next={typeof next === "string" ? next : undefined} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-[0_1px_2px_rgb(60_40_20/0.04),0_20px_48px_-24px_rgb(60_40_20/0.25)]">{children}</div>
    </main>
  );
}
