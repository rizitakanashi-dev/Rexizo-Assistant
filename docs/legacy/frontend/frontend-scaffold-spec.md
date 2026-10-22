# Smart CCTV — Frontend Scaffold Design Spec

**Author:** Frontend Engineer
**Status:** Draft for Tech Lead & DevOps review
**Date:** 2026-10-21
**Task:** `.ai-team/tasks/board.md` → "Frontend Engineer: Set up React project scaffold"

> **Scope note.** AGENTS.md states *"No code changes or dependency installations at this stage."* This document is therefore the
> reviewable design for the React + MUI web client — folder structure, module boundaries, API/realtime contracts, version
> pins, and a phased build plan — with **no code and no installs in this repository**. Implementation begins after Tech Lead
> sign-off (see §12).
>
> **Verification note.** Every version pin in §9 was resolved against the npm registry on 2026-10-21 and the full matrix was
> proven to resolve cleanly (`npm install --package-lock-only`, lockfileVersion 3, zero peer warnings) in a throwaway
> `/tmp` sandbox. **No install was run inside this repo.**

---

## 1. Decisions & Context

### 1.1 Confirmed decisions

| Area | Decision | Rationale |
|---|---|---|
| Build tool | Vite 8 + React 19 + TypeScript 6 | Fast dev server, native ESM, first-class TS. Next.js was rejected — this is an offline appliance dashboard with a static SPA shell, not a content/SEO site. |
| Component library | MUI 9 (`@mui/material`) + Emotion | Already mandated by the UI/UX Designer role ("Material‑UI based design system"). |
| Server state | TanStack Query 5 | Cache, retries, pagination and invalidation for REST data; avoids hand-rolling a cache. |
| Client/UI state | Zustand 5 | Small, dependency-free store for cross-component UI state (layout, selected camera, filters). |
| Realtime | `socket.io-client` 4.8.4 | **Aligned to the backend spec** (`docs/backend/backend-api-design.md` §7): namespace `/realtime`, `handshake.auth.token`, rooms. A native WebSocket client was the original frontend preference but would require the backend gateway to be rewritten — the published contract wins. |
| Video transport | HLS via `hls.js` 1.7.3 (native HLS fallback) | WebRTC was rejected for MVP (TURN/ICE complexity on a LAN appliance); MJPEG polling was rejected (bandwidth + CPU). Stream URLs are **provided by the backend**, never assembled in the browser. |
| Routing | `react-router` 8.5.0 | v8 ships as `react-router` (the `react-router-dom` package is stuck at 7.18.4). Requires React ≥ 19.2.7 — satisfied by 19.3.1. |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) | `pnpm` is **not installed** on this machine (Node v26.11.1 / npm 12.2.1), so npm workspaces are the supported root. |
| Tests | Vitest 5 + Testing Library (jsdom) + MSW 3; Playwright 1.64 for E2E | Vitest matches the Vite toolchain (no second bundler); MSW mocks HTTP at the network layer so the real client wrapper is exercised; Playwright covers the real HLS/Socket.IO paths that jsdom cannot. |

### 1.2 System context

```
┌──────────────────┐   REST /api    ┌───────────────────┐
│  React 19 SPA    │◀───────────────▶│  NestJS API       │
│  apps/web        │                 │  (backend spec)   │
│                  │   Socket.IO     │                   │
│  TanStack Query  │◀───────────────▶│  /realtime ns     │
│  Zustand (UI)    │   /realtime     │                   │
│  hls.js (video)  │                 └─────────┬─────────┘
└──────────────────┘                          │
                                    media    │  (thumbnails, HLS)
                                   pointers  ▼
                                        ┌─────────────┐
                                        │  Frigate /  │
                                        │  go2rtc     │
                                        └─────────────┘
```

**Division of responsibility.** The web client is a **pure consumer**. It never talks to Frigate, MQTT, or PostgreSQL
directly, and it never constructs a media URL from a Frigate path — it renders the URLs the API hands it. That rule is
what keeps the Frigate/go2rtc wiring (still an open item in the Video & CV track) out of the frontend.

### 1.3 Non-goals (MVP)

- No video transcoding, recording, or snapshot capture in the browser.
- No offline/PWA caching of video — metadata caching only, via TanStack Query's `staleTime`.
- No user-management screens (`admin` endpoints exist; the UI for them is post-MVP — see §12).
- No multi-camera mosaic compositing (one stream per tile, real-time only).

---

## 2. Repository Layout

The repo is currently a bare scaffold. The web client lands as an npm workspace so the API, shared types, and web app can
be built and tested together.

