import { AdminAuditTable } from "@/components/admin-audit-table";
import { listAdminAudit } from "@/lib/admin-audit";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminAuditPage() {
  await requireSuperAdmin();
  const entries = await listAdminAudit(50);
  return (
    <div className="space-y-8">
      <div>
        <p className="nota-label mb-2">Private operations</p>
        <h1>Audit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The latest 50 admin actions. Each workspace page shows its own.
        </p>
      </div>
      <AdminAuditTable entries={entries} />
    </div>
  );
}
