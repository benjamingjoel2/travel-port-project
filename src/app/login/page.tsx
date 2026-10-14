import { redirect } from "next/navigation";
import { isPasswordMissing, isPasswordRequired } from "@/lib/auth/session-core";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Build Tracker" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  if (isPasswordMissing()) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">One more setup step</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The database is connected, but no team password has been set, so the tracker is locked until one exists.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>Open your project on Vercel and go to <strong>Settings → Environment Variables</strong>.</li>
          <li>
            Add <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DASHBOARD_PASSWORD</code> with the password your team will use.
          </li>
          <li>Go to <strong>Deployments</strong> and click <strong>Redeploy</strong> on the latest one.</li>
        </ol>
      </Shell>
    );
  }

  if (!isPasswordRequired()) redirect("/");

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Build Tracker</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the team password to continue.</p>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </main>
  );
}