```
smart-cctv/
├── package.json                    # npm workspaces root (workspaces: apps/*, packages/*)
├── package-lock.json               # lockfileVersion 3 — committed, single source of truth
├── tsconfig.base.json              # shared compilerOptions
├── eslint.config.js                # flat config, shared rules
├── .prettierrc.json                # formatting
├── apps/
│   ├── api/                        # NestJS (Backend Engineer — see backend spec)
│   └── web/                        # THIS DELIVERABLE
│       ├── package.json
│       ├── vite.config.ts
│       ├── vitest.config.ts        # or a `test` block inside vite.config.ts
│       ├── playwright.config.ts
│       ├── index.html
│       ├── tsconfig.json           # solution-style, references app/node/test configs
│       ├── tsconfig.app.json
│       ├── tsconfig.node.json
│       ├── public/
│       └── src/
│           ├── main.tsx            # bootstrap: providers, router, theme
│           ├── App.tsx
│           ├── vite-env.d.ts
│           ├── app/
│           │   ├── router.tsx      # route tree (lazy-loaded)
│           │   ├── providers.tsx   # QueryClientProvider + ThemeProvider + AuthProvider
│           │   └── queryClient.ts
│           ├── theme/
│           │   ├── index.ts        # createTheme + CssBaseline — THEME COMES FROM UI/UX DESIGNER
│           │   └── tokens.ts
│           ├── api/
│           │   ├── client.ts       # fetch wrapper: base URL, auth header, error envelope
│           │   ├── endpoints.ts    # typed endpoint builders
│           │   └── queries/        # TanStack Query hooks (one file per domain)
│           │       ├── cameras.ts
│           │       ├── events.ts
│           │       └── auth.ts
│           ├── realtime/
│           │   ├── socket.ts       # socket.io-client factory (single connection)
│           │   ├── useRealtime.ts  # React binding
│           │   └── handlers.ts     # event.created / event.updated / camera.status
│           ├── auth/
│           │   ├── AuthContext.tsx
│           │   ├── tokenStore.ts   # access token in memory ONLY
│           │   ├── useAuth.ts
│           │   └── guards.tsx      # <RequireAuth> / <RequireRole>
│           ├── state/
│           │   └── uiStore.ts      # Zustand: layout prefs, selected camera, filters
│           ├── features/
│           │   ├── dashboard/      # camera grid + status
│           │   │   ├── DashboardPage.tsx
│           │   │   ├── CameraGrid.tsx
│           │   │   ├── CameraTile.tsx
│           │   │   └── CameraStatusBadge.tsx
│           │   ├── events/         # event timeline + detail
│           │   │   ├── EventsPage.tsx
│           │   │   ├── EventTimeline.tsx
│           │   │   ├── EventList.tsx
│           │   │   ├── EventDetail.tsx
│           │   │   └── EventFilters.tsx
│           │   ├── player/         # HLS playback
│           │   │   ├── StreamPlayer.tsx
│           │   │   └── useHls.ts
│           │   └── auth/
│           │       ├── LoginPage.tsx
│           │       └── ProtectedRoute.tsx
│           ├── components/         # shared, design-system-agnostic building blocks
│           │   ├── AppShell.tsx
│           │   ├── ErrorBoundary.tsx
│           │   └── ...
│           └── test/
│               ├── setup.ts       # jest-dom matchers, MSW handlers
│               └── fixtures/      # typed factory fixtures (no real camera data)
├── packages/
│   └── shared/                     # types shared with the API
│       ├── package.json            # "@smart-cctv/shared"
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── camera.ts           # Camera, CameraStatus
│           ├── event.ts            # Event, EventType, ObjectDetection
│           ├── realtime.ts         # realtime event payload discriminated union
│           ├── auth.ts             # User, Role, AuthTokens
│           └── api.ts              # envelope types: ApiEnvelope<T>, ApiError
├── docs/
│   ├── backend/backend-api-design.md
│   └── frontend/frontend-scaffold-spec.md   # this file
├── tests/
│   └── e2e/                        # Playwright specs (workspace-level)
└── infra/                          # dev environment, CI (Tech Lead & DevOps)
```

### 2.1 `packages/shared` — why it exists

The API DTOs and the web client's view models must not drift. `packages/shared` holds **transport shapes only** — no React,
no NestJS, no runtime validation. It is consumed by both `apps/api` and `apps/web` as `@smart-cctv/shared`.

Rules:
- Types only (plus `const` lookup tables that are erased at build time). No framework imports.
- The **backend owns the canonical definitions**. When the API's DTO changes, `packages/shared` is updated in the same PR.
- Runtime validation stays on the server. The client trusts the API envelope but still narrows on `data` access via the
  shared types; it does not re-validate with a schema library (YAGNI — the API is the trust boundary).

### 2.2 Workspace wiring

`packages/shared` is consumed as **TypeScript source** (not a build artifact) to keep the build simple:

```jsonc
// packages/shared/package.json
{
  "name": "@smart-cctv/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts"
}
```

Vite resolves the raw `.ts` through its normal pipeline; `tsc --build` (project references) type-checks it in the same
pass. A build step for `shared` is added only if the API ever needs to consume the package as compiled JS.

---

## 3. `apps/web` — Build & TypeScript Setup

### 3.1 `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev-only: keeps the browser on one origin, so the refresh cookie is first-party.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // Socket.IO's engine.io endpoint is mounted at /socket.io by default.
      // The '/realtime' namespace is a *protocol-level* namespace, not a URL path —
      // see §6.1. The ws: true flag upgrades the polling handshake to WebSocket.
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
```

**The proxy is not a production concern.** In production the API origin is supplied at runtime (§7.2), so the built bundle
is environment-agnostic.

### 3.2 TypeScript project references

Three configs, so app code and tooling code get different `lib`/`types` sets:

| Config | Purpose | Key options |
|---|---|---|
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` | `module: ESNext`, `types: ["node"]`, `noEmit: true` |
| `tsconfig.app.json` | `src/**` | `jsx: "react-jsx"`, `types: ["vite/client"]`, `noEmit: true` |
| `tsconfig.json` | Solution file | `references: [app, node]`, `files: []` |

Shared strictness lives in `tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  }
}
```

> `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are deliberate — they are the two flags that catch the most
> real bugs when consuming a nullable API envelope. They cost a little friction early and save debugging later.

### 3.3 ESLint 10 (flat config) + Prettier

ESLint 10 requires flat config (`eslint.config.js`), no `.eslintrc`:

```js
// eslint.config.js (root)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

**Verified against the installed plugins:**
- `eslint-plugin-react-hooks@7.1.1` exposes `configs.recommended`, `configs['recommended-latest']`, and `configs.flat.*`
  (flat variants are under `configs.flat`, *not* `configs['flat/recommended']`).
