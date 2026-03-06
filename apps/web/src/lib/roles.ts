import type { AuthenticatedRole } from "@/lib/auth";

const ROLE_ORDER: Array<AuthenticatedRole> = ["member", "admin", "owner"];
const INSUFFICIENT_PERMISSIONS_ERROR = "Insufficient permissions";

function hasMinimumRole(role: AuthenticatedRole, minimumRole: AuthenticatedRole) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimumRole);
}

export function getInsufficientPermissionsError() {
  return INSUFFICIENT_PERMISSIONS_ERROR;
}

export function canManageMembers(role: AuthenticatedRole) {
  return hasMinimumRole(role, "owner");
}

export function canManageSettings(role: AuthenticatedRole) {
  return hasMinimumRole(role, "owner");
}

export function canManageApiKeys(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canSendInvoice(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canSendInvoiceReminder(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canDeleteInvoice(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canCancelInvoice(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canMarkInvoicePaid(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}

export function canCreateInvoice(role: AuthenticatedRole) {
  return hasMinimumRole(role, "member");
}

export function canEditDraft(role: AuthenticatedRole) {
  return hasMinimumRole(role, "member");
}

export function canManageBankAccounts(role: AuthenticatedRole) {
  return hasMinimumRole(role, "admin");
}
