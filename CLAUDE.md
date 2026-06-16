# CLAUDE.md · TicketHub 北极星

> **TL;DR for any agent / session landing here:** This file is the project's north star. Read it first. It defines *what we're building*, *how we think about it*, and *the protocol for evolving it*. Every subagent, every review pass, every new session **must** follow the **Evolution Protocol** at the bottom.

---

## 0. The 30-Second Mental Model

TicketHub is a **single-category commerce system** modeled on Ctrip's `票券` (ticket/voucher) category. It supports four ticket archetypes out of the box — **sight** (景区门票), **show** (演出票), **dining** (餐饮券), **experience** (体验券) — and is **designed for an Nth** (the fifth and beyond is "other" today, anything custom tomorrow).

It is built as a **single Next.js 14 App Router codebase** that serves three audiences from one repo:

| Audience | Path | Purpose |
| --- | --- | --- |
| **B2C shoppers** | `/` (route group `(frontend)`) | Browse, search, cart, checkout, voucher wallet |
| **CMS staff** | `/cms` | Product CRUD, orders, voucher verification, categories |
| **API consumers** | `/api/*` | REST-style route handlers, JSON in/out |

The architecture is intentionally **vertical-slice monorepo**: one repo, one Next.js process, three top-level route surfaces. This is the right shape *until* the team grows enough to physically separate the CMS as its own deployable — at which point the `app/cms` and `app/api` directories can be lifted into a second Next.js project with zero refactor, because the API and CMS share no client-side state.

---

