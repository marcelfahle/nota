import { createHash } from "node:crypto";

import { parse } from "csv-parse/sync";
import { z } from "zod";

import {
  normalizeTaxIdentifier,
  taxIdentifierFromLegacyVatNumber,
  TaxIdentifierValidationError,
} from "@/lib/tax-identifier";

export const MAX_CLIENT_CSV_BYTES = 250 * 1024;
export const MAX_CLIENT_CSV_ROWS = 1000;

export class ClientImportError extends Error {}

const currencies = new Set(Intl.supportedValuesOf("currency"));

const clientSchema = z
  .object({
    address: z.string().max(4000).optional(),
    company: z.string().max(250).optional(),
    defaultCurrency: z
      .string()
      .refine(
        (value) => currencies.has(value),
        "Use a supported ISO currency code, such as EUR or USD",
      ),
    email: z.email("A valid email is required").max(320),
    name: z.string().min(1, "A name or company is required").max(250),
    notes: z.string().max(4000).optional(),
    taxIdentifier: z.object({ type: z.literal("tax_id"), value: z.string().max(100) }).optional(),
    vatNumber: z.string().max(100).optional(),
  })
  .superRefine((client, context) => {
    for (const [path, read] of [
      ["taxIdentifier", () => normalizeTaxIdentifier(client.taxIdentifier)],
      ["vatNumber", () => taxIdentifierFromLegacyVatNumber(client.vatNumber)],
    ] as const) {
      try {
        read();
      } catch (error) {
        if (!(error instanceof TaxIdentifierValidationError)) {
          throw error;
        }
        context.addIssue({ code: "custom", message: error.message, path: [path] });
      }
    }
  });

export type ImportedClient = z.infer<typeof clientSchema>;
export type ClientImportRow = {
  line: number;
  reason?: string;
} & (
  | { client: ImportedClient; status: "ready" }
  | { client: Partial<ImportedClient>; status: "duplicate" | "invalid" }
);
export type ClientImportPreview = {
  columns: Array<{ field: string; header: string }>;
  counts: { duplicate: number; invalid: number; ready: number; total: number };
  hash: string;
  ignoredColumns: Array<string>;
  rows: Array<ClientImportRow>;
};

