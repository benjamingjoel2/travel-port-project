import Link from "next/link";
import { LogOutIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import type { Actor } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/whoami/actions";

export function MemberMenu({ actor, passwordRequired }: { actor: Actor; passwordRequired: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {actor.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium leading-tight">{actor.name}</div>
          <div className="text-xs text-muted-foreground">{ROLE_LABELS[actor.role]}</div>
        </div>
      </div>
      <Button asChild variant="ghost" size="icon-sm" title="Switch person">
        <Link href="/whoami">
          <UsersIcon />
        </Link>
      </Button>
      <ThemeToggle />
      {passwordRequired && (
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="icon-sm" title="Sign out">
            <LogOutIcon />
          </Button>
        </form>
      )}
      <span className="sr-only">
        <UserRoundIcon />
      </span>
    </div>
  );
}
