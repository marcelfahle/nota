"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/actions/clients";
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <div>
      <Link
        href="/clients"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      <h1 className="mb-6 text-lg font-semibold">New Client</h1>

      <div className="max-w-2xl">
        <ClientForm
          action={createClient}
          submitLabel="Create Client"
          redirectTo="/clients"
        />
      </div>
    </div>
  );
}
