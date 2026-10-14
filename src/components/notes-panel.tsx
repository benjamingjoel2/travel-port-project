"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Note, TeamMember } from "@/db/schema";
import { addNote, deleteNote } from "@/lib/actions/notes";
import { formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type NoteWithAuthor = Note & { author: TeamMember | null };

export function NotesPanel({ brandId, notes, editable, actorId, isOwner }: { brandId: string; notes: NoteWithAuthor[]; editable: boolean; actorId?: string; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");

  const submit = () =>
    start(async () => {
      const res = await addNote(brandId, body);
      if (res.ok) setBody("");
      else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      {editable && (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="e.g. Claude Code got stuck on the planner, fixed by splitting the routes into a separate file."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) submit();
            }}
          />
          <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
            Add note
          </Button>
        </div>
      )}
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border p-3 text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{n.author?.name ?? "Someone"}</span>
              <span title={formatDate(n.createdAt)}>· {timeAgo(n.createdAt)}</span>
              {editable && (n.authorId === actorId || isOwner) && (
                <button
                  type="button"
                  className="ml-auto hover:text-destructive hover:underline"
                  onClick={() =>
                    start(async () => {
                      if (!confirm("Delete this note?")) return;
                      const res = await deleteNote(n.id);
                      if (!res.ok) toast.error(res.error);
                    })
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
