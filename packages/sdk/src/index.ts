export type Pagination = {
  page: number;
  perPage: number;
  total: number;
};

export type PaginatedResult<T> = {
  data: Array<T>;
  pagination: Pagination;
};

export type OrgRole = "owner" | "admin" | "member";

export type TaxIdentifier = {
  canonicalValue: string;
  countryCode: string | null;
  type: "eu_vat" | "tax_id" | "us_ein";
  value: string;
};

export type TaxIdentifierInput = Pick<TaxIdentifier, "type" | "value"> & {
  countryCode?: string | null;
};

export type NotaUser = {
  email: string;
  id: string;
  name: string;
};

export type NotaOrg = {
  id: string;
  name: string;
  brandColor?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  city?: string | null;
  contactEmail?: string | null;
  country?: string | null;
  defaultCurrency?: string | null;
  legalName?: string | null;
  logoUrl?: string | null;
  invoicePrefix?: string | null;
  invoiceSeparator?: string | null;
  invoiceDigits?: number | null;
  nextInvoiceNumber?: number | null;
  postalCode?: string | null;
  region?: string | null;
  street?: string | null;
  taxIdentifier?: TaxIdentifier | null;
  vatNumber?: string | null;
  website?: string | null;
};

export type MeResponse = {
  org: NotaOrg;
  role: OrgRole;
  user: NotaUser;
};

export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  address?: string | null;
  defaultCurrency?: string | null;
  notes?: string | null;
  taxIdentifier?: TaxIdentifier | null;
  vatNumber?: string | null;
  bankAccountId?: string | null;
  invoiceCount?: number;
  totalInvoiced?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  vatRegistryAddress?: string | null;
  vatRegistryName?: string | null;
  vatStatus?: "invalid" | "unavailable" | "valid" | null;
  vatVerifiedAt?: string | null;
};

export type ClientCreateInput = {
  name: string;
  email: string;
  company?: string;
  address?: string;
  defaultCurrency?: string;
  notes?: string;
  taxIdentifier?: TaxIdentifierInput | null;
  /** @deprecated Use taxIdentifier with type eu_vat. */
  vatNumber?: string;
  bankAccountId?: string | null;
};

export type ClientUpdateInput = ClientCreateInput;

export type ClientImportPreview = {
  columns: Array<{ field: string; header: string }>;
  counts: { duplicate: number; invalid: number; ready: number; total: number };
  hash: string;
  ignoredColumns: Array<string>;
  rows: Array<{
    client: Partial<ClientCreateInput>;
    line: number;
    reason?: string;
    status: "ready" | "duplicate" | "invalid";
  }>;
};
export type ClientImportResult = {
  added: number;
  counts: ClientImportPreview["counts"];
  stale: false;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type InvoiceSummary = {
  balance: string;
  id: string;
  number: string;
  paidAmount: string;
  source?: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient?: string | null;
  status: InvoiceStatus;
  currency: string | null;
  total: string | null;
  issuedAt: string;
  dueAt: string;
  client: {
    email: string | null;
    id: string | null;
    name: string | null;
  } | null;
};

export type InvoiceLineItem = {
  id?: string;
  invoiceId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type InvoiceActivity = {
  id: string;
  action: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  source: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient?: string | null;
};

export type InvoiceDetail = {
  balance: string;
  creditedAmount: string;
  id: string;
  kind: "credit_note" | "invoice";
  clientId: string;
  userId: string;
  orgId: string;
  number: string;
  paidAmount: string;
  settlementStatus: "paid" | "partially_paid" | "unpaid";
  source: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient?: string | null;
  status: InvoiceStatus;
  currency: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  taxRate: string | null;
  total: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  reverseCharge: boolean | string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string | null;
  sentAt?: string | null;
  stripePaymentLinkId?: string | null;
  stripePaymentLinkUrl?: string | null;
  stripePaymentIntentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  client: {
    id: string;
    name: string;
    email: string;
    defaultCurrency?: string | null;
    taxIdentifier?: TaxIdentifier | null;
  } | null;
  lineItems: Array<InvoiceLineItem>;
  lastViewedAt: string | null;
  activityLog: Array<InvoiceActivity>;
  payments: Array<{
    amount: string;
    currency: string;
    id: string;
    method: "bank_transfer" | "other" | "stripe";
    note?: string | null;
    receivedAt: string;
  }>;
  viewCount: number;
};

export type InvoiceLineItemInput = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
};

export type InvoiceCreateInput = {
  clientId: string;
  currency?: string;
  issuedAt: string;
  dueAt: string;
  notes?: string;
  internalNotes?: string;
  reverseCharge?: boolean;
  taxRate?: number | string;
  lineItems: Array<InvoiceLineItemInput>;
};

export type InvoiceUpdateInput = InvoiceCreateInput;

export type InvoiceListFilters = {
  status?: InvoiceStatus;
  clientId?: string;
  search?: string;
  page?: number;
  perPage?: number;
};

export type ClientListFilters = {
  search?: string;
  page?: number;
  perPage?: number;
};

export type InvoiceMutationResponse = {
  invoice: InvoiceDetail;
  warning?: string;
};

export type BinaryDownload = {
  contentType: string;
  data: Uint8Array;
  filename: string | null;
};

export class NotaApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "NotaApiError";
    this.status = status;
    this.details = details;
  }
}

