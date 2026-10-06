---
title: Nota email inventory and test sends
type: runbook
status: active
date: 2026-10-05
---

# Nota email inventory

Sender configured locally and in production: **Nota <hello@withnota.com>**, via Helo's
**Nota transactional** live channel. Production reset delivery was verified on 2026-10-05.
This catalog describes implemented email paths, not proof of their delivery.

| Email | Trigger | Recipient | Template | Delivery path |
| --- | --- | --- | --- | --- |
| Password reset | Forgot password | Account email | `password-reset.tsx` | Better Auth, immediate |
| Email verification | Verification request | Account email | `verification.tsx` | Better Auth, immediate; not automatic on signup |
| Workspace invitation | Owner/admin invites teammate | Invited email | `invite.tsx` | Immediate; returns a warning if sending fails |
| Invoice | Send invoice | Client | `invoice-sent.tsx` | Job queue; PDF attached |
| Invoice test copy | User requests preview | Explicit test recipient | `invoice-sent.tsx` | Job queue; PDF attached; test label |
| Reminder | Reminder job / approved proposal | Client / proposal recipient | `invoice-sent.tsx` | Job queue; reminder variant |
| Payment notification | Payment email job | Invoice owner's account email | `payment-received.tsx` | Job queue |

No welcome sequence, onboarding drip, newsletter, or win-back campaign is implemented.
Marketing must use a separate Helo channel and broadcast sending; unsubscribing
from onboarding tips must not suppress a password reset or invoice.

## Test ledger — 2026-10-05

Only record a message as accepted when Helo returns its message ID. Accepted is
not delivered; record provider delivery and inbox observation separately.
Never store password reset or invitation tokens in this log.

| Test | Recipient | Subject / purpose | Provider status | Inbox evidence |
| --- | --- | --- | --- | --- |
| Earlier Resend password reset | Not captured | User reported no reset email | Not verified; configured key later failed authentication | Not received per user |
| Helo setup, before test run | None | No application emails sent | Domain verified; scoped credential configured locally | Not applicable |
| 05:09:30 UTC — invoice test attempt | m.fahle@gmail.com | `[Nota test 1] Invoice PDF — nothing to pay` | Rejected, HTTP 422; account was in test mode at setup | Not delivered |
| 05:10:44 UTC — invoice test after subscription | m.fahle@gmail.com | `[Nota test 1] Invoice PDF — nothing to pay` | Accepted: `01a10a78-b3f6-7106-a07d-3564f3aa34f0` | Gmail Inbox / Updates, 05:10:45 UTC; PDF attached |
| 05:11:41 UTC — reminder test | m.fahle@gmail.com | `[Nota test 2] Reminder template — nothing to pay` | Accepted: `01a10a79-9295-7edf-ad5f-ca1379f21650` | Gmail Inbox / Updates, 05:11:42 UTC; no attachment |

| 05:22:38 UTC — reset request before domain promotion | m.fahle@gmail.com | Password reset request | HTTP 200 from the previous app deployment; no Helo message confirmed | No matching email found |
| 05:25:10 UTC — production password reset | m.fahle@gmail.com | `Reset your nota password` | Helo message ID `01a10a85-e460-7509-b136-9a0392d8f158`, recovered from received headers | Gmail Inbox / Personal, 05:25:10 UTC; Gmail ID `1a10a85eb297069e`; SPF and DKIM pass |

**Verified total: three delivered emails, one earlier rejected send, one reset request with no observed delivery.**
No real invoice, payment, invitation, or account was created by these tests.

Gmail message IDs: `1a10a78b635341d9` (invoice), `1a10a79973068694` (reminder).
The invoice's authentication headers show SPF pass and DKIM pass for
`withnota.com`. The received PDF is 16,859 bytes and its extracted content
contains `TEST-HELO-001`, a zero balance, and the explicit test-only disclaimer.
This confirms delivery for these two messages, not future inbox placement.

The local private `.nota/email-tests/sends.jsonl` records each attempt and outcome.
Its manifest prevents accidentally re-running an already accepted sample send.
The production Gmail account exists and is already verified. The reset email reached
its real inbox; completing a password change is still a user handoff. The verification
email's refreshed design was rendered and visually inspected; that is not proof of a
live verification round trip. Do not unset a real user's verified state to test it.
