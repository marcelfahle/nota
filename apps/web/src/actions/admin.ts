"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { deleteWorkspace } from "@/lib/admin-delete";
import { isAllowedModel, MODEL_FEATURES } from "@/lib/ai-usage";
import { requireSuperAdmin } from "@/lib/auth";
import { auth } from "@/lib/better-auth";
import { db } from "@/lib/db";
import {
  accounts,
  aiModelChanges,
  aiModelSettings,
  aiWorkspaceModelOverrides,
  orgs,
  sessions,
  users,
} from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

export type AdminActionState = { error?: string };

const modelFeature = z.enum(MODEL_FEATURES);

export async function changeTemporaryPassword(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const currentSession = await auth.api.getSession({ headers: await headers() });
  const user = await requireSuperAdmin({ allowPasswordChange: true });
  if (!currentSession || !user.mustChangePassword) {
    redirect("/admin");
  }
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (newPassword.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (newPassword !== confirmation) {
    return { error: "The new passwords do not match." };
  }

  const [account] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!account?.password || !(await verifyPassword(currentPassword, account.password))) {
    return { error: "The temporary password is incorrect." };
  }

  const password = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ password }).where(eq(accounts.id, account.id));
    await tx
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSession.session.id)));
  });
  redirect("/admin");
}

export async function setGlobalModel(formData: FormData) {
  const admin = await requireSuperAdmin();
  const feature = modelFeature.parse(formData.get("feature"));
  const modelId = String(formData.get("modelId") ?? "");
  if (modelId !== "fallback" && !isAllowedModel(modelId)) {
    throw new Error("Model is not allowed");
  }
  await db.transaction(async (tx) => {
    if (modelId === "fallback") {
      await tx.delete(aiModelSettings).where(eq(aiModelSettings.feature, feature));
    } else {
      await tx
        .insert(aiModelSettings)
        .values({ changedAt: new Date(), changedBy: admin.id, feature, modelId })
        .onConflictDoUpdate({
          set: { changedAt: new Date(), changedBy: admin.id, modelId },
          target: aiModelSettings.feature,
        });
    }
    await tx
      .insert(aiModelChanges)
      .values({ changedBy: admin.id, feature, modelId: modelId === "fallback" ? null : modelId });
  });
  revalidatePath("/admin/ai");
}

export async function setWorkspaceModel(formData: FormData) {
  const admin = await requireSuperAdmin();
  const feature = modelFeature.parse(formData.get("feature"));
  const modelId = String(formData.get("modelId") ?? "");
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  if (feature !== "chat") {
    throw new Error("Only chat supports workspace overrides");
  }
  if (modelId !== "fallback" && !isAllowedModel(modelId)) {
    throw new Error("Model is not allowed");
  }
  await db.transaction(async (tx) => {
    if (modelId === "fallback") {
      await tx
        .delete(aiWorkspaceModelOverrides)
        .where(
          and(
            eq(aiWorkspaceModelOverrides.orgId, orgId),
            eq(aiWorkspaceModelOverrides.feature, feature),
          ),
        );
    } else {
      await tx
        .insert(aiWorkspaceModelOverrides)
        .values({ changedAt: new Date(), changedBy: admin.id, feature, modelId, orgId })
        .onConflictDoUpdate({
          set: { changedAt: new Date(), changedBy: admin.id, modelId },
          target: [aiWorkspaceModelOverrides.orgId, aiWorkspaceModelOverrides.feature],
        });
    }
    await tx.insert(aiModelChanges).values({
      changedBy: admin.id,
      feature,
      modelId: modelId === "fallback" ? null : modelId,
      orgId,
    });
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/workspaces/${orgId}`);
}

/**
 * Deletes a workspace for good. The operator must type its exact name; the
 * check runs here, not only in the browser.
 */
export async function deleteWorkspaceAsAdmin(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireSuperAdmin();
  const orgId = z.string().uuid().safeParse(formData.get("orgId"));
  if (!orgId.success) {
    return { error: "Workspace not found." };
  }
  const [workspace] = await db
    .select({ name: orgs.name })
    .from(orgs)
    .where(eq(orgs.id, orgId.data))
    .limit(1);
  if (!workspace) {
    return { error: "Workspace not found." };
  }
  if (String(formData.get("confirmation") ?? "").trim() !== workspace.name.trim()) {
    return { error: "The name does not match." };
  }

  let result: Awaited<ReturnType<typeof deleteWorkspace>>;
  try {
    result = await deleteWorkspace(orgId.data);
  } catch (error) {
    // eslint-disable-next-line no-console -- A failed deletion must be visible in server logs.
    console.error("[admin] workspace deletion failed", error);
    return { error: "Could not delete this workspace. Nothing was removed." };
  }
  if ("error" in result) {
    return { error: result.error };
  }
  // eslint-disable-next-line no-console -- The only record that a workspace was removed, and by whom.
  console.info(
    `[admin] ${admin.email} deleted workspace "${workspace.name}" (${orgId.data}):`,
    JSON.stringify(result.deleted),
  );
  revalidatePath("/admin");
  redirect("/admin");
}

/** Locks a workspace out, or lets it back in. Nothing is deleted and billing is not touched. */
export async function setWorkspaceActive(formData: FormData) {
  const admin = await requireSuperAdmin();
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const active = formData.get("active") === "true";
  const [workspace] = await db
    .update(orgs)
    .set({ deactivatedAt: active ? null : new Date() })
    .where(eq(orgs.id, orgId))
    .returning({ name: orgs.name });
  if (workspace) {
    // eslint-disable-next-line no-console -- The record of who locked or unlocked a workspace.
    console.info(
      `[admin] ${admin.email} ${active ? "reactivated" : "deactivated"} workspace "${workspace.name}" (${orgId})`,
    );
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/workspaces/${orgId}`);
}