- `eslint-plugin-react-refresh@0.5.7` exposes `configs.recommended()`, `configs.vite()`, `configs.next()` as **functions**.
- `typescript-eslint@8.72.0` peer-supports ESLint `^8.57 || ^9 || ^10` — ESLint 10 is in range.

Prettier (`3.9.10`) handles formatting only; `eslint-config-prettier` is **not** added in MVP to keep the dependency count
down — instead, ESLint is not configured with any stylistic rules, so the two never conflict.

---

## 4. State Architecture

Three stores, three owners, no overlap:

| Concern | Tool | Examples |
|---|---|---|
| **Server state** | TanStack Query | cameras list, events page, event detail, current user |
| **Realtime state** | TanStack Query cache (writes) + Socket.IO (transport) | `event.created` → `setQueryData` on the events list |
| **UI state** | Zustand | selected camera, grid density, sidebar collapsed, event filter draft |

### 4.1 Why realtime writes into the Query cache

The events list is server state with a live tail. Instead of duplicating it in a second store, realtime handlers **write
into the TanStack Query cache**:

```ts
// apps/web/src/realtime/handlers.ts
export function applyEventCreated(queryClient: QueryClient, event: Event) {
  queryClient.setQueryData(['events', 'list', { cameraId: null }], (old: EventPage | undefined) =>
    old ? { ...old, data: [event, ...old.data], meta: { ...old.meta, total: old.meta.total + 1 } } : old,
  );
}
```

**One-way data flow is preserved:** the socket is an *invalidator/updater* for the cache, never a parallel source of truth.
Components read exclusively through `useQuery`. This avoids the classic "the list and the socket disagree" bug.

When the realtime payload does not match a cached query's filter, the handler falls back to `invalidateQueries(['events'])`,
which refetches from the REST endpoint. Simpler and always correct; the cost is one extra request in the unfiltered case.

### 4.2 Query defaults

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // cameras change slowly
      gcTime: 5 * 60_000,
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500 ? false : failureCount < 3,
      refetchOnWindowFocus: true,
    },
  },
});
```

The retry predicate is the important part: **4xx responses are not retried** (they will never succeed), while network errors
and 5xx are.

### 4.3 Zustand store shape

```ts
interface UiState {
  selectedCameraId: string | null;
  gridDensity: 'comfortable' | 'compact';
  sidebarOpen: boolean;
  eventFilters: { cameraId: string | null; from: string | null; to: string | null; type: string | null };
  setSelectedCamera: (id: string | null) => void;
  setGridDensity: (density: UiState['gridDensity']) => void;
  toggleSidebar: () => void;
  setEventFilters: (filters: Partial<UiState['eventFilters']) => void;
}
```

Small, flat, and serialisable. No derived state, no side effects in the store — that is TanStack Query's job.

---

## 5. API Integration

### 5.1 HTTP client

The backend uses a **uniform envelope** (backend spec §8): `{ data, meta }` on success, `{ error: { code, message, details } }`
on failure. The client normalizes both into one result type so components never branch on HTTP status.

```ts
// apps/web/src/api/client.ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<ApiEnvelope<T>> {
  const { token, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',                       // refresh cookie is HttpOnly
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return payload as ApiEnvelope<T>;
}
```

`credentials: 'include'` is required because the refresh token is an `HttpOnly` cookie (backend spec §4.1) — the browser
attaches it automatically and JS can never read it.

### 5.2 Endpoints the frontend consumes

Derived from backend spec §8.1. This table is the **contract surface** the frontend is written against.

| Method | Path | Used by | Query key |
|---|---|---|---|
| `POST` | `/auth/login` | LoginPage | — (mutation) |
| `POST` | `/auth/refresh` | token refresh | — (mutation) |
| `POST` | `/auth/logout` | AppShell user menu | — (mutation) |
| `GET` | `/auth/me` | AuthProvider bootstrap | `['auth','me']` |
| `GET` | `/cameras` | DashboardPage, EventsPage filter | `['cameras']` |
| `GET` | `/cameras/:id` | CameraTile detail | `['cameras', id]` |
| `GET` | `/events` | EventsPage | `['events','list', filters]` |
| `GET` | `/events/:id` | EventDetail | `['events', id]` |
| `POST` | `/events/:id/acknowledge` | EventDetail (operator/admin) | mutation → invalidate `['events']` |

Cursor pagination is passed as `cursor` + `limit` in the query key so each page is cached independently and the list can
be appended with `useInfiniteQuery`.

### 5.3 Auth flow

```
App boot
  → GET /auth/me  (cookie? no — access token needed first)
  → POST /auth/refresh  (HttpOnly cookie present?)
       ├─ 200 → new access token → GET /auth/me → render app
       └─ 401 → render <LoginPage>
