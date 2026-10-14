"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { createAndChooseMember } from "./actions";

export function NewMemberForm({ showRole }: { showRole: boolean }) {
  const [state, action, pending] = useActionState(createAndChooseMember, undefined);
  return (
    <form action={action} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={80} placeholder="Ben" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" placeholder="you@company.com" />
        </div>
      </div>
      {showRole && (
        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <Select name="role" defaultValue="editor">
            <SelectTrigger id="role">
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
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
