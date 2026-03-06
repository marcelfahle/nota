---
title: Internal Auth Hardening, Stripe Dev Dock & Brand Setup
type: feat
status: in_progress
date: 2026-03-05
---

# Internal Auth Hardening, Stripe Dev Dock & Brand Setup

## Overview

Turn `nota` from a promising internal prototype into a deployable single-owner invoicing app.

This plan intentionally optimizes for the user's actual use case:
- one owner
- low invoice volume
- reliable self-hosted or Vercel-hosted usage
- code quality high enough that the project could later be opened publicly without embarrassment

The work is split into two tracks:
1. **Trust the app**: auth, authorization, invoice safety, deployment hygiene
2. **Operate the app**: Stripe visibility, lightweight branding, and internal ergonomics

## Problem Statement

The app already has the core primitives needed to be useful:
- Postgres schema for users, clients, invoices, bank accounts, line items, and activity log
- PDF generation, email sending, Stripe payment links, webhook handling, overdue cron, and XRechnung export

But it is not yet safe to rely on as a daily-use hosted app.

Current blockers:
- Authentication is owner-only gating, not real session auth
- Authorization is incomplete; many reads and writes are not scoped by `userId`
- Sent/paid invoices remain mutable and can be hard-deleted
- Stripe side effects are hard to inspect from inside the app
- Branding support exists in schema (`logoUrl`) but is not wired into settings or the UI
- Deployment and recovery docs are missing

## Goals

- Keep the app intentionally **single-owner** for now
- Make all data access owner-scoped so a second user cannot leak data if added later
- Add a proper path toward DB-backed auth without overbuilding a multi-tenant SaaS
- Surface Stripe-created resources in an internal, toggleable developer dock
- Wire up the existing `logoUrl` field so the app feels owned and publishable
- Leave the repo in a shape that can be refined toward open source later

## Non-Goals

- Public signup
- Teams / organizations / invitations
- Full accounting-grade credit-note workflows in this pass
- A separate client portal
- Deep Stripe object synchronization beyond what the app creates directly

## Proposed Solution

### 1. Single-Owner Auth & Authorization Baseline

Use the current internal login only as a temporary shell, but make the data layer behave as if ownership matters everywhere.

Implementation rules:
- Every page, action, and API route that reads or writes app data must load the current user first
- Every invoice, client, and bank account lookup must be filtered by owner
- Child resources (`line_items`, `activity_log`) must be reached through owner-scoped parent records
- Mutations must fail closed when the record is not owned by the current user

This gives immediate safety now and makes a later auth-library migration much smaller.

### 2. Deployable Session Auth Direction

Do not build public auth. Build **owner auth**.

Near-term:
- Continue to support a single owner account
- Replace shared-secret assumptions gradually with DB-backed session semantics
- Introduce a dedicated auth/config module so env requirements are explicit and testable

Longer-term:
- Swap the temporary auth layer for Better Auth or Auth.js without rewriting authorization again

### 3. Stripe Dev Dock

Add an internal-only, dark, toggleable bottom dock inspired by developer tooling.

Purpose:
- expose Stripe IDs and URLs created by the app
- make webhook/payment state visible without leaving the app
- reduce guesswork during manual testing and production debugging

Initial dock scope:
- collapsed by default
- available on dashboard routes only
- shows recent invoices with Stripe data:
  - invoice number
  - invoice status
  - Stripe payment link ID
  - Stripe payment link URL
  - Stripe payment intent ID if present
  - recent activity timestamps
- quick actions:
  - open Stripe payment link
  - copy IDs / URLs
  - jump to invoice detail

Follow-up enhancement:
- persist extra Stripe metadata in `activity_log.metadata` for richer history
- optionally store Stripe `price.id` if needed for deeper debugging

### 4. Brand / Logo Wiring

Wire the existing `users.logoUrl` field into the product.

Initial brand scope:
- add `Logo URL` to settings
- render logo in the dashboard header when present
- preserve a clean text fallback (`nota`) when absent or broken

Optional follow-up:
- add logo to invoice PDF header once the basic auth/authorization hardening is done

### 5. Invoice Safety Rules

Protect invoice history enough for real usage.

Rules:
- draft invoices can be edited freely
- sent invoices should no longer be freely editable
- paid invoices should be immutable
- destructive delete should become cancel/archive instead of hard delete
- manual `mark paid` / `cancel` actions should exist for non-Stripe payments

This phase is required before the app should fully replace a bookkeeping tool.

## Technical Approach

### Authorization Sweep