## 1. Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js 14 App Router                       │
│  ┌────────────┐   ┌────────────┐   ┌─────────────────────────┐  │
│  │ (frontend) │   │   /cms     │   │      /api/*             │  │
│  │ B2C store  │   │ admin UI   │   │ route handlers (REST)  │  │
│  └─────┬──────┘   └─────┬──────┘   └──────────┬──────────────┘  │
│        │                │                     │                  │
│        └────────────────┴─────────────────────┘                  │
│                              │                                  │
│                    ┌─────────▼─────────┐                        │
│                    │   Service layer   │  ← 唯一写入口           │
│                    │  (lib/services/*) │                        │
│                    └─────────┬─────────┘                        │
│                              │                                  │
│                    ┌─────────▼─────────┐  ┌─────────────────┐   │
│                    │  Mongoose Models  │  │ Strategy layer  │   │
│                    │  (lib/models/*)   │  │ (lib/strategies)│   │
│                    └─────────┬─────────┘  └────────┬────────┘   │
└──────────────────────────────┼──────────────────────┼───────────┘
                               │                      │
                          ┌────▼─────┐         ┌──────▼──────┐
                          │ MongoDB  │         │   Cache     │
                          │ (primary)│         │ (in-mem →   │
                          │          │         │   Redis)    │
                          └──────────┘         └─────────────┘
```

### 1.1 The Three Inviolable Rules

1. **All writes go through `lib/services/*`.** Route handlers and server components may read with Mongoose directly, but anything that mutates state MUST live in a service. This is what makes the codebase auditable, testable, and replaceable.
2. **All input is validated at the route boundary with Zod.** A request that hasn't passed through `withValidation` is a bug, not a feature.
3. **All cross-cutting concerns (auth, error, rate-limit, validation) compose via HOFs, not inheritance.** Read `lib/middleware/withError.ts` for the canonical example.

### 1.2 The Extensibility Contract

The whole system is built so that **adding a new ticket type is a 3-step, ~30-line change**:

1. Append `'my-type'` to `TicketType` in `src/models/Category.ts` and `src/lib/validation/schemas.ts`.
2. Implement `MyTypeStrategy` in `src/lib/strategies/my-type.ts` (the interface is in `types.ts`).
3. Register it: `registerStrategy('my-type', MyTypeStrategy)` in `src/lib/strategies/registry.ts`.

That is the *only* correct way to add a new ticket type. If your change requires touching more than three files, **propose a refactor first** — the contract is doing its job when additions are cheap.

---

## 2. Stack & Conventions

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 14 App Router** | Server Components, route groups, single deploy |
| Language | **TypeScript strict** | Catch mistakes at compile time, not in prod |
| UI | **React 18 + Tailwind CSS** | Server-friendly, no runtime CSS-in-JS |
| DB | **MongoDB + Mongoose** | Document model fits the polymorphic `attributes` field |
| Auth | **`jose` JWT in HttpOnly cookie** | Edge-compatible, no Node-only crypto |
| Validation | **Zod** | Single source of truth: types *and* runtime checks |
| Cache | **In-mem Map, swappable to Redis** | Start simple, scale by changing one file |
| Tests | (TBD — add Vitest when iteration count > 5) | Cost/benefit only kicks in once code stabilizes |

### 2.1 Naming & File Conventions

- **One model per file**, named after the model: `models/Product.ts` exports `Product` and `IProduct`.
- **One service per resource**, named `XxxService.ts`. Service functions are pure of HTTP concerns.
- **Route handlers** live in `app/api/<resource>/route.ts` and use HOFs: `withError → withValidation → withAuth`.
- **No barrel files** for components. Import directly: `import { Button } from '@/components/ui/Button'`. Mongoose's `models/index.ts` is the one allowed barrel (it's typed).
- **Comments are in Chinese (zh-CN)** for code-level annotations; **identifiers and commit messages in English**. This matches the team's primary language while keeping git tooling friendly.

### 2.2 Money, IDs, and Time — The Three Sacred Types

- **Money**: integers in cents. Field suffix: `*InCents`. Never floats. Never strings.
- **IDs**: Mongoose's `_id` is renamed to `id` in `toJSON`. The client never sees `_id`.
- **Time**: `Date` for instants, `string` (`YYYY-MM-DD`) for *visit dates* (calendar day, not instant). Never store local time strings.

---

## 3. The Three Domains

### 3.1 Sales Frontend — `app/(frontend)/`

The conversion-optimized B2C surface. Mobile-first. Server Components for SEO-critical pages (list, detail, landing), Client Components for cart and interactive bits.

**Bottleneck to watch**: list pages. Always paginate server-side, never `find()` without `.limit()`. The Cache-Control header is set globally in `src/middleware.ts` — be careful changing it.

### 3.2 CMS — `app/cms/`

The admin surface. Heavier on forms than on data. Every form posts to a `lib/services/*` function. Use Server Actions for forms where possible; route handlers for actions that need to be called from external integrations.

**Rule**: a CMS page must work without JavaScript for read operations (Server Components). Write operations (forms) can require JS.

### 3.3 API — `app/api/`

The public surface. Stable contracts, version-free for now (we're v0). Every route composes:

```ts
export const POST = withError(
  withValidation({ body: SomeSchema }, async ({ body, req }) => {
    // ...
  })
);
```

Add `withAuth({ roles: [...] })` for protected routes. **Do not** write a route handler that does its own try/catch or its own `await req.json()` — the HOFs do that.

---

## 4. Data Model — Why It's Shaped This Way

The five collections are: **User, Category, Product, Cart, Order, Voucher**.

The interesting design decisions:

- **`Product.attributes` is `Mixed`.** Each `ticketType` carries its own fields. The schema is enforced in TypeScript by the strategy pattern, not in MongoDB. This lets a "tour bus" ticket type ship next month without a migration.
- **`Order` carries a `productSnapshot`.** When a product is renamed or pulled, the historical order stays correct. This is non-negotiable for invoicing and customer support.
- **`Voucher` is a separate collection from `Order`.** One order of 3 dining vouchers produces 3 Voucher docs. This lets each voucher be independently verified, refunded, and audited.
- **`Cart` is one-per-user (not per-session).** Anonymous carts are a future feature; for v0, cart requires login. This is a deliberate simplification — it removes a class of edge cases.
- **Status enums are strings, not numbers.** Easier to debug, no implicit ordering, and MongoDB aggregations stay readable.

### Indexes (Do Not Remove)

The following compound indexes are *load-bearing* for the current query patterns:

- `products`: `{ status, salesCount }`, `{ categoryId, status, salesCount }`, `{ 'location.city', status }`, text on `{ title, summary, description }`
- `orders`: `{ userId, createdAt }`, `{ status, expiresAt }`
- `vouchers`: `{ status, expiresAt }`, `{ userId }`

If you remove one, expect a performance regression. If you add one, document the query that requires it in the schema's comment block.

---

## 5. Security Posture (v0)

| Concern | Mitigation |
| --- | --- |
| **XSS** | React's default escaping + CSP-friendly HTML output |
| **CSRF** | `SameSite=Lax` cookies; mutating endpoints are POST/PUT/DELETE |
| **NoSQL injection** | Zod validation at the route boundary; Mongoose schema typing |
| **Password storage** | `bcryptjs` cost 12 |
| **Session** | JWT in HttpOnly cookie, short TTL (e.g. 7d access + refresh) |
| **Rate limiting** | In-memory token bucket per IP+path (Redis-backed is a v1 task) |
| **Authorization** | RBAC: `user` / `staff` / `admin`. Roles checked in `withAuth` and in the service layer |
| **Secrets** | `.env.local` only; `JWT_SECRET` and `MONGODB_URI` are required at boot |

**Defense in depth**: the global `src/middleware.ts` adds security headers (`X-Content-Type-Options`, `Referrer-Policy`). Per-route HOFs add the route-specific checks. The service layer is the last line — *no* write skips authorization.

---

## 6. Scalability Plan (v0 → v1 → vN)

### v0 (current)
- Single Node process, single MongoDB
- In-memory cache and rate limiter
- 2-20 connection pool

### v1 (when DAU > 1k or p95 list > 200ms)
- **Cache**: swap `lib/cache.ts` to Redis (the interface stays the same; the implementation changes)
- **Rate limit**: swap to Redis sliding window
- **Images**: serve from object storage (S3/R2) with CDN; product.image becomes a URL
- **Sessions**: keep JWT (they're cheap to verify) but add a refresh token store in Redis so logout can revoke

### vN (when team > 5 engineers OR DAU > 100k)
- **Split CMS**: extract `app/cms` + `app/api` into a separate Next.js project
- **Worker queue**: order confirmation, voucher generation, refund processing → BullMQ on Redis
- **Read replicas**: MongoDB secondaries for list queries, primary for writes
- **Search**: MongoDB Atlas Search or Meilisearch, fed by change streams

The contract is: **the boundary between frontend, CMS, and data layer does not move between v0 and vN.** If you find yourself wanting to break it, propose a refactor first.

---

## 7. Coding Standards — The Non-Negotiables

1. **`strict: true` in `tsconfig.json`.** No `any` in new code. `unknown` is fine if you immediately narrow.
2. **No silent errors.** Every `catch` either re-throws, logs, or returns a typed `Result`. `catch { return null }` is allowed only at I/O boundaries where the caller already handles null.
3. **Functions do one thing.** If you need a comment to explain a function, the function probably needs to be split.
4. **Constants are SCREAMING_SNAKE_CASE. Types and interfaces are PascalCase. Variables and functions are camelCase.** No exceptions.
5. **Server Components by default.** Add `"use client"` only when you need state, effects, or browser APIs.
6. **No `console.log` in committed code.** Use a logger (to be added in Phase 7). `console.error` is acceptable for unhandled exceptions.

---

## 8. The Evolution Protocol (READ THIS LAST — IT'S THE MOST IMPORTANT SECTION)

This project is **explicitly** built to be evolved by an iterative loop of subagents and review sessions, **at least 10 times**, until **two consecutive cycles** find nothing actionable.

### 8.1 The Loop

Each cycle, in order:

1. **Audit.** A subagent (or fresh session) reads the codebase end-to-end and produces a structured finding list. Findings are tagged: `[bug]`, `[perf]`, `[security]`, `[ux]`, `[extensibility]`, `[docs]`, `[code-smell]`.
2. **Triage.** Findings are bucketed: 🔴 must-fix, 🟡 should-fix, 🟢 nice-to-have. Anything not actionable is dropped (with a reason in the cycle log).
3. **Apply.** Each 🔴 is applied as an atomic commit. Each 🟡 is bundled into a single "cycle N cleanup" commit. 🟢s are deferred to a backlog.
4. **Verify.** Re-run typecheck, lint, and any smoke tests. If something regressed, it's a 🔴 for the next cycle.
5. **Log.** Append to `EVOLUTION.md` (one section per cycle) with: the changes, why, what was deferred, and what to look at next.
6. **Repeat** — but only with a **fresh session or subagent**, never the same context. Fresh eyes find different things.

### 8.2 Stop Conditions

The loop terminates when **two consecutive cycles produce zero 🔴 and zero 🟡 findings**. 🟢-only cycles do not count as a "dry" — keep going.

### 8.3 Subagent Prompt Template

When dispatching a subagent for an evolution cycle, hand it:

> **Mission**: Audit `tickets/` for the Nth evolution cycle. Read `CLAUDE.md` first. Produce findings tagged `[bug|perf|security|ux|extensibility|docs|code-smell]` with severity `🔴|🟡|🟢`. **Do not edit files.** Return JSON: `{findings: [{tag, severity, file, line, summary, suggestedFix}]}`. Use 3 lens-passes (correctness, performance, security) in parallel for cross-validation.

### 8.4 What This Project Is NOT

- It is not a generic e-commerce platform. The "one category" is the point — adding hotel/flight is a future evolution, not a current goal.
- It is not a SaaS template. There's no multi-tenancy. If you need that, propose a v2.
- It is not a CMS framework. The CMS is hand-rolled for this domain; we are not building "a CMS" as a product.

### 8.5 What Success Looks Like

After 10+ cycles, the codebase should have:
- **Zero `any`** in new code.
- **Zero silent errors** (every `catch` is typed).
- **Zero duplication** of business logic between API/CMS/frontend.
- **One obvious place to change** for any given concern.
- **Documentation that does not lie.** If a comment says X, the code does X.

---

## 9. Quick Reference

| Where to look | What you'll find |
| --- | --- |
| `src/app/api/*/route.ts` | API route handlers, all composed via HOFs |
| `src/app/cms/**` | Admin pages, server-rendered forms |
| `src/app/(frontend)/**` | B2C pages, server-first with client islands |
| `src/lib/services/*` | The write-side of the system — touch with care |
| `src/lib/strategies/*` | Per-ticket-type business rules |
| `src/lib/middleware/*` | HOFs for cross-cutting concerns |
| `src/models/*` | Mongoose schemas and TypeScript types |
| `src/lib/validation/schemas.ts` | Zod schemas — the contract for the API |
| `src/middleware.ts` | Global Next.js middleware (headers, cache hints) |
| `EVOLUTION.md` | The running log of audit cycles (added by cycle 1) |
| `README.md` | User-facing quickstart (for humans, not agents) |

---

*Last updated: cycle 0 (project bootstrap). Every evolution cycle must update the cycle log in `EVOLUTION.md`.*
