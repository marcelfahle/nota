"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { approveProposal } from "@/lib/proposal-service";

export async function approveProposalAction(proposalId: string) {
  const { org, role, user } = await getCurrentUser();
  const result = await approveProposal(
    { orgId: org.id, role, source: "web", userId: user.id },
    proposalId,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/home");
  return { success: true };
}
