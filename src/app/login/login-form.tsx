"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { loginAction } from "./actions";

export function LoginForm({ people, next }: { people: { id: string; name: string }[]; next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [memberId, setMemberId] = useState(people.length === 1 ? people[0].id : "");
  const password = useRef<HTMLInputElement>(null);
  const chosen = people.find((p) => p.id === memberId);
  return (
    <form action={action} className="mt-5 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {/* The choice lives in state + a hidden field: React resets radios after a failed sign-in. */}
      <input type="hidden" name="memberId" value={memberId} />
      <div role="radiogroup" aria-labelledby="who-label" className="space-y-2">
        <div id="who-label" className="mb-2 text-sm font-medium">
          Who are you?
        </div>
        <div className="grid grid-cols-2 gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={memberId === p.id}
              onClick={() => {
                setMemberId(p.id);
                setTimeout(() => password.current?.focus(), 0);
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                memberId === p.id && "border-terra bg-accent ring-2 ring-terra/60",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-sm">
                {p.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{chosen ? `${chosen.name.split(" ")[0]}'s password` : "Password"}</Label>
        <Input ref={password} id="password" name="password" type="password" autoComplete="current-password" required disabled={!memberId} aria-invalid={Boolean(state?.error)} />
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending || !memberId}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
