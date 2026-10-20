import { getTranslations } from "next-intl/server";

import { translateProblem } from "@/lib/invoice-problems";

/**
 * The English sentences the services, schemas and actions speak, by name.
 * The API, CLI and MCP get the sentence; the web app shows it in the
 * member's language (messages/*.json, "errors"). A sentence that is not
 * listed here passes through in English, so nothing ever disappears.
 */
export const ACTION_ERRORS = {
  accountHolderRequired: "Account holder is required",
  accountNameRequired: "Account name is required",
  accountNotFound: "Account not found",
  alreadyMember: "That user is already a member of this organization",
  apiKeyNotFound: "API key not found",
  bankAccountNotFound: "Assigned bank account not found",
  bankDetailsFirst: "Add your bank details first.",
  bankDetailsRequired: "Bank details are required",
  billingFailed: "Billing action failed. Please try again.",
  brandSaveFailed: "Could not update brand settings right now",
  cancelStatus: "Only sent or overdue invoices can be cancelled",
  cannotMarkPaid: "This document cannot be marked as paid",
  chooseLanguage: "Choose English or German",
  chooseXmlDelivery: "Choose whether to attach the XRechnung XML",
  cityRequired: "City is required",
  clientNotFound: "Client not found",
  clientSaveFailed: "Could not save the client",
  confirmEmailForTestCopies: "Confirm your email address to send more test copies.",
  countryCodeTwoLetters: "Country must be a two-letter code such as DE",
  countryCodeTwoLettersExample: "Country code must be two letters, for example DE",
  countryRequired: "Country is required",
  defaultAccountDelete: "Cannot delete the default account. Set another account as default first.",
  descriptionRequired: "Description is required",
  documentLanguageSaveFailed: "Could not save the document language right now",
  dueDateRequired: "Due date is required",
  emailInvalid: "Enter a valid email address",
  emailInvalidShort: "Invalid email address",
  emailSettingSaveFailed: "Could not save the email setting right now",
  emailVerificationRequired: "Confirm your email address before sending your first invoice.",
  faviconTooLarge: "Favicon files must be 2 MB or smaller",
  faviconType: "Favicons must be PNG, JPG, or WebP files",
  faviconUploadFailed: "Favicon upload failed. Please try again.",
  fullyCredited: "Invoice has already been fully credited",
  hexColour: "Choose a six-digit hex colour",
  ibanEnterValid: "Enter a valid IBAN",
  ibanInvalid: "Invalid IBAN",
  ibanRequired: "IBAN is required",
  insufficientPermissions: "Insufficient permissions",
  invalidBankAccount: "Invalid bank account",
  invalidClient: "Invalid client",
  invalidDueDate: "Invalid due date",
  invalidInvoice: "Invalid invoice",
  invalidInvoiceAmount: "Invalid invoice amount",
  invalidPaymentAmount: "Invalid payment amount",
  inviteEmailFailed: "Invite created, but the email could not be sent. Share the link manually.",
  inviteNotFound: "Invite not found",
  invoiceChanged: "Invoice changed. Refresh and try again.",
  invoiceNotFound: "Invoice not found",
  invoiceStatusChanged: "Invoice status changed. Refresh and try again.",
  issueDateRequired: "Issue date is required",
  lastOwnerDemote: "Cannot demote the last owner",
  lastOwnerRemove: "Cannot remove the last owner",
  legalDetailsFirst: "Add your legal name and address first.",
  legalDetailsSaveFailed: "Could not save legal details",
  legalNameRequired: "Legal name is required",
  lineItemRequired: "At least one line item is required",
  logoChoose: "Choose a logo file to upload",
  logoTooLarge: "Logo files must be 2 MB or smaller",
  logoType: "Logos must be PNG, JPG, or WebP files",
  logoUploadFailed: "Logo upload failed. Please try again.",
  memberNotFound: "Member not found",
  nameRequired: "Name is required",
  nameTooLong: "Name must be 64 characters or fewer",
  noteTooLong: "Note is too long",
  onlyDraftDelete: "Only draft invoices can be deleted",
  onlyDraftEdit: "Only draft invoices can be edited",
  onlyDraftMarkSent: "Only draft invoices can be marked as sent",
  onlyDraftSend: "Only draft invoices can be sent",
  onlyIssuedCredit: "Only issued invoices can be credited",
  organizationNotFound: "Organization not found",
  paidCannotCancel: "Paid invoices cannot be cancelled",
  paymentExceeds: "Payment exceeds the remaining balance",
  paymentOutstandingOnly: "Only an outstanding issued invoice can receive payments",
  proposalExpired: "Proposal has expired",
  proposalInvalid: "Proposal payload is invalid",
  proposalInvoiceChanged: "Invoice changed; proposal expired",
  proposalNoInvoice: "Proposal has no invoice",
  proposalNotFound: "Proposal not found",
  proposalNotPending: "Proposal is no longer pending",
  proposalPending: "A reminder proposal is already pending",
  proposalReminderOnly: "Only outstanding invoices can receive reminder proposals",
  quantityRequired: "Quantity is required",
  reminderStatus: "Only sent or overdue invoices can receive reminders",
  sendFailed: "Invoice could not be sent. Please try again.",
  servicePeriodFormat: "Service period dates must be real dates in YYYY-MM-DD format",
  servicePeriodOrder: "The service period must end on or after it starts",
  settingsSaveFailed: "Could not update settings right now",
  shownAsRequired: "Shown as is required",
  stillSending: "Invoice is still being sent. Refresh and try again.",
  streetRequired: "Street and number are required",
  stripeLinkActive: "Stripe payment link is still active. Disable it in Stripe.",
  stripeLinkActiveOriginal:
    "The original Stripe payment link is still active. Disable it in Stripe.",
  taxIdCountryCode: "Country code must be a two-letter ISO code",
  taxIdEin: "Enter a nine-digit EIN",
  taxIdentifierInvalid: "Enter a valid tax identifier",
  taxIdRequired: "Enter a tax identifier",
  taxIdTooLong: "Tax identifier must be 100 characters or fewer",
  taxIdVatPrefix: "Enter an EU VAT ID with its country prefix",
  unitPriceRequired: "Unit price is required",
  upgrade:
    "You've sent your 5 free invoices this month. Upgrade in Settings → Billing for unlimited invoices ($9/month or $90/year).",
  verificationEmailFailed: "Could not send the confirmation email. Try again shortly.",
} as const;

