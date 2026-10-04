import { AdminShell } from "@/components/admin-shell";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
