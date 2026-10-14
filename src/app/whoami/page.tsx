import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teamMembers } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { chooseMember } from "./actions";
import { NewMemberForm } from "./new-member-form";

export const metadata = { title: "Who are you? · Build Tracker" };
export const dynamic = "force-dynamic";

export default async function WhoAmIPage() {
  const db = await getDb();
  const members = await db.query.teamMembers.findMany({ where: eq(teamMembers.active, true), orderBy: [asc(teamMembers.name)] });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Who are you?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick your name so the activity log shows who changed what. You can switch later from the menu in the sidebar.
        </p>

        {members.length > 0 && (
          <div className="mt-5 space-y-2">
            {members.map((m) => (
              <form key={m.id} action={chooseMember}>
                <input type="hidden" name="memberId" value={m.id} />
                <Button type="submit" variant="outline" className="w-full justify-between">
                  <span>{m.name}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                </Button>
              </form>
            ))}
          </div>
        )}

        <div className="mt-6 border-t pt-5">
          <h2 className="text-sm font-medium">{members.length ? "Not in the list? Add yourself" : "Add the first team member"}</h2>
          {members.length === 0 && <p className="mt-1 text-xs text-muted-foreground">The first person becomes the owner and can manage the team in Settings.</p>}
          <NewMemberForm showRole={members.length > 0} />
        </div>
      </div>
    </main>
  );
}
