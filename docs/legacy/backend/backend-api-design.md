# Smart CCTV — Backend (NestJS API) Design Spec

**Author:** Backend Engineer
**Status:** Draft for Tech Lead & DevOps review
**Date:** 2026-10-21
**Task:** `.ai-team/tasks/board.md` → "Backend Engineer: Initialize NestJS API repo" (delivered as a design spec; repo init deferred pending sign-off)

> **Scope note.** AGENTS.md states *"No code changes or dependency installations at this stage."* This document is therefore the
> reviewable design for the NestJS API — module boundaries, contracts, data model, and a phased build plan — with **no code
> and no installs**. Implementation begins after Tech Lead sign-off (see §12).

> **Verification note.** The Frigate MQTT contract (§5.1–§5.2), the Prisma 7 configuration model (§10.1, §11), and the
> NestJS 12 defaults (§10.2) were checked against upstream documentation and the npm registry on 2026-10-21 — not assumed.
> The Frigate payload uses the published `before`/`after` envelope, the camera topics use Frigate's real
> `frigate/<camera_id>/status/detect` layout, and the version pins record three specific upgrade traps.

---

## 1. Decisions & Context

### 1.1 Confirmed decisions

| Area | Decision | Rationale |
|---|---|---|
| Auth | Local JWT + rotating refresh + RBAC | Self-hosted appliance must work fully offline; no external IdP dependency |
| Data access | Prisma + PostgreSQL | Type-safe schema, first-class migrations, no separate migration service |
| Notifications | Rules engine + pluggable channel adapters | Rule logic decoupled from delivery; channels added without touching rules |
| Event source | Frigate via MQTT | Frigate owns RTSP ingest, detection, and recording; API consumes its events |
| API style | REST + Socket.IO WebSocket | REST for CRUD/config; WS for live event push to dashboard |

### 1.2 System context

```
┌──────────────┐   RTSP    ┌───────────────────┐
│ IP Cameras   │──────────▶│ Frigate (video-engine) │
└──────────────┘           └─────────┬─────────┘
                                      │ MQTT (events, camera status)
                                      ▼
                            ┌───────────────────┐
                            │  NestJS API       │
                            │  (this spec)      │
                            └────┬────────┬─────┘
                                 │        │
                 PostgreSQL ◀─────┘        └────▶ Socket.IO ──▶ React/MUI web
                 (events, users,               (live events)
                  rules, cameras)
```

**Division of responsibility.** Frigate is the video engine: RTSP ingest, motion/object detection, recording retention, and
its own event publication. The API never touches RTSP or video files. It consumes Frigate's MQTT events, persists metadata,
evaluates notification rules, and pushes live updates to the dashboard.

### 1.3 Non-goals (MVP)

- No video streaming proxying or transcoding in the API.
- No storage of media or snapshots in PostgreSQL (Frigate owns files; API stores only paths/IDs).
- No multi-tenant SaaS — single-tenant appliance.
- No mobile app.

---

## 2. Module Architecture

`apps/api` is a single NestJS application. Modules are strictly layered: **controllers depend on services, services depend on
repositories, repositories depend only on Prisma.** No module reaches into another module's internals — cross-module access goes
through the exporting module's public service.

```
apps/api/src/
├── main.ts                     # bootstrap: config validation, helmet, global pipes
├── app.module.ts
├── common/                     # shared building blocks
│   ├── decorators/             # @CurrentUser, @Roles, @Public
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── filters/                # AllExceptionsFilter (uniform error envelope)
│   ├── interceptors/           # LoggingInterceptor, TimeoutInterceptor
│   └── dto/                    # PaginationDto, IdParamDto
├── config/                     # typed env schema + validation
├── prisma/                     # PrismaService (lifecycle), PrismaModule
├── auth/                       # login, refresh, logout, password, guards
├── users/                      # user CRUD (admin only)
├── cameras/                    # camera registry + status
├── events/                     # ingestion pipeline + query/read API
├── notifications/              # rule engine + dispatch + channel adapters
├── mqtt/                       # MQTT client, topic mapping, reconnection
├── realtime/                   # Socket.IO gateway, auth handshake
├── health/                     # /health, /ready (liveness/readiness)
└── openapi/                    # Swagger bootstrap
```

### 2.1 Dependency rules

| Rule | Enforcement |
|---|---|
| Controllers never touch Prisma directly | Review; PrismaService is not exported publicly except to `PrismaModule` consumers |
| Modules communicate via exported services | `exports` arrays in each module |
| MQTT is a *transport* concern only | `mqtt/` owns the broker connection; `events/` depends on an `EventIngestor` interface, not on `mqtt` |
| Notification channels are pluggable | `NotificationChannel` interface; channels registered via DI multi-provider |

**Why the ingestion abstraction matters.** `events/` must be testable without a broker, and must not break when MQTT reconnects.
It receives a validated `FrigateEvent` DTO from *any* source (MQTT now, replay/import later). This is the single most important
boundary in the design.

---

## 3. Data Model (Prisma)

The Database & Messaging Engineer owns the final schema; this section states the backend's *required* entities and fields so
their work is unblocked. All IDs are UUIDs. All timestamps are `timestamptz` in UTC.

### 3.1 Entities

**User**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext unique | Lowercased, normalized on write |
| `passwordHash` | text | Argon2id; never selected by default |
| `displayName` | text | |
| `role` | enum `admin`/`operator`/`viewer` | |
| `isActive` | boolean | Default true; disables login without deleting audit history |
| `lastLoginAt` | timestamptz nullable | |
| `failedLoginCount` | int | Default 0; lockout counter |
| `lockedUntil` | timestamptz nullable | Set on lockout |
| `createdAt` / `updatedAt` | timestamptz | |

**RefreshToken**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK → User, cascade delete | |
| `tokenHash` | text unique | SHA-256 of the opaque token — raw token is never stored |
| `expiresAt` | timestamptz | |
| `revokedAt` | timestamptz nullable | Rotation marks old token revoked |
| `userAgent` / `ip` | text nullable | Audit |
| `createdAt` | timestamptz | |

**Camera**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `frigateId` | text unique | **Join key.** Frigate's *config camera **ID*** — the key under `cameras:` in `config.yml`, **not** its `friendly_name` (§5.1) |
| `name` | text | Friendly display name |
| `location` | text nullable | |
| `enabled` | boolean | Default true; disabled cameras are skipped by the rules engine |
| `lastSeenAt` | timestamptz nullable | Updated from MQTT status topic |
| `lastMotionAt` | timestamptz nullable | Updated from `frigate/<camera_id>/motion` |
| `createdAt` / `updatedAt` | timestamptz | |

> **Join key detail.** Frigate's MQTT topics embed the camera's config **ID** — the key under `cameras:` in `config.yml`
> (e.g. `front_door`), **not** the `friendly_name` and not a database id. The same value appears in the `camera` field of
> every `frigate/events` payload. `Camera.frigateId` therefore holds that exact string, which makes the topic path and the
> event payload resolve to one camera row. The Video & Computer Vision Engineer owns the canonical camera list; §5.1
> explains how the API reconciles it.

**CameraHealth** — current per-role status, one row per (camera, role)
| Field | Type | Notes |
|---|---|---|
| `cameraId` | uuid FK → Camera, PK part | |
| `role` | text, PK part | `detect` \| `record` \| `record_sub` \| `audio` — Frigate publishes one status topic per role (§5.1) |
| `status` | text | `online`/`offline`/`disabled`/`unknown` |
| `since` | timestamptz | When this status was first observed |
| `lastMessageAt` | timestamptz | Last status message received — drives the staleness sweep |
| `updatedAt` | timestamptz | |

> **Per-role, not one status column.** A single status column on `Camera` cannot represent a camera whose `detect` role is
> online while its `record` role is offline — a normal state (recording disabled, detection live). The Database & Messaging
> Engineer's `camera_health` table is per-role and this spec adopts it: a camera can be *detecting* while *not recording*,
> and the dashboard must be able to say so. `unknown` is a meaningful status and the **default** for a camera with no status
> row, because status topics are not retained — silence is not evidence of a fault (§5.1, §5.4).

**Event** — a Frigate *review item* (a segment of activity), the canonical user-facing record
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `frigateReviewId` | text unique | **Idempotency key.** Frigate's review id (e.g. `1718987129.308396-fqk5ka`). One review = one row |
| `frigateEventIds` | string[] | Member tracked-object ids (`data.detections`) |
| `cameraId` | uuid FK → Camera | |
| `severity` | text | `detection` \| `alert` — Frigate's `severity` field on the review segment (§5.2) |
| `status` | text | `open` \| `ended` — **stored explicitly**, with a monotonic guard so a late `update` cannot reopen an ended review (§16.2) |
| `objects` | string[] | Object labels present in the segment (`data.objects`) — e.g. `["person","car"]` |
| `subLabels` | string[] | `data.sub_labels` — e.g. `["Bob"]` for a recognised face |
| `zones` | string[] | `data.zones` — zones the segment touched |
| `verifiedObjects` | string[] | `data.verified_objects` — objects confirmed by a recogniser (e.g. `["person"]`) |
| `audio` | string[] | `data.audio` — audio labels detected in the segment (e.g. `["speech"]`) |
| `thumbnailPath` | text nullable | Frigate's review `thumb_path` (a `.webp`) |
| `startedAt` | timestamptz | Review `start_time` |
| `endedAt` | timestamptz nullable | Review `end_time`; null while open |
| `durationSeconds` | int nullable | `GENERATED ALWAYS ... STORED` in PostgreSQL — the DB owns it, so it cannot drift (§16.2) |
| `acknowledgedAt` | timestamptz nullable | Set by `POST /events/:id/acknowledge` (§8.1) — **not in the DB design; requested in §16** |
| `acknowledgedById` | uuid FK → User nullable | Operator who acknowledged — **requested in §16** |
| `rawPayload` | jsonb | Original MQTT payload for forensics |
| `createdAt` / `updatedAt` | timestamptz | |

