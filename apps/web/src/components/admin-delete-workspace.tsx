"use client";

import { useActionState, useState } from "react";

import { deleteWorkspaceAsAdmin, type AdminActionState } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AdminActionState = {};

/** Deleting cannot be undone, so the operator types the workspace's name first. */
export function AdminDeleteWorkspace({
  memberCount,
  name,
  orgId,
}: {
  memberCount: number;
  name: string;
  orgId: string;
}) {
  const [state, action, pending] = useActionState(deleteWorkspaceAsAdmin, initialState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name.trim();

  return (
    <section className="space-y-3" data-testid="admin-delete-workspace">
      <h2 className="text-lg font-semibold">Delete workspace</h2>
      <div className="space-y-4 rounded-md border border-destructive/40 p-4">
        <p className="text-sm text-muted-foreground">
          Removes this workspace for good: its invoices, clients, bank details, invites, API keys
          and chat, and {memberCount === 1 ? "its member’s account" : "its members’ accounts"}{" "}
          unless they also belong to another workspace. There is no undo.
        </p>
        {open ? (
          <form action={action} className="space-y-3">
            <input name="orgId" type="hidden" value={orgId} />
            <label className="block text-sm font-medium" htmlFor="delete-confirmation">
              Type <span className="font-mono">{name}</span> to confirm
            </label>
            <Input
              autoComplete="off"
              autoFocus
              className="max-w-sm"
              data-testid="admin-delete-confirmation"
              id="delete-confirmation"
              name="confirmation"
              onChange={(event) => setTyped(event.target.value)}
              value={typed}
            />
            {state.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                data-testid="admin-delete-submit"
                disabled={!matches || pending}
                type="submit"
                variant="destructive"
              >
                {pending ? "Deleting…" : "Delete this workspace for good"}
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            data-testid="admin-delete-open"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            Delete workspace…
          </Button>
        )}
      </div>
    </section>
  );
}
