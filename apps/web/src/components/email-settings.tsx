"use client";

import { useOptimistic, useState, useTransition } from "react";

import { updateEInvoiceDelivery } from "@/actions/settings";
import { attachesXRechnung, type EInvoiceDelivery } from "@/lib/e-invoice-delivery";

export function EmailSettings({
  canManage,
  eInvoiceDelivery,
}: {
  canManage: boolean;
  eInvoiceDelivery: EInvoiceDelivery;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useOptimistic<EInvoiceDelivery>(eInvoiceDelivery);

  return (
    <section aria-labelledby="email-settings-heading" className="space-y-3">
      <h2 className="text-lg font-semibold" id="email-settings-heading">
        Email
      </h2>
      <label className="flex items-start gap-3 text-sm">
        <input
          checked={attachesXRechnung(delivery)}
          className="mt-0.5 size-4 rounded border-zinc-300"
          data-testid="settings-einvoice-delivery"
          disabled={!canManage || pending}
          onChange={(event) => {
            const value: EInvoiceDelivery = event.target.checked ? "pdf_and_xrechnung" : "pdf_only";
            setError("");
            startTransition(async () => {
              setDelivery(value);
              const result = await updateEInvoiceDelivery(value);
              if (result?.error) {
                setError(result.error);
              }
            });
          }}
          type="checkbox"
        />
        <span>
          <span className="font-medium">Attach the XRechnung XML to invoice emails.</span>{" "}
          <span className="text-muted-foreground">
            Business and public-sector customers in Germany can read it into their accounting.
          </span>
        </span>
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
