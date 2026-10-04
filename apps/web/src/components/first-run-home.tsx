"use client";

import { Check, ChevronDown, Landmark, Mail, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  requestFirstSendVerification,
  saveFirstRunBankDetails,
  saveFirstRunProfile,
  sendFirstInvoice,
  sendFirstRunTestInvoice,
} from "@/actions/first-run";
import { ChatPanel } from "@/components/chat-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";

type FirstRunInvoice = {
  client: { email: string; name: string };
  currency: string;
  dueAt: string;
  id: string;
  issuedAt: string;
  lineItems: Array<{
    amount: string;
    description: string;
    id: string;
    quantity: string;
  }>;
  number: string;
  total: string;
} | null;

type FirstRunOrg = {
  brandColor: string | null;
  businessName: string | null;
  city: string | null;
  country: string | null;
  legalName: string | null;
  logoUrl: string | null;
  name: string;
  postalCode: string | null;
  street: string | null;
  vatNumber: string | null;
};

export type FirstRunHomeData = {
  bankAccount: { bic: string | null; details: string; iban: string | null; name: string } | null;
  email: string;
  emailVerified: boolean;
  invoice: FirstRunInvoice;
  org: FirstRunOrg;
  testSent: boolean;
};

type Editor = "bank" | "profile" | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function readableTextColor(background: string) {
  const channels = background.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) {
    return "#1f1b16";
  }
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const luminance = [red, green, blue]
    .map((channel) => (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.48 ? "#1f1b16" : "#fffefb";
}

function useSaved(state: { success?: boolean } | null, onSaved: () => void) {
  const saved = useEffectEvent(onSaved);
  useEffect(() => {
    if (state?.success) {
      saved();
    }
  }, [state]);
}

function Gap({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="onboarding-missing min-h-7 text-left outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#1f1b16] focus-visible:ring-offset-2"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** True once the page has loaded, so later arrivals can be told from what was there. */
const Settled = createContext<{ isSettled: () => boolean } | null>(null);

/** A value that arrived after the page loaded gets one pass of the highlighter. */
function Landed({ children, value }: { children?: React.ReactNode; value: string }) {
  const page = useContext(Settled);
  const [initial] = useState(() => (page?.isSettled() ? null : value));
  return (
    <span className={cn(initial !== value && "onboarding-land")} key={value}>
      {children ?? value}
    </span>
  );
}

function ProfileForm({ onSaved, org }: { onSaved: () => void; org: FirstRunOrg }) {
  const [state, action, pending] = useActionState(saveFirstRunProfile, null);
  useSaved(state, onSaved);

  return (
    <form action={action} className="space-y-4" data-testid="first-run-profile-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="first-run-legal-name">Legal name</Label>
          <Input
            defaultValue={org.legalName ?? org.businessName ?? ""}
            id="first-run-legal-name"
            name="legalName"
            placeholder="Registered business name"
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="first-run-street">Street and number</Label>
          <Input
            defaultValue={org.street ?? ""}
            id="first-run-street"
            name="street"
            placeholder="Carrer de la Mar 12"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first-run-postal-code">Postal code</Label>
          <Input defaultValue={org.postalCode ?? ""} id="first-run-postal-code" name="postalCode" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first-run-city">City</Label>
          <Input defaultValue={org.city ?? ""} id="first-run-city" name="city" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first-run-country">Country</Label>
          <Input defaultValue={org.country ?? ""} id="first-run-country" name="country" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first-run-vat">VAT ID (if registered)</Label>
          <Input defaultValue={org.vatNumber ?? ""} id="first-run-vat" name="vatNumber" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save legal details"}
        </Button>
        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="flex items-center gap-1.5 text-sm" role="status">
            <Check className="size-4" /> Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}

function BankForm({
  bankAccount,
  onSaved,
}: {
  bankAccount: FirstRunHomeData["bankAccount"];
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(saveFirstRunBankDetails, null);
  useSaved(state, onSaved);

  return (
    <form action={action} className="space-y-4" data-testid="first-run-bank-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="first-run-account-holder">Account holder</Label>
          <Input
            defaultValue={bankAccount?.name ?? ""}
            id="first-run-account-holder"
            name="accountHolder"
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="first-run-iban">IBAN</Label>
          <Input
            autoCapitalize="characters"
            defaultValue={bankAccount?.iban ?? ""}
            id="first-run-iban"
            name="iban"
            placeholder="DE89 3704 0044 0532 0130 00"
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="first-run-bic">BIC (optional)</Label>
          <Input
            autoCapitalize="characters"
            defaultValue={bankAccount?.bic ?? ""}
            id="first-run-bic"
            name="bic"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save bank details"}
        </Button>
        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="flex items-center gap-1.5 text-sm" role="status">
            <Check className="size-4" /> Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function FirstRunHome({ data }: { data: FirstRunHomeData }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLElement>(null);
  const [settled] = useState(() => {
    let done = false;
    return {
      isSettled: () => done,
      settle: () => {
        done = true;
      },
    };
  });
  useEffect(() => settled.settle(), [settled]);
  const [chatOpen, setChatOpen] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [testSent, setTestSent] = useState(data.testSent);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const invoice = data.invoice;
  const currency = invoice?.currency ?? "EUR";
  const total = Number(invoice?.total ?? 0);
  const brandColor = data.org.brandColor ?? "#d1fd39";
  const addressLine = [data.org.postalCode, data.org.city].filter(Boolean).join(" ");
  const legalReady = Boolean(
    data.org.legalName && data.org.street && data.org.city && data.org.country,
  );
  const bankReady = Boolean(data.bankAccount);
  const readyForTest = Boolean(invoice && legalReady && bankReady);

  useEffect(() => {
    function openChat() {
      setChatOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    window.addEventListener("nota:open-home-chat", openChat);
    return () => window.removeEventListener("nota:open-home-chat", openChat);
  }, []);

  useEffect(() => {
    // On a phone the form opens far below the gap that was tapped: bring it up.
    if (editor && window.matchMedia("(max-width: 1023px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editor]);

  useEffect(() => {
    // The dock's next step can act on this section while it is off screen.
    if ((notice || verificationOpen) && window.matchMedia("(max-width: 1023px)").matches) {
      sendRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [notice, verificationOpen]);

  const drafted = Boolean(invoice);
  const wasDrafted = useRef(drafted);
  useEffect(() => {
    if (drafted && !wasDrafted.current) {
      navigator.vibrate?.(12);
    }
    wasDrafted.current = drafted;
  }, [drafted]);

  // Back to the paper, where the saved details land.
  function showPaper() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setEditor(null);
      scrollRef.current?.scrollTo({ behavior: "smooth", top: 0 });
    }
  }

  function askNota() {
    setChatOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function sendTest() {
    if (!invoice) {
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await sendFirstRunTestInvoice(invoice.id);
      if (result.error) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setTestSent(true);
      setNotice({ kind: "success", text: `Test copy queued for ${data.email}.` });
      router.refresh();
    });
  }

  function requestVerification() {
    setNotice(null);
    startTransition(async () => {
      const result = await requestFirstSendVerification();
      setNotice(
        result.error
          ? { kind: "error", text: result.error }
          : { kind: "success", text: `Confirmation sent to ${data.email}.` },
      );
    });
  }

  function sendRealInvoice() {
    if (!invoice) {
      return;
    }
    if (!data.emailVerified) {
      setVerificationOpen(true);
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await sendFirstInvoice(invoice.id);
      if (result.error) {
        setVerificationOpen(Boolean(result.verificationRequired));
        setNotice({ kind: "error", text: result.error });
        return;
      }
      router.refresh();
    });
  }

  const nextStep = !invoice
    ? undefined
    : !legalReady
      ? { label: "Next: your legal details", onClick: () => setEditor("profile") }
      : !bankReady
        ? { label: "Next: how you get paid", onClick: () => setEditor("bank") }
        : !testSent
          ? { label: "Next: send yourself a test copy", onClick: sendTest }
          : { label: "Last step: send it to your client", onClick: sendRealInvoice };

  return (
    <Settled value={settled}>
      {/* On a phone this is a pane, not a page: the invoice scrolls above, Nota
          sits below as a footer, and nothing moves underneath either. */}
      <div
        className="mx-auto max-w-[1120px] max-lg:relative max-lg:flex max-lg:min-h-0 max-lg:w-full max-lg:max-w-none max-lg:flex-1 max-lg:flex-col lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start lg:gap-x-10 lg:gap-y-5"
        data-first-run
      >
        <div
          className="max-lg:min-h-0 max-lg:flex-1 max-lg:space-y-7 max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:px-[max(1rem,env(safe-area-inset-left))] max-lg:pt-6 max-lg:pb-10 sm:max-lg:px-8 lg:contents"
          ref={scrollRef}
        >
          <article
            aria-label="Your first invoice"
            className="invoice-paper overflow-hidden border border-black/10 p-5 text-[#1f1b16] shadow-[0_24px_70px_-42px_rgb(31_27_22/55%)] sm:p-8 lg:sticky lg:top-6 lg:col-start-1 lg:row-span-4 lg:row-start-1"
            data-testid="first-run-invoice"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 pb-5 sm:pb-6">
              <div className="flex min-w-0 items-start gap-3">
                {data.org.logoUrl ? (
                  <img
                    alt=""
                    className="h-10 max-w-24 shrink-0 rounded-md object-contain object-left sm:h-11 sm:max-w-28"
                    src={data.org.logoUrl}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-md text-sm font-bold sm:size-11"
                    style={{ backgroundColor: brandColor, color: readableTextColor(brandColor) }}
                  >
                    {data.org.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 space-y-1 text-xs leading-5 text-[#6b655c]">
                  <p className="text-sm font-bold text-[#1f1b16]">
                    {data.org.legalName ? (
                      <Landed value={data.org.legalName} />
                    ) : (
                      <Gap onClick={() => setEditor("profile")}>Legal name</Gap>
                    )}
                  </p>
                  <p>
                    {data.org.street ? (
                      <Landed value={data.org.street} />
                    ) : (
                      <Gap onClick={() => setEditor("profile")}>Street and number</Gap>
                    )}
                  </p>
                  <p>
                    {addressLine && data.org.country ? (
                      <Landed value={`${addressLine}, ${data.org.country}`} />
                    ) : (
                      <Gap onClick={() => setEditor("profile")}>Postcode, city, country</Gap>
                    )}
                  </p>
                  <p>
                    {data.org.vatNumber ? (
                      `VAT ${data.org.vatNumber}`
                    ) : legalReady ? (
                      <span className="text-[#6b655c]">No VAT ID</span>
                    ) : (
                      <Gap onClick={() => setEditor("profile")}>VAT ID, if registered</Gap>
                    )}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold tracking-[-0.04em] sm:text-4xl">Invoice</p>
                <p className="mt-1 font-mono text-xs text-[#6b655c]">
                  {invoice?.number ?? "INV-0001"}
                </p>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-4 border-b border-black/10 py-5 sm:grid-cols-3 sm:py-6">
              <div className="col-span-2 sm:col-span-1">
                <p className="nota-label text-[#6b655c]">Billed to</p>
                <p className="mt-2 text-sm font-bold">
                  {invoice ? (
                    <Landed value={invoice.client.name} />
                  ) : (
                    <Gap onClick={askNota}>Your first client</Gap>
                  )}
                </p>
                {invoice ? (
                  <p className="mt-1 text-xs text-[#6b655c]">{invoice.client.email}</p>
                ) : null}
              </div>
              <div>
                <p className="nota-label text-[#6b655c]">Issued</p>
                <p className="mt-2 font-mono text-xs">
                  {invoice ? formatDate(invoice.issuedAt) : "When drafted"}
                </p>
              </div>
              <div>
                <p className="nota-label text-[#6b655c]">Due</p>
                <p className="mt-2 font-mono text-xs">
                  {invoice ? formatDate(invoice.dueAt) : "14 days later"}
                </p>
              </div>
            </section>

            <div className="mt-5 sm:mt-6">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-[#6b655c]">
                    <th className="nota-label pb-3 font-medium">Description</th>
                    <th className="nota-label w-10 pb-3 text-right font-medium sm:w-14">Qty</th>
                    <th className="nota-label w-24 pb-3 text-right font-medium sm:w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice ? (
                    invoice.lineItems.map((item) => (
                      <tr className="border-b border-black/10 align-top" key={item.id}>
                        <td className="py-4 pr-3 font-medium">
                          <Landed value={item.description} />
                        </td>
                        <td className="py-4 text-right font-mono text-xs">
                          {Number(item.quantity)}
                        </td>
                        <td className="py-4 text-right font-mono text-xs font-medium">
                          {formatCurrency(Number(item.amount), currency)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-b border-black/10">
                      <td className="py-4" colSpan={3}>
                        <Gap onClick={askNota}>What you did and what it costs</Gap>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex items-end justify-between gap-5 sm:mt-6">
              <p className="nota-label pb-1">Total due</p>
              <p className="font-mono text-2xl font-bold tracking-[-0.04em] sm:text-3xl">
                {invoice ? <Landed value={formatCurrency(total, currency)} /> : "—"}
              </p>
            </div>

            <button
              className="mt-5 flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-[filter] outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#1f1b16] focus-visible:ring-offset-2 sm:mt-6"
              onClick={() => setEditor("bank")}
              style={{ backgroundColor: brandColor, color: readableTextColor(brandColor) }}
              type="button"
            >
              <Landed value={bankReady ? "Pay by bank transfer" : "Add how you get paid"} />
              <span className="flex items-center gap-2 font-mono text-xs">
                {bankReady ? data.bankAccount?.name : "Bank details"}
                <Landmark className="size-4" />
              </span>
            </button>
          </article>

          <div className="min-w-0 space-y-2 max-lg:hidden lg:col-start-2 lg:row-start-1">
            <p className="nota-label">Your first invoice</p>
            <h1 className="!text-[2rem] !leading-[1.05]">Who’s the first one for?</h1>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              One sentence is enough. Include who, what you did, the price, and their email.
            </p>
          </div>

          <section
            aria-labelledby="finish-invoice-heading"
            className="min-w-0 border-t pt-5 lg:col-start-2 lg:row-start-3"
          >
            <h2 className="nota-label text-foreground" id="finish-invoice-heading">
              Finish on the invoice
            </h2>
            <div className="mt-3 divide-y">
              <button
                className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setEditor(editor === "profile" ? null : "profile")}
                type="button"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border",
                      legalReady && "bg-primary text-primary-foreground",
                    )}
                  >
                    {legalReady ? <Check className="size-3" /> : "1"}
                  </span>
                  Legal name and address
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    editor === "profile" && "rotate-180",
                  )}
                />
              </button>
              <button
                className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setEditor(editor === "bank" ? null : "bank")}
                type="button"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border",
                      bankReady && "bg-primary text-primary-foreground",
                    )}
                  >
                    {bankReady ? <Check className="size-3" /> : "2"}
                  </span>
                  Bank details
                </span>
                <ChevronDown
                  className={cn("size-4 transition-transform", editor === "bank" && "rotate-180")}
                />
              </button>
            </div>

            {editor ? (
              <div
                className="mt-4 scroll-mt-24 rounded-lg border bg-card p-4 sm:p-5"
                ref={editorRef}
              >
                {editor === "profile" ? (
                  <ProfileForm onSaved={showPaper} org={data.org} />
                ) : (
                  <BankForm bankAccount={data.bankAccount} onSaved={showPaper} />
                )}
              </div>
            ) : null}
          </section>

          <section
            aria-label="Send your first invoice"
            className="min-w-0 space-y-3 border-t pt-5 lg:col-start-2 lg:row-start-4"
            ref={sendRef}
          >
            <Button
              className="w-full"
              disabled={!readyForTest || pending || testSent}
              onClick={sendTest}
              type="button"
            >
              {testSent ? <Check /> : <Mail />}
              {testSent ? "Test copy sent" : "Send it to me first"}
            </Button>
            {!readyForTest ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Fill the highlighted client, work, legal, and bank details to send a test copy.
              </p>
            ) : null}
            {testSent ? (
              <Button
                className="w-full"
                disabled={pending}
                onClick={sendRealInvoice}
                type="button"
                variant="outline"
              >
                <Send /> Send invoice
              </Button>
            ) : null}

            {verificationOpen ? (
              <div
                className="space-y-3 rounded-lg border bg-card p-4"
                data-testid="first-run-verify"
              >
                <p className="text-sm font-semibold">Confirm {data.email}</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  We’ll send a one-time link. Come back here after confirming, then send the
                  invoice.
                </p>
                <Button disabled={pending} onClick={requestVerification} size="sm" type="button">
                  Send confirmation link
                </Button>
              </div>
            ) : null}

            {notice ? (
              <p
                className={cn("text-sm", notice.kind === "error" && "text-destructive")}
                role={notice.kind === "error" ? "alert" : "status"}
              >
                {notice.text}
              </p>
            ) : null}
          </section>
        </div>
        <ChatPanel
          dockAction={nextStep}
          inputRef={inputRef}
          mode="first-run"
          onDockSubmit={() => scrollRef.current?.scrollTo({ behavior: "smooth", top: 0 })}
          onOpenChange={setChatOpen}
          open={chatOpen}
          prompt={
            invoice
              ? {
                  label: "Change anything",
                  placeholder: "Make it 4 days, due in 30",
                  question: "Who’s the first one for?",
                  submitLabel: "Update",
                }
              : {
                  label: "Client, work, price, email",
                  placeholder: "Acme GmbH, 3 days of design at €600, billing@acme.com",
                  question: "Who’s the first one for?",
                  submitLabel: "Draft it",
                }
          }
          starterPrompts={[]}
        />
      </div>
    </Settled>
  );
}
