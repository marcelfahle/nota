"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { performBillingAction } from "@/lib/billing-actions";

export async function updateBilling(
  action: "connect" | "disconnect" | "refresh" | "month" | "year" | "portal",
) {
  const { org, role, user } = await getCurrentUser();
  try {
    const result = await performBillingAction(
      { email: user.email, orgId: org.id, role, userId: user.id },
      action,
    );
    revalidatePath("/settings");
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Billing action failed. Please try again.",
    };
  }
}
