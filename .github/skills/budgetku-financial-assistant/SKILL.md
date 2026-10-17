---
name: budgetku-financial-assistant
description: "Build and evolve a lightweight Indonesian family budgeting system for Cloudflare Workers with free-tier persistence. Use when designing budget flows, choosing a free database, implementing income/expense tracking, household sharing, allocation rules, financial insights, or deployment-safe changes in BudgetKu."
argument-hint: "Describe the budgeting feature or financial workflow to implement"
user-invocable: true
---

# BudgetKu Financial Assistant

## Purpose

Help implement and maintain BudgetKu as a practical family financial assistant. Prioritize simple daily use, clear household visibility, privacy, and free-tier Cloudflare Workers deployment over feature breadth.

## Product Principles

- Use Indonesian rupiah formatting and plain Indonesian copy unless the user requests another language.
- Keep the primary flow fast: record income/expense, review the month, understand what is safe to spend.
- Treat financial data as private: never expose secrets, tokens, receipt contents, or another household's records.
- Prefer a small, reversible change over a broad rewrite.
- Avoid paid infrastructure by default. Select free-tier services with a serverless-compatible connection model.
- Preserve the existing no-dependency approach unless a dependency materially reduces risk or complexity.

## Default Technical Direction

- Frontend: existing vanilla PWA in `public/`.
- Runtime: Node.js server-compatible with Cloudflare Workers serverless deployment; do not assume a long-lived process.
- Persistence: replace server-local SQLite/file writes for production with a free hosted database compatible with Cloudflare Workers, preferably a free Postgres provider such as Neon or Supabase. Keep SQLite only for local development if the code cleanly abstracts storage.
- Configuration: all database URLs, auth secrets, and provider keys come from environment variables; never commit `.env` files.
- API: preserve the existing HTTP contract where practical and make writes idempotent where retries are possible.

## Workflow

1. **Inspect the current app**
   - Read `README.md`, `package.json`, `server.js`, and relevant files under `public/`.
   - Identify current routes, auth/session behavior, storage schema, realtime behavior, and deployment assumptions.
   - Check the working tree before editing and avoid overwriting unrelated user changes.

2. **Clarify the feature boundary**
   - State the user outcome in one sentence.
   - Separate must-have behavior from optional polish.
   - For ambiguous financial rules, ask for the rule rather than silently inventing it.
   - Confirm whether the change is local-only, production-ready for Cloudflare Workers, or both.

3. **Model the smallest safe data change**
   - Define entities, ownership, household boundaries, required fields, and currency units before coding.
   - Store monetary values as integer rupiah (or another explicitly documented minor unit), never floating-point amounts.
   - Add timestamps, user/household ownership, and audit-friendly identifiers to new records.
   - Plan backward compatibility or a migration for existing SQLite data when persistence changes.

4. **Implement vertically**
   - Add or update storage abstraction first.
   - Add server validation and authorization before UI controls.
   - Wire the smallest end-to-end UI flow in `public/app.js` and `public/index.html`.
   - Update styles only when needed for clarity and mobile usability.
   - Keep realtime/event behavior consistent with the existing app, or document the limitation on Cloudflare Workers.

5. **Apply financial guardrails**
   - Validate amount, date, category, account/household ownership, and duplicate submission behavior.
   - Make budget calculations explicit: income, fixed needs, variable needs, wants, savings, and remaining safe-to-spend amount.
   - Never present estimates as facts; label assumptions and allow user overrides.
   - Ensure users cannot read or mutate another household's transactions through guessed IDs or altered requests.

6. **Validate locally and for Cloudflare Workers**
   - Run the available syntax checks and start the local app.
   - Exercise registration/login, household membership, transaction creation/edit/delete, monthly summaries, and invalid-input paths.
   - Verify mobile/PWA behavior for the main recording flow.
   - Check that production paths do not depend on filesystem persistence, process memory, or a permanently running SSE connection.
   - Review environment-variable requirements and document deployment steps in `README.md`.

7. **Review before completion**
   - Inspect the diff for accidental secrets, data leaks, broken existing routes, and unnecessary dependencies.
   - Report changed files, verification performed, known limitations, and any required manual setup.
   - Do not claim Cloudflare Workers readiness until persistence, environment variables, and serverless lifecycle assumptions have been checked.

## Decision Rules

- If production persistence is required, do not recommend SQLite on Cloudflare Workers's ephemeral filesystem.
- If realtime is required, prefer a hosted realtime service or polling fallback; do not rely on an in-process subscriber surviving serverless execution.
- If authentication is not yet production-safe, label the app MVP/local and avoid presenting it as secure for sensitive financial data.
- If a requested feature needs paid infrastructure, first propose a free-tier alternative and state its limits.
- If a calculation is a financial recommendation rather than bookkeeping, show the formula and assumptions in the UI or documentation.

## Completion Checklist

- [ ] User outcome and scope are explicit.
- [ ] Data ownership and authorization are enforced server-side.
- [ ] Money uses integer-safe storage and deterministic calculations.
- [ ] No secrets or production data are committed.
- [ ] Local validation passes for the changed flow.
- [ ] Cloudflare Workers/serverless persistence assumptions are addressed.
- [ ] `README.md` documents required environment variables and setup.
- [ ] Known free-tier limitations are stated.