> **Why a review, not a tracked object.** Frigate 0.14+ distinguishes *tracked objects* (one per person/car) from *review
> items* (one time period per camera, bundling every object active in it). Frigate's own notification guide states it is
> "generally recommended to trigger notifications based on the `frigate/reviews` MQTT topic". Two people and a dog walking
> past produce **one** review item, not four records — which is what a user actually wants to see and be notified about.
> The `Event` entity therefore models the review segment; individual tracked objects live in `EventObject` below.

> **The field is `severity`, not `type`.** Frigate's review payload carries `"severity": "alert" | "detection"` and **no**
> `type` field. The envelope's `type` is the *message* type (`new`/`update`/`end`) and lives one level up. Naming the
> column `type` would collide with the message type and with `Event.status`, and would misdescribe the value. `Event.severity`
> holds the review's severity; the message type is not stored as an entity field (§5.3).

> **There is no `hasSnapshot` / `hasClip` on a review.** Those flags are published on `frigate/events` (per tracked object),
> not on `frigate/reviews`. A review segment carries only `thumb_path`. The flags therefore live on `EventObject`, where the
> upstream data actually provides them — see the `EventObject` table below and the media caveat in §5.2.

**EventObject** — one tracked object inside a review
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `eventId` | uuid FK → Event, cascade delete | |
| `frigateEventId` | text unique | Frigate's tracked-object id (e.g. `1718987128.947436-g92ztx`) |
| `label` | text | Object class — `person`, `car`, `dog`, … |
| `subLabel` | text nullable | Frigate `sub_label` — a recognised face name or LPR value. **From `frigate/events` the value is a `[value, score]` tuple — take `sub_label[0]`.** See the asymmetry note below |
| `zones` | string[] | Zones the object entered during the segment |
| `confidence` | float nullable | Frigate `top_score` |
| `currentScore` | float nullable | Frigate `score` on the current frame |
| `attributes` | jsonb | Face/LPR/classification scores → `attributes`. **Also holds the `sub_label` tuple's score**, so no score is lost |
| `hasSnapshot` | boolean | Frigate `has_snapshot` (published on `frigate/events`, not on reviews) |
| `hasClip` | boolean | Frigate `has_clip` (published on `frigate/events`, not on reviews) |
| `falsePositive` | boolean | |
| `stationary` | boolean | |
| `startedAt` / `endedAt` | timestamptz | Object lifecycle within the segment |
| `rawPayload` | jsonb | The tracked-object payload as received |

> **Two levels, two idempotency keys.** A tracked object id is stable for that object's whole life, and a review id is
> stable for the segment. The Database & Messaging Engineer owns the concrete ledger (§16); the backend requires that both
> are unique, because MQTT redelivery is expected at QoS 1 and must never create a duplicate review or a duplicate object.

> **`sub_label` has two different types upstream — this is a real trap.** In `frigate/events`, `after.sub_label` is a
> **`[value, score]` tuple** (`["Bob", 0.95]`) or `null`. In `frigate/reviews`, `data.sub_labels` is a **list of plain
> strings** (`["Bob"]`) — upstream reads `obj["sub_label"][0]` and keeps only that element. `EventObject.subLabel` is a `text`
> column, so it is populated from **`sub_label[0]`**; writing the raw tuple would store the literal string `("Bob", 0.95)`.
> The tuple's score is kept in `EventObject.attributes` (and `top_score`/`confidence` where it applies). This asymmetry is
> the backend's Correction 3 to the Database & Messaging Engineer's review (§16.2).

**NotificationRule**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `enabled` | boolean | Default true |
| `cameraIds` | uuid[] | Empty array = all cameras |
| `eventLabels` | string[] | Empty array = all object labels (`person`, `car`, …); matched against `Event.objects` |
| `zones` | string[] | Empty array = all zones; matched against `Event.zones` |
| `severities` | string[] | Empty array = all severities; matched against `Event.severity` (`detection`/`alert`) |
| `minConfidence` | float nullable | Null = no threshold |
| `activeFrom` | time nullable | Local time-of-day window start |
| `activeTo` | time nullable | Local time-of-day window end; `activeFrom > activeTo` means overnight window |
| `cooldownSeconds` | int | Default 300; per-rule suppression window |
| `minIntervalSeconds` | int | Default 0; additional global-ish suppression |
| `lastFiredAt` | timestamptz nullable | Cooldown bookkeeping |
| `channels` | jsonb | Array of channel configs (see §6.2) |
| `createdById` | uuid FK → User | |
| `createdAt` / `updatedAt` | timestamptz | |