```

- **Access token lives in memory only** (React state + a module-level holder). Never `localStorage` — an XSS payload can read
  `localStorage` but cannot read a closure variable. Backend spec §4.1 states "Client memory only"; this honours it.
- **Refresh token is an `HttpOnly` cookie** — invisible to JS, so it is immune to XSS theft.
- The refresh token **rotates on every use**, so a refresh failure means the session is gone → redirect to login.
- A proactive refresh timer fires at ~80% of the 15-minute access-token TTL, so requests are not racing an expiry.

### 5.4 RBAC in the UI

The backend's `RolesGuard` is the real enforcement; the UI only **hides** what the user cannot do:

```ts
// apps/web/src/auth/guards.tsx
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roleAtLeast(user.role, role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

Role order: `viewer` < `operator` < `admin`. The **acknowledge** button renders only for `operator`/`admin`; the API
independently enforces it, so a mis-rendered button is a cosmetic bug, not a security hole.

---

## 6. Realtime (Socket.IO)

### 6.1 Connection lifecycle

One socket for the whole app, created in a provider, torn down on unmount.

```ts
// apps/web/src/realtime/socket.ts
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(baseUrl: string, getToken: () => string | null): Socket {
  if (!socket) {
    socket = io(baseUrl, {
      path: '/socket.io',              // engine.io mount path (default)
      auth: (cb) => cb({ token: getToken() }),  // re-read on every (re)connect
      withCredentials: true,           // carries the HttpOnly refresh cookie
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
    });
  }
  return socket;
}
```

> **The `/realtime` namespace is NOT a client option.** In Socket.IO v4 the namespace is a *protocol-level* concept: the
> client sends a `CONNECT` packet whose `nsp` field selects the namespace, and the server acks or rejects it. The
> `socket.io-client` v4 `SocketOptions` type has **no `namespace` key** — passing one is silently ignored, which would leave
> the client on the default `/` namespace and never receive the backend's `/realtime` events. The namespace is therefore
> selected by **the URL**:
>
> ```ts
> socket = io(`${baseUrl}/realtime`, { /* … */ });   // ✅ namespace comes from the URL path
> ```
>
> This was verified against the published `socket.io-client@4.8.4` bundle: `io()` parses the URI, and the path segment
> becomes the namespace (`h.socket(i.path, s)`).

Three details worth calling out:

1. **`auth` as a callback.** Socket.IO re-reads the `auth` payload on every (re)connect attempt — the callback is invoked in
   `onopen()`, so it runs again on each reconnect. Passing a function means a **refreshed** access token is used after a
   reconnect, instead of the stale one captured at connect time. This is the standard pattern for short-lived JWTs and
   directly satisfies backend spec §7.1 ("client refreshes and re-authenticates on expiry"). The callback takes a
   `getToken` **getter**, not a captured token value.
2. **The engine.io path is `/socket.io`, not `/realtime`.** The URL path selects the *namespace*; the `path` option selects
   the engine.io HTTP/WS endpoint. Both must be right: the reverse proxy forwards `/socket.io` (with the `Upgrade` header) to
   the NestJS gateway, and the gateway answers the `CONNECT` packet for the `/realtime` namespace.
3. **`auth.expired` handling.** The server emits `auth.expired` when the token expires (backend spec §7.2). The client
   responds by triggering a refresh and calling `socket.auth = { token: newToken }` + `socket.disconnect().connect()`.

### 6.2 Event handlers

| Server event | Client action |
|---|---|
| `event.created` | `setQueryData` into the events list, or `invalidateQueries(['events'])` if filters do not match |
| `event.updated` | `setQueryData(['events', id], event)` + patch the matching list entry |
| `camera.status` | `setQueryData(['cameras'], ...)` to patch that camera's status |
| `auth.expired` | Refresh access token, re-authenticate the socket |
| `connect` / `disconnect` | Flip a `connectionState` flag → a small "Reconnecting…" banner in the app shell |

### 6.3 Rooms

The backend joins sockets to `events:all` plus a room per camera (backend spec §7.3). The dashboard subscribes to
`events:all`; a focused single-camera view additionally subscribes to `camera:<id>` and **unsubscribes on unmount** so a
long-lived session does not accumulate rooms.

### 6.4 Failure handling

| Situation | Behaviour |
|---|---|
| Socket down at boot | App still renders; the dashboard shows cached/stale data with a "Live updates paused" banner. REST keeps working. |
| Reconnect | Handled by the Socket.IO client with exponential backoff + jitter. On reconnect, the client **invalidates the events list** to catch up on anything missed while disconnected. |
| Token invalid | `auth.expired` → refresh; refresh fails → clear session → redirect to `/login`. |
| Duplicate events | The API guarantees at-least-once delivery with idempotent upserts (backend spec §5.4), so the client dedupes by `event.id` before inserting into the list. |

---

## 7. Configuration & Secrets

### 7.1 Rules

- **No secret ever reaches the frontend.** The web client holds no API key, no MQTT credential, no Frigate credential, and no
  JWT secret. It authenticates with a short-lived token it receives from the API.
- Vite only exposes variables prefixed with `VITE_` via `import.meta.env`. **Only non-secret, non-sensitive config uses that
  prefix.**
- No `VITE_` variable may hold a secret — the bundle is public. This rule is enforced by review and flagged in §10.

### 7.2 Runtime configuration

The built bundle must be deployable to any appliance without a rebuild, so the API base URL is **not** baked into the build.
It is loaded at boot from `public/config.json` (or a `<meta>` tag in `index.html`), fetched before React mounts:

```jsonc
// public/config.json — deployed per-environment, not baked into the bundle
{
  "apiBaseUrl": "/api",          // same-origin by default (nginx proxies /api → NestJS)
  "socketUrl": "",               // ORIGIN only, e.g. "https://cctv.local" — empty ⇒ same origin.
                                 // The "/realtime" namespace is appended by the client (see §6.1).
  "siteName": "Smart CCTV",
  "siteTimezone": "Asia/Jakarta"
}
```

```ts
// apps/web/src/config.ts
export interface RuntimeConfig {
  apiBaseUrl: string;
  socketUrl: string;
  siteName: string;
  siteTimezone: string;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load runtime configuration');
  return (await response.json()) as RuntimeConfig;
}
```

**Boot order matters:** `loadRuntimeConfig()` → create the QueryClient and socket with the resolved base URL → render. A
failure here shows a full-page "configuration error" screen rather than a broken dashboard.

### 7.3 `import.meta.env` — the only sanctioned uses

| Variable | Purpose | Secret? |
|---|---|---|
| `VITE_APP_VERSION` | Build metadata shown in the app shell "About" panel | No |
| `VITE_SENTRY_DSN` | Optional error reporting endpoint | No (public by design) — omitted in MVP |
| `VITE_ENABLE_MOCKS` | Enables the MSW mock worker in local dev | No |

Everything else — API URL, socket URL, site name — comes from the runtime config.

### 7.4 `.env.example`

```
# apps/web/.env.example — copy to .env.local for local development.
# Only VITE_-prefixed vars are exposed to the browser. Never put a secret here.
VITE_APP_VERSION=0.0.0-dev
VITE_ENABLE_MOCKS=true
```

`.env.local` is git-ignored. The committed example file contains **empty or placeholder values only**.

---

## 8. Video Playback (HLS)

### 8.1 The contract

**The frontend never builds a stream URL.** The API returns a ready-to-play URL per camera. This is deliberate: the exact
public HLS path through Frigate's nginx → go2rtc (`/api/stream.m3u8?src=…` and Frigate's proxied `/live/mse/` routes)
is still being pinned down by the Video & CV Engineer, and Frigate 0.18 changed its nginx layout. If the frontend assembled
the URL itself, every Frigate upgrade would break the player.

