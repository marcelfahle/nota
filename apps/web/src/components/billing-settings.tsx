"use client";

import posthog from "posthog-js";
import { useState, useTransition } from "react";

import { updateBilling } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import type { billingStatus } from "@/lib/billing";

type Status = Awaited<ReturnType<typeof billingStatus>>;
export function BillingSettings({
  canManage,
  notice,
  status,
}: {
  canManage: boolean;
  notice?: string;
  status: Status;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  function act(action: Parameters<typeof updateBilling>[0]) {
    posthog.capture("billing_action_started", { billing_action: action });
    setError(null);
    startTransition(async () => {
      const result = await updateBilling(action);
      if ("error" in result) {
        setError(result.error);
      } else if ("url" in result) {
        window.location.assign(result.url);
      }
      setConfirmDisconnect(false);
    });
  }
  return (
    <section className="space-y-6 rounded-lg border p-6" id="billing">
      {notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Payments from your clients</h2>
        {status.paymentMode === "bank-transfer" ? (
          <p className="text-sm text-muted-foreground">
            Invoices use your bank details. Stripe payment links are disabled for this installation.
          </p>
        ) : status.mode === "direct" ? (
          <p className="text-sm text-muted-foreground">
            Payments use this installation’s Stripe account.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your Stripe account to accept payment on your invoices. Money goes directly to
              your account. You pay Stripe’s processing fees; Nota adds no fee.
            </p>
            <p className="text-sm">
              {status.stripeAccountId
                ? status.chargesEnabled
                  ? "Stripe connected · Payments enabled"
                  : "Stripe connected · Setup needs attention"
                : "Stripe is not connected. Invoices use your bank details without a Pay button."}
            </p>
            {status.stripeAccountId && !status.payoutsEnabled ? (
              <p className="text-sm text-muted-foreground">
                Stripe has not enabled bank payouts yet. Complete your account details in Stripe.
              </p>
            ) : null}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {!status.chargesEnabled ? (
                  <Button disabled={pending} onClick={() => act("connect")}>
                    {status.stripeAccountId ? "Continue Stripe setup" : "Connect Stripe"}
                  </Button>
                ) : null}
                {status.stripeAccountId ? (
                  <>
                    <Button disabled={pending} onClick={() => act("refresh")} variant="outline">
                      Refresh status
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() => setConfirmDisconnect(true)}
                      variant="ghost"
                    >
                      Disconnect
                    </Button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The workspace owner can manage Stripe.
              </p>
            )}
            {confirmDisconnect ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm">
                  Disconnect Stripe? New invoices will use bank details only. Existing payment links
                  remain in your Stripe account; Nota may no longer receive their payment updates.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending}
                    onClick={() => act("disconnect")}
                    variant="destructive"
                  >
                    Disconnect Stripe
                  </Button>
                  <Button onClick={() => setConfirmDisconnect(false)} variant="outline">
                    Keep connected
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Your Nota plan</h2>
        <p className="text-sm">
          {status.deploymentMode === "self-hosted"
            ? "Self-hosted · Unlimited invoices · Free"
            : status.plan === "pro"
              ? "Nota Pro · Unlimited invoices"
              : `Nota Free · ${status.sent} of 5 invoices sent this month`}
        </p>
        {status.deploymentMode === "hosted" ? (
          <p className="text-sm text-muted-foreground">
            Prices are in USD, plus applicable tax calculated at checkout. Every feature is
            included. Free sends reset on the first day of each month (UTC). Your Nota subscription
            is separate from your clients’ invoice payments.
          </p>
        ) : null}
        {canManage && status.deploymentMode === "hosted" ? (
          <div className="flex flex-wrap gap-2">
            {status.plan !== "pro" ? (
              <>
                <Button disabled={pending} onClick={() => act("month")}>
                  Upgrade · $9/month
                </Button>
                <Button disabled={pending} onClick={() => act("year")} variant="outline">
                  Upgrade · $90/year
                </Button>
              </>
            ) : null}
            {status.hasBillingAccount ? (
              <Button disabled={pending} onClick={() => act("portal")} variant="outline">
                Manage billing
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