// Recognize export labels, never instructions in cells. Parsing does not call a model.
const aliases: Record<string, Array<string>> = {
  address: ["address", "billingaddress", "fulladdress"],
  city: ["city", "town", "billingcity"],
  company: ["company", "companyname", "organization", "organisation", "businessname"],
  country: ["country", "billingcountry"],
  defaultCurrency: ["currency", "defaultcurrency", "currencycode"],
  email: ["email", "emailaddress", "billingemail", "primaryemail", "email1"],
  firstName: ["firstname", "contactfirstname"],
  lastName: ["lastname", "contactlastname", "surname"],
  name: ["name", "fullname", "clientname", "customername", "displayname", "contactname"],
  notes: ["notes", "note", "comments"],
  postalCode: ["postalcode", "postcode", "zipcode", "zip", "billingpostalcode"],
  region: ["state", "province", "region", "billingstate"],
  street: ["address1", "addressline1", "street", "streetaddress", "billingaddress1"],
  street2: ["address2", "addressline2", "billingaddress2"],
  taxIdentifier: ["taxnumber", "taxid", "taxregistrationnumber"],
  vatNumber: ["vatnumber", "vatid"],
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

export function previewClientImport(
  csv: string,
  existing: Array<{ email: string; name: string }>,
  defaultCurrency = "EUR",
): ClientImportPreview {
  if (Buffer.byteLength(csv, "utf8") > MAX_CLIENT_CSV_BYTES) {
    throw new ClientImportError("Keep client CSV files under 250 KB (up to 1,000 clients).");
  }
  let records: Array<{ info: { lines: number }; record: Array<string> }>;
  try {
    // Detect from the header, so punctuation inside quoted addresses/notes cannot select a delimiter.
    const headerLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
    const delimiter = [",", ";", "\t"]
      .map((candidate) => {
        try {
          return {
            candidate,
            count:
              (
                parse(headerLine, { delimiter: candidate, trim: true })[0] as
                  | Array<string>
                  | undefined
              )?.length ?? 0,
          };
        } catch {
          return { candidate, count: 0 };
        }
      })
      .sort((a, b) => b.count - a.count)[0].candidate;
    records = parse(csv, {
      bom: true,
      delimiter,
      info: true,
      max_record_size: 16_000,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as unknown as typeof records; // The sync overload omits metadata from `info: true`.
  } catch {
    throw new ClientImportError(
      "This CSV could not be read. Check its quotes and export it as UTF-8 CSV.",
    );
  }
  const headers = records.shift()?.record ?? [];
  if (
    headers.some((header) =>
      ["invoicenumber", "invoiceid", "invoicedate"].includes(normalizeHeader(header)),
    )
  ) {
    throw new ClientImportError(
      "This looks like an invoice export. Upload your client CSV; invoice-history import is not available yet.",
    );
  }
  const columns: ClientImportPreview["columns"] = [];
  const ignoredColumns: Array<string> = [];
  const indices = new Map<string, number>();
  headers.forEach((header, index) => {
    const field = Object.keys(aliases).find((key) =>
      aliases[key].includes(normalizeHeader(header)),
    );
    if (!field) {
      ignoredColumns.push(header);
      return;
    }
    if (indices.has(field)) {
      throw new ClientImportError(
        `More than one ${field} column was found. Keep the primary column and try again.`,
      );
    }
    indices.set(field, index);
    columns.push({ field, header });
  });
  if (
    !indices.has("email") ||
    !["name", "company", "firstName", "lastName"].some((key) => indices.has(key))
  ) {
    throw new ClientImportError(
      "Upload a client CSV with an Email column and a Name, Organization, or First Name column. Invoice exports are not supported here yet.",
    );
  }
  if (!records.length) {
    throw new ClientImportError("This CSV has headers but no clients to import.");
  }
  if (records.length > MAX_CLIENT_CSV_ROWS) {
    throw new ClientImportError("Import up to 1,000 clients at a time.");
  }
  const existingEmails = new Set(existing.map((client) => client.email.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows = records.map<ClientImportRow>(({ info, record }) => {
    const value = (field: string) => record[indices.get(field) ?? -1]?.trim() ?? "";
    const company = value("company");
    const contact = [value("firstName"), value("lastName")].filter(Boolean).join(" ");
    const name = value("name") || company || contact;
    const email = value("email").toLowerCase();
    const address = [
      value("address") || value("street"),
      value("street2"),
      [value("postalCode"), value("city")].filter(Boolean).join(" "),
      value("region"),
      value("country"),
    ]
      .filter(Boolean)
      .join("\n");
    const client = {
      address: address || undefined,
      company: company || undefined,
      defaultCurrency: (value("defaultCurrency") || defaultCurrency).toUpperCase(),
      email,
      name,
      notes:
        [contact && contact !== name ? `Contact: ${contact}` : "", value("notes")]
          .filter(Boolean)
          .join("\n") || undefined,
      taxIdentifier: value("taxIdentifier")
        ? { type: "tax_id" as const, value: value("taxIdentifier") }
        : undefined,
      vatNumber: value("vatNumber") || undefined,
    };
    if (record.length !== headers.length) {
      return {
        client,
        line: info.lines,
        reason: "The number of cells does not match the headers.",
        status: "invalid",
      };
    }
    const result = clientSchema.safeParse(client);
    if (!result.success) {
      return {
        client,
        line: info.lines,
        reason: result.error.issues[0].message,
        status: "invalid",
      };
    }
    if (existingEmails.has(email) || seen.has(email)) {
      return {
        client,
        line: info.lines,
        reason: existingEmails.has(email)
          ? "This email is already in Nota. Existing details will stay intact."
          : "This email appears earlier in the file.",
        status: "duplicate",
      };
    }
    seen.add(email);
    return { client: result.data, line: info.lines, status: "ready" };
  });
  const counts = { duplicate: 0, invalid: 0, ready: 0, total: rows.length };
  for (const row of rows) {
    counts[row.status]++;
  }
  const hash = createHash("sha256").update(JSON.stringify({ columns, rows })).digest("hex");
  return { columns, counts, hash, ignoredColumns, rows };
}