Proposed camera DTO addition (backend owner):

```ts
interface Camera {
  id: string;
  frigateId: string;
  name: string;
  location: string | null;
  enabled: boolean;
  status: 'online' | 'offline' | 'unknown';
  lastSeenAt: string | null;
  streamUrl: string | null;   // absolute or root-relative HLS URL, null when unavailable
  thumbnailPath: string | null;
}
```

> **Open question for the backend (blocking for the player, not for the rest of the app):** add `streamUrl` to the camera DTO,
> or expose a dedicated `GET /cameras/:id/stream` that returns `{ url, protocol }`? Recommendation: the DTO field, so the
> dashboard can render all tiles without N extra requests.

### 8.2 Player implementation

```ts
// apps/web/src/features/player/useHls.ts
import Hls from 'hls.js';
import { useEffect, useRef } from 'react';

export function useHls(videoRef: React.RefObject<HTMLVideoElement | null>, src: string | null) {
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Safari and iOS play HLS natively — use it and skip the MSE path entirely.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => { video.removeAttribute('src'); video.load(); };
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
    hlsRef.current = hls;
    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();                 // detaches listeners + frees the MediaSource
      hlsRef.current = null;
    };
  }, [src]);

  return hlsRef;
}
```

**Lifecycle rules that prevent the classic HLS memory leak:**
1. `hls.destroy()` on unmount and whenever `src` changes — the effect's cleanup closure handles both.
2. The native-HLS branch cleans up with `removeAttribute('src')` + `video.load()` to release the network buffer.
3. The `Hls` instance is held in a ref, never in state — state updates would re-run the effect and re-create the player.

### 8.3 Error and offline states

The error listener receives an `ErrorData` object with `type`, `details`, `error`, and `fatal`. The `hls.js` v1.7.3 API
verified for this spec: `Hls.Events.ERROR` (value `"hlsError"`), `Hls.ErrorTypes.NETWORK_ERROR | MEDIA_ERROR | OTHER_ERROR`,
`hls.startLoad()`, `hls.recoverMediaError()`, `hls.destroy()`.

```ts
hls.on(Hls.Events.ERROR, (_event, data: HlsErrorData) => {
  if (!data.fatal) return;                       // log at debug and ignore

  switch (data.type) {
    case Hls.ErrorTypes.NETWORK_ERROR:
      hls.startLoad();                            // resume the manifest/segment loader
      break;
    case Hls.ErrorTypes.MEDIA_ERROR:
      hls.recoverMediaError();                    // reset the buffer
      break;
    default:
      hls.destroy();                              // unrecoverable — fall back to the placeholder
      break;
  }
});
```

| Fatal error type | Handling | UI |
|---|---|---|
| `NETWORK_ERROR` | `hls.startLoad()` (once per error, then give up) | "Reconnecting…" overlay on the tile |
| `MEDIA_ERROR` | `hls.recoverMediaError()` (once per error, then give up) | Same overlay |
| `OTHER_ERROR` | `hls.destroy()` | "Stream unavailable" placeholder |

> **Guard against an infinite recovery loop.** hls.js re-emits the same fatal error if recovery does not work, so each error
> type is allowed **one** recovery attempt; a second occurrence of the same type destroys the player and shows the
> placeholder. The attempt counter lives in a ref, not in state.

Non-fatal errors are logged at `debug` and ignored. An offline camera (per `camera.status`) renders a placeholder instead of
mounting the player at all — this avoids a pointless connection storm against dead RTSP sources.

### 8.4 Performance

- **One player per visible tile.** Tiles outside the viewport are unmounted (not just hidden) so their MediaSource is freed.
- `preload="metadata"` and `playsInline muted` on the `<video>` element.
- Autoplay is muted-only (browsers block unmuted autoplay); the user unmutes deliberately.
- A `visibilitychange` listener pauses all players when the tab is hidden and resumes on return.

---

## 9. Toolchain & Version Pins

Versions verified against the npm registry on **2026-10-21**.

### 9.1 Runtime dependencies

