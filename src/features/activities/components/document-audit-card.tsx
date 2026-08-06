"use client";

import { PenLine, UserRound } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date";
import type { Activity } from "@/features/activities/types";

/**
 * Who touched this document, and when.
 *
 * Derived from the activities the detail page already loads rather than
 * from a query of its own — every mutation writes one, so the newest is
 * the last edit and the 'create' is the first. No round trip, and it
 * cannot disagree with the timeline shown beside it.
 *
 * Two known limits, both stated rather than hidden:
 *
 *  - The pages load the 50 most recent activities. On a document with
 *    more than that, the 'create' entry has fallen off the end, so the
 *    created line falls back to the row's own created_at and shows no
 *    name. The date is still right; only the person is unknown.
 *
 *  - Documents imported by migration (00095, 00100) have no activities
 *    at all. They show their creation date and "Imported", which is the
 *    truth — nobody edited them in the app.
 */

/**
 * There are two action vocabularies in the schema, and a document's
 * history can contain both. Functions that INSERT into activities
 * directly write 'create' / 'update' / 'delete'; those going through
 * log_activity write 'created' / 'updated' / 'duplicated' /
 * 'status_change' / 'invoice_generated' / 'versioned' /
 * 'fulfillment_recorded' / 'viewed' and more.
 *
 * So this does not list what counts as an edit — that list was wrong the
 * moment it was written and would rot again. It lists what does not: a
 * document being created, and somebody merely looking at it through the
 * portal. Everything else is a change to the document, including action
 * names added after this was written.
 */
const CREATE_ACTIONS = new Set(["create", "created"]);
const NOT_AN_EDIT = new Set([...CREATE_ACTIONS, "viewed", "view"]);

type DocumentAuditCardProps = {
  activities: Activity[];
  /** The document row's own created_at, as the fallback for the first line. */
  createdAt: string;
};

function actorName(activity: Activity | undefined): string | null {
  const name = activity?.actor?.full_name?.trim();
  return name && name.length > 0 ? name : null;
}

export function DocumentAuditCard({
  activities,
  createdAt,
}: DocumentAuditCardProps) {
  // The queries all order newest first; not relying on that, since a
  // caller passing them the other way round would silently invert this.
  const sorted = [...activities].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
  );

  // Oldest create wins: a document generated from another carries the
  // source's history too, and the first entry is the one that made it.
  const created = sorted.filter((a) => CREATE_ACTIONS.has(a.action)).at(-1);
  const lastEdit = sorted.find((a) => !NOT_AN_EDIT.has(a.action));

  const createdName = actorName(created);
  const editName = actorName(lastEdit);

  return (
    <div className="rounded-lg border bg-muted/30 px-3.5 py-3 text-[13px]">
      <div className="flex items-start gap-2.5">
        <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="text-muted-foreground">Created </span>
          {createdName ? (
            <>
              by <span className="font-medium">{createdName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {activities.length === 0 ? "on import" : ""}
            </span>
          )}
          <div className="text-muted-foreground">
            {formatDateTime(created?.created_at ?? createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 border-t pt-3">
        <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          {lastEdit ? (
            <>
              <span className="text-muted-foreground">Last edited </span>
              {editName ? (
                <>
                  by <span className="font-medium">{editName}</span>
                </>
              ) : null}
              <div className="text-muted-foreground">
                {formatDateTime(lastEdit.created_at)}
              </div>
              {/* What the edit was, in the words the activity itself used
                  — a name and a time without the change is half an
                  answer. */}
              <div className="mt-0.5 truncate text-muted-foreground/80">
                {lastEdit.description}
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">
              No edits since it was created
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
