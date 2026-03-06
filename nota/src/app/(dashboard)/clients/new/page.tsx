import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/actions/clients";
import { ClientForm } from "@/components/client-form";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";

export default async function NewClientPage() {
  const user = await getCurrentUser();

  const userBankAccounts = await db
    .select({
      id: bankAccounts.id,
      isDefault: bankAccounts.isDefault,
      name: bankAccounts.name,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, user.id))
    .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.createdAt));

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href="/clients"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      <h1 className="mb-6 text-lg font-semibold">New Client</h1>

      <div className="max-w-2xl">
        <ClientForm
          action={createClient}
          bankAccounts={userBankAccounts}
          redirectTo="/clients"
          submitLabel="Create Client"
        />
      </div>
    </div>
  );
}