| Package | Pin | Note |
|---|---|---|
| `react` / `react-dom` | `19.3.1` | React 19 |
| `react-router` | `8.5.0` | v8 ships under `react-router`; `react-router-dom` is frozen at 7.18.4. Peer requires React ≥ 19.2.7 ✔ |
| `@mui/material` / `@mui/icons-material` | `9.5.0` | MUI 9. Peer allows React 17/18/19 ✔ |
| `@mui/x-date-pickers` | `9.16.0` | Peer `@mui/material: ^7.3.0 \|\| ^9.0.0` ✔ |
| `@emotion/react` / `@emotion/styled` | `11.14.0` / `11.14.1` | Required by MUI; peer optional in MUI 9 but installed explicitly |
| `@tanstack/react-query` | `5.104.5` | |
| `zustand` | `5.0.15` | |
| `socket.io-client` | `4.8.4` | Matches backend `socket.io` 4.8.4 |
| `hls.js` | `1.7.3` | MSE-based HLS for non-Safari browsers |
| `dayjs` | `1.11.23` | Peer for `@mui/x-date-pickers`; used for event timestamps |

### 9.2 Dev dependencies

| Package | Pin | Note |
|---|---|---|
| `typescript` | `6.0.3` | **See trap 1** |
| `vite` | `8.3.5` | Node `^20.19.0 \|\| >=22.12.0` |
| `@vitejs/plugin-react` | `6.1.2` | Peer `vite ^8.0.0` ✔ |
| `vitest` / `@vitest/coverage-v8` | `5.0.5` | Peer `vite ^6.4 \|\| ^7 \|\| ^8` ✔ |
| `jsdom` | `30.1.3` | |
| `msw` | `3.0.3` | Mock Service Worker — HTTP mocking at the network layer. Peer `vite >=6` (optional) ✔ |
| `@testing-library/react` / `jest-dom` / `user-event` | `16.3.3` / `7.0.1` / `14.6.8` | |
| `@playwright/test` | `1.64.1` | |
| `eslint` / `@eslint/js` | `10.13.0` / `10.0.1` | Node `^20.19 \|\| ^22.13 \|\| >=24` |
| `typescript-eslint` | `8.72.0` | |
| `eslint-plugin-react-hooks` | `7.1.1` | Flat config at `configs.flat.*` |
| `eslint-plugin-react-refresh` | `0.5.7` | Configs are **functions**: `configs.vite()` |
| `prettier` | `3.9.10` | |
| `@types/react` / `@types/react-dom` | `19.3.0` | |
| `@types/node` | `26.6.5` | |

### 9.3 The three version traps — flagged for the Tech Lead

Each was verified against the registry, not assumed.

**1. TypeScript 7 breaks the toolchain.** `typescript@latest` is now **7.0.2**, but `typescript-eslint@8.72.0` declares
`typescript: ">=4.8.4 <6.1.0"` — a hard peer ceiling. Installing `typescript@latest` produces a peer conflict and a broken
lint/type-check pipeline. Pin **`typescript: 6.0.3`** exactly. This matches the backend spec's `~6.0.2` pin, so both apps
stay on one TS version.

**2. `react-router` v8 does not publish `react-router-dom` anymore.** `react-router-dom@latest` is **7.18.4** — the v7 line.
Installing `react-router-dom` alongside `react-router@8` yields two competing routers and a duplicated-`RouterProvider`
runtime error. Import from **`react-router`** only. This is a major-version migration with real API differences; the route
tree must be written against the v8 data-router API (`createBrowserRouter` + `RouterProvider`), which is what §3.1/§10 use.

**3. MUI 9 removed `GridLegacy` and changed the Grid API.** In v9, `GridLegacy` is **deleted** — `Grid` is the Grid v2 API
(`size={{ xs: 12, md: 6 }}` + `columns`), and `direction="column"` is no longer a valid value. MUI 9 also raised the default
browser targets (Chrome 117, Safari 17) and changed how it detects DOM environments — which affects jsdom-based tests. The
**UI/UX Designer must build the design system on MUI 9 syntax**, not the MUI 7 docs. `@mui/material@latest-v7` is 7.3.11 if
a downgrade is ever needed, but MUI 9 is the recommendation.

### 9.4 Install commands (for the Tech Lead — **not run by me**)

```bash
# from the repo root, after the workspace root package.json exists
npm install

# from apps/web
npm run dev        # vite dev server on :5173, proxies /api and /realtime to :3000
npm run build      # tsc --build && vite build
npm run lint       # eslint . (flat config)
npm run format     # prettier --write .
npm run test       # vitest run
npm run test:e2e   # playwright test
```

### 9.5 Dependency-resolution evidence

The complete matrix above was resolved with `npm install --package-lock-only` in a throwaway sandbox:

- **lockfileVersion 3**
- **391 packages** resolved
- **0 peer warnings, 0 ERESOLVE conflicts, 0 vulnerabilities** reported
- A `--dry-run` re-check produced no `peer` / `warn` / `deprecated` output lines

**No install was performed inside this repository.** No `package.json` was created here. This is evidence for the Tech Lead,
not a change to the repo.

---

## 10. Security Review Notes

For the Security & Privacy Engineer's threat model — the frontend's own contribution:

| Concern | Mitigation |
|---|---|
| XSS → token theft | Access token in **memory only**, never `localStorage`/`sessionStorage`. Refresh token is `HttpOnly` + `Secure` + `SameSite=Strict` (server-set, JS-invisible). |
| Secret in the bundle | No secret is ever placed in a `VITE_` variable. Only `VITE_APP_VERSION` and `VITE_ENABLE_MOCKS` are defined. |
| Open redirect | `react-router` internal navigation only; no `window.location` redirects to user-supplied URLs. |
| Clickjacking | `X-Frame-Options` / CSP `frame-ancestors` are set by the reverse proxy, not the SPA — see Tech Lead's nginx config. |
| Insecure transport | The SPA must be served over HTTPS; `Secure` cookies and `wss://` require it. Proxy terminates TLS. |
| Media URL injection | Stream URLs come from the API, not user input. `src` is set via `hls.loadSource()`, never injected into HTML. |
| Logout completeness | `POST /auth/logout` revokes the refresh token **server-side**; the client clears memory state and closes the socket. |
| Error disclosure | The API's error envelope is user-safe by design (backend spec §8.2). The client shows `message`, never a stack trace. |

