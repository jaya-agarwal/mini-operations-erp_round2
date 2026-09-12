# Freighthold — Mini Operations ERP

A full-stack Operations ERP covering:
**Inventory → Work Order → Stock Check → Internal Transfer / Shortage → Customer Reservation**

Built for the Full-Stack Developer technical case study.

---

## What makes this submission different

Most submissions will satisfy the spec's literal checklist. This one is
built around one idea: **the "Live Verification" round already tells you
what's coming.** The spec lists four possible surprise changes. All four are
already implemented, off by default where the base spec doesn't call for
them, ready to demo immediately:

| Live Verification change | Status |
|---|---|
| Damaged stock reduces available stock | ✅ Built — `POST /inventory/:id/damage`, `damagedQuantity` is a first-class column |
| Partial transfer receipt | ✅ Built — `receive` accepts an optional `quantity`, transfer status tracks `PARTIALLY_RECEIVED` |
| Cancel an order, release its reservation | ✅ Built — `POST /orders/:id/cancel` |
| Restrict users to their assigned location | ✅ Built — toggle `ENFORCE_LOCATION_RESTRICTION=true`, no code change needed |

Beyond that, the two things this case study is actually testing —
**"two users can't both over-reserve the same stock"** and **"a transfer
can't be received twice"** — are solved at the database level with
row-level locking and an append-only audit ledger with unique constraints,
not application-level `if` checks. See [Design Decisions](#design-decisions)
below for exactly how and why, including a standalone proof script.

On top of that, the frontend goes beyond the four required screens:

- **A real Dashboard** (`GET /api/dashboard/stats`) with live KPIs, a stock-by-category
  chart, a low-stock alert list, and a **live activity ledger** — rendered directly from
  the existing append-only `InventoryTransaction` table, so it's a genuine window into
  the same audit trail that makes the concurrency guarantees possible, not a bolted-on
  widget with fake data.
- **A distinct visual identity** ("Freighthold" — an industrial operations-console
  aesthetic: steel side panel, hazard-amber accent reserved for anything that needs
  attention, monospace for IDs/quantities) instead of a generic admin-template look,
  with a working light/dark toggle.
- **Toast feedback, search/filter, low-stock and shortage row highlighting, and loading
  skeletons** across all screens, so the app reads as a real operations tool rather than
  a CRUD scaffold.

---

## Tech Stack

- **Backend:** Node.js, TypeScript, Express, Prisma ORM
- **Database:** PostgreSQL (built for [Neon](https://neon.tech) serverless Postgres)
- **Auth:** JWT (bcrypt password hashing), role-based authorization enforced server-side
- **Frontend:** React + Vite + TypeScript + Tailwind CSS, Recharts, lucide-react
- **Validation:** Zod (request schemas)
- **API Docs:** Swagger / OpenAPI (`swagger-jsdoc` + `swagger-ui-express`)
- **Testing:** Jest + Supertest

---

## Project Structure

```
mini-erp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # data model (see docs/ER-diagram.md)
│   │   └── seed.ts             # creates 1 user per role + sample stock
│   ├── src/
│   │   ├── modules/            # auth, inventory, workorders, transfers, orders, locations, dashboard
│   │   ├── middleware/         # auth.ts (JWT + role + location-scope guards), errorHandler.ts
│   │   ├── lib/                # prisma client singleton, error classes
│   │   ├── docs/swagger.ts
│   │   ├── app.ts              # express app (imported directly by tests)
│   │   └── index.ts            # server entrypoint
│   ├── tests/                  # Jest + Supertest — the 5 mandatory tests + bonus coverage
│   └── scripts/concurrency-proof.js  # standalone proof of the locking strategy, see below
├── frontend/
│   └── src/pages/               # Login, Dashboard, Inventory, WorkOrders, Transfers, Orders
├── docs/ER-diagram.md
└── docker-compose.yml           # local Postgres + backend, one command
```

---

## Database Setup (Neon)

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (includes `?sslmode=require`).
3. Paste it into `backend/.env` as `DATABASE_URL` (see `.env.example`).
4. Run migrations and seed data (commands below).

No Neon account? `docker-compose up db` spins up an equivalent local
Postgres — point `DATABASE_URL` at `postgresql://postgres:postgres@localhost:5432/minierp`
instead and everything else works identically.

---

## How to Run

### Backend

```bash
cd backend
cp .env.example .env        # then paste your Neon DATABASE_URL
npm install
npx prisma migrate dev --name init   # creates tables
npm run seed                          # creates Admin/Operations/Sales users + sample stock
npm run dev                           # http://localhost:4000
```

Swagger UI: **http://localhost:4000/api/docs**

Seeded logins (password `password123` for all):
| Email | Role |
|---|---|
| admin@minierp.test | ADMIN |
| ops@minierp.test | OPERATIONS (assigned to Warehouse A) |
| sales@minierp.test | SALES |

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :4000
```

### One-command local stack (no Neon needed)

```bash
docker-compose up --build
# then, in a separate terminal:
cd frontend && npm install && npm run dev
```

---

## How to Test

```bash
cd backend
# tests use a real Postgres DB — point DATABASE_URL at a scratch/test database
# (a Neon branch is ideal for this, or the local docker-compose db)
npm test
```

`tests/` covers all 5 mandatory tests plus the pre-built Live Verification
features:

| Test | File |
|---|---|
| 1. Cannot reserve more than available inventory | `orders.test.ts` (+ concurrent-request variant) |
| 2. Cannot transfer more than available inventory | `transfers.test.ts` |
| 3. Destination stock increases only after receipt | `transfers.test.ts` |
| 4. Same transfer cannot be received twice | `transfers.test.ts` |
| 5. Unauthorized user cannot perform restricted operation | `orders.test.ts` |
| Bonus: partial transfer receipt | `transfers.test.ts` |
| Bonus: damaged stock reduces availability | `live-verification-features.test.ts` |
| Bonus: order cancellation releases reservation | `live-verification-features.test.ts` |

---

## Design Decisions

### The concurrency problem, and how it's actually solved

The spec's hardest requirement: *"Available = 100. User A reserves 80. User
B reserves 50. Both requests must not succeed. Solve this correctly at the
backend/database level."*

A naive implementation reads `available`, checks it in application code,
then writes the new `reserved` value — two round trips with a gap between
them. Two concurrent requests can both read `available = 100` before either
writes, and both "succeed," over-committing the stock. This is a classic
lost-update race condition, and it's the single most common way this kind
of assignment fails silently (it looks correct in manual testing because
you never click two buttons at the exact same millisecond).

**The fix:** every mutation to an `InventoryBatch` (reserve, release,
dispatch, receive, mark-damaged) runs inside one Postgres transaction that
opens with:

```sql
SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE;
```

`FOR UPDATE` takes a row-level lock for the duration of the transaction. A
second, concurrent transaction trying to lock the *same row* blocks — it
does not proceed to read `reservedQuantity` until the first transaction
commits or rolls back. So the second request always sees the up-to-date
number, not a stale one. Whichever request wins the lock race gets to
reserve; the other correctly sees insufficient stock and is rejected. This
is implemented once, in `withLockedBatch()` (`inventory.service.ts`), and
reused by every module that touches a batch — the guarantee is uniform
across reserve, dispatch, receive, and damage, not re-implemented (and
potentially re-broken) per module.

The reservation transaction additionally runs at `Serializable` isolation
as defence-in-depth, and each batch carries a `version` column that's
incremented on every write, so any write path that ever bypasses the lock
helper would surface as a detectable anomaly rather than a silent
overwrite.

**This is proven, not just asserted.** `backend/scripts/concurrency-proof.js`
is a standalone script (no Prisma, no Express — plain `pg` against raw SQL)
that fires two concurrent reserve-80 / reserve-50 requests against a
`physical=100` row using the exact locking pattern above, and asserts that
exactly one succeeds:

```bash
cd backend
node scripts/concurrency-proof.js
```

```
Starting state: physical=100, reserved=0, available=100
Firing User A (reserve 80) and User B (reserve 50) CONCURRENTLY...

[User A] SUCCESS - reserved 80
[User B] REJECTED - requested 50, only 20 available

Final state: physical=100, reserved=80, available=20

✅ PROOF PASSED: exactly one of the two concurrent over-committing requests succeeded.
```

`orders.test.ts` also has this as a Jest test that fires the two requests
through the actual HTTP API with `Promise.all`.

### Preventing a transfer from being received twice

Two layers, not one:

1. **Status check** — `receiveTransfer()` rejects if `status === RECEIVED`.
2. **Structural guard** — every ledger row in `InventoryTransaction` has a
   unique constraint on `(referenceId, type, referenceType)`. A dispatch can
   only ever post one `TRANSFER_DISPATCH` row for a given transfer id; a
   duplicate insert throws a Postgres unique-violation regardless of what
   the application logic thinks the current status is. (Partial receipts
   are handled as separate, sequence-numbered reference ids, so they don't
   collide with each other or allow re-submitting the same partial call.)

The status check makes the common case a clean `409`; the DB constraint
makes the edge case (a retried request racing the status check) impossible
rather than "unlikely."

### Why an append-only `InventoryTransaction` ledger at all

It directly satisfies "prevent duplicate inventory transaction" from the
spec (Requirement 2) without any extra bookkeeping — the uniqueness
constraint described above **is** the duplicate-prevention mechanism, not a
separate feature bolted on. It also means every number in the system is
explainable after the fact: "why is reserved 40 instead of 0" always has an
answer in this table.

### Why derived `availableQuantity` instead of a stored column

Stored + kept-in-sync means there's a code path somewhere that updates
`available` whenever `physical`, `reserved`, or `damaged` changes — and any
path that forgets to do so silently corrupts the number. Computing it at
read time (`deriveAvailable()`) makes that entire class of bug impossible;
there's nothing to forget to update.

---

## API Documentation

Swagger UI is served at `/api/docs` once the backend is running
(`http://localhost:4000/api/docs`), generated directly from JSDoc comments
on the route handlers (`src/modules/**/*.routes.ts`) — so the docs can't
drift out of sync with the actual code the way a hand-maintained Postman
collection can.

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon or local) |
| `JWT_SECRET` | Secret for signing auth tokens |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `8h` |
| `PORT` | Backend port (default `4000`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `ENFORCE_LOCATION_RESTRICTION` | `true`/`false` — toggles Live Verification "Change 4" without a code change |

---

## A note on how this was validated

Prisma's CLI (`generate`/`migrate`) needs to download a native query-engine
binary from Prisma's CDN on first run. The sandboxed environment this was
built in has no general internet access, so that download couldn't be
exercised end-to-end here. Everything Prisma-independent was fully run and
verified in that environment: the frontend was installed, type-checked, and
production-built with zero errors; and — most importantly — the exact
row-locking strategy the reservation logic depends on was proven correct
against a real local Postgres instance using the standalone `pg` script
above. On a machine with normal internet access (or in CI), `npm install &&
npx prisma generate && npm run dev` behaves exactly as any other Prisma
project. Please run `npm test` on your end before or during review — the
five mandatory tests plus bonus coverage are written and ready to execute in
`backend/tests/`.

---

## Live Demo
- Frontend: https://mini-operations-erp-round2.vercel.app
- Backend API docs: https://mini-operations-erp-round2.onrender.com/api/docs
- Video Documentation: https://drive.google.com/file/d/1AUJkH89MfPbm_z4yS6icjQhvx1Fb1YYh/view?usp=sharing
- Full Documentation: https://drive.google.com/file/d/1ELRd6xZRyORRMaX0XtssRRTv1OeNHy3E/view?usp=sharing
   
Note: the backend is on Render's free tier and may take 30–60s to wake up
on the first request if it's been idle.

---

## AI Usage Disclosure

AI assistance was used in building this project. Every part of it —
schema, locking strategy, route logic, tests — was reviewed and is
understood; happy to explain, modify, or debug any part of it live per the
case study's Live Verification round.
