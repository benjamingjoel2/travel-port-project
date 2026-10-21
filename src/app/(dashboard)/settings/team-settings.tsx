"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import type { MemberRole, TeamMember } from "@/db/schema";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMember, updateMember } from "./actions";

export function TeamSettings({ members, canManage, selfId }: { members: TeamMember[]; canManage: boolean; selfId: string }) {
  const [state, action, pending] = useActionState(addMember, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Member added");
    }
  }, [state]);

  const change = (id: string, patch: { role?: MemberRole; active?: boolean }) =>
    start(async () => {
      const res = await updateMember(id, patch);
      if (!res.ok) toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Owners manage settings and the team. Editors change brands. Viewers only look.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className={m.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                  {m.name} {m.id === selfId && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email ?? "no email"}</div>
              </div>
              {canManage ? (
                <>
                  <Select value={m.role} onValueChange={(v) => change(m.id, { role: v as MemberRole })} disabled={m.id === selfId}>
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" disabled={m.id === selfId} onClick={() => change(m.id, { active: !m.active })}>
                    {m.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <form ref={formRef} action={action} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Name</Label>
              <Input id="m-name" name="name" required placeholder="New member" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-email">Email</Label>
              <Input id="m-email" name="email" type="email" placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-role">Role</Label>
              <Select name="role" defaultValue="editor">
                <SelectTrigger id="m-role" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
            {state?.error && <p className="text-xs text-destructive sm:col-span-4">{state.error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
