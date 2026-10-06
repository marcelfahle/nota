---
title: Helo transactional email
type: runbook
status: active
date: 2026-10-05
---

# Helo transactional email

Nota sends password resets, email verification, workspace invitations, invoices
(with PDF attachments), reminders, and payment notifications through Helo.
Existing React Email templates render to HTML and plain text. Link and open
tracking are disabled, including for authentication links.

## Configure

1. Create a channel in [Helo](https://app.helohq.com/). Use **Sandbox** for
   development without delivery and **Live** for actual delivery tests or production.
2. Add `withnota.com` as a sending domain. Copy Helo's DKIM TXT record and its two
   return-path CNAME records into DNS. Keep the existing Fastmail MX, SPF, and DKIM
   records. Click **Verify DNS records** in Helo.
3. Create a sending credential scoped to the channel. Store it in the ignored
   `apps/web/.env.local` file (mode `600`), or Vercel's environment variables for
   the `nota` app project. Never put credentials in source, tickets, or logs.
4. Set:

   ```dotenv
   HELO_API_KEY=<private credential>
   HELO_CHANNEL_ID=<channel UUID>
   EMAIL_FROM_ADDRESS=hello@withnota.com
   EMAIL_FROM_NAME=Nota
   ```

5. Restart the local app or redeploy after environment changes. Set `APP_URL` to
   the origin you are testing so password-reset links return to the correct app.
   The normal production origin is `https://app.withnota.com`.

The old `RESEND_API_KEY` and `RESEND_FROM_EMAIL` variables are no longer read.
Remove them from deployment settings after switching. Email configuration is
validated when first used, so non-email local development can run without a key.

## Test delivery

Helo's free test mode only delivers to verified domains owned by the account.
After domain verification, send a test invoice to `hello@withnota.com` and check
both Helo activity and the Fastmail inbox. The API accepting a message does not
prove inbox delivery. A sandbox channel never delivers messages to real inboxes.

Sending to Gmail or customer domains requires leaving test mode with a paid
subscription. Confirm current pricing and authorize the subscription before
enabling paid sending. Do not switch a customer's login email just to test delivery.

With live sending configured, request a reset for an existing Nota account and
follow the link. Test an invitation and an invoice copy; confirm that the PDF
attachment opens. Verify queue failures remain pending/retried or dead-lettered
and are never marked completed after a rejected send.

## Failures and retries

The adapter throws on provider rejection, timeout, malformed acknowledgement,
or recipient suppression. It never logs raw response bodies or reset URLs.
Inspect Helo activity for details. Queued email uses the job UUID as Helo's
idempotency key, preserving it across retries. Helo deduplicates identical request bodies for one
hour only; this is not a permanent exactly-once guarantee. PDF regeneration or
changed invoice content can cause an HTTP 409 within that window. Persisting the
message payload and delivery status is follow-up work. Authentication and invitation
sends do not automatically retry; inspect provider activity after an ambiguous
timeout before requesting another email.

The previous Resend key failed authentication during setup. Some old call sites
also ignored Resend's returned error object; all sends now use the throwing
adapter. PostHog's previously planned Resend source setup is separate and must
be reassessed for Helo rather than configured with the retired provider key.

References: [sending API](https://docs.helohq.com/api-reference/sending/send-a-transactional-email),
[domain authentication](https://docs.helohq.com/core/domains),
[test mode](https://docs.helohq.com/account/test-mode).