Key files to harden first:
- `nota/src/app/(dashboard)/invoices/page.tsx`
- `nota/src/app/(dashboard)/invoices/new/page.tsx`
- `nota/src/app/(dashboard)/invoices/[id]/page.tsx`
- `nota/src/app/(dashboard)/invoices/[id]/edit/page.tsx`
- `nota/src/app/(dashboard)/clients/page.tsx`
- `nota/src/app/(dashboard)/clients/[id]/page.tsx`
- `nota/src/actions/invoices.ts`
- `nota/src/actions/clients.ts`
- `nota/src/app/api/invoices/[id]/pdf/route.ts`
- `nota/src/app/api/invoices/[id]/xrechnung/route.ts`

Patterns:
- list pages filter by `userId`
- detail pages fetch owner-scoped parent first, then related records
- updates/deletes use compound ownership predicates
- PDF/XML routes verify invoice ownership before generating files

### Stripe Dev Dock Data Source

Phase 1 data source should avoid schema churn.

Use existing columns on `invoices`:
- `stripePaymentLinkId`
- `stripePaymentLinkUrl`
- `stripePaymentIntentId`
- `status`
- `sentAt`
- `paidAt`

And combine with `activity_log` to show timeline hints.

Potential implementation files:
- `nota/src/components/stripe-dev-dock.tsx` (new)
- `nota/src/app/(dashboard)/layout.tsx`
- `nota/src/lib/auth.ts`
- small server-side query helper if needed

### Brand Wiring

Potential implementation files:
- `nota/src/actions/settings.ts`
- `nota/src/components/settings-form.tsx`
- `nota/src/app/(dashboard)/settings/page.tsx`
- `nota/src/app/(dashboard)/layout.tsx`
- `nota/src/components/invoice-pdf.tsx` (follow-up)

### Configuration & Deploy Hygiene

Required repo additions:
- `.env.example`
- env validation module using `zod`
- real README for setup, seed, build, deploy, cron, and webhook config

Follow-up operational additions:
- smoke-test checklist
- migration/runbook notes
- restore notes for Neon

## Acceptance Criteria

### Auth / Authorization
- [x] Every invoice, client, and bank account list is owner-scoped
- [x] Invoice detail/edit/PDF/XML routes return not found or equivalent when the record is not owned
- [x] Client update/delete and invoice update/delete/send/reminder actions fail closed on non-owned records
- [x] The codebase no longer assumes “first user in the DB” is enough for authorization

### Stripe Dev Dock
- [x] A bottom dock exists on dashboard pages
- [x] The dock is visually distinct and dark-themed
- [x] The dock can be toggled open/closed
- [x] The dock shows recent Stripe-related invoice data from the app
- [x] The dock provides copy/open affordances for relevant Stripe values
- [x] The dock surfaces recent email jobs and dead-letter visibility

### Branding
- [x] Settings include a `Logo URL` input
- [x] Header shows the configured logo when present
- [x] Text fallback remains usable when no logo is set

### Deployability
- [x] The repo has an app-specific plan and README trail
- [x] Env requirements are explicit and validated
- [x] The app still builds successfully after the changes

### Follow-up Hardening
- [x] Registration and password-reset flows exist
- [x] A basic `bun test` suite covers password, reset-token, and invoice lifecycle logic
- [x] Outbound invoice emails are moved onto a retryable DB-backed job flow
- [x] Browser-level auth and invoice flow coverage exists

## Implementation Phases

### Phase 1: Owner Scoping Sweep
- Add owner-scoped reads for invoice/client pages
- Add owner-scoped predicates to invoice/client actions
- Lock down PDF/XML routes to owned invoices only
- Verify build after sweep

### Phase 2: Stripe Dev Dock
- Add dock UI and toggle state in dashboard layout
- Query recent Stripe-related invoice data for the current owner
- Add copy/open shortcuts and compact status display

### Phase 3: Brand Wiring
- Add logo URL setting
- Render logo in the header with a clean fallback

### Phase 4: Auth & Config Foundation
- Add explicit env validation
- Start moving auth from shared-secret assumptions toward a DB-backed session model
- Add `.env.example` and README deployment notes

### Phase 5: Invoice Safety
- Freeze sent/paid invoices
- Replace hard delete with cancel/archive semantics
- Add manual `mark paid` / `cancel`

## Risks & Notes

- The repository root is `/Users/mf/code/payme`, not `nota/`, so plan/docs commits must be made carefully
- There is an unrelated working-tree change in `ralph/ralph.sh` that must stay out of `nota` commits
- A real auth-library migration is valuable, but authorization hardening should land first because it is the more urgent defect
- The Stripe dock should stay explicitly internal-facing and not become customer UI

## Immediate Next Step

Implement the next trust-and-operations pass:
- add deeper integration or browser tests around login, scoped invoice access, and webhook payment completion
- add visibility into queued/dead email jobs inside the Stripe dock or settings
- consider moving password reset and registration behind invite-only or feature-flagged access if the app stays private