export type ActionErrorKey = keyof typeof ACTION_ERRORS;

const KEY_BY_SENTENCE = new Map<string, ActionErrorKey>(
  (Object.keys(ACTION_ERRORS) as Array<ActionErrorKey>).map((key) => [ACTION_ERRORS[key], key]),
);

export function actionErrorKey(message: string) {
  return KEY_BY_SENTENCE.get(message) ?? null;
}

/** An English sentence in the member's language, or as it came when unknown. */
export async function localizeError(message: string): Promise<string>;
export async function localizeError(message: string | undefined): Promise<string | undefined>;
export async function localizeError(message: string | undefined) {
  const key = message === undefined ? null : actionErrorKey(message);
  if (!key) {
    return message;
  }
  const t = await getTranslations("errors");
  return t(key);
}

/**
 * The error of an invoice mutation. An issuance failure lists the problems;
 * the list is rebuilt from the compliance problems in the member's
 * language, the way the invoice page shows them.
 */
export async function localizeMutationError(result: { error: string; problems?: Array<string> }) {
  if (!result.problems?.length) {
    return localizeError(result.error);
  }
  const [t, tProblems, tTreatment] = await Promise.all([
    getTranslations("invoiceDetail"),
    getTranslations("problems"),
    getTranslations("taxTreatment"),
  ]);
  const problems = result.problems.map((problem) =>
    translateProblem(problem, tProblems, (treatment) => tTreatment(`labels.${treatment}`)),
  );
  return `${t("fixBefore")} ${problems.join(" ")}`;
}