**NotificationDelivery**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ruleId` | uuid FK → NotificationRule | |
| `eventId` | uuid FK → Event | |
| `channel` | text | `telegram`/`webhook`/… |
| `status` | text + `CHECK` | `pending`/`sent`/`failed`/`skipped` — **text with a CHECK, not a PG enum** (§16.2) |
| `attemptCount` | int | |
| `lastError` | text nullable | Sanitized — never contains secrets |
| `sentAt` | timestamptz nullable | |
| `createdAt` | timestamptz | |

> **Uniqueness:** `(ruleId, eventId, channel)` unique — a rule cannot fire twice for the same event on the same channel, even
> across an API restart. This complements the cooldown check.

> **The array-valued rule filters are the backend's model and they win.** The Database & Messaging Engineer's §3.7 sketch
> uses a single `camera_id` + `zone` + `min_severity`. The backend's `cameraIds[]` / `eventLabels[]` / `zones[]` /
> `severities[]` form is strictly more expressive — a rule scoped to "cameras A and B, any of person/dog, in zone porch" is
> not expressible in the single-column form. **Their §3.7 is a sketch, not a constraint**; the Prisma migration implements
> the array form.

> **`NotificationDelivery.status` is `text` + `CHECK`, not a PostgreSQL enum.** The two designs disagreed on the word for a
> suppressed delivery: the backend says `skipped`, the DB design says `suppressed`. **The backend's `skipped` wins**, and the
> column is `text` with a `CHECK` that allows **both** words so neither side is broken. `text` + `CHECK` also avoids the
> `ALTER TYPE` lock that adding a value to a PG enum requires (§16.2).

### 3.2 Indexes

| Index | Purpose |
|---|---|
| `Event.frigateReviewId` unique | Idempotency for the canonical review stream (above) |
| `EventObject.frigateEventId` unique | Idempotency for the tracked-object stream |
| `Event(cameraId, startedAt DESC)` | Camera timeline, the dominant query |
| `Event(startedAt DESC)` | Global timeline |
| `Event(objects, startedAt DESC)` | Filter by object label — GIN on the `objects` array |
| `Event` GIN on `zones` | Zone filter queries |
| `Event(status, startedAt DESC)` partial `WHERE status = 'open'` | Open-event lookups (the dashboard's default view) |
| `Event(acknowledgedAt)` partial `WHERE acknowledgedAt IS NULL` | "Unacknowledged events" widget — the default dashboard filter |
| `EventObject(eventId)` | Objects belonging to a review |
| `EventObject(label, startedAt DESC)` | Filter objects by label |
| `CameraHealth(status, updatedAt)` | Camera-health sweep — find roles that have gone stale |
| `NotificationRule(enabled)` | Partial index `WHERE enabled = true` for the hot path |
| `NotificationDelivery(status, createdAt)` | Retry sweep |
| `RefreshToken(tokenHash)` unique | Refresh lookup |
| `User(email)` unique | Login lookup |

> **The indexes above are the backend's requirement, not the schema.** The Database & Messaging Engineer owns the final
> DDL and has measured index roles against a real PostgreSQL instance; where their measured plan differs from this table,
> **theirs wins** — this is a requirement list, not a second schema. Their `EXPLAIN (ANALYZE)` results are the stronger
> evidence. See §16.

**Retention.** `Event` rows older than the configured retention window (default 30 days) are deleted by a nightly job. Frigate
owns media retention; the API owns only metadata retention. Retention configuration is owned jointly with the Security &
Privacy Engineer.

---

## 4. Authentication & Authorization

### 4.1 Token model

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token | 15 minutes (configurable) | Client memory only | Authorization on every request |
| Refresh token | 30 days, **rotating** | `HttpOnly` + `Secure` + `SameSite=Strict` cookie | Mint new access tokens |

- **Access token** is a JWT signed `HS256` with a `JWT_SECRET` (≥32 bytes, injected via env — never committed). Claims:
  `sub` (user id), `email`, `role`, `typ: 'access'`, `iat`, `exp`, `jti`.
- **Refresh token** is an opaque 32-byte random string, not a JWT. Only its SHA-256 hash is stored, so a database leak does not
  yield usable tokens. Presented in the body/cookie, looked up by hash, and **rotated on every use**: the old token is revoked
  and a new one issued. Reuse of an already-revoked token revokes the whole family (theft detection).

### 4.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Body: email + password. Rate-limited. Sets refresh cookie. Returns access token + user profile |
| `POST` | `/auth/refresh` | Refresh cookie | Rotates refresh token, returns new access token |
| `POST` | `/auth/logout` | Authenticated | Revokes the presented refresh token |
| `POST` | `/auth/change-password` | Authenticated | Requires current password; revokes all refresh tokens |
| `GET` | `/auth/me` | Authenticated | Current profile |
| `POST` | `/users` | `admin` | Create user |
| `GET` | `/users` | `admin` | List users |
| `PATCH` | `/users/:id` | `admin` | Update role/active state/name |
| `DELETE` | `/users/:id` | `admin` | Deactivate (soft) — never hard-delete an audited user |

### 4.3 RBAC

| Role | Permissions |
|---|---|
| `admin` | Everything, including user management and channel credential configuration |
| `operator` | Read cameras/events, manage notification rules, acknowledge events |
| `viewer` | Read-only: cameras, events, live feed |

Enforcement is a `RolesGuard` reading a `@Roles(...)` decorator. The guard is global and fails **closed**: a route with no
`@Roles` decorator and no `@Public` decorator defaults to requiring authentication.

**Route policy.** Any endpoint not explicitly marked `@Public()` requires a valid access token.

### 4.4 Brute-force mitigation

- Login is rate-limited (default 5 attempts / 15 min / IP+email) via `@nestjs/throttler`.
- Per-user `failedLoginCount` triggers a lockout of 15 minutes after 5 failures.
- Responses are uniform for "unknown email" and "wrong password" — no user enumeration.
- Passwords: minimum 12 characters, checked against a breach list; hashed with **Argon2id** (memory-hard).

### 4.5 Secrets management

- All secrets arrive via environment variables or a mounted secret file; **nothing is hard-coded** in source.
- `.env` is git-ignored; `.env.example` documents variable names with empty/placeholder values only.
- Channel credentials (Telegram bot token, webhook secret) are stored **encrypted at rest** using a master key from the
  environment (`CREDENTIALS_ENCRYPTION_KEY`), and decrypted only at dispatch time.
- `JWT_SECRET` and `CREDENTIALS_ENCRYPTION_KEY` are validated at startup — the app refuses to boot without them.

---

## 5. Event Ingestion (MQTT)

### 5.1 Topic contract

Frigate publishes to these topics (via the MQTT integration). **These are Frigate's actual published topic names**, verified
against the upstream docs on 2026-10-21:

| Topic | Direction | Payload | QoS |
|---|---|---|---|
| `frigate/reviews` | Subscribe | Review item envelope (JSON) — **canonical event stream**, see §5.2 | 1 |
| `frigate/events` | Subscribe | Tracked-object envelope (JSON) — per-object detail, see §5.2 | 1 |
| `frigate/tracked_object_update` | Subscribe | Face/LPR/classification patch keyed by object id — see §5.5 | 1 |
| `frigate/camera_activity` | Subscribe | Per-camera activity + config snapshot (JSON) | 0 |
| `frigate/stats` | Subscribe | CPU/memory/camera stats (JSON) | 0 |
| `frigate/available` | Subscribe | Frigate availability flag | 0 |
| `frigate/profile/state` | Subscribe | Active detection profile name | 0 |
| `frigate/<camera_id>/status/detect` | Subscribe | Plain text: `online` \| `offline` \| `disabled` | 0 |
| `frigate/<camera_id>/status/record` | Subscribe | Plain text: `online` \| `offline` \| `disabled` | 0 |
| `frigate/<camera_id>/status/audio` | Subscribe | Plain text: `online` \| `offline` \| `disabled` | 0 |
| `frigate/<camera_id>/detect/state` | Subscribe | Plain text: `ON` \| `OFF` | 0 |
| `frigate/<camera_id>/motion` | Subscribe | Plain text: `ON` \| `OFF` (held for `mqtt_off_delay`, 30 s default) | 0 |
| `frigate/<camera_id>/motion/state` | Subscribe | Plain text: `ON` \| `OFF` | 0 |
| `frigate/<camera_id>/enabled/state` | Subscribe | Plain text: `ON` \| `OFF` | 0 |
| `frigate/<camera_id>/recordings/state` | Subscribe | Plain text: `ON` \| `OFF` | 0 |
| `frigate/<camera_id>/snapshots/state` | Subscribe | Plain text: `ON` \| `OFF` | 0 |
| `frigate/<camera_id>/<object_name>` | Subscribe | Object count for the camera (e.g. `person`) | 0 |
| `frigate/<camera_id>/<object_name>/snapshot` | Subscribe | Latest snapshot for that object class — see the media caveat in §5.2 | 0 |

**The status topic is `frigate/<camera_id>/status/<role>`**, where `<role>` is one of `detect`, `record`, `audio` (plus
`record_sub` on cameras with sub-stream recording). Every role publishes the same three-value vocabulary:
`online` (stream running and processed), `offline` (stream offline, being restarted), `disabled` (camera turned off).
The API subscribes to the `detect` role for the dashboard's camera health and treats `record`/`audio` as optional.

> **Use the config ID, never the friendly name.** Frigate's docs are explicit: *"Wherever a topic below includes a camera,
> mask, or zone name, use its `ID` from the config, not its `friendly_name`."* A camera declared as
> `cameras: { front_door: { friendly_name: "Front Door" } }` publishes to `frigate/front_door/...` — not
> `frigate/Front Door/...`. Building a topic with the friendly name silently produces a topic nobody publishes to, and the
> camera looks permanently offline.

> **Command topics are out of scope.** Frigate also exposes writable topics — `frigate/<camera_id>/detect/set`,
> `frigate/<camera_id>/motion/set`, `frigate/<camera_id>/recordings/set` — used to toggle detection, motion, and recording.
> The API does **not** publish to them in the MVP: camera control belongs to the operator, and switching detection off from
> a notification surface is a footgun. Listed here so the next engineer does not mistake them for read-only feeds.

> **`frigate/camera_activity` is the camera-reconciliation feed.** It reports each camera's current features, whether it is
> detecting motion, and its activity state. The API requests the full snapshot by publishing to `frigate/onConnect` at
> startup (and on demand) — the only reliable way to learn the camera list at boot, since individual status topics only
> arrive on change. This is how the API reconciles `Camera` rows against Frigate's actual config.

> **Neither `reviews` nor `events` is retained.** A reconnecting consumer therefore **loses** the messages published while
> it was away. The resync procedure is owned by the Database & Messaging Engineer (§5 of their design) — the backend
> requires that the resync is **idempotent against the same dedupe rules**, so anything received both live and via resync
> collapses into one row. See §5.4.

> **Status topics are not retained either.** A consumer that connects late sees no camera status at all. A camera with no
> status is `unknown`, **not** `offline` — only an explicit `offline` payload may set that.

> **Final topic names are the Database & Messaging Engineer's call** — the API treats topics as configuration, not constants
> (§9 `MQTT_TOPIC_PREFIX`, `MQTT_EVENTS_TOPIC`, `MQTT_STATUS_TOPIC_PATTERN`), so a re-layout is a config change plus a
> mapper change, not a rewrite.

> **Status payloads are plain strings, not JSON.** A common integration mistake is to expect
> `{"camera": "front_door", "status": {...}}`. Frigate publishes the bare token. The Zod schema for status topics is
> therefore a string enum, not an object.

> **Status describes the role, not reachability.** Per Frigate's docs, the status reflects the state of Frigate's *process
> for that role*, not whether the camera is reachable — an unreachable camera alternates between `offline` and `online` as
> the watchdog restarts ffmpeg. The API therefore **debounces status changes** before writing `CameraHealth.status` (see
> §5.4) and never flips the dashboard to "offline" on a single message.

> **The topic path segment is the camera's config *ID*, not a friendly name.** The identical config ID appears in the
> `camera` field of every `frigate/events` payload. This is why `Camera.frigateId` (§3.1) holds the config ID and is the
> single join key across topics, payloads, and the database. The dashboard shows the friendly name; the API matches on the ID.

### 5.2 `frigate/reviews` payload (canonical) and `frigate/events` (detail)

Both topics use the same **`before` / `after` envelope**: the `type` field describes the *message*
(`new`, `update`, `end`), and the payload lives in `before` and/or `after`. They differ in what they represent.

#### `frigate/reviews` — the canonical event stream

A review is a **segment**: one time period for one camera, bundling every object active during it. This is the
canonical `Event` (§3.1).

```json
{
  "type": "new",
  "before": null,
  "after": {
    "id": "1718987129.308396-fqk5ka",
    "camera": "front_door",
    "start_time": 1718987129.308396,
    "end_time": null,
    "severity": "alert",
    "thumb_path": "/media/frigate/clips/review/thumb-front_door-1718987129.308396-fqk5ka.webp",
    "data": {
      "detections": ["1718987128.947436-g92ztx", "1718987148.879516-d7oq7r"],
      "objects": ["person", "car"],
      "verified_objects": [],
      "sub_labels": ["Bob"],
      "zones": ["front_yard"],
      "audio": [],
      "classification_state_changes": []
    }
  }
}
```

> **The review payload is nested under `data`.** `detections`, `objects`, `sub_labels`, `zones`, `audio`, and
> `classification_state_changes` live **inside `data`**, not at the top level. There is no top-level `has_snapshot`,
> `has_clip`, `duration`, or `type` field. A Zod schema that reads `after.objects` instead of `after.data.objects` will
> validate against `null` and silently persist an empty segment — the single most likely cause of "the dashboard shows no
> labels" bugs. **The Zod schema must read from `data.*`.**

| Review field | Type | Notes |
|---|---|---|
| `id` | string | Review segment id — a string like `1718987129.308396-fqk5ka`. **The idempotency key** → `Event.frigateReviewId` |
| `camera` | string | Config camera ID → `Camera.frigateId` |
| `start_time` | number | → `Event.startedAt` |
| `end_time` | number \| null | `null` while open → `Event.endedAt` |
| `severity` | string | Exactly `alert` \| `detection` (Frigate's `SeverityEnum`) → `Event.severity` |
| `thumb_path` | string | The review thumbnail (`.webp`) → `Event.thumbnailPath` |
| `data.detections` | string[] | Member tracked-object ids → `Event.frigateEventIds` |
| `data.objects` | string[] | Object labels in the segment → `Event.objects` |
| `data.verified_objects` | string[] | Objects confirmed by a recognizer → `Event.verifiedObjects` |
| `data.sub_labels` | string[] | **Plain strings**, e.g. `["Bob"]` → `Event.subLabels` |
| `data.zones` | string[] | Zones the segment entered → `Event.zones` |
| `data.audio` | string[] | Audio labels → `Event.audio` |
| `data.classification_state_changes` | array | State-classification transitions (`{model, from, to, timestamp}`) → `Event.rawPayload` |

> **`severity` has exactly two values** — `alert` and `detection` (upstream's `SeverityEnum`). There is no `false_positive`
> or `record` severity at the review level. `Event.severity` is therefore a two-valued enum, not free text.
>
> **`data.sub_labels` is a list of plain strings** (`["Bob"]`), *not* the `[value, score]` tuple used by `frigate/events`.
> See the type-asymmetry note below.

> **Notification semantics.** Frigate's own guidance is to trigger notifications from `frigate/reviews` — a review is
> "typically when a person or vehicle is detected on a camera and the event is not a false positive". This is why the
> canonical `Event` is a review and not a tracked object: one notification per segment, not one per object.
>
> **Note the two levels of `type`.** The envelope's `type` is the *message* type (`new`/`update`/`end`). The review's own
> classification is **`severity`** (`detection`/`alert`) — upstream's `SeverityEnum`, a different field at a different level
> of the payload. They must not be confused. The API stores the message type nowhere (lifecycle comes from `endedAt`) and
> stores the review severity in `Event.severity`.

#### `frigate/events` — per-object detail

A tracked object is one person, car, or animal. These become `EventObject` rows (§3.1).

```json
{
  "type": "new",
  "before": null,
  "after": {
    "id": "1718987128.947436-g92ztx",
    "camera": "front_door",
    "label": "person",
    "sub_label": null,
    "top_score": 0.87,
    "score": 0.82,
    "start_time": 1744512345.123,
    "end_time": null,
    "current_zones": ["entrance"],
    "entered_zones": ["entrance"],
    "has_snapshot": true,
    "has_clip": false,
    "snapshot": null,
    "thumbnail": "/media/frigate/thumbnails/front_door/1718987128.947436-g92ztx.jpg",
    "false_positive": false,
    "recognized_license_plate": null,
    "stationary": false,
    "active": true,
    "frame_time": 1744512345.123,
    "attributes": { "face": 0.86 },
    "current_attributes": []
  }
}
```

| Object field | Type | Notes |
|---|---|---|
| `id` | string | Tracked-object id, e.g. `1718987128.947436-g92ztx`. **The idempotency key** → `EventObject.frigateEventId` |
| `camera` | string | Config camera ID → `Camera.frigateId` |
| `label` | string | Object class → `EventObject.label` |
| `sub_label` | `[value, score]` tuple \| null | e.g. `["Bob", 0.92]` for a recognised face → `EventObject.subLabel` = `sub_label[0]`, score → `attributes` |
| `top_score` | number | → `EventObject.confidence` |
| `score` | number | Current frame score → `EventObject.currentScore` |
| `start_time` / `end_time` | number / number \| null | Object lifecycle → `EventObject.startedAt` / `endedAt` |
| `current_zones` | string[] | Zones occupied right now |
| `entered_zones` | string[] | Zones entered during the object → `EventObject.zones` |
| `has_snapshot` / `has_clip` | boolean | Flags only — the paths are not published → `EventObject.hasSnapshot` / `hasClip` |
| `snapshot` | object \| null | **Not a path.** A structured detection summary → `EventObject.rawPayload` |
| `thumbnail` | string \| null | The only media path published → `EventObject.rawPayload` |
| `false_positive` | boolean | → `EventObject.falsePositive` |
| `recognized_license_plate` | string \| null | Folded into `EventObject.subLabel` |
| `stationary` / `active` | boolean | `active` is strictly the opposite of `stationary` |
| `frame_time` | number | Timestamp of the frame this state describes |
| `attributes` | object | Attributes identified at any point, with top score (e.g. `{ face: 0.86 }`) → `EventObject.attributes` |
| `current_attributes` | array | Detailed attribute detections for the current frame |
| `box` / `area` / `ratio` / `region` | array / number | Frame geometry → `rawPayload` only — not indexed, not filtered on |

> **The first message is not always `new`.** Frigate publishes the first message for an object "when the tracked object is
> no longer marked as a `false_positive`", so the first message for an id may be an `update`, and a `new` may arrive with
> `false_positive: true` before it. The upsert is keyed on the id alone and never assumes the first message is a `new`.

> **`sub_label` is a tuple here, but a plain string on reviews.** In `frigate/events`, `after.sub_label` is a
> **`[value, score]` tuple** (upstream assigns `self.obj_data["sub_label"] = (max_logo, score)`) or `null`. In
> `frigate/reviews`, `data.sub_labels` is a **list of plain strings** (upstream reads `obj["sub_label"][0]` and keeps only
> that element). `EventObject.subLabel` is a `text` column, so the API takes **`sub_label[0]`** — writing the raw tuple
> would store the literal string `("Bob", 0.92)`. The tuple's score is kept in `EventObject.attributes`, so nothing is
> lost. This is Correction 3 in the Database & Messaging Engineer's review of this spec (§16.2).

> **Media-path caveat.** Frigate does **not** publish snapshot or clip *paths* on either event topic. The `snapshot` field
> is a version-dependent structure, and the clip path is not included at all. The API stores what it is given
> (`thumb_path` on reviews, `thumbnail` on objects) plus the `has_snapshot` / `has_clip` flags — and **no snapshot URL is
> invented from a Frigate path**. If the dashboard needs images, the Video & Computer Vision Engineer must confirm the
> mechanism (Frigate's snapshot API, a media server, or a version-specific field); until then, the UI shows the thumbnail
> or a "no snapshot" placeholder. This is tracked as Q9 in §13 and blocks the dashboard's event-detail screen.


### 5.3 Ingestion pipeline

Two streams are ingested, with different levels of authority:

```
frigate/reviews  ──▶ review envelope  ──▶ Event      (canonical, segment-level)
frigate/events   ──▶ object envelope  ──▶ EventObject (detail, object-level)
frigate/tracked_object_update ──▶ patch ──▶ EventObject attributes (patch only)
```

**Review stream (canonical):**
```
MQTT message
  → raw JSON parse (safe)
  → Zod schema validation (reject malformed, log + drop)
  → envelope unwrap (message type + after ?? before)
  → camera resolution (payload.camera → Camera.frigateId; upsert if unknown)
  → idempotent upsert on frigateReviewId
  → emit internal EventCreated / EventUpdated domain events
  → rules engine evaluation (§6)
  → realtime push to dashboard (§7)
