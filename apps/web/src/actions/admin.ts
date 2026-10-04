"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAllowedModel, MODEL_FEATURES } from "@/lib/ai-usage";
import { requireSuperAdmin } from "@/lib/auth";
import { auth } from "@/lib/better-auth";
import { db } from "@/lib/db";
import {
  accounts,
  aiModelChanges,
  aiModelSettings,
  aiWorkspaceModelOverrides,
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
