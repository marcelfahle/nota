"use client";

import { Copy, ExternalLink, MailPlus, Trash2, UserRoundMinus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  inviteMember,
  removeMember,
  revokeInvite,
  updateMemberRole,
  type InviteMemberState,
} from "@/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuthenticatedRole } from "@/lib/auth";
import { isAppLocale, toIntlLocale } from "@/lib/i18n";

type Member = {
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  role: AuthenticatedRole;
  userId: string;
};

type PendingInvite = {
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  inviteUrl: string;
  role: AuthenticatedRole;
};

type ActionFeedback = {
  error?: string;
  success?: string;
} | null;

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function FeedbackBanner({ feedback }: { feedback: ActionFeedback }) {
  if (!feedback?.error && !feedback?.success) {
    return null;
  }

  const tone = feedback.error
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`} data-testid="team-feedback">
      {feedback.error ?? feedback.success}
    </div>
  );
}

export function TeamSettings({
  currentUserId,
  members,
  organizationName,
  pendingInvites,
}: {
  currentUserId: string;
  members: Array<Member>;
  organizationName: string;
  pendingInvites: Array<PendingInvite>;
}) {
  const t = useTranslations("settings.team");
  const tRoles = useTranslations("common.roles");
  const appLocale = useLocale();
  const locale = toIntlLocale(isAppLocale(appLocale) ? appLocale : "en");
  const [feedback, setFeedback] = useState<ActionFeedback>(null);
  const [inviteState, inviteAction, invitePending] = useActionState<InviteMemberState, FormData>(
    inviteMember,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!inviteState?.success) {
      return;
    }

    formRef.current?.reset();
    router.refresh();
  }, [inviteState?.success, router]);

  async function handleCopyInvite(inviteUrl: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setFeedback({ success: t("inviteLinkCopied") });
    } catch {
      setFeedback({ error: t("clipboardUnavailable") });
    }
  }

  async function handleRemoveMember(memberId: string) {
    setFeedback(null);
    const result = await removeMember(memberId);
    if (result?.error) {
      setFeedback({ error: result.error });
      return;
    }

    setFeedback({ success: t("memberRemoved") });
    router.refresh();
  }

  async function handleRevokeInvite(inviteId: string) {
    setFeedback(null);
    const result = await revokeInvite(inviteId);
    if (result?.error) {
      setFeedback({ error: result.error });
      return;
    }

    setFeedback({ success: t("inviteRevoked") });
    router.refresh();
  }

  return (
    <Card data-testid="team-settings">
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>{t("description", { org: organizationName })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <FeedbackBanner feedback={feedback} />
        {inviteState?.error ? <FeedbackBanner feedback={{ error: inviteState.error }} /> : null}
        {inviteState?.success ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <p>{inviteState.warning ?? t("inviteSent")}.</p>
            {inviteState.inviteUrl ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  data-testid="team-copy-latest-invite"
                  onClick={() => void handleCopyInvite(inviteState.inviteUrl!)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Copy className="size-4" />
                  {t("copyInviteLink")}
                </Button>
                <a href={inviteState.inviteUrl} rel="noreferrer" target="_blank">
                  <Button size="sm" type="button" variant="outline">
                    <ExternalLink className="size-4" />
                    {t("openInvite")}
                  </Button>
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">{t("inviteHeading")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("inviteHint")}</p>
          </div>

          <form
            action={inviteAction}
            className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]"
            data-testid="team-invite-form"
            ref={formRef}
          >
            <div className="space-y-2">
              <Label htmlFor="teamInviteEmail">{t("email")}</Label>
              <Input
                data-testid="team-invite-email"
                id="teamInviteEmail"
                name="email"
                placeholder={t("emailPlaceholder")}
                required
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamInviteRole">{t("role")}</Label>
              <Select defaultValue="member" name="role">
                <SelectTrigger
                  className="w-full"
                  data-testid="team-invite-role"
                  id="teamInviteRole"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{tRoles("member")}</SelectItem>
                  <SelectItem value="admin">{tRoles("admin")}</SelectItem>
                  <SelectItem value="owner">{tRoles("owner")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button data-testid="team-invite-submit" disabled={invitePending} type="submit">
                <MailPlus className="size-4" />
                {invitePending ? t("creating") : t("createInvite")}
              </Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">{t("membersHeading")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("membersHint")}</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <Table data-testid="team-members-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.member")}</TableHead>
                  <TableHead>{t("columns.role")}</TableHead>
                  <TableHead>{t("columns.joined")}</TableHead>
                  <TableHead className="text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow data-testid={`team-member-row-${member.id}`} key={member.id}>
                    <TableCell className="align-top">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-950">{member.name}</span>
                          {member.userId === currentUserId ? (
                            <Badge variant="outline">{t("you")}</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-sm text-zinc-500">{member.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <MemberRoleControl
                        memberId={member.id}
                        onError={(error) => setFeedback({ error })}
                        onSuccess={() => {
                          setFeedback({ success: t("roleUpdated") });
                          router.refresh();
                        }}
                        role={member.role}
                      />
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(member.createdAt, locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        data-testid={`team-remove-member-${member.id}`}
                        onClick={() => void handleRemoveMember(member.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <UserRoundMinus className="size-4" />
                        {t("remove")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">{t("pendingHeading")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("pendingHint")}</p>
          </div>

          {pendingInvites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-sm text-zinc-500">
              {t("noPending")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <Table data-testid="team-pending-invites-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.email")}</TableHead>
                    <TableHead>{t("columns.role")}</TableHead>
                    <TableHead>{t("columns.expires")}</TableHead>
                    <TableHead className="text-right">{t("columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow data-testid={`team-invite-row-${invite.id}`} key={invite.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-zinc-950">{invite.email}</p>
                          <p className="text-sm text-zinc-500">
                            {t("created", { date: formatDate(invite.createdAt, locale) })}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tRoles(invite.role)}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {formatDate(invite.expiresAt, locale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            data-testid={`team-copy-invite-${invite.id}`}
                            onClick={() => void handleCopyInvite(invite.inviteUrl)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Copy className="size-4" />
                            {t("copyLink")}
                          </Button>
                          <a
                            data-testid={`team-open-invite-${invite.id}`}
                            href={invite.inviteUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <Button size="sm" type="button" variant="outline">
                              <ExternalLink className="size-4" />
                              {t("open")}
                            </Button>
                          </a>
                          <Button
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid={`team-revoke-invite-${invite.id}`}
                            onClick={() => void handleRevokeInvite(invite.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="size-4" />
                            {t("revoke")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function MemberRoleControl({
  memberId,
  onError,
  onSuccess,
  role,
}: {
  memberId: string;
  onError: (error: string) => void;
  onSuccess: () => void;
  role: AuthenticatedRole;
}) {
  const tRoles = useTranslations("common.roles");
  const [value, setValue] = useState<AuthenticatedRole>(role);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValue(role);
  }, [role]);

  async function handleValueChange(nextRole: string) {
    const normalizedRole = nextRole as AuthenticatedRole;
    if (normalizedRole === value) {
      return;
    }

    const previousRole = value;
    setValue(normalizedRole);
    setPending(true);

    const result = await updateMemberRole(memberId, normalizedRole);
    if (result?.error) {
      setValue(previousRole);
      onError(result.error);
      setPending(false);
      return;
    }

    setPending(false);
    onSuccess();
  }

  return (
    <Select
      disabled={pending}
      onValueChange={(value) => void handleValueChange(value)}
      value={value}
    >
      <SelectTrigger className="w-32" data-testid={`team-member-role-${memberId}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">{tRoles("member")}</SelectItem>
        <SelectItem value="admin">{tRoles("admin")}</SelectItem>
        <SelectItem value="owner">{tRoles("owner")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
