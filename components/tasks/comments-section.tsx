"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useComments } from "@/lib/hooks/use-tasks";
import { canComment, canDeleteComment, canEditComment } from "@/lib/permissions";
import { addComment, deleteComment, editComment } from "@/lib/services/comments";
import { attempt, notifyError } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { Comment, Sprint, Task } from "@/types";

export function CommentsSection({ task, sprint }: { task: Task; sprint: Sprint | undefined }) {
  const { actor } = useCurrentUser();
  const { userById } = useData();
  const { data: comments, loading } = useComments(task.id);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [toDelete, setToDelete] = useState<Comment | null>(null);

  const allowed = canComment(actor, sprint);

  // Optimistic: Firestore shows the comment from its local cache immediately, so clear the box
  // right away and only restore the text if the server rejects the write (offline writes just queue).
  const post = () => {
    const text = body;
    if (!text.trim()) return;
    setBody("");
    addComment(task.id, text, actor.uid).catch((err) => {
      setBody((current) => current || text);
      notifyError(err, "Couldn't post comment");
    });
  };

  return (
    <div className="grid gap-3">
      {loading ? (
        <Skeleton className="h-16" />
      ) : comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" /> No comments yet.
        </p>
      ) : (
        <ul className="grid gap-3">
          {comments.map((c) => {
            const author = userById.get(c.authorId);
            const isEditing = editingId === c.id;
            return (
              <li key={c.id} className="group flex gap-2">
                <UserAvatar id={c.authorId} initials={author?.initials ?? "?"} name={author?.name} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{author?.name ?? "Unknown user"}</span>
                    <span className="text-muted-foreground">
                      {c.createdAt ? formatDistanceToNow(c.createdAt.toDate(), { addSuffix: true }) : "just now"}
                      {c.editedAt && " (edited)"}
                    </span>
                    <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      {canEditComment(actor, c, sprint) && !isEditing && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Edit comment"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditBody(c.body);
                          }}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {canDeleteComment(actor, c, sprint) && (
                        <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={() => setToDelete(c)}>
                          <Trash2 />
                        </Button>
                      )}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="mt-1 grid gap-2">
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        autoFocus
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!editBody.trim()}
                          onClick={async () => {
                            const ok = await attempt(() => editComment(task.id, c.id, editBody), "Couldn't save comment");
                            if (ok) setEditingId(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {allowed && (
        <div className="grid gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment… (Ctrl/Cmd+Enter to post)"
            rows={3}
            aria-label="New comment"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                post();
              }
            }}
          />
          <div>
            <Button size="sm" onClick={post} disabled={!body.trim()}>
              Comment
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete comment?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (toDelete) await attempt(() => deleteComment(task.id, toDelete.id), "Couldn't delete comment");
        }}
      />
    </div>
  );
}
