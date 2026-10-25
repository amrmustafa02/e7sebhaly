# Frontend Architecture & Quality Rules

Reusable engineering rules for web frontends. The examples use **TypeScript**,
**React**, Clean Architecture, and often **Next.js (App Router)**, **TanStack React
Query**, **Zustand**, **React Hook Form + Zod**, **next-intl**, and **Tailwind CSS**,
but stack-specific rules apply only when the project actually uses those tools.
Do not introduce a framework, library, folder, command, or dependency solely
because it appears in an example.

These rules apply to human and AI contributors. The user's current request and its
acceptance criteria define the requested outcome. Use this file for architecture
and engineering conventions, and inspect the existing code, reference feature, API
contracts, and any available project notes for context. Separate requirements,
screen inventory, or wireframe documents are optional, not prerequisites. If
available sources conflict or a material product decision cannot be inferred
safely, explain the conflict and ask the user before proceeding (§30).

## Scope & how to adopt

- Apply these rules to the frontend source, tests, and tooling configuration, using
  the repository's actual structure (for example `src/`, `app/`, or `components/`).
- Treat this file as a living document. New rules may be appended over time
  without changing the meaning of older rules unless explicitly requested.
- **Pick a reference feature** only if the repository has a clear, mature example
  (usually the most complete CRUD feature). When in doubt, mirror its structure.
  If none exists yet, define the conventions needed for the new feature instead of
  inventing a reference. `<feature>` below is any feature folder (e.g. `orders`,
  `products`) and `<Entity>` is its domain entity (e.g. `Order`, `Product`).
- **Read the framework documentation for the installed version** before using an
  API you are unsure of. Next.js ships its docs in `node_modules/next/dist/docs/`;
  APIs and conventions change between majors.
- Record the actual stack, versions, scripts, and environment variables in the
  project profile (README, package manifest, CI configuration, or `.env.example`),
  not in this general file (§36).

## Default stack (when the project uses it)

