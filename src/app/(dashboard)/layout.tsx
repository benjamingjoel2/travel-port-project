import { getDbMode } from "@/db";
import { isPasswordRequired, requireActor } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { MemberMenu } from "@/components/member-menu";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const mode = getDbMode();

  return (
    <div className="min-h-screen">
      <AppSidebar footer={<MemberMenu actor={actor} passwordRequired={isPasswordRequired()} />} />
      <div className="md:pl-56">
        {mode === "demo" && (
          <div className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-xs">
            <strong>Demo mode.</strong> No database is connected yet, so changes are not saved and sample data resets. See the README for the two-minute fix.
          </div>
        )}
        {mode === "local" && (
          <div className="border-b bg-muted/60 px-4 py-1.5 text-center text-xs text-muted-foreground">Local development database (./.pglite)</div>
        )}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