```

**Object stream (detail):**
```
MQTT message
  → Zod schema validation
  → envelope unwrap
  → upsert EventObject on frigateEventId
  → link to the parent Event by matching the object's id
      against Event.frigateEventIds
```

**Design decisions:**

- **Zod, not class-validator, for MQTT input.** MQTT payloads are untrusted external input with a shape we don't control.
  Zod gives structural parsing with precise error paths and no prototype-pollution risk. class-validator is retained for
  *our* REST DTOs, where Nest's `ValidationPipe` integration is the right tool.
- **Unknown camera → upsert, not reject.** Frigate may publish for a camera before an admin registers it. Auto-creating a
  disabled camera row (enabled = false) prevents event loss; an admin can enable it later. The upsert uses the payload's
  `camera` value as `frigateId`.
- **Validation failures are dropped, not fatal.** A single malformed message must not kill the MQTT client. Failures are logged
  at `warn` with the topic and validation paths — never the raw payload (it may contain paths/identifiers).
- **Envelope unwrapping.** The API normalizes `before`/`after` into a single object view before validating business rules:
  `new` → `after`; `update` → `after ?? before`; `end` → `after ?? before` (the `after` object carries the terminal
  `end_time`). If both are `null`, the message is dropped as malformed.
- **`update` and `end` merge into the same row.** A review is identified by `frigateReviewId`; `end` sets `endedAt` and
  `durationSeconds` (computed from `end_time - start_time`), and every message refreshes `rawPayload`.
- **Message type is not stored as an entity field.** `new`/`update`/`end` describes the *transport message*, not the review.
  The row's lifecycle is derived from `endedAt` being null or set. This avoids a name collision with the review's own
  `severity` — see §5.2.
- **Terminal state wins, and `status` is stored explicitly.** An `end` that arrives before its `new` still creates the row
  (upsert), and a later `new` must not clear `endedAt`. `Event.status` is written as `open`/`ended` and guarded
  **monotonically**: a late `update` cannot move an `ended` review back to `open`. Deriving the status from `endedAt` alone
  cannot express that rule. The guard is applied in the write path, not left to the application to remember.
- **Object → review linking is by id, not by time.** A tracked object joins its review when its id appears in
  `Event.frigateEventIds`. There is no fuzzy time-window join — a person and a car detected at the same second belong to
  different reviews.
- **`sub_label` is normalized to text — on the `frigate/events` stream only.** There the value is a `[value, score]` tuple or
  `null`; the API stores `sub_label[0]` (e.g. `Bob`) and keeps the paired score in `attributes` (and in `confidence` only if
  `top_score` is absent). On the `frigate/reviews` stream `data.sub_labels` is already a list of plain strings and is stored
  as-is. The two shapes are **not** interchangeable — see the type-asymmetry note in §5.2.


### 5.4 Reliability

| Concern | Approach |
|---|---|
| Broker down at startup | Reconnect loop with exponential backoff (1s → 60s, jitter). App stays up; ingestion resumes |
| Duplicate delivery | `upsert` on the unique review id / object id. QoS 1 is at-least-once, so duplicates are **expected**, not an edge case |
| Out-of-order messages | `startedAt` comparison; a message with an older `start_time` does not overwrite newer state. An `end` arriving before its `new` still creates the row (upsert), and a later `new` must not clear `endedAt` — terminal state wins |
| Malformed payload | Zod validation → drop + warn |
| Slow consumer / backpressure | The MQTT client decouples reception from processing; ingestion is queued in-process with a bounded buffer |
| Poison message | Bounded retries, then dropped to a dead-letter log |
| Broker restart | `clean: false` session with QoS 1 so buffered messages are redelivered — and, because Frigate does not retain `reviews`/`events`, a **resync from the Frigate HTTP API** (§5.4.1) to fill the gap |
| Frigate crash | `frigate/available` is retained with a will message, so a crash is distinguishable from a clean stop. Open events are closed with `endedAt` = the transition time, because Frigate will never send their `end` |

**QoS choice.** Subscribe at **QoS 1** for `frigate/reviews`, `frigate/events`, and `frigate/tracked_object_update`
(at-least-once, matches the idempotency design) and **QoS 0** for camera status (latest-value data where a stale message
is worthless).

**Camera status handling.** Status topics are subscribed with a wildcard — `frigate/+/status/<role>` — rather than one
subscription per camera, so a camera added to Frigate's config is picked up without an API restart. The topic's second segment
is the camera's config ID, which is exactly the value used to resolve the `Camera` row. Each (camera, role) pair is written to
its own `CameraHealth` row (§3.1), so a camera can be detecting while not recording.

Three properties of upstream's status stream shape this handler, and all three break a naive implementation:

1. **Status is a level, not an edge.** Frigate republishes each role's status roughly every 10 s (`ffmpeg.retry_interval`).
   A republish is not a state change and must not create a row, a log line, or a dashboard update.
2. **Status topics are not retained.** A consumer that connects late sees *no* status at all. A camera with no
   `CameraHealth` row is **`unknown`**, never `offline` — only an explicit `offline` payload may set that. A periodic sweeper
   marks roles `unknown` once `lastMessageAt` is older than the staleness threshold.
3. **An unreachable camera flaps.** Because status reflects Frigate's *process* for that role, not camera reachability, a dead
   camera alternates `offline` → `online` as the watchdog restarts ffmpeg. Status changes are therefore **debounced** with a
   hysteresis window before they are written, so the dashboard does not flicker on a single message.

#### 5.4.1 Resync — the gap every consumer must handle

Frigate does not retain `reviews` or `events`. **Any disconnect loses messages.** This is the single most important
operational property of the integration, and it is why the ingestor cannot be "subscribe and hope".

The resync procedure itself is owned by the Database & Messaging Engineer (§5.2–§5.3 of their design). The backend's
requirement is narrow and specific:

1. **Subscribe first, then fetch.** Subscribing before the HTTP fetch guarantees no gap; the fetch then fills it.
2. **The resync must be idempotent against the same dedupe rules.** Anything received both live and via resync collapses
   into one row — the resync is not a special path.
3. **The resync must run on cold start and on every warm reconnect**, not only at boot.
4. **The Frigate API credential is injected at runtime**, never committed (AGENTS.md: no hard-coded API keys). It needs its
   own env var and secret treatment — see §9 and Q13.

Without this, a brief network blip silently drops events, and the dashboard shows a timeline with holes in it that nobody
can explain.

### 5.5 `frigate/tracked_object_update` — out-of-band patches

Face recognition, license-plate recognition, and classification results do **not** arrive on the
`frigate/events` stream. Frigate publishes them separately on `frigate/tracked_object_update`, keyed only by the tracked
object's `id` — the same id used in `frigate/events`.

> **Modelling statement (Correction 2).** To be unambiguous, and to close the contradiction the Database & Messaging
> Engineer flagged: **`frigate/reviews` is modelled as `Event`** (the canonical review segment, §3.1) and
> **`frigate/events` is modelled as `EventObject`** (the tracked-object detail, §3.1). There is no third, unmodelled review
> stream and no pre-0.14 review shape anywhere in this spec — `frigate/reviews` did not exist before Frigate 0.14, and the
> 0.13.1 MQTT documentation lists only `frigate/events`. §5.5 covers a *third* topic, `frigate/tracked_object_update`,
> which is a patch channel onto `EventObject`, not an event source in its own right.

**MVP decision: subscribe and validate, but do not build a second write path.** The API applies these as **patches to an
existing `EventObject` row**, never as new objects. The patch is idempotent by construction: it sets `subLabel` and
`attributes` to the values carried in the message, so applying the same patch twice produces the same result.

If the tracked object is not yet known (the patch arrived before its `frigate/events` message), the API **buffers** the
patch in memory with a short TTL and re-applies it when the object arrives; if the object still has not arrived, the patch
is dropped and logged. This is a small, contained addition to the ingestion pipeline — it is not a reason to delay Phase 2.

The Database & Messaging Engineer owns the persistence detail; the backend requires only that a patch never creates a
duplicate object and never resurrects an ended one.


## 6. Notification Rules Engine

### 6.1 Evaluation flow

```
Review created (Frigate `new`) or Review ended (Frigate `end`)
  → load enabled rules (partial index on enabled)
  → for each rule: does it match?
      cameraIds  (empty = all)
      eventLabels (empty = all) — matched against Event.objects
      zones       (empty = all) — matched against Event.zones
      severities  (empty = all) — matched against Event.severity (detection/alert)
      minConfidence
      time window (activeFrom/activeTo, overnight-aware)
  → cooldown check: now - lastFiredAt < cooldownSeconds → skip
  → duplicate check: (ruleId, eventId, channel) already delivered → skip
  → create NotificationDelivery rows (status=pending)
  → dispatch to each channel adapter
  → update status / attemptCount / lastError