---

## 11. Testing Strategy

Aligned with the QA Engineer's brief (offline cameras, duplicate events, reconnections). Layered:

### 11.1 Unit & component tests (Vitest + Testing Library, jsdom)

| Suite | Covers | Notable cases |
|---|---|---|
| `api/client.test.ts` | HTTP wrapper | 401 → `ApiError` with code; 4xx is **not** retried; envelope parsing; `Authorization` header present/absent |
| `api/queries/cameras.test.ts` | Query hooks | Loading → success → error states; cache key includes filters |
| `realtime/handlers.test.ts` | Socket → cache | `event.created` prepends without duplicating an existing id; `camera.status` patches only that camera |
| `realtime/socket.test.ts` | Connection | `auth` callback returns the **current** token; reconnect triggers an events invalidation |
| `features/player/useHls.test.ts` | HLS lifecycle | `hls.destroy()` called on unmount and on `src` change; native-HLS path taken when `canPlayType` returns a value |
| `auth/guards.test.tsx` | RBAC UI | `viewer` sees no acknowledge button; `operator` does; unauthenticated redirects to `/login` |
| `features/dashboard/CameraGrid.test.tsx` | Grid | Renders tiles; offline camera renders a placeholder, **not** a player |
| `features/events/EventTimeline.test.tsx` | Timeline | Cursor pagination appends rather than replaces |

**Mocking strategy:** MSW 3 for HTTP (network-level realism, exercises the real client wrapper) and a local `socket.io`
server for realtime, driven from the test harness. `hls.js` is mocked at the module boundary — the unit test asserts
*lifecycle calls*, never real video decoding.

### 11.2 End-to-end tests (Playwright)

Run against a **real** stack: NestJS + PostgreSQL + a Frigate instance with a test stream, or an API stub that emits
Socket.IO events.

| Spec | Scenario |
|---|---|
| `auth.spec.ts` | Login → dashboard → logout; refresh-token rotation keeps the session alive; expired token → login screen |
| `dashboard.spec.ts` | Camera grid renders live tiles; a camera going offline swaps the player for a placeholder without a page reload |
| `realtime.spec.ts` | An `event.created` push appears in the timeline **without a refresh**; a socket drop shows the reconnecting banner and the list catches up on reconnect |
| `player.spec.ts` | The HLS `<video>` reaches `HAVE_ENOUGH_DATA`; the source URL matches the API-provided URL |
| `events.spec.ts` | Filter by camera → timeline updates; acknowledge → the badge persists after reload |

**Media in E2E is the hard part.** A single static HLS fixture (`fixtures/sample.m3u8` + segments) is committed to the repo
and served by the test harness — that avoids depending on a live camera in CI.

### 11.3 Coverage

`@vitest/coverage-v8`, thresholds: **80% statements / 75% branches** for `apps/web/src`, excluding `src/main.tsx` and
generated types. Coverage is a floor, not a goal — the branch threshold matters more than the statement threshold because the
interesting bugs live in the error and reconnect branches.

### 11.4 Definition of done for a frontend feature

1. Unit tests for the happy path + at least one error/reconnect path.
2. Types compile under `tsc --build` with the strict flags in §3.2.
3. ESLint clean, Prettier formatted.
4. No new `VITE_` variable holding anything sensitive.
5. The QA Engineer can trace the feature to a listed test case.

---

## 12. Implementation Plan (phased)

Each phase is independently reviewable and produces working, testable software. Ordering respects the dependency on the
backend contract.

### Phase 0 — Toolchain & workspace bootstrap
Root `package.json` with npm workspaces; `packages/shared` skeleton (types only); `apps/web` scaffolded with Vite + React +
TS 6.0.3; ESLint 10 flat config; Prettier; Vitest + Playwright configured; `.env.example`; `public/config.json`; runtime
config loader.

**Exit:** `npm install` resolves with zero peer warnings; `npm run dev` serves a blank React app; `npm run lint`,
`npm run test`, `npm run build` all pass; `npm run typecheck` is clean.

### Phase 1 — API client & auth
`api/client.ts` + `ApiError`; `tokenStore` (memory-only) + refresh flow; `AuthContext` + `useAuth`; login page; route guards;
MSW mocks for the auth endpoints.

**Exit:** login → refresh → logout cycle covered by tests; an expired access token triggers a transparent refresh; a failed
refresh clears the session and redirects to `/login`.

### Phase 2 — Realtime transport
Socket factory with the `auth` callback; `useRealtime` provider; handlers for the four server events; connection-state banner;
room join/leave for the focused camera view.

**Exit:** a fake server emitting `event.created` updates the Query cache; a reconnect invalidates the events list; the
socket re-authenticates with the refreshed token.

### Phase 3 — Dashboard
Camera query hook; `CameraGrid` + `CameraTile` + `CameraStatusBadge`; the grid density control (Zustand); the offline-camera
placeholder; `AppShell` with the app bar and the connection banner.

**Exit:** cameras render from the API with loading/empty/error states; an offline camera shows a placeholder and mounts no
player; the grid responds to the density control.

### Phase 4 — HLS player
`useHls` + `StreamPlayer`; native-HLS fallback; fatal-error recovery; viewport-based mounting/unmounting; `streamUrl` on the
camera DTO (**requires the backend change in §8.1**).

**Exit:** the player mounts, tears down cleanly on unmount (asserted by a `hls.destroy()` spy), and shows the correct error
state for each fatal error class.