type FetchLike = typeof fetch;

type JsonErrorResponse = {
  error?: string;
};

type JsonDataResponse<T> = {
  data: T;
  warning?: string;
};

type JsonSuccessResponse = {
  success: true;
};

function normalizeApiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Nota base URL is required");
  }

  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

function toSearchParams(input: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

function extractFilename(headers: Headers) {
  const disposition = headers.get("content-disposition");
  if (!disposition) {
    return null;
  }

  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

export class NotaClient {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, apiKey: string, fetchImpl: FetchLike = fetch) {
    if (!apiKey.trim()) {
      throw new Error("Nota API key is required");
    }

    this.apiBaseUrl = normalizeApiBaseUrl(baseUrl);
    this.apiKey = apiKey.trim();
    this.fetchImpl = fetchImpl;
  }

  async getMe() {
    const response = await this.requestJson<JsonDataResponse<MeResponse>>("/me");
    return response.data;
  }

  async listClients(filters: ClientListFilters = {}) {
    const query = toSearchParams({
      page: filters.page,
      per_page: filters.perPage,
      search: filters.search,
    });

    return this.requestJson<PaginatedResult<ClientRecord>>(`/clients?${query.toString()}`);
  }

  async createClient(input: ClientCreateInput) {
    const response = await this.requestJson<JsonDataResponse<ClientRecord>>("/clients", {
      body: JSON.stringify(input),
      method: "POST",
    });

    return response.data;
  }

  async previewClientsCsv(csv: string) {
    const response = await this.requestJson<JsonDataResponse<ClientImportPreview>>(
      "/clients/import",
      {
        body: JSON.stringify({ csv, mode: "preview" }),
        method: "POST",
      },
    );
    return response.data;
  }

  async importClientsCsv(csv: string, previewHash: string) {
    const response = await this.requestJson<JsonDataResponse<ClientImportResult>>(
      "/clients/import",
      {
        body: JSON.stringify({ csv, mode: "commit", previewHash }),
        method: "POST",
      },
    );
    return response.data;
  }

  async getClient(clientId: string) {
    const response = await this.requestJson<JsonDataResponse<ClientRecord>>(
      `/clients/${encodeURIComponent(clientId)}`,
    );

    return response.data;
  }

  async updateClient(clientId: string, input: ClientUpdateInput) {
    const response = await this.requestJson<JsonDataResponse<ClientRecord>>(
      `/clients/${encodeURIComponent(clientId)}`,
      {
        body: JSON.stringify(input),
        method: "PATCH",
      },
    );

    return response.data;
  }

  async deleteClient(clientId: string) {
    await this.requestJson<JsonSuccessResponse>(`/clients/${encodeURIComponent(clientId)}`, {
      method: "DELETE",
    });
  }

  async listInvoices(filters: InvoiceListFilters = {}) {
    const query = toSearchParams({
      client_id: filters.clientId,
      page: filters.page,
      per_page: filters.perPage,
      search: filters.search,
      status: filters.status,
    });

    return this.requestJson<PaginatedResult<InvoiceSummary>>(`/invoices?${query.toString()}`);
  }

  async createInvoice(input: InvoiceCreateInput) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>("/invoices", {
      body: JSON.stringify({
        ...input,
        reverseCharge: input.reverseCharge ?? false,
        taxRate: input.taxRate ?? 0,
      }),
      method: "POST",
    });

    return {
      invoice: response.data,
      warning: response.warning,
    } satisfies InvoiceMutationResponse;
  }

  async getInvoice(invoiceId: string) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );

    return response.data;
  }

  async updateInvoice(invoiceId: string, input: InvoiceUpdateInput) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
      {
        body: JSON.stringify({
          ...input,
          reverseCharge: input.reverseCharge ?? false,
          taxRate: input.taxRate ?? 0,
        }),
        method: "PATCH",
      },
    );

    return {
      invoice: response.data,
      warning: response.warning,
    } satisfies InvoiceMutationResponse;
  }

  async deleteInvoice(invoiceId: string) {
    await this.requestJson<JsonSuccessResponse>(`/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "DELETE",
    });
  }

  async duplicateInvoice(invoiceId: string) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}/duplicate`,
      { method: "POST" },
    );

    return {
      invoice: response.data,
      warning: response.warning,
    } satisfies InvoiceMutationResponse;
  }

  async createCreditNote(invoiceId: string) {
    return this.postInvoiceAction(invoiceId, "credit-note");
  }

  async recordInvoicePayment(
    invoiceId: string,
    input: {
      amount: number | string;
      method?: "bank_transfer" | "other";
      note?: string;
      receivedAt?: string;
    },
  ) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}/payments`,
      { body: JSON.stringify(input), method: "POST" },
    );
    return { invoice: response.data, warning: response.warning } satisfies InvoiceMutationResponse;
  }

  async sendInvoice(invoiceId: string) {
    return this.postInvoiceAction(invoiceId, "send");
  }

  async sendReminder(invoiceId: string) {
    return this.postInvoiceAction(invoiceId, "remind");
  }

  async markInvoicePaid(invoiceId: string) {
    return this.postInvoiceAction(invoiceId, "mark-paid");
  }

  async cancelInvoice(invoiceId: string) {
    return this.postInvoiceAction(invoiceId, "cancel");
  }

  async downloadPdf(invoiceId: string) {
    return this.requestBinary(`/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  }

  async downloadXrechnung(invoiceId: string) {
    return this.requestBinary(`/invoices/${encodeURIComponent(invoiceId)}/xrechnung`);
  }

  async findClientByName(name: string) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) {
      return [];
    }

    const result = await this.listClients({ perPage: 100, search: name });
    return result.data.filter((client) => {
      return [client.name, client.company, client.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase() === normalizedName);
    });
  }

  async findInvoiceByNumber(number: string) {
    const normalizedNumber = number.trim().toLowerCase();
    if (!normalizedNumber) {
      return null;
    }

    const rows: InvoiceSummary[] = [];
    let page = 1;
    let result: PaginatedResult<InvoiceSummary>;
    do {
      result = await this.listInvoices({ page, perPage: 100, search: number });
      rows.push(...result.data);
      page++;
    } while (rows.length < result.pagination.total && result.data.length > 0);
    const exact = rows.find((invoice) => invoice.number.toLowerCase() === normalizedNumber);
    const numeric = /^\d+$/.test(normalizedNumber)
      ? normalizedNumber.replace(/^0+/, "") || "0"
      : null;
    const candidates =
      numeric === null
        ? []
        : rows.filter((invoice) => {
            const suffix = invoice.number.match(/\d+$/)?.[0];
            return suffix !== undefined && (suffix.replace(/^0+/, "") || "0") === numeric;
          });
    if (!exact && candidates.length > 1)
      throw new Error(
        `Invoice '${number}' is ambiguous. Use the full number: ${candidates.map((invoice) => invoice.number).join(", ")}.`,
      );
    const match = exact ?? candidates[0];
    if (!match) {
      return null;
    }

    return this.getInvoice(match.id);
  }

  async changeInvoiceDueDate(invoiceId: string, dueAt: string): Promise<InvoiceMutationResponse> {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}/due-date`,
      {
        method: "PATCH",
        body: JSON.stringify({ dueAt }),
      },
    );
    return { invoice: response.data, warning: response.warning };
  }

  private async postInvoiceAction(invoiceId: string, action: string) {
    const response = await this.requestJson<JsonDataResponse<InvoiceDetail>>(
      `/invoices/${encodeURIComponent(invoiceId)}/${action}`,
      { method: "POST" },
    );

    return {
      invoice: response.data,
      warning: response.warning,
    } satisfies InvoiceMutationResponse;
  }

  private async requestBinary(path: string, init?: RequestInit): Promise<BinaryDownload> {
    const response = await this.fetchImpl(this.buildUrl(path), {
      ...init,
      headers: this.buildHeaders(init?.headers),
    });

    if (!response.ok) {
      throw await this.buildError(response);
    }

    return {
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      data: new Uint8Array(await response.arrayBuffer()),
      filename: extractFilename(response.headers),
    };
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(path), {
      ...init,
      headers: this.buildHeaders(init?.headers),
    });

    const text = await response.text();
    const parsed = text ? this.tryParseJson(text) : null;

    if (!response.ok) {
      throw this.toApiError(response.status, parsed, text);
    }

    if (parsed === null) {
      throw new NotaApiError("Expected a JSON response from Nota", response.status, text);
    }

    return parsed as T;
  }

  private buildUrl(path: string) {
    return new URL(path.replace(/^\//, ""), `${this.apiBaseUrl}/`);
  }

  private buildHeaders(headers?: HeadersInit) {
    const result = new Headers(headers);
    result.set("authorization", `Bearer ${this.apiKey}`);

    if (!result.has("content-type")) {
      result.set("content-type", "application/json");
    }

    return result;
  }

  private tryParseJson(value: string): unknown | null {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private async buildError(response: Response) {
    const text = await response.text();
    const parsed = text ? this.tryParseJson(text) : null;
    return this.toApiError(response.status, parsed, text);
  }

  private toApiError(status: number, parsed: unknown, fallback: string) {
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const error = parsed as JsonErrorResponse;
      return new NotaApiError(
        (error.error ?? fallback) || "Nota API request failed",
        status,
        parsed,
      );
    }

    return new NotaApiError(fallback || "Nota API request failed", status, parsed ?? fallback);
  }
}

export function createNotaClient(baseUrl: string, apiKey: string, fetchImpl?: FetchLike) {
  return new NotaClient(baseUrl, apiKey, fetchImpl);
}

export function createNotaClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.NOTA_URL?.trim();
  const apiKey = env.NOTA_API_KEY?.trim();

  if (!baseUrl) {
    throw new Error("NOTA_URL is required");
  }

  if (!apiKey) {
    throw new Error("NOTA_API_KEY is required");
  }

  return new NotaClient(baseUrl, apiKey);
}
