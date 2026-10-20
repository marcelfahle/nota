"use client";

import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { createApiKeyAction, deleteApiKeyAction, type CreateApiKeyState } from "@/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAppLocale, toIntlLocale } from "@/lib/i18n";

type ApiKeyListItem = {
  createdAt: Date;
  id: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  name: string;
};

type Feedback = {
  error?: string;
  success?: string;
} | null;

function formatDate(value: Date | null, locale: string, never: string) {
  if (!value) {
    return never;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback?.error && !feedback?.success) {
    return null;
  }

  const tone = feedback.error
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {feedback.error ?? feedback.success}
    </div>
  );
}

export function ApiKeysSettings({ apiKeys }: { apiKeys: Array<ApiKeyListItem> }) {
  const t = useTranslations("settings.apiKeys");
  const appLocale = useLocale();
  const locale = toIntlLocale(isAppLocale(appLocale) ? appLocale : "en");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [createState, createAction, createPending] = useActionState<CreateApiKeyState, FormData>(
    createApiKeyAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!createState?.success) {
      return;
    }

    formRef.current?.reset();
    router.refresh();
  }, [createState?.success, router]);

  async function copyKey(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ success: successMessage });
    } catch {
      setFeedback({ error: t("clipboardUnavailable") });
    }
  }

  async function handleDelete(apiKeyId: string) {
    setFeedback(null);
    const result = await deleteApiKeyAction(apiKeyId);
    if (result?.error) {
      setFeedback({ error: result.error });
      return;
    }

    setFeedback({ success: t("deleted") });
    router.refresh();
  }

  return (
    <Card data-testid="api-keys-settings">
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FeedbackBanner feedback={feedback} />
        {createState?.error ? <FeedbackBanner feedback={{ error: createState.error }} /> : null}
        {createState?.success && createState.key ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <p className="font-medium text-zinc-950">
              {t("ready", { name: createState.keyName ?? "" })}
            </p>
            <p className="mt-1 text-zinc-500">{t("copyNow")}</p>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs break-all text-zinc-950">
              {createState.key}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                data-testid="api-key-copy-created"
                onClick={() => void copyKey(createState.key!, t("copied"))}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-4" />
                {t("copyKey")}
              </Button>
            </div>
          </div>
        ) : null}

        <form
          action={createAction}
          className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto]"
          data-testid="api-keys-form"
          ref={formRef}
        >
          <div className="space-y-2">
            <Label htmlFor="apiKeyName">{t("name")}</Label>
            <Input
              data-testid="api-keys-name"
              id="apiKeyName"
              name="name"
              placeholder={t("namePlaceholder")}
              required
            />
          </div>
          <div className="flex items-end">
            <Button data-testid="api-keys-submit" disabled={createPending} type="submit">
              <KeyRound className="size-4" />
              {createPending ? t("creating") : t("create")}
            </Button>
          </div>
        </form>

        {apiKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-sm text-zinc-500">
            {t("none")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <Table data-testid="api-keys-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead>{t("columns.prefix")}</TableHead>
                  <TableHead>{t("columns.created")}</TableHead>
                  <TableHead>{t("columns.lastUsed")}</TableHead>
                  <TableHead className="text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow data-testid={`api-key-row-${apiKey.id}`} key={apiKey.id}>
                    <TableCell className="font-medium text-zinc-950">{apiKey.name}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {apiKey.keyPrefix}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(apiKey.createdAt, locale, t("never"))}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(apiKey.lastUsedAt, locale, t("never"))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        data-testid={`api-key-delete-${apiKey.id}`}
                        onClick={() => void handleDelete(apiKey.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-4" />
                        {t("delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
