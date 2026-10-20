"use client";

import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { useState, useTransition } from "react";

import { updateBilling } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import type { billingStatus } from "@/lib/billing";
import { FREE_INVOICE_LIMIT } from "@/lib/billing-policy";

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
  const t = useTranslations("settings.billing");
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
        <h2 className="text-lg font-semibold">{t("paymentsHeading")}</h2>
        {status.paymentMode === "bank-transfer" ? (
          <p className="text-sm text-muted-foreground">{t("bankTransferOnly")}</p>
        ) : status.mode === "direct" ? (
          <p className="text-sm text-muted-foreground">{t("directMode")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("connectIntro")}</p>
            <p className="text-sm">
              {status.stripeAccountId
                ? status.chargesEnabled
                  ? t("connectedEnabled")
                  : t("connectedAttention")
                : t("notConnected")}
            </p>
            {status.stripeAccountId && !status.payoutsEnabled ? (
              <p className="text-sm text-muted-foreground">{t("payoutsPending")}</p>
            ) : null}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {!status.chargesEnabled ? (
                  <Button disabled={pending} onClick={() => act("connect")}>
                    {status.stripeAccountId ? t("continueSetup") : t("connect")}
                  </Button>
                ) : null}
                {status.stripeAccountId ? (
                  <>
                    <Button disabled={pending} onClick={() => act("refresh")} variant="outline">
                      {t("refresh")}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() => setConfirmDisconnect(true)}
                      variant="ghost"
                    >
                      {t("disconnect")}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>
            )}
            {confirmDisconnect ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm">{t("disconnectConfirm")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending}
                    onClick={() => act("disconnect")}
                    variant="destructive"
                  >
                    {t("disconnectStripe")}
                  </Button>
                  <Button onClick={() => setConfirmDisconnect(false)} variant="outline">
                    {t("keepConnected")}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">{t("planHeading")}</h2>
        <p className="text-sm">
          {status.deploymentMode === "self-hosted"
            ? t("planSelfHosted")
            : status.plan === "pro"
              ? t("planPro")
              : t("planFree", { limit: FREE_INVOICE_LIMIT, sent: status.sent })}
        </p>
        {status.deploymentMode === "hosted" ? (
          <p className="text-sm text-muted-foreground">{t("pricingNote")}</p>
        ) : null}
        {canManage && status.deploymentMode === "hosted" ? (
          <div className="flex flex-wrap gap-2">
            {status.plan !== "pro" ? (
              <>
                <Button disabled={pending} onClick={() => act("month")}>
                  {t("upgradeMonth")}
                </Button>
                <Button disabled={pending} onClick={() => act("year")} variant="outline">
                  {t("upgradeYear")}
                </Button>
              </>
            ) : null}
            {status.hasBillingAccount ? (
              <Button disabled={pending} onClick={() => act("portal")} variant="outline">
                {t("manageBilling")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