```

**Zone matching** uses `Event.zones` — the zones the *segment* touched. A review accumulates its zones for the whole
segment, so an object that entered `entrance` and later moved to `driveway` still matches a rule scoped to `entrance`.
Matching on the object's live position instead would make a rule silently stop firing as the subject walks through.

**Label matching** uses `Event.objects` (the array of object labels in the segment), not the tracked object's `label`. A
segment containing a person *and* a dog matches a rule scoped to `person` — the rule fires if **any** member matches, not
only if all do. This is the behaviour an operator expects from "notify me when a person appears".

**Severity matching** uses `Event.severity` (`detection`/`alert`). A rule can be scoped to `alert` only, so the user is not
woken for every routine detection.

**Confidence matching** uses the segment's member objects: a review matches `minConfidence` if **any** member object has
`confidence >= minConfidence`. A review with no objects (or with objects whose scores are unknown) matches only rules with
no confidence threshold.

**Evaluation timing.** Rules are evaluated on `new` and on `end` (a person present for 40 seconds in a monitored zone should
still notify, and the `end` message carries the final segment state). Rules are **not** re-evaluated on every `update` —
that would fire repeatedly during a long event. A segment that lasts 40 seconds produces **one** notification, not forty.

**Time windows** use the configured site timezone (env `SITE_TIMEZONE`, default `UTC`), so "quiet hours" match the user's
intent, not the server's clock.

**Cooldown is per rule**, not per rule+event, and is stored on the rule (`lastFiredAt`) so it survives an API restart. A
single person lingering in a 60-second window produces one notification, not sixty.

### 6.2 Channel adapter interface

```ts
export interface NotificationChannel {
  readonly type: string;                      // stable identifier, e.g. 'telegram'
  send(target: ChannelTarget, message: NotificationMessage): Promise<SendResult>;
  validateConfig(config: unknown): boolean;   // called on rule save
}

export interface ChannelTarget {
  channel: string;
  config: Record<string, unknown>;   // decrypted at dispatch time
}

export interface NotificationMessage {
  title: string;
  body: string;
  eventId: string;
  cameraName: string;
  mediaUrl?: string;   // only set when a real, resolvable media path exists — never fabricated
  occurredAt: string;
}