### Phase 5 — Events view
Cursor-paginated `useInfiniteQuery` for the events list; `EventTimeline`; `EventFilters` (camera / type / time range via
`@mui/x-date-pickers`); `EventDetail` drawer; the acknowledge mutation (operator/admin).

**Exit:** filtering updates the timeline; acknowledge persists across a reload; the realtime `event.created` push prepends
to the filtered list when it matches.

### Phase 6 — Hardening & polish
Error boundaries per route; accessibility pass (keyboard navigation, focus management in the drawer, contrast against the
UI/UX design tokens); responsive breakpoints; bundle analysis; the E2E suite.

**Exit:** the full suite green; no console errors in the browser; the bundle stays within the size budget agreed with the
Tech Lead.

### Cross-cutting (every phase)
- Tests written before implementation (TDD), Vitest for units, Playwright for E2E.
- No secrets in source; `.env.example` only, with placeholder values.
- No commit without a passing test run.
- No dependency added without a registry check and a clean `npm install --package-lock-only` re-resolution.
- No deployment without explicit approval (per AGENTS.md).

---

## 13. Open Questions for the Team

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Add `streamUrl` to the camera DTO, or expose `GET /cameras/:id/stream`? (recommendation: DTO field) | Backend + Video & CV | **Yes** — Phase 4 |
| 2 | Which exact public HLS URL does Frigate expose to the browser through its nginx → go2rtc path? | Video & CV | **Yes** — Phase 4 |
| 3 | Confirm `event.acknowledged` should be pushed live (backend spec §13 Q6 asks this of Frontend) | Frontend → Backend | No — Phase 5 |
| 4 | Is a separate `GET /cameras/:id/stream` needed for on-demand stream start (Frigate go2rtc `?src=` semantics)? | Video & CV + Backend | No — Phase 4 |
| 5 | Confirm the role set `viewer` / `operator` / `admin` and whether per-camera access is needed | Product + Security | No — Phase 1 |
| 6 | Should the UI include the `admin` screens (users, notification rules, delivery log) in MVP, or API-only? | Product | No — Phase 6 |
| 7 | Is `packages/shared` acceptable as the shared-types location, or does the System Architect prefer a different boundary? | System Architect | No — Phase 0 |
| 8 | Does the role matrix use `viewer` < `operator` < `admin` ordering for the UI's `roleAtLeast` helper? | Product + Security | No — Phase 1 |

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Frigate's public HLS path is not settled | The player cannot be built | The frontend consumes a **backend-provided** `streamUrl`; the player is written against a URL, not a Frigate route (§8.1) |
| MUI 9 migration friction (GridLegacy removed, `Grid` v2 API, raised browser targets) | The UI/UX design system may be written against v7 syntax | Flagged to the UI/UX Designer in §9.3 trap 3 before they build the theme |
| `react-router` v8 vs `react-router-dom` v7 confusion | Duplicate router runtime error | Import from `react-router` only (§9.3 trap 2); a lint rule/import review catches it early |
| TypeScript 7 pulled in by a floating range | Peer conflict, broken lint/type-check | Pin `6.0.3` exactly; the Tech Lead owns the root lockfile (§9.3 trap 1) |
| React 19 + MUI 9 peer range | Install failure | Verified: MUI 9 peers allow React 19 ✔; full matrix resolves with zero warnings (§9.5) |
| A single socket is a single point of failure | All live updates stop | The app degrades to REST-only with a visible banner; TanStack Query's `refetchOnWindowFocus` recovers state |
| Media memory growth with many tiles | Browser memory blow-up | Unmount off-screen tiles, `hls.destroy()` on cleanup, `backBufferLength: 30` (§8.4) |
| Socket.IO v4 vs v5 protocol mismatch | Realtime silently fails to connect | Pin `socket.io-client` to the same `4.8.4` line as the server `socket.io`; assert the handshake in a Phase 2 test |
| The `/realtime` namespace is set via an unsupported `namespace` option | The client silently stays on `/` and receives **no** events — a silent failure with no error | The namespace is encoded in the **URL** (`io(\`\${baseUrl}/realtime\`)`); Phase 2 asserts the namespace handshake (§6.1) |

---

## 15. Review Checklist for Tech Lead & DevOps

- [ ] Monorepo layout and npm workspaces (§2) acceptable — note `pnpm` is unavailable on this machine
- [ ] Version pins and the three traps in §9.3 acknowledged
- [ ] Auth model (memory access token, HttpOnly refresh cookie) acceptable per §5.3
- [ ] Realtime contract alignment with backend spec §7 (Socket.IO, `/realtime`, `handshake.auth.token`) confirmed
- [ ] Runtime-config approach (§7.2) acceptable for appliance deployment
- [ ] No secret-bearing `VITE_` variable introduced (§7.1, §10)
- [ ] Test strategy and coverage thresholds (§11) acceptable
- [ ] Phase plan and dependencies (§12) acceptable
- [ ] Open questions (§13) routed to the right owners
- [ ] Confirmation that **no code, no `package.json`, and no install** was made in this repo during this phase

---

## 16. Status

| Item | State |
|---|---|
| Frontend scaffold spec | **Complete** — this document |
| `apps/web` scaffold | **Blocked** — pending Tech Lead sign-off (AGENTS.md: no code changes / installs at this stage) |
| `packages/shared` types | **Blocked** — pending sign-off; types drafted in §2.1, §8.1 |
| Dependencies installed | **Not performed** — matrix proven resolvable in a `/tmp` sandbox only (§9.5) |
| Board item "Set up React project scaffold" | **Awaiting review** by Tech Lead & DevOps |

> The board item is deliberately **not** checked off: no scaffold exists yet. It is completed when Phase 0 lands, after
> approval.

---

*End of spec.*
