"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/actions/clients";
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
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
        <ClientForm action={createClient} redirectTo="/clients" submitLabel="Create Client" />
      </div>
    </div>
  );
}