export type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean };
```

**MVP channels:**

| Channel | Config | Notes |
|---|---|---|
| `telegram` | `botToken`, `chatId` | Bot API `sendPhoto` with caption; falls back to `sendMessage` when no media URL is available |
| `webhook` | `url`, optional `secret` | Generic POST with JSON body; HMAC-SHA256 signature header when a secret is set |

Adapters are registered through a NestJS multi-provider token, so adding a channel = one new class + one provider entry. The
rules engine depends only on the `NotificationChannel` interface and never on a concrete channel.

**Media in notifications.** `mediaUrl` is populated from a **real** media path only — currently Frigate's `thumbnail` path
when the dashboard/API is configured to serve it. Per §5.2, no snapshot URL is invented. A channel that receives no
`mediaUrl` sends a text-only message; the Telegram adapter does this automatically.

**Failure handling.** Delivery failures are recorded, not fatal. `retryable: true` errors are retried with exponential backoff
(up to 3 attempts); permanent failures (bad token, 4xx) are not retried. Failed deliveries are visible to admins for
inspection — the MVP surfaces them in the API but does not build a separate retry dashboard.

**Secret hygiene.** `lastError` is sanitized so that a Telegram bot token or webhook secret can never leak into the database
or logs. Error messages are truncated to 500 characters and known secret values are redacted.

---

## 7. Realtime (Socket.IO)

### 7.1 Gateway

Namespace `/realtime`, CORS restricted to the configured web origin.

**Handshake authentication.** The client passes the access token in `handshake.auth.token`. The gateway verifies it with the
same JWT service used by the HTTP guard. Unauthenticated sockets are rejected during the handshake — no unauthenticated
connection is ever accepted. Tokens are short-lived, so the client refreshes and re-authenticates on expiry; the server emits
`auth.expired` to prompt a refresh.

### 7.2 Events pushed

| Event | Payload | Trigger |
|---|---|---|
| `event.created` | Event DTO | New event ingested |
| `event.updated` | Event DTO | Event ended, or a field changed on an active event |
| `camera.status` | `{ cameraId, role, status, since, lastSeenAt, lastMotionAt }` | MQTT status / motion message — `role` is `detect`/`record`/`record_sub`/`audio` |
| `auth.expired` | `{}` | Access token expired |

### 7.3 Rooms and authorization

Sockets join a room per camera (`camera:<id>`) and a global room (`events:all`). The dashboard subscribes to `events:all` plus
the cameras it displays. **Filtering by role:** a `viewer` receives all camera events (they can view all cameras anyway); if
per-camera access restrictions are later introduced, room joins are validated against the user's camera grants.

### 7.4 Connection hygiene

- `pino` structured logging for connect/disconnect with user id and client count.
- Heartbeat with disconnect detection (Socket.IO ping/pong, default 25s).
- A client count metric is exposed for the readiness endpoint.

---

## 8. REST API Surface

All list endpoints are cursor-paginated (`limit` ≤ 100, `cursor`). Responses use a consistent envelope:

```json
{ "data": ..., "meta": { "limit": 25, "nextCursor": "..." | null, "total": 123 } }
```

Errors use a uniform envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### 8.1 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness — process is up |
| `GET` | `/health/ready` | Public | Readiness — DB reachable, MQTT connected |
| `POST` | `/auth/*` | Public / authed | See §4.2 |
| `GET` | `/cameras` | Authed | List cameras with live status — `health[]` (one entry per role: `role`, `status`, `since`), `lastSeenAt`, `lastMotionAt` |
| `GET` | `/cameras/:id` | Authed | Camera detail |
| `PATCH` | `/cameras/:id` | `admin` | Update name/location/enabled |
| `GET` | `/events` | Authed | List/filter reviews: `cameraId`, `label`, `zone`, `severity`, `status`, `acknowledged`, `from`, `to`, `cursor`, `limit` |
| `GET` | `/events/:id` | Authed | Event detail (raw payload available to admin only) |
| `GET` | `/events/:id/objects` | Authed | The tracked objects inside a review segment |
| `POST` | `/events/:id/acknowledge` | `operator`, `admin` | Mark acknowledged |
| `GET` | `/notification-rules` | Authed | List rules |
| `POST` | `/notification-rules` | `operator`, `admin` | Create rule |
| `PATCH` | `/notification-rules/:id` | `operator`, `admin` | Update rule |
| `DELETE` | `/notification-rules/:id` | `operator`, `admin` | Delete rule |
| `GET` | `/notification-deliveries` | `admin` | Delivery log (status, errors) |
| `GET` | `/users` | `admin` | See §4.2 |
| `GET` | `/api-docs` | Public | Swagger UI (dev only) |

Event `rawPayload` is restricted to `admin` — it contains internal Frigate detail that need not be exposed to viewers.

**Filter naming follows the data model.** `label` matches `Event.objects`, `zone` matches `Event.zones`, and `severity`
matches `Event.severity`. The API vocabulary and the database vocabulary stay identical (§3.1), so there is exactly one
word for each concept across the API, the database, and the dashboard. An unknown query parameter is rejected rather than
silently ignored — `forbidNonWhitelisted` applies to query params too.

> **`severity`, not `type`.** The filter is named after the column it filters (`Event.severity`). `type` would collide with
> the envelope's message type (`new`/`update`/`end`) — a term that already means two different things in this system. The
> Frontend Engineer's scaffold spec still refers to this filter as `type` in its `eventFilters` store shape; **the frontend
> must rename it to `severity`** before the events page ships, or the request will be rejected as an unknown parameter.
> Tracked as Q16 (§13).

**`label` and `zone` are array matches, not equality.** A review with objects `["person","car"]` matches `?label=person`
**and** `?label=car`. Repeating the parameter (`?label=person&label=car`) means "any of these" (OR), not "all of these" — a
rule scoped to two labels should not require a review to contain both.

**Acknowledgement.** `POST /events/:id/acknowledge` sets `acknowledgedAt` and `acknowledgedById`. It is idempotent — a second
call returns the same row and does not move the timestamp. `GET /events?acknowledged=false` (the default view for the
dashboard) is served by the partial index in §3.2.

### 8.2 Validation & error handling

- **REST DTOs** use `class-validator` + `class-transformer` via a global `ValidationPipe` with `whitelist: true`,
  `forbidNonWhitelisted: true`, and `transform: true`. Unknown properties are rejected, not silently dropped.
- **MQTT payloads** use Zod (see §5.3).
- **One library, or two?** NestJS 12 supports Standard Schema, so Zod could serve both REST DTOs and MQTT payloads. The
  spec keeps `class-validator` for REST (native `ValidationPipe` + Swagger decorator integration) and Zod for MQTT
  (untrusted external input, needs precise path-level errors). Standardising on Zod is open question Q11 — either choice
  is valid, but only one should be chosen deliberately.
- A global `AllExceptionsFilter` maps exceptions to the error envelope, hides internal messages in production, and never
  leaks stack traces or SQL text to the client.
- `HttpException` for expected errors; unexpected errors are logged with a correlation id that is also returned to the client.

---

## 9. Configuration

`@nestjs/config` with a **validated, typed** env schema. The app **fails fast at startup** if a required variable is missing
or malformed — misconfiguration must never surface as a runtime error at 3am.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | No | `development` | |
| `PORT` | No | `3000` | |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | ≥32 bytes; app refuses to boot otherwise |
| `JWT_ACCESS_TTL` | No | `15m` | |
| `JWT_REFRESH_TTL` | No | `30d` | |
| `CREDENTIALS_ENCRYPTION_KEY` | **Yes** | — | 32-byte key, base64 — encrypts channel secrets at rest |
| `MQTT_URL` | **Yes** | — | `mqtt://host:1883` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | No | — | Optional broker auth |
| `MQTT_TOPIC_PREFIX` | No | `frigate` | Topic prefix for Frigate topics (`frigate/events`, `frigate/<camera>/status/detect`, …) |
| `MQTT_EVENTS_TOPIC` | No | `frigate/events` | Override if the layout changes (§5.1) |
| `MQTT_STATUS_TOPIC_PATTERN` | No | `frigate/+/status/detect` | Wildcard subscription for camera detect status |
| `FRIGATE_MEDIA_BASE_URL` | No | — | Base URL for serving Frigate media (thumbnails). Unset ⇒ no media URL is emitted (§5.2) |
| `FRIGATE_API_URL` | No | `http://frigate:5000` | Frigate's HTTP API — used for the resync (§5.4.1) |
| `FRIGATE_API_KEY` | No | — | Frigate API credential for resync calls. Runtime-injected, never committed (Q13) |
| `CORS_ORIGINS` | **Yes** | — | Comma-separated allowed web origins |
| `SITE_TIMEZONE` | No | `UTC` | IANA zone for rule time windows |
| `EVENT_RETENTION_DAYS` | No | `30` | Metadata retention |
| `TELEGRAM_BOT_TOKEN` | No | — | Fallback default for telegram channel |
| `WEBHOOK_URL` | No | — | Fallback default for webhook channel |
| `LOG_LEVEL` | No | `info` | `pino` level |

Secrets are validated for presence *and* minimum entropy. The env schema uses Zod so the same validator serves config and
MQTT payloads.

---

## 10. Toolchain & Version Pins

Versions verified against the npm registry on **2026-10-21**.

| Package | Pin | Note |
|---|---|---|
| Node.js | `>= 20.19` (or `>= 22.12`) | Required by NestJS 12 *and* Prisma 7; the 21.x line is unsupported. Local dev uses 26.x |
| `@nestjs/*` | `^12.2.0` | NestJS 12 — ESM packages, Vitest, oxlint (§10.2) |
| `prisma` / `@prisma/client` | `7.10.1` | **See trap below** |
| `@prisma/adapter-pg` | `7.10.1` | Driver adapter — required by Prisma 7; must match the client version |
| `mqtt` | `^5.16.1` | MQTT 5 client |
| `socket.io` | `^4.8.4` | |
| `zod` | `^4.6.7` | Env + MQTT payload validation |
| `class-validator` | `^0.15.1` | REST DTO validation |
| `argon2` | `^0.45.1` | Password hashing (Argon2id) |
| `pino` / `pino-http` | `^10.4.0` / `^11.0.0` | Structured logging |
| `helmet` | `^8.3.0` | Security headers |
| `@nestjs/throttler` | `^6.7.1` | Rate limiting |
| `@nestjs/swagger` | `^12.0.2` | OpenAPI docs |
| `zod` + `@nestjs/config` | `^4.6.7` / `^12.0.1` | |

### 10.1 Three version traps — flagged for the Tech Lead

These are the non-obvious ones. Each was verified against the registry, not assumed.

**1. TypeScript 7 breaks `nest build`.** `typescript@latest` is now **7.0.2**, but `@nestjs/cli@12.0.10` depends on
`typescript: ~6.0.2`, and `@nestjs/schematics` requires `typescript >= 6.0.0`. Pin **`typescript: ~6.0.2`** explicitly in
`apps/api/package.json`. Do not let a floating range pull 7.x. TypeScript 7 also changed the decorator/`emitDecoratorMetadata`
model that NestJS DI depends on — upgrading is a separate, tested migration, not a side effect of `npm install`.

**2. Prisma's `latest` tag points at a release candidate.** On the CLI, `prisma@latest` resolves to **`8.0.0-rc.24`**, while
`@prisma/client@latest` resolves to stable **`7.10.1`**. Installing `prisma@latest` therefore pairs an RC CLI with a stable
client — a broken combination. Pin **both** `prisma` and `@prisma/client` to `7.10.1` exactly.

**3. Prisma 7 changed its configuration, generator, and connection model.** Three separate changes land at once:

   a. **`prisma.config.ts` is now the CLI's config source.** The old `package.json#prisma` and `schema.prisma#datasource` config
      paths are gone. The file sits at the project root and carries the schema path, migration path, seed command, and the
      datasource URL.
   b. **The `prisma-client` generator requires an explicit `output`.** Prisma Client is no longer emitted into
      `node_modules`. `output` is mandatory, and the client must be imported from the generated path — *not* from
      `@prisma/client`.
   c. **A driver adapter is mandatory.** `new PrismaClient()` without an `adapter` is an error in v7. The adapter
      (`@prisma/adapter-pg`) must be version-matched to the client.

   The `url` also leaves `schema.prisma`: the `datasource` block keeps only `provider = "postgresql"`, and the URL arrives
   from `prisma.config.ts` via `env("DATABASE_URL")`. These details change how `PrismaService` is written — see §11.

> **Fallback:** if Prisma 7's config migration proves disruptive, Prisma `6.19.3` is the last v6 and uses the familiar
> `schema.prisma` + URL-based client. Pinning `6.19.3` is a valid, low-risk alternative — but the v7 path is preferred and is
> what the plan below assumes.

### 10.2 NestJS 12 defaults

NestJS 12 changed several defaults. Verified against the v12.0.0 release notes and the official migration guide:

| Default | Value | Consequence for this API |
|---|---|---|
| Module system | `nest new` prompts **CommonJS or ESM**; in non-interactive/CI it defaults to **ESM** | The API targets ESM (`"type": "module"`). `main.ts` uses top-level `await` for `app.listen()` |
| Test runner | **Vitest** for ESM projects (CommonJS projects keep Jest) | Vitest is the test runner (§12 cross-cutting). Vitest needs the `swc.vite()` plugin to compile test files |
| Linter | **oxlint** replaces ESLint in *generated* projects (both variants) | Do **not** add an ESLint config. The Phase 0 checklist says "ESLint/Prettier" — that is corrected here to oxlint + Prettier |
| Bundler | **Rspack** is the default for monorepos; `--webpack`/`--webpackPath` are deprecated in favour of `--builder rspack` | See the decision below |
| Validation | First-class **Standard Schema** support | Zod is now a first-class validation citizen — see the note below |
| Observability | New `@nestjs/observe` SDK | Optional; Phase 5 candidate |

**Builder decision (flag for the Tech Lead).** Two viable choices:

- `--builder swc` — the documented fast path for a standalone app. SWC emits the same module format as `tsc`
  (ESM when `package.json` has `"type": "module"`). Simple, and it is what the SWC recipe documents.
- `--builder rspack` — the v12 default for monorepos. If this repo's `apps/api` becomes a Nest monorepo root
  (`nest-cli.json` with `monorepo: true`), Rspack is the intended path and it compiles via SWC internally.

**Recommendation:** scaffold `apps/api` as a standalone Nest app with `--builder swc` for Phases 0–3. If the team later
converts the repo into a Nest monorepo, move to Rspack then. Rspack-from-day-one adds a variable that buys nothing while
the module boundaries are still moving. This is a §13 open question, not a unilateral decision.

**Standard Schema and Zod.** NestJS 12 validates any schema that implements the Standard Schema interface. Zod 4 does, so
the API can use **one** validation library for both REST DTOs and MQTT payloads instead of maintaining `class-validator`
alongside Zod. The spec keeps `class-validator` for REST DTOs for now (it integrates natively with `ValidationPipe` and
Swagger decorators), but this is now a **style choice, not a necessity** — §13 records it as an open question. Note that
`@nestjs/config`'s validation options and Joi are also migrated by `nest upgrade`.

**ESM + `reflect-metadata`.** Nest's DI depends on `emitDecoratorMetadata`. Under TypeScript 6 and ESM the decorator metadata
emission must remain enabled — the tsconfig keeps `experimentalDecorators: true` and `emitDecoratorMetadata: true`, and the
app imports `reflect-metadata` once at bootstrap. This is also why TypeScript must be pinned to 6.x (trap 1): TS 7 changed the
decorator metadata model and is a separate, tested migration.

---

## 11. Prisma 7 Client Construction (PrismaService)

Three Prisma 7 changes combine here. **First**, the `prisma-client` generator must declare an explicit `output` — Prisma
Client is no longer generated into `node_modules`:

```prisma
// schema.prisma — conceptual
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"   // no `url` here in v7 — it comes from prisma.config.ts
}
```

**Second**, the client is imported from the **generated path**, not from `@prisma/client`:

```ts
// Conceptual — exact import path confirmed during implementation
import { PrismaClient } from '../generated/prisma/client';
```

The generated output directory is committed or git-ignored consistently, but must not be hand-edited; a `prisma generate` run
recreates it. `.gitignore` handling is an explicit Phase 0 checklist item — CI must run `prisma generate` before building.

**Third**, the datasource URL is supplied by `prisma.config.ts`, and the client is constructed with a **driver adapter**
(`@prisma/adapter-pg`) rather than a connection URL passed directly to `new PrismaClient()`:

```ts
// Conceptual — exact form confirmed during implementation
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

`PrismaPg` is constructed with a `connectionString` (plus optional pool fields) and takes over connection management. The
adapter must be version-matched to the client — `7.10.1` for both.

`PrismaService` extends `PrismaClient` and implements `OnModuleInit` / `OnModuleDestroy` to connect and disconnect cleanly.
It is provided globally but **exports nothing but the service class** — repositories depend on it, controllers never do.

**Pool sizing** matters: Frigate can emit bursts of events (e.g. 50 cameras detecting motion simultaneously). Default pool
size is 10; the plan will set a modest pool (e.g. 10–15) and rely on the ingestion queue for smoothing, rather than an
oversized pool.

---

## 12. Implementation Plan (phased)

Each phase is independently reviewable and produces working, testable software. Order respects the dependencies between
modules.

### Phase 0 — Toolchain & bootstrap
`nest new` with ESM (`"type": "module"`) and `--builder swc`; pin TypeScript `~6.0.2`, Prisma `7.10.1`, and `@prisma/adapter-pg` `7.10.1`; Vitest setup (with the `swc.vite()` plugin); oxlint + Prettier (Nest 12's generated projects use oxlint, not ESLint); health endpoint; `prisma.config.ts` + initial schema with an explicit `output` on the `prisma-client` generator; Zod-validated env config that fails fast; `.gitignore` entry for the generated Prisma client directory.

**Exit:** app boots, `/health` responds, `npm run build` passes, config validation rejects a missing `JWT_SECRET`, `prisma generate` produces a client under the declared `output` path, and `prisma migrate dev` runs against a local PostgreSQL.

### Phase 1 — Auth & users
User/RefreshToken schema + migration; Argon2id hashing; login/refresh/logout; JWT guard; RBAC guard; rate limiting; lockout.
**Exit:** a full login → refresh-rotation → logout cycle is covered by tests; wrong-role access returns 403.

### Phase 2 — Cameras & MQTT ingestion
`mqtt/` module with reconnect + backoff; Zod validation of the `frigate/reviews` and `frigate/events` `before`/`after` envelopes; envelope unwrapping; idempotent upsert on the string review id and the string object id; camera auto-registration keyed on the config camera ID; status topic handling via wildcard subscription (`frigate/+/status/detect`, plain-text payload) with a hysteresis window; camera reconciliation via `frigate/camera_activity` + `frigate/onConnect`; resync from the Frigate HTTP API on cold start and warm reconnect (§5.4.1); `frigate/tracked_object_update` as an idempotent patch path. Embedded `aedes` broker for tests.

**Exit:** publishing a Frigate-shaped review message results in exactly one `Event` row and one `EventObject` row per member id; republishing the same ids does not duplicate them; a disconnect followed by a resync produces no duplicates and no missing rows.

### Phase 3 — Events API & realtime
Event query endpoints with cursor pagination and the `label`/`zone`/`severity`/`status` filters; per-event object listing; acknowledgement endpoint; Socket.IO gateway with handshake auth; `event.created` / `event.updated` / `camera.status` pushes.

**Exit:** a socket client authenticated with a valid token receives events; an unauthenticated client is rejected; `?label=person` returns a review containing a person and not one that does not.

### Phase 4 — Notification rules
Rule CRUD; matcher (cameras/labels/zones/severity/confidence/time window, matched against `Event.objects`, `Event.zones`, and
`Event.severity`); cooldown + duplicate suppression; delivery records; telegram + webhook adapters behind the
`NotificationChannel` interface; retry with backoff; secret encryption at rest.
**Exit:** a matching event produces one delivery; a non-matching event produces none; cooldown suppresses the second event.

### Phase 5 — Hardening & observability
Retention job; delivery log endpoint; structured logging; readiness checks; OpenAPI docs; full test suite; security review
pass with the Security & Privacy Engineer.
**Exit:** full suite green, no secrets in the repo, threat-model items addressed.

### Cross-cutting (every phase)
- Tests written before implementation (TDD), Vitest unit + integration.
- No secrets in source; `.env.example` only.
- No commit without a passing test run.
- No deployment without explicit approval (per AGENTS.md).

---

## 13. Open Questions for the Team

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Confirm the final MQTT topic layout (the spec now uses Frigate's real names: `frigate/reviews`, `frigate/events`, `frigate/<camera_id>/status/detect`, and the config-ID-not-friendly-name rule) | Database & Messaging | **Yes** — Phase 2 |
| 2 | Confirm the `Event` / `EventObject` schema and retention policy — **largely resolved by §16**; the `event_sources` ledger and the acknowledgement columns remain open | Database & Messaging | **Yes** — Phase 2 |
| 3 | Is the `admin`/`operator`/`viewer` role set right, or is per-camera access required? | Product + Security | **Yes** — Phase 1 |
| 4 | Confirm `frigateId` = Frigate's **config camera ID** (the `cameras:` key, not `friendly_name`) as the join key, and the canonical camera list source | Database & Messaging + Video & CV | **Yes** — Phase 2 |
| 5 | Confirm event retention vs. Frigate's own retention alignment | Security & Privacy | No — Phase 5 |
| 6 | Does the dashboard need `event.acknowledged` pushed live? | Frontend | No — Phase 3 |
| 7 | Confirm `SITE_TIMEZONE` semantics for overnight rule windows | Product | No — Phase 4 |
| 8 | Approve the Prisma 7 + driver-adapter path, or fall back to Prisma 6.19.3 | Tech Lead | No — Phase 0 |
| 9 | **How does the dashboard obtain a snapshot?** Frigate does not publish snapshot/clip *paths* on the MQTT event topic — only the `has_snapshot`/`has_clip` flags and a `thumbnail` path. Confirm the mechanism (Frigate API, media server, or a version-specific `snapshot` field) | Video & Computer Vision | **Yes** — Phase 3 |
| 10 | **Builder choice:** `--builder swc` (recommended for a standalone app) vs. Rspack (v12 default for monorepos) | Tech Lead | No — Phase 0 |
| 11 | **Validation library:** keep `class-validator` for REST DTOs, or standardise on Zod now that Nest 12 supports Standard Schema? | Tech Lead | No — Phase 0 |
| 12 | ~~Do reviews need first-class modelling?~~ **Resolved in §16** — `Event` is now a review segment, with tracked objects in `EventObject`. No further decision needed | — | Closed |
| 13 | Where does the Frigate HTTP API credential live, and how is it injected at runtime for resync? (AGENTS.md: no hard-coded API keys) | Tech Lead + Security | **Yes** — Phase 2 |
| 14 | Should the backend publish its own normalized event stream (`smart-cctv/events`) so the dashboard and future consumers do not depend on Frigate's nested format? | Tech Lead + Database & Messaging | No — Phase 3 |
| 15 | Do we support Frigate 0.14–0.16 (no per-role camera status) or require 0.17+ outright? | Tech Lead | No — Phase 2 |
| 16 | The events filter was renamed `type` → **`severity`** to match `Event.severity` (§16.5). The Frontend scaffold spec still uses `type` in its `eventFilters` store shape — it must be renamed, or the request is rejected as an unknown parameter | Frontend | **Yes** — Phase 3 |

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Frigate version changes the `before`/`after` envelope shape (e.g. `snapshot` becomes a path string) | Ingestion fails or media breaks | Zod schema with optional/tolerant fields and a **version-tolerant `snapshot` field** (`string \| object \| null`); the `rawPayload` column preserves the original for forensics; contract confirmed in §13 before Phase 2 |
| Camera ID drift between Frigate config and `Camera.frigateId` | Events orphaned to an auto-created camera | The join key is the config camera ID; the Video & CV Engineer owns the canonical list; `frigate/camera_activity` reconciliation compares the two and flags orphans |
| Event burst overwhelms the DB pool | Dropped events | Bounded ingestion queue, batch inserts, pool sized for the expected camera count |
| Duplicate Frigate events | Inflated timelines | Unique index + `upsert` — defence in depth, not just app-level checks |
| Secret leakage into logs / DB | Credential compromise | Encrypted-at-rest channel config, sanitized errors, no raw payload logging, code review checklist |
| Prisma 7 RC/ESM migration friction | Delayed Phase 0 | Explicit pins; Prisma 6.19.3 fallback documented; Phase 0 is timeboxed to prove the toolchain early |
| TypeScript 7 pulled in by a floating range | Build breaks | `typescript` pinned to `~6.0.2`; `npm ls typescript` checked in CI |
| Dashboard requests a snapshot that does not exist | Broken images in the UI | The API never fabricates a snapshot URL; Q9 must be answered before the dashboard's event detail ships |
| Clock skew between API and Frigate | Misordered events | Compare using `startedAt` from the payload, not local receive time |

---

## 15. Review Checklist for Tech Lead & DevOps

- [ ] Module boundaries and dependency rules (§2) acceptable
- [ ] RBAC role set and route policy (§4.3) acceptable
- [ ] Token lifetimes and refresh rotation design (§4.1) acceptable
- [ ] Version pins and the three traps in §10.1 acknowledged (TypeScript 7, Prisma RC, Prisma 7 config/generator/adapter)
- [ ] NestJS 12 defaults in §10.2 acknowledged — builder choice (Q10), oxlint over ESLint, Vitest, Standard Schema (Q11)
- [ ] Frigate contract in §5.1–§5.2 accepted: real topic names, `before`/`after` envelope, plain-text status payloads
- [ ] The Database & Messaging Engineer's three corrections (§16.5) accepted as applied, and the `Event.severity` rename propagated to the Frontend (Q16)
- [ ] Snapshot strategy (Q9) settled with the Video & Computer Vision Engineer
- [ ] Phase plan and dependencies (§12) acceptable
- [ ] Open questions in §13 routed to the right owners

---

## 16. Reconciliation with the Database & Messaging Engineer's Design

The Database & Messaging Engineer published `docs/design/database-messaging-design.md` while this spec was being written. The
two documents were compared field by field. **Their Frigate contract matches this spec independently** — same config-ID
join key, same `before`/`after` envelope, same status vocabulary, same non-retained-topic gap. That is a good sign: two
engineers reading the same upstream source reached the same conclusions.

They differ on one point of substance, and this spec has been **corrected to follow them**.

### 16.1 The canonical `Event` — corrected to a review segment

This spec originally modelled `Event` as a Frigate **tracked object** (`frigate/events`). The Database & Messaging design
models it as a Frigate **review item** (`frigate/reviews`) with tracked objects in a child table. **Their model is correct**,
and this spec now follows it.

The reason is upstream's own guidance: Frigate's notification docs state it is "generally recommended to trigger
notifications based on the `frigate/reviews` MQTT topic". A review is a *segment* — one time period per camera, bundling
every object active during it. Two people and a dog walking past produce **one** review, not four records. That is what a
user wants to be notified about, and it is what the dashboard timeline should show.

Changes made to this spec as a result:

| Area | Before | After |
|---|---|---|
| §3.1 `Event` | Tracked object | Review segment, with `EventObject` as a child entity |
| §3.1 idempotency key | `Event.frigateEventId` | `Event.frigateReviewId` + `EventObject.frigateEventId` |
| §5.2 | `frigate/events` only | `frigate/reviews` (canonical) and `frigate/events` (detail) |
| §5.3 pipeline | One stream | Two streams, with the object stream attaching to the review by id |
| §5.5 | Reviews as an unmodelled side-topic | `frigate/tracked_object_update` as an idempotent patch path |
| §6.1 rule matching | `Event.label`, `Event.enteredZones` | `Event.objects`, `Event.zones`, `Event.severity` |
| §8.1 filters | `label`, `zone` | `label`, `zone`, `severity`, `status` |

### 16.2 Where the Database & Messaging design wins outright

| Point | Their position | Why it wins |
|---|---|---|
| Dedupe key | `sha256(entity:id:message_type)` with an `event_sources` ledger table | A payload hash would collapse the legitimate `new` → `update` → `end` progression into one row. Their key is monotone in the lifecycle. Their ledger makes the write path race-safe with `ON CONFLICT DO NOTHING` in a single transaction |
| `duration_seconds` | `GENERATED ALWAYS ... STORED` in PostgreSQL | It can never drift from `started_at`/`ended_at`, and the API never computes it in two places |
| Resync | `frigate/onConnect` + `GET /api/config` + `GET /api/review`, subscribe-before-fetch | The only reliable way to fill the gap left by non-retained topics. §5.4.1 now requires this of the backend |
| `frigate/available` semantics | `online` / `stopped` / `offline`, with a will message | Distinguishes "someone stopped Frigate" from "Frigate crashed". §5.4 adopts this |
| Stale-status handling | A camera with no status row is `unknown`, never `offline`; a sweeper marks stale rows unknown | Status topics are not retained, so silence is not evidence of a fault |
| Index roles | Measured with `EXPLAIN (ANALYZE)` against a 200k-row table | Measured evidence beats a requirement list. §3.2 explicitly defers to their DDL |
| Retention | A job, not a wall-clock `CHECK` constraint | A `now()`-based constraint is not re-evaluated as time passes and rejects legitimate backfills |

### 16.3 What this spec needs from them

| # | Request | Blocking? |
|---|---|---|
| 1 | The `event_sources` ledger, or an equivalent, is required for the backend's ingestion to be correct. Confirm the table and its transaction boundary | **Yes** — Phase 2 |
| 2 | `Event.acknowledgedAt` / `acknowledgedById` are **not** in the current DDL. The backend needs them for `POST /events/:id/acknowledge` and the unacknowledged filter (§8.1) | **Yes** — Phase 3 |
| 3 | Confirm `events.objects` and `events.zones` are queryable via GIN so `?label=` and `?zone=` are index-backed, not sequential scans | **Yes** — Phase 3 |
| 4 | The Frigate HTTP API credential for resync needs a home in the backend's env schema (§9, Q13) | **Yes** — Phase 2 |

### 16.4 Open questions this raises

These are folded into §13 as Q13, Q14, and Q15 so there is a single open-questions list for the team.

### 16.5 Their three factual corrections — applied

The Database & Messaging Engineer's report flags **three corrections** to this spec, and asks that the Zod schemas be
corrected against their §3.9.2–§3.9.4 before Phase 2 implementation begins. All three are applied. Their report is
evidence-backed (upstream source references and live PostgreSQL validation), and the corrections do not move any entity
boundary.

| # | Their correction | Where it was wrong here | Status |
|---|---|---|---|
| 1 | The review payload is **nested under `data`**; `Event.type` maps to `severity` | §5.2 showed a flattened envelope with `detections`/`objects`/`sub_labels`/`zones` as siblings of `id`; §3.1 carried a `type` column, plus `hasSnapshot`/`hasClip` that the review stream never publishes | **Applied.** §5.2's example and field table read from `data.*`; `Event.severity` replaces `Event.type`; `hasSnapshot`/`hasClip` moved to `EventObject`, where upstream actually publishes them; `verifiedObjects` and `audio` added to `Event` |
| 2 | The spec contradicted itself — §3.1 modelled reviews while §5.5 said "subscribe but do not model it" and described a pre-0.14 review envelope (`detection_id`, `detection_time`, `thumb_path2`) | §5.5 carried legacy text | **Applied.** The legacy text is gone; §5.5 now states explicitly that `frigate/reviews` → `Event` and `frigate/events` → `EventObject`. `frigate/reviews` did not exist before 0.14 |
| 3 | **`sub_label` has two types** — a `[value, score]` tuple in `frigate/events`, a plain string list in `frigate/reviews` | §3.1, §5.2, and §5.3 all implied a single string shape | **Applied.** `EventObject.subLabel` is populated from `sub_label[0]`; the tuple's score goes to `attributes`; the review side stores `data.sub_labels` as-is. The asymmetry is called out in §3.1, §5.2, and §5.3 |

Three of the schema deltas they proposed in their §3.9.5 are also adopted: per-role `CameraHealth` instead of a single
`Camera.lastStatus`; `Event.status` stored explicitly with a monotonic guard; and `NotificationDelivery.status` as `text` +
`CHECK` allowing both `skipped` and `suppressed` (the backend's `skipped` wins). Their array-valued `NotificationRule`
filters remain a sketch, and this spec's array form is adopted.

**One vocabulary change reaches outside this document.** Renaming `Event.type` → `Event.severity` also renames the REST
filter `?type=` → `?severity=`. The Frontend Engineer's scaffold spec still uses `type` in its `eventFilters` store shape and
must be updated — tracked as Q16 (§13).

---

*End of spec.*
