"use client";

import { useState, useTransition } from "react";

import { approveProposalAction } from "@/actions/proposals";
import { Button } from "@/components/ui/button";

export function HomeProposal({ children, id }: { children: React.ReactNode; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border/50 px-1 py-4">
      <p className="min-w-0 flex-[1_1_21rem] text-[15.5px]">{children}</p>
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await approveProposalAction(id);
            if (result.error) {
              setError(result.error);
            }
          });
        }}
        type="button"
      >
        {pending ? "Sending…" : "Send reminder"}
      </Button>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
