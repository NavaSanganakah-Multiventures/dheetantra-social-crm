# Agent Guidelines & Repo Rules

Rules and conventions that **MUST** be followed when working in this repository.
Humans and AI agents alike — read this before editing the code or database.

---

## R1 — Keep `schema.sql` in sync with EVERY migration

This repository has **two parallel migration mechanisms**:

1. `wrangler d1 migrations apply dhitantra_db_prod --remote` — runs the `.sql` files in `db_migrations/` (the canonical migrations).
2. The **admin panel "Migrate" button** — runs `diffSchema(db, schema.sql)` from `src/schema.ts`, which only knows about tables/columns declared in `schema.sql`.

`diffSchema` parses **only** `CREATE TABLE IF NOT EXISTS (...)` blocks. It does **not** read `db_migrations/*.sql` and does **not** parse standalone `ALTER TABLE` statements.

> ⚠️ Therefore: **every time a migration adds a table or column, you MUST also add it to `schema.sql`**, otherwise the admin panel reports a false "up to date" and the table/column is never created on databases that rely on the admin migration path — exactly the bug that left `addon_subscriptions` missing and broke domain-add.

**How to keep them in sync:**
- **New table** → append a `CREATE TABLE IF NOT EXISTS (...)` block to `schema.sql` (same `CREATE TABLE IF NOT EXISTS` form, because that's what `parseSchemaSQL` matches).
- **New column on an existing table** → add the column line **inside** that table's existing `CREATE TABLE` block in `schema.sql` (so `diffSchema` detects it as missing and emits `ALTER TABLE ... ADD COLUMN`). Standalone `ALTER TABLE` lines in `schema.sql` are ignored.
- Also keep `src/schema.ts` → `allTableNames` in sync if the table should appear there.

**Concrete failure that produced this rule:** migration `0019_saas_email_gating.sql` added `addon_subscriptions`, `service_addons`, `custom_hostnames` and 4 `domains` columns (`billing_status`, `subscription_id`, `admin_notes`, `requested_by`), but `schema.sql` was never updated → admin panel said "up to date" while the tables were missing → `getActiveEmailAddon()` threw `no such table: addon_subscriptions` → domain-add returned a non-JSON 500 → UI showed an opaque "अमान्य प्रतिक्रिया" error.

---

## How to add a new rule

Append a new `## R<n> — <title>` section below. Keep rules concrete, with the *why* and a *how*, so any future editor (human or agent) can follow them without re-discovering the same bug.

---

## Rule index

- **R1** — Keep `schema.sql` in sync with every migration (dual migration system pitfall).
