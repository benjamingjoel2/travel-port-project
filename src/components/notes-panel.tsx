"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, MessageSquareReplyIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import type { Note, NoteReply, TeamMember } from "@/db/schema";
import { addNote, addReply, deleteNote, deleteReply, setNoteDone, updateNote, updateReply } from "@/lib/actions/notes";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Person = Pick<TeamMember, "id" | "name">;
type ReplyWithAuthor = NoteReply & { author: Person | null };
export type NoteWithPeople = Note & { author: Person | null; doneBy: Person | null; replies: ReplyWithAuthor[] };

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Comments on a brand: anyone can post, edit their own (owners can edit any), and mark them done. */
export function NotesPanel({ brandId, notes, editable, actorId, isOwner }: { brandId: string; notes: NoteWithPeople[]; editable: boolean; actorId?: string; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [showDone, setShowDone] = useState(false);
  const open = notes.filter((n) => !n.doneAt);
  const done = notes.filter((n) => n.doneAt);

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
            aria-label="New comment"
            placeholder="Leave a comment for the team, e.g. “Hero photo looks stretched on mobile, can you swap it?”"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) submit();
            }}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
              Post comment
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to post</span>
          </div>
        </div>
      )}
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {notes.length > 0 && open.length === 0 && <p className="text-sm text-muted-foreground">All comments are done.</p>}
      <ul className="space-y-3">
        {open.map((n) => (
          <CommentItem key={n.id} note={n} editable={editable} canChange={n.authorId === actorId || isOwner} actorId={actorId} isOwner={isOwner} />
        ))}
      </ul>
      {done.length > 0 && (
        <div>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} {done.length} done comment{done.length === 1 ? "" : "s"}
          </button>
          {showDone && (
            <ul className="mt-3 space-y-3">
              {done.map((n) => (
                <CommentItem key={n.id} note={n} editable={editable} canChange={n.authorId === actorId || isOwner} actorId={actorId} isOwner={isOwner} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type Result = { ok: true } | { ok: false; error: string };

function CommentItem({ note, editable, canChange, actorId, isOwner }: { note: NoteWithPeople; editable: boolean; canChange: boolean; actorId?: string; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const isDone = Boolean(note.doneAt);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) after?.();
      else toast.error(res.error);
    });

  return (
    <li id={`comment-${note.id}`} className={cn("rounded-md border p-3 text-sm target:ring-2 target:ring-ring", isDone && "bg-muted/40")}>
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">{initials(note.author?.name ?? "?")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{note.author?.name ?? "Someone"}</span>
            <span title={formatDate(note.createdAt)}>{timeAgo(note.createdAt)}</span>
            {note.editedAt && <span title={`Edited ${formatDate(note.editedAt)}`}>· edited</span>}
            {isDone && (
              <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 font-medium text-success">
                <CheckIcon className="size-3" /> Done{note.doneBy ? ` by ${note.doneBy.name.split(" ")[0]}` : ""}
              </span>
            )}
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus aria-label="Edit comment" />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending || !draft.trim()} onClick={() => run(() => updateNote(note.id, draft), () => setEditing(false))}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(note.body);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className={cn("mt-1 whitespace-pre-wrap", isDone && "text-muted-foreground")}>{note.body}</p>
          )}
          {editable && !editing && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="xs" variant="outline" disabled={pending} onClick={() => setReplying(true)}>
                <MessageSquareReplyIcon /> Reply
              </Button>
              <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setNoteDone(note.id, !isDone))}>
                {isDone ? <RotateCcwIcon /> : <CheckIcon />} {isDone ? "Reopen" : "Mark done"}
              </Button>
              {canChange && (
                <>
                  <Button size="xs" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
                    <PencilIcon /> Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="hover:text-destructive"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("Delete this comment?")) run(() => deleteNote(note.id));
                    }}
                  >
                    <Trash2Icon /> Delete
                  </Button>
                </>
              )}
            </div>
          )}
          {note.replies.length > 0 && (
            <ul className="mt-3 space-y-2 border-l-2 pl-3">
              {note.replies.map((r) => (
                <ReplyItem key={r.id} reply={r} editable={editable} canChange={r.authorId === actorId || isOwner} />
              ))}
            </ul>
          )}
          {replying && (
            <div className="mt-3 space-y-2 border-l-2 pl-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                autoFocus
                aria-label="Write a reply"
                placeholder={`Reply to ${note.author?.name.split(" ")[0] ?? "this comment"}…`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) run(() => addReply(note.id, reply), () => setReply(""));
                  if (e.key === "Escape") setReplying(false);
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending || !reply.trim()} onClick={() => run(() => addReply(note.id, reply), () => setReply(""))}>
                  Post reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReply("");
                    setReplying(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ReplyItem({ reply, editable, canChange }: { reply: ReplyWithAuthor; editable: boolean; canChange: boolean }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) after?.();
      else toast.error(res.error);
    });

  return (
    <li id={`reply-${reply.id}`} className="flex items-start gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">{initials(reply.author?.name ?? "?")}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{reply.author?.name ?? "Someone"}</span>
          <span title={formatDate(reply.createdAt)}>{timeAgo(reply.createdAt)}</span>
          {reply.editedAt && <span title={`Edited ${formatDate(reply.editedAt)}`}>· edited</span>}
          {editable && canChange && !editing && (
            <span className="ml-auto flex gap-2">
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => setEditing(true)} disabled={pending}>
                Edit
              </button>
              <button
                type="button"
                className="hover:text-destructive hover:underline"
                disabled={pending}
                onClick={() => {
                  if (confirm("Delete this reply?")) run(() => deleteReply(reply.id));
                }}
              >
                Delete
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus aria-label="Edit reply" />
            <div className="flex gap-2">
              <Button size="xs" disabled={pending || !draft.trim()} onClick={() => run(() => updateReply(reply.id, draft), () => setEditing(false))}>
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(reply.body);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap">{reply.body}</p>
        )}
      </div>
    </li>
  );
}
