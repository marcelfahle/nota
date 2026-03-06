import type { ApiRequestAuthContext } from "@/lib/api-auth";
import {
  cancelInvoice as cancelInvoiceService,
  createInvoice as createInvoiceService,
  deleteInvoice as deleteInvoiceService,
  duplicateInvoice as duplicateInvoiceService,
  getInvoiceDetail,
  markInvoicePaid as markInvoicePaidService,
  sendInvoice as sendInvoiceService,
  sendReminder as sendReminderService,
  type InvoiceDetail,
  type InvoiceMutationInput,
  type InvoiceMutationResult,
  type InvoiceServiceContext,
  updateInvoice as updateInvoiceService,
} from "@/lib/invoice-service";
import { getInsufficientPermissionsError } from "@/lib/roles";

type InvoiceActionError = {
  error: string;
  status: number;
};

type InvoiceActionSuccess = {
  invoice: InvoiceDetail;
  warning?: string;
};

type InvoiceActionResult = InvoiceActionError | InvoiceActionSuccess;

type InvoiceDeleteResult = InvoiceActionError | { success: true };

function buildError(error: string, status: number): InvoiceActionError {
  return { error, status };
}

function buildServiceContext(auth: ApiRequestAuthContext): InvoiceServiceContext {
  return {
    orgId: auth.org.id,
    role: auth.role,
    userId: auth.user.id,
  };
}

function getErrorStatus(error: string) {
  if (error === getInsufficientPermissionsError()) {
    return 403;
  }

  if (error === "Invoice not found" || error === "Client not found") {
    return 404;
  }

  if (error === "Invoice could not be sent. Please try again.") {
    return 500;
  }

  return 409;
}

async function loadInvoiceDetailOrThrow(orgId: string, invoiceId: string) {
  const invoice = await getInvoiceDetail(orgId, invoiceId);
  if (!invoice) {
    throw new Error("Invoice could not be loaded");
  }

  return invoice;
}

async function toInvoiceActionResult(
  auth: ApiRequestAuthContext,
  result: InvoiceMutationResult,
): Promise<InvoiceActionResult> {
  if ("error" in result) {
    return buildError(result.error, getErrorStatus(result.error));
  }

  return {
    invoice: await loadInvoiceDetailOrThrow(auth.org.id, result.invoiceId),
    warning: result.warning,
  };
}

export async function createInvoiceFromApi(
  auth: ApiRequestAuthContext,
  input: InvoiceMutationInput,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(auth, await createInvoiceService(buildServiceContext(auth), input));
}

export async function updateInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
  input: InvoiceMutationInput,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await updateInvoiceService(buildServiceContext(auth), invoiceId, input),
  );
}

export async function deleteInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceDeleteResult> {
  const result = await deleteInvoiceService(buildServiceContext(auth), invoiceId);
  if ("error" in result) {
    return buildError(result.error, getErrorStatus(result.error));
  }

  return { success: true };
}

export async function sendInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await sendInvoiceService(buildServiceContext(auth), invoiceId),
  );
}

export async function sendReminderFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await sendReminderService(buildServiceContext(auth), invoiceId),
  );
}

export async function markInvoicePaidFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await markInvoicePaidService(buildServiceContext(auth), invoiceId),
  );
}

export async function cancelInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await cancelInvoiceService(buildServiceContext(auth), invoiceId),
  );
}

export async function duplicateInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  return toInvoiceActionResult(
    auth,
    await duplicateInvoiceService(buildServiceContext(auth), invoiceId),
  );
}