| Concern | Typical choice |
|---|---|
| Framework | React + TypeScript (`strict: true`); Next.js App Router when server rendering/routing is needed |
| Server state | TanStack React Query |
| Client / UI state | Zustand (or local component state) |
| Forms & validation | React Hook Form + Zod |
| i18n | The project's i18n library (e.g. `next-intl`) for every supported language |
| Styling | Tailwind CSS with design tokens; shared components in `shared/ui/` |
| Tests | Vitest (or the project's runner) + Testing Library (+ `user-event`) |

Adding a new dependency needs a reason (§29) and approval when it overlaps with
something already in the stack.

## Current Rules

### 1. Follow Clean Architecture for every feature

Every feature is split into three layers with a strict dependency direction —
**dependencies point inward toward the domain**:

```text
presentation  →  domain  ←  data
```

- `domain` is plain TypeScript: no React, no framework, no HTTP client, no store.
- `data` implements the ports declared in `domain` and is the only layer that
  talks to the backend.
- `presentation` (pages, components, hooks) depends on `domain`, never on
  `data` internals. Wiring happens in the feature's `di.ts` (§5).

### 2. Folder structure

Use this shape unless the repository already has an established equivalent. Route
folders follow the framework in use (Next.js `app/`, or the router of a Vite/SPA
project).

```text
src/
├─ app/                              # routes only — thin pages/layouts (§3)
├─ features/
│  └─ <feature>/
│     ├─ presentation/
│     │  ├─ components/              # <feature>-<thing>.tsx — one component per file
│     │  ├─ hooks/                   # use-<action>.hook.ts — React Query hooks wrapping use cases
│     │  ├─ stores/                  # <feature>-<thing>.store.ts — UI state only (§8)
│     │  ├─ schemas/                 # <form>.schema.ts — form schemas (§13)
│     │  └─ test/
│     ├─ domain/
│     │  ├─ entities/                # <entity>.entity.ts — plain types the UI renders
│     │  ├─ enums/
│     │  ├─ constants/               # <feature>.constants.ts — named constants (§21)
│     │  ├─ repositories/            # <feature>.repository.ts — PORT (interface)
│     │  ├─ use-cases/               # <action>.use-case.ts — one class per operation
│     │  └─ test/
│     ├─ data/
│     │  ├─ dto/                     # <entity>.dto.ts — exact backend wire shape
│     │  ├─ mappers/                 # <entity>.mapper.ts — DTO ↔ entity
│     │  ├─ repositories/            # <feature>.api.repository.ts (+ <feature>.fake.repository.ts, §35)
│     │  ├─ fixtures/                # <feature>.fixtures.ts — DTO-shaped sample data for the fake
│     │  └─ test/
│     └─ di.ts                       # builds use cases with their repository
├─ shared/
│  ├─ ui/                            # design-system components (Button, Table, Dialog, EmptyState …)
│  ├─ api/                           # the single HTTP client, error mapping, response envelope types
│  ├─ i18n/                          # i18n config, routing, formatters (money, date, number)
│  ├─ auth/                          # session, route guards, permission helpers
│  └─ lib/                           # small framework-free helpers
└─ messages/                         # translation catalogs, one per supported language
```

- A feature's React Query key factory lives in
  `presentation/hooks/<feature>.query-keys.ts` (§9).
- `shared/` never imports from `features/` (§42).

### 3. Pages are thin

- Route files only compose: read params, check access, render the feature's
  top-level component. No fetching logic, no business rules, no mapping in
  `page.tsx` / `layout.tsx` (or the router's equivalent).
- Route files never import from a feature's `data/` layer.

### 4. Components never call the network

- Components → hooks → use cases → repository port → `data/` implementation →
  `shared/api` client. Never `fetch`/`axios` inside a component or hook body.
- One HTTP client lives in `shared/api/`. It owns the base URL, credentials/cookies,
  the locale header (`Accept-Language`), the CSRF header on requests that change data
  when the backend uses one, timeouts, an `Idempotency-Key` option where the API
  supports it, and maps backend errors to one typed `ApiError` (§16).
- Uploads and other special calls (multipart with progress, `204 No Content`
  responses) are extra methods on the same client, so headers, auth, timeouts, and
  error mapping stay identical (§47).

### 5. Repository = port + implementation, wired in `di.ts`

- `domain/repositories/<feature>.repository.ts` declares the interface.
- `data/repositories/<feature>.api.repository.ts` implements it.
- `di.ts` creates the use cases with the **api** implementation; hooks import use
  cases from `di.ts`. Tests (and local demos without a backend) use the fake
  repository (§35).

### 6. DTOs stay in `data/`; the UI only sees entities

- `data/dto/` mirrors the backend contract exactly (field casing, nullability,
  enums, pagination envelope). Mappers convert DTO → entity (camelCase) and
  entity/form input → request DTO.
- Raw backend shapes never reach components. If the backend contract changes,
  only `dto/` + `mappers/` change.

### 7. Use cases hold application logic

- One class per operation with a single `execute()` method
  (`CancelOrderUseCase`, `AssignOrderUseCase`).
- Business rules (pricing, fees, status transitions, eligibility) are decided by
  the **backend**. The frontend displays them; it never recomputes them. A use case
  may only orchestrate calls and client-side preconditions that the backend also
  enforces.

### 8. Server state in React Query, UI state in a store

- Anything that comes from the backend lives in React Query (or the project's
  server-state library). Never copy server data into a store or `useState` — the
  copy goes stale.
- The client store (e.g. Zustand) is for UI state shared across components
  (sidebar collapsed, open drawer, selected rows). Prefer local state when only one
  component needs it.
- Never persist tokens or personal data in a persisted store (§18).

### 9. React Query conventions

- Query keys come from one factory per feature (`orderKeys.list(filters)`,
  `orderKeys.detail(id)`) and include **every** parameter the query depends on
  (filters, page, sort, locale, id).
- Mutations invalidate or update every affected query. Optimistic updates must
  have a rollback.
- Action buttons are disabled while their mutation is pending (no double submit).
- Clear the query cache whenever a session ends or a new one starts, so one
  person's data is never shown to the next (§44).

### 10. Every data view handles all four states

- **Loading** (skeleton matching the layout), **error** (message + retry),
  **empty** (explanation + primary action when there is one), **success**.
- Use shared `QueryState` / `EmptyState` / `ErrorState` components from
  `shared/ui/` — do not re-invent them per feature.
- Add error boundaries (e.g. Next.js `error.tsx`) at sensible route levels so one
  failing widget does not take down the page.

### 11. Lists: paginated, sortable, filter state in the URL

- Every list that can grow is paginated server-side; page size comes from a named
  constant. A list the API documents as returned whole is the written exception.
- Filters, search, sort, page, and active tab live in the URL search params so
  refresh, share, and back work (§40).
- Search inputs that hit the API are debounced (named constant for the delay).

### 12. Server vs. Client Components (Next.js App Router)

- Applies to projects using React Server Components. Default to Server Components.
  Add `'use client'` only where interactivity or browser APIs are needed, and push
  it as far down the tree as possible.
- Never import server-only code (secrets, server session helpers) into a client
  component.

### 13. Forms: one schema, server errors on their fields

- Every form has a schema (e.g. Zod) in `presentation/schemas/`. Validation
  messages are translation keys, never literal text.
- Each field control has an explicit `id` so an error summary can link to it.
- Server validation errors (field-level `details` from the backend) are mapped back
  to the matching fields, not only shown as a toast. An error that matches no field
  is shown as a banner above the form; the person's input stays in the form.
- Inputs use the correct `type` / `inputMode` / `autocomplete` (phone, email,
  numeric OTP, `current-password` / `new-password`). Passwords are never trimmed.
- Warn before leaving a form with unsaved changes when losing them matters.

### 14. Permissions: UI hiding is UX, not security

- Each route and each action declares the permission it needs (same permission
  keys as the backend). Use one shared guard component / `can()` helper — no ad-hoc
  role checks in components.
- Hidden buttons and guarded routes are convenience only; the backend is the real
  authorization boundary. Handle `403` gracefully and show the backend's message.
- A screen opened with view-only access hides create/save actions and makes fields
  read-only, with a visible notice; the backend still refuses writes.

### 15. Localize everything; RTL done right

- Every user-facing string goes through the project's i18n mechanism with keys in
  **every** supported language — JSX text, placeholders, `alt`, `aria-label`,
  toasts, validation messages, table headers, empty states. Arabic (`ar`) and
  English (`en`) are typical, not universal.
- `dir` and `lang` on `<html>` come from the active locale. Arabic is RTL.
- Use logical CSS only: `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`,
  `text-start` — never `ml-*`, `mr-*`, `left-*`, `right-*`, `text-left`.
- Directional icons (arrows, chevrons, back) flip in RTL.
- Numbers, dates, and currency are formatted through shared formatters in
  `shared/i18n/` (built on `Intl`), never by string concatenation. Plurals use ICU
  plural rules. The digit system (Latin or Arabic-Indic) is one documented choice.

### 16. One error contract

- The `shared/api` client turns every failed response into a typed `ApiError` with
  the backend's `code`, localized `message`, and optional `details`.
- Show the backend's localized message by default. Handle specific `code`s
  explicitly where the UI must react (e.g. slot already taken, record changed by
  someone else).

### 17. Money and time

- Amounts are displayed through one shared money formatter (project currency,
  locale-aware). No floating-point math on amounts that matter — totals and fees
  come from the backend.
- Timestamps arrive in UTC and are shown in the project's documented display
  timezone through one shared date helper. A missing time is shown as text (e.g.
  "Not yet"), never as a fake date.

### 18. Security basics

- Access/refresh tokens are stored in `httpOnly`, `Secure`, `SameSite` cookies when
  the backend supports it — never in `localStorage`, `sessionStorage`, or a
  persisted store.
- No secrets in client code or public env variables (`NEXT_PUBLIC_*`, `VITE_*`).
- No `dangerouslySetInnerHTML` (or equivalent) with unsanitized content;
  user-controlled URLs are validated before going into `href`/`src`.
- No tokens, OTPs, or personal data in URLs, logs, or analytics.
- Post-login redirects only go to allowed internal paths, checked by one shared
  helper (§44).

### 19. Accessibility

- Semantic elements (`button`, `a`, `label`, ordered headings) — no clickable
  `div`s. Every input has a label; icon-only buttons have an accessible name.
- Everything works with the keyboard; dialogs and drawers trap and restore focus.
  Row actions are reachable by keyboard and on touch screens (e.g. a row menu).
- A choice of one among a few values is a radio group (or segmented control built
  on one), not a row of unrelated buttons.
- Sufficient contrast; colour is never the only signal of a state (status badges
  carry text too).

### 20. Styling uses the design system

- Colours, spacing, radius, and typography come from theme tokens — no hard-coded
  hex values, pixel spacing, or one-off font sizes.
- Reuse `shared/ui/` components. A feature never re-implements a button, table,
  dialog, badge, or form field that already exists there.
- One styling approach. No inline styles except for truly dynamic values.
- Changing a `shared/ui/` component's public props or behaviour needs approval.

### 21. No hard-coded values or magic numbers

- Page sizes, debounce delays, limits, polling intervals, route paths, and query
  keys are named constants or configuration. Paths are built from one routes map
  (`ROUTES.order(id)`), not typed inline.
- Status → label/colour/icon mappings live in one map per enum (single source of
  truth), not in `switch` statements spread across components.

### 22. No silent fallbacks

- Never hide a failure behind a default (showing `0` when a price failed to load,
  an empty list when the request errored, "signed out" when the backend could not
  be reached). Show the error state instead.

### 23. Types are strict

- No `any`, no `as` casts to silence the compiler, no non-null `!` without a proven
  reason. Unknown external data is parsed/validated at the boundary.
- One component, type, or interface per file.

### 24. Naming & conventions

- Files and folders: `kebab-case`. Suffix reveals the layer:
  `.entity.ts`, `.enum.ts`, `.dto.ts`, `.mapper.ts`, `.repository.ts`,
  `.api.repository.ts`, `.fake.repository.ts`, `.fixtures.ts`, `.use-case.ts`,
  `.hook.ts`, `.query-keys.ts`, `.store.ts`, `.schema.ts`, `.constants.ts`.
- Tests: `.test.ts` / `.test.tsx` inside the layer's `test/` folder (§31).
- Components: `PascalCase` (`OrderStatusBadge`), hooks: `useCancelOrder`,
  handlers: `handleCancelClick`. Names say what the thing is — no `data`, `temp`,
  `Comp2`.

### 25. Keep files small and focused

- Hard limit: **300 lines** per production source file. Split by responsibility
  before reaching it (extract a hook, sub-component, or mapper).
- A component that fetches, transforms, validates, and renders is a smell — keep
  rendering in the component and move the rest out.

### 26. Code explains itself; comments explain decisions

- Default is no comment: rename or restructure instead of explaining *what* the
  code does.
- Comment only the *why* of a non-obvious business/UX rule, a browser workaround,
  or a deliberate trade-off.
- No commented-out code, no `console.log`, no TODO without context.

### 27. Reuse before writing

- Search `shared/` and the other features before adding a helper, component, or
  hook. Duplicated formatting, mapping, or validation must be consolidated into
  one place — in the right layer.
- Do not change another feature's logic without approval.

### 28. Performance

- Stable, unique `key`s for lists; virtualize or paginate long lists.
- Optimized images with explicit sizes (e.g. `next/image`, restricted to the
  project's known image hosts) and self-hosted fonts (e.g. `next/font`).
- Heavy, rarely used UI (charts, maps, rich editors) is lazy-loaded.
- Store selectors subscribe to the slice they need, not the whole store.
- Memoize only where there is a measured or obvious cost.

### 29. Dependencies

- Every new package must be justified (what it solves that the stack does not).
  Prefer tree-shakeable imports; no full `lodash`/`moment` for one helper.

### 30. Resolve material ambiguity without unnecessary interruptions

- Use the user's current request and acceptance criteria as the source for the
  requested outcome. Use this file for engineering conventions, and inspect existing
  code, the reference feature, API contracts, and any available project notes for
  context. Separate requirements, screen inventory, or wireframe documents are
  optional and must not be required to begin.
- Ask in simple Arabic with concrete options when an unresolved decision materially
  affects business behavior, UX, permissions, security, data handling, or an API
  contract.
- For low-risk implementation details already determined by these rules or
  established patterns, choose the conventional option and continue. State
  important assumptions.
- If available sources conflict, do not silently invent a reconciliation; explain
  the conflict and ask before making a material decision.

### 31. Tests

- Domain tests: use cases with a fake repository.
- Data tests: mappers, the api repository with a mocked HTTP client, and the fake
  repository (it must honour the same port, pagination and error codes).
- Presentation tests: components and hooks with real logic, covering loading,
  error, empty, and success states. Query by role/label/text as a user would.
- Snapshot-only tests do not count as coverage. Skipped tests need a reason.

### 32. Verify before finishing

- Run the checks the repository defines — type checking, lint, format check, and
  tests — using the script names from its package manifest and CI. Do not assume
  every project has the same script names.
- Check the screen in the browser in every supported language and direction (RTL
  and LTR when both exist), at phone, tablet, and desktop widths, with
  loading/error/empty states exercised.
- Report exactly which checks passed, failed, or could not run. Never claim a check
  passed if it was not executed.

### 33. Branches, commits, and pull requests

- Create a branch before any edit (`feature/<feature>-<short-desc>`,
  `fix/<short-desc>`, `chore/<short-desc>`, `docs/<short-desc>`). Include an
  established feature identifier in the name when useful. Never commit directly to
  the protected default branch.
- Keep pull requests small and coherent (the team guideline is about 15 files).
  Split bigger work into a sequence of PRs that each build and pass tests on their
  own; explain when a coherent change legitimately needs more.

### 34. Keep this file in sync

- When a new convention is agreed, add it here as a numbered rule in the same
  change that introduces it.

### 35. Fake repositories and fixtures

- Each feature may have `data/repositories/<feature>.fake.repository.ts`
  implementing the same port as the api repository, used by tests and local demos
  without a backend.
- It reads `data/fixtures/<feature>.fixtures.ts`: sample data in the **exact DTO
  shape** of the contract, passed through the same mappers.
- It keeps changes in memory, applies page, limit, search and filters, returns the
  same pagination metadata, waits a fixed named latency, and throws `ApiError` with
  real contract codes when forced (in development only).
- Business values (fees, refunds, allowed actions) are pre-computed in the
  fixtures; the fake never calculates business rules (§7).
- `di.ts` picks the fake only through one documented switch (e.g. a data-source env
  variable) that is impossible to enable in production builds.

### 36. Tooling, versions, and local setup

- Document the runtime, package manager, framework and library versions, formatter,
  linter, test tools, and upgrade policy in the project profile (README, package
  manifest, `.nvmrc`/`engines`, CI). Do not hardcode one project's versions here.
- Commit the lockfile of the chosen package manager.
- Prettier (or the project's formatter) formats every file; do not hand-format
  against it. Lint runs in CI.
- Every environment variable is listed in `.env.example` with a safe example value.
  Public variables hold no keys or tokens. Missing required configuration fails
  clearly where it is needed.
- Upgrading a major version needs owner approval (§30).

### 37. Route tests and framework agent files

- Tests for route files live in one consistent place (e.g. `src/app/test/`).
- Keep framework-generated guidance files for agents (e.g. Next.js `AGENTS.md`)
  that point to the bundled docs.

### 38. One feature using another

- A feature may use another feature's `presentation` hooks and components, never
  its `data/` or its `di.ts`. Keep the direction one way: if `users` uses `roles`,
  `roles` never imports `users`. Shared pieces of a section live in the lower
  feature.

### 39. Tabs and sections are routes

- Pages that are tabs of one section (e.g. Users | Roles) are separate routes, so
  the address says which one is open, refresh keeps it, and Back works.

### 40. List state in the address is validated

- A list reads its page, tab, search, and filters from the URL through one shared
  hook, never from `useState`. Defaults stay out of the address, any filter change
  returns to page 1, and unrelated parameters are preserved.
- The address is not trusted: invalid ids are dropped, search is cut at a named max
  length, and a page past the last one moves to the last page with data.

### 41. Relative times

- "Last seen" style times use one shared relative-date formatter ("Today, 9:12 AM",
  "Yesterday", "14 Oct") counted on the documented display timezone.

### 42. Shared code asks features through slots

- `shared/` never imports `features/`. When the shell or a shared component needs
  something from a feature (an account-menu action, a session guard), the route
  layout composes it and passes it in as a prop or slot.

### 43. Server-confirmed access ceilings

- When the product lets users grant roles or permissions, the UI may disable choices
  above the current user's own access as a convenience, but the backend decides;
  its refusal message is shown where the action happened.

### 44. Session, sign-in, and where to return to

- Only the backend says who is signed in. Read the session server-side (or from one
  session endpoint) once per request/load; a backend that cannot be reached shows an
  error, never a wrong "signed out" (§22).
- Unauthenticated users go to sign-in with a `next` parameter. Every `next` passes
  through one safe-path helper before use: only internal paths, never `//host`, a
  backslash, a scheme, or the sign-in page itself.
- Token refresh happens in one place, with one refresh in flight per tab (and
  coordinated across tabs when the backend treats reused refresh tokens as theft).
  The HTTP client retries a request once after a successful refresh.
- Signing out clears the query cache and replaces the page so Back shows nothing of
  the old session.

### 45. One-time tokens and passwords

- A one-time token from an invitation or reset link is removed from the address at
  once, sent to the backend in a POST body (not a URL), and cleared after use.
- Password rules live in one pure checker used by both the UI hint list and the form
  schema; the backend has the last word and its errors show on the field. Use a
  show/hide password field component.

### 46. A secret shown once

- A value the backend returns only once (a temporary password, an API key) is held
  only in the state of the dialog that shows it: no query cache, no store, no URL.
  Reset the mutation right after reading the value, and make the dialog hard to
  close by accident. Copying uses `navigator.clipboard`, with a message if the
  browser refuses.

### 47. Uploads and reorderable lists

- Files are uploaded only through the shared HTTP client (multipart with progress,
  cancel, and the same auth/CSRF/error handling). Never set the multipart
  `Content-Type` by hand.
- One shared upload control checks type, size, and dimensions in the browser first,
  shows progress and Cancel, tells the form an upload is running so Save waits, and
  shows the server's message when it refuses. The control receives an `upload`
  function; it never calls the network itself (§4).
- Reordering uses pointer and keyboard (arrow keys on a focused handle), never
  HTML5 drag-and-drop alone; each move is announced to screen readers, saved at once,
  shown optimistically, and rolled back on failure. Move up/down actions are also
  offered for touch devices.
- Fields with a length limit show a live character counter that turns to the error
  colour when exceeded.

## Future Rules

- Add new frontend rules here as the project conventions evolve.
