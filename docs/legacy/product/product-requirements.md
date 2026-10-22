# Smart CCTV — Product Requirements

**Author:** Product Manager
**Status:** Draft for Tech Lead & DevOps review
**Date:** 2026-10-21
**Task:** `.ai-team/tasks/board.md` → "Product Manager: Define goals, write user stories"

> **Scope note.** AGENTS.md states *"No code changes or dependency installations at this stage."* This document is therefore a
> requirements artifact: goals, scope, personas, prioritized user stories, and acceptance criteria. It commits no code and
> installs nothing. It is the input the Backend, Frontend, QA, Security, and UI/UX roles build against.

> **Grounding note.** Every user story below is traced to a contract that already exists in the repo. The source specs are
> `docs/backend/backend-api-design.md` (Backend), `docs/design/database-messaging-design.md` (Database & Messaging), and
> `docs/frontend/frontend-scaffold-spec.md` (Frontend). Where this document states a rule, the rule is either quoted from one
> of those specs or is an explicit Product decision recorded in §9. No requirement here is invented in the abstract — if it
> is not traceable, it is flagged in §10 as an assumption.

---

## 1. Product Goals

Smart CCTV is a **self-hosted monitoring appliance**: Frigate handles video and detection, and this product adds the layer
between them — a persistent, queryable record of what happened, and a way to be told about it.

### 1.1 Problem statement

A person with IP cameras already has Frigate. What Frigate does not do is **remember** in a way a human can use. The
recorded footage lives on disk, event notifications are transient, and "did anything happen at the front door while I was
away?" becomes a manual search through a video timeline. The operator's real questions are:

1. **What happened?** — a reviewable list of events, filterable by camera, time, object type, and zone.
2. **Is anything wrong right now?** — the live health of every camera, including one that is simply *absent* rather than
   *offline*.
3. **Did I miss it?** — a notification that reaches the phone, and a record of whether it actually got delivered.

### 1.2 Goals (MVP)

| # | Goal | Measurable success |
|---|---|---|
| G1 | **Every camera is always accounted for.** A camera is online, offline, disabled, or unknown — never silently missing. | A camera that stops publishing status shows as `unknown`, not `offline`. The dashboard never shows an empty grid when cameras exist. |
| G2 | **Every detection becomes a durable record.** A review segment is persisted exactly once, queryable later. | Replaying the same MQTT message does not create a second event. A 30-day-old event is still retrievable and filterable. |
| G3 | **The operator can find "that thing that happened".** | The event list filters by camera, object label, zone, severity, time range, and acknowledgement state, and paginates without losing its place. |
| G4 | **The operator can be told, and can trust the telling.** | A rule-scoped detection produces a notification on the configured channel, and the delivery attempt is recorded with its outcome. |
| G5 | **Access is controlled and auditable.** | Three roles with distinct capabilities; every write is attributable to a user; the API fails closed. |

### 1.3 Non-goals (MVP)

These are explicitly **out of scope** and must not creep into the MVP:

- **Video hosting, transcoding, or proxying.** The API never touches RTSP or media files. Frigate owns all video.
- **Face recognition / license-plate recognition workflows.** Frigate may supply `subLabel` values; the API stores and shows
  them as passive labels. No enrollment, no matching, no alerting on a recognised face (see §9.4).
- **Multi-tenant / SaaS.** Single-tenant, single-site appliance.
- **A mobile app.** The web client is responsive; the phone's push path is the notification channel, not an app.
- **A native iOS/Android client.** Out of scope.
- **Cloud AI / LLM summarisation of events.** No description generation, no natural-language event querying in the MVP.
- **Per-camera access control.** The MVP is site-wide access with three roles (see §9.2).
- **Video archiving / long-term video retention management.** Frigate owns media retention; Smart CCTV owns *metadata*
  retention only (§4.4).
- **Multi-camera stitching, PTZ control, and two-way audio control.** Frigate's domain.

### 1.4 Design principles

These are the tie-breakers when two requirements conflict.

1. **Never fabricate.** If a snapshot path, a stream URL, or a camera name does not exist, the API returns `null` and the UI
   shows an explicit "unavailable" state. A broken image is better than a plausible-looking wrong one.
2. **Unknown is a first-class state.** Absence of data is not the same as negative data. `unknown` ≠ `offline`.
3. **The API is the source of truth; the UI mirrors it.** The UI hides what a role cannot do, but the API enforces it
   independently. A mis-rendered button is a cosmetic bug, never a security hole.
4. **Degrade, don't break.** If realtime drops, the dashboard falls back to polling and says so. If Frigate drops, the API
   resyncs rather than losing history.
5. **One word per concept.** The API, the database, the UI, and this document use the same vocabulary for the same thing.

---

## 2. Personas

### 2.1 Primary — Dana, the owner-operator

A home or small-site owner with 4–8 cameras covering entry points, a driveway, and a yard. Not a security professional.
Runs the appliance on their own hardware on their own network. Checks the dashboard on a desktop and gets woken by phone
notification when something happens.

**Goals:** know if a camera is down; see what triggered an alert; look back over the day; be sure they were told.
**Frustrations:** Frigate's timeline requires knowing Frigate's mental model; notifications are transient and easy to miss;
camera health is ambiguous when a camera is merely quiet.
**Success looks like:** opens the dashboard, immediately sees every camera's state, filters to "person, last 6 hours",
and gets a Telegram message within seconds of a person entering the `front_door` zone.

### 2.2 Secondary — Sam, the operator

Trusted by the owner to respond to alerts: a neighbour, a family member, or a contractor. Handles events but does not
configure the system. May acknowledge an event to signal "I've seen this".

**Goals:** see what is happening right now; acknowledge events to stop the noise; never accidentally change configuration.
**Success looks like:** signs in, sees the live grid, taps acknowledge on an event, and cannot reach any admin action.

### 2.3 Tertiary — Alex, the administrator

The owner, or an IT contractor who set the appliance up. Configures users, notification rules, and channel credentials.
Rarely uses the product day-to-day.

**Goals:** make sure the system is correctly configured; add/remove users; set up alerting once and trust it.
**Success looks like:** adds a rule "notify me on person in front_door between 22:00 and 06:00, cooldown 15 minutes",
verifies a delivery in the log, and never has to touch a config file.

### 2.4 Role mapping

| Persona | Role | Access |
|---|---|---|
| Dana | `admin` (owner-operator) | Everything |
| Sam | `operator` | Read cameras/events, acknowledge, manage notification rules |
| Alex | `admin` | Everything, including users and channel credentials |

The `viewer` role exists for read-only access (e.g. a guest, or a display-only wall tablet) but is **not a primary persona**
in the MVP.

---

## 3. Scope — MVP feature set

### 3.1 In scope

| Area | MVP feature |
|---|---|
| **Auth** | Local login, JWT access token + rotating refresh token, three roles, login rate-limiting, password change, user CRUD (admin) |
| **Cameras** | Mirrored camera list with live status (`online`/`offline`/`unknown`/`disabled`), per-camera detail, enable/disable, stream URL on the DTO |
| **Events** | Ingestion of Frigate review segments, durable storage, filterable list, detail view, object list, acknowledge |
| **Notifications** | Rules engine, Telegram + generic webhook channels, delivery log |
| **Realtime** | Socket.IO push of new/ended events and camera status changes to the dashboard |
| **Web UI** | Login, dashboard (camera grid + live status), events list, event detail, acknowledge |
| **Admin** | **API only** — users, notification rules, and delivery log have complete API surfaces but **no web UI in the MVP** (§9.1) |
| **Retention** | Metadata-only retention with a provable deletion audit trail |

### 3.2 Out of scope for the MVP UI (but in the API)

Per the decision in §9.1, the following are **delivered as API surfaces only**:

- User management screens
- Notification rule management screens
- Notification delivery log screen

The API endpoints, RBAC, and data model for all three are in the MVP. The screens are post-MVP. This is a deliberate
trade: it protects the MVP's ship date, and it keeps the API complete so the screens are additive later.

### 3.3 MVP definition of done

The MVP is done when all of the following are true:

1. A user can log in on the web client and see the dashboard with every configured camera and its live status.
2. A person detected on a camera appears in the event list within seconds, live, without a page refresh.
3. The event list can be filtered by camera, label, zone, severity, time range, and acknowledgement state.
4. An event can be acknowledged, and the acknowledgement survives a restart and is visible to other users.
5. A configured notification rule delivers to Telegram and/or a webhook, and the attempt is recorded and inspectable.
6. A camera that stops publishing status is visibly distinguished from a camera that has failed.
7. A camera that is added or removed in Frigate's config is reconciled in the dashboard without manual intervention.
8. The full test strategy in the QA role's plan passes, and the Security & Privacy Engineer has signed off on auth, secret
   handling, and retention.

---

## 4. Requirements

Each requirement is traceable. `B§n` = Backend spec §n, `D§n` = Database & Messaging spec §n, `F§n` = Frontend spec §n.

### 4.1 Authentication & authorization

| ID | Requirement | Source | Priority |
|---|---|---|---|
| AUTH-1 | The system authenticates users locally with email + password. No external identity provider is required. | B§4 | P0 |
| AUTH-2 | Access tokens expire in 15 minutes; refresh tokens expire in 30 days and **rotate on every use**. Reuse of a revoked token revokes the whole family. | B§4.1 | P0 |
| AUTH-3 | Refresh tokens are stored only as SHA-256 hashes. | B§4.1 | P0 |
| AUTH-4 | Access tokens live in client memory only; refresh tokens are `HttpOnly` + `Secure` + `SameSite=Strict` cookies. | B§4.1, F§5.3 | P0 |
| AUTH-5 | The role set is exactly `admin` < `operator` < `viewer`, with the permissions in the table in §4.2. | B§4.3, §9.2 | P0 |
| AUTH-6 | Every route without an explicit public marker requires authentication. The guard **fails closed**. | B§4.3 | P0 |
| AUTH-7 | Login is rate-limited (5 attempts / 15 min / IP+email) and per-user lockout applies after 5 failures. | B§4.4 | P0 |
| AUTH-8 | Responses for "unknown email" and "wrong password" are identical — no user enumeration. | B§4.4 | P0 |
| AUTH-9 | Passwords require ≥12 characters, are checked against a breach list, and are hashed with Argon2id. | B§4.4 | P0 |
| AUTH-10 | A user is deactivated (soft), never hard-deleted, so the audit trail survives. | B§4.2 | P0 |
| AUTH-11 | Changing a password revokes all outstanding refresh tokens. | B§4.2 | P0 |
| AUTH-12 | No secret is hard-coded in any file; secrets arrive by env var or mounted secret file. | AGENTS.md, B§4.5 | P0 |
| AUTH-13 | `JWT_SECRET` and `CREDENTIALS_ENCRYPTION_KEY` are validated at startup — the app refuses to boot without them. | B§4.5 | P0 |

### 4.2 Role permission matrix

The single source of truth for what each role can do. The API enforces this; the UI uses it to hide controls.

| Capability | `viewer` | `operator` | `admin` |
|---|---|---|---|
| View cameras and live status | ✔ | ✔ | ✔ |
| View event list and event detail | ✔ | ✔ | ✔ |
| View live video stream | ✔ | ✔ | ✔ |
| Acknowledge an event | ✘ | ✔ | ✔ |
| Create / update / delete notification rules | ✘ | ✔ | ✔ |
| View raw event payload | ✘ | ✘ | ✔ |
| View notification delivery log | ✘ | ✘ | ✔ |
| Manage users and roles | ✘ | ✘ | ✔ |
| Configure channel credentials | ✘ | ✘ | ✔ |
| Edit camera name/location/enabled | ✘ | ✘ | ✔ |

### 4.3 Cameras & status

| ID | Requirement | Source | Priority |
|---|---|---|---|
| CAM-1 | The camera list is **mirrored from Frigate's config**, read-only. Smart CCTV never writes cameras or zones back to Frigate. | D§1 | P0 |
| CAM-2 | The join key is Frigate's **config camera ID** (the `cameras:` key), not the friendly name. | D§3.2, B§13 Q4 | P0 |
| CAM-3 | Each camera exposes a status of `online`, `offline`, `disabled`, or `unknown`. | D§3.3 | P0 |
| CAM-4 | A camera whose status topics have never appeared is `unknown` — **never** `offline`. | D§2.3, D§1.1 | P0 |
| CAM-5 | Status is stored as a **level** (current state per camera role), not an event log. The ~10s upstream resend must not create rows. | D§3.3 | P0 |
| CAM-6 | A camera that flaps `offline`→`online` as Frigate restarts ffmpeg is **debounced** before the status changes. | D§2.3 | P0 |
| CAM-7 | A camera removed from Frigate's config is retained with `retired_at` set, and is hidden from the active grid but present in history. | D§3.2 | P1 |
| CAM-8 | Cameras added to Frigate's config are discovered and added automatically — reconciliation is automatic, not manual. | B§13 Q4, D§5.2 | P0 |
| CAM-9 | The camera DTO carries a `streamUrl` (absolute or root-relative HLS URL), `null` when unavailable. | F§8.1, §9.3 | P0 |
| CAM-10 | `lastSeenAt` and `lastMotionAt` are exposed for each camera. | B§8.1 | P1 |

### 4.4 Events

| ID | Requirement | Source | Priority |
|---|---|---|---|
| EVT-1 | The canonical user-facing event is a **Frigate review segment**; tracked objects inside it are attached as children. | D§3.4, B§16.1 | P0 |
| EVT-2 | The idempotency key is `(entity, id, type)`. A payload hash is **not** used — `new`/`update`/`end` for one entity are three distinct, legitimate records. | D§4.1 | P0 |
| EVT-3 | Replaying a message never creates a duplicate event. Concurrent inserts of the same key produce exactly one row. | D§4.1, §4.2 | P0 |
| EVT-4 | Events are filterable by `cameraId`, `label`, `zone`, `type` (severity), `status`, `acknowledged`, `from`, `to`. | B§8.1 | P0 |
| EVT-5 | `label` and `zone` are **array (OR) matches**, not equality. `?label=person&label=car` means "person or car". | B§8.1 | P0 |
| EVT-6 | An unknown query parameter is **rejected**, not silently ignored. | B§8.1 | P0 |
| EVT-7 | Acknowledgement sets `acknowledgedAt` + `acknowledgedById`, is **idempotent**, and does not move the timestamp on a second call. | B§8.1 | P0 |
| EVT-8 | A late `update` must not reopen an ended event. The monotonic guard holds. | D§4.2 | P0 |
| EVT-9 | Out-of-band `frigate/tracked_object_update` patches (face/LPR/description) are applied as **patches to an existing object**, never as new objects, and are safe to apply twice. | B§5.5 | P0 |
| EVT-10 | A patch that arrives before its object is **buffered briefly and re-applied** when the object arrives; it is dropped and logged if the object never arrives. | B§5.5 | P0 |
| EVT-11 | `subLabel` is stored as a plain string. A tuple value must never be written into a `text` column. | D§3.9, §9.4 | P0 |
| EVT-12 | The raw event payload is stored verbatim for forensics and is exposed **only to `admin`**. | B§8.1, D§3.4 | P0 |
| EVT-13 | Event list endpoints are cursor-paginated with `limit` ≤ 100. | B§8 | P0 |
| EVT-14 | The API **never fabricates** a snapshot or clip URL. Only real paths from Frigate are stored and returned. | B§5.2, §5.5 | P0 |
| EVT-15 | An **open** event is never dropped by retention. | D§7 | P0 |
| EVT-16 | Ended events are retained for 30 days; the idempotency ledger for 7 days; delivery records for 90 days. | D§7 | P0 |
| EVT-17 | Retention deletion is **provable** — the job records deleted ids and time range in an audit table. | D§7 | P0 |
| EVT-18 | Event ordering uses the payload's own `startedAt`, never local receive time, so clock skew between API and Frigate cannot misorder the timeline. | B§14 | P1 |

### 4.5 Notifications

| ID | Requirement | Source | Priority |
|---|---|---|---|
| NTF-1 | Rules are evaluated on `new` and on `end`, and **not** on every `update` — a 40-second event produces one notification, not forty. | B§6.1 | P0 |
| NTF-2 | A rule matches on camera, event labels, zones, event type/severity, minimum confidence, and a time window. An empty filter means "all". | B§6.1 | P0 |
| NTF-3 | Label matching is **any-of** semantics against the segment's object labels. | B§6.1 | P0 |
| NTF-4 | Zone matching uses the zones the **segment** touched, not the object's live position. | B§6.1 | P0 |
| NTF-5 | `minConfidence` matches if **any** member object meets the threshold. | B§6.1 | P0 |
| NTF-6 | Cooldown is **per rule** and survives an API restart. | B§6.1 | P0 |
| NTF-7 | A duplicate suppression check prevents the same (rule, event, channel) from being delivered twice. | B§6.1 | P0 |
| NTF-8 | Time windows are evaluated in the configured **site timezone** (`SITE_TIMEZONE`), including overnight windows that cross midnight. | B§6.1, §9.5 | P0 |
| NTF-9 | MVP channels are **Telegram** and a **generic signed webhook**. | §9.6 | P0 |
| NTF-10 | Channel adapters implement a common `NotificationChannel` interface, registered via DI. Adding a channel requires no change to the rules engine. | B§6.2 | P0 |
| NTF-11 | Channel credentials are **encrypted at rest** and decrypted only at dispatch time. | B§4.5 | P0 |
| NTF-12 | `mediaUrl` is set only when a **real, resolvable** media path exists. A channel with no media sends text only — Telegram falls back to `sendMessage` automatically. | B§6.2 | P0 |
| NTF-13 | Delivery failures are **recorded, not fatal**. Retryable errors retry with exponential backoff up to 3 attempts; permanent errors do not retry. | B§6.2 | P0 |
| NTF-14 | `lastError` is sanitized — secret values are redacted and messages truncated to 500 characters. | B§6.2 | P0 |
| NTF-15 | The webhook adapter signs payloads with HMAC-SHA256 when a secret is configured. | B§6.2 | P0 |
| NTF-16 | A rule's channel configuration is validated **at save time**, not at dispatch time. | B§6.2 | P0 |
| NTF-17 | The delivery log is visible to `admin` for inspection. | B§8.1 | P0 |

### 4.6 Realtime

| ID | Requirement | Source | Priority |
|---|---|---|---|
| RT-1 | New and ended events are pushed to the dashboard over Socket.IO without a page refresh. | B§7, F§6 | P0 |
| RT-2 | Camera status changes are pushed live. | B§7.2 | P0 |
| RT-3 | The socket authenticates during the **handshake**; an unauthenticated connection is rejected. | B§7.1 | P0 |
| RT-4 | Events are pushed to **rooms**; a client receives only what its role and camera scope permit. | B§7.3 | P0 |
| RT-5 | The client protocol version is compatible with the server (`socket.io` v4 on both sides). | F§14 | P0 |
| RT-6 | If the socket drops, the app degrades to **REST-only with a visible banner** and recovers on reconnect. | F§14 | P0 |
| RT-7 | Live event updates write into the query cache rather than a parallel store, so REST and realtime never disagree. | F§4.1 | P0 |

### 4.7 Web UI

| ID | Requirement | Source | Priority |
|---|---|---|---|
| UI-1 | The web client provides: login, dashboard, event list, event detail, and acknowledge. | §3.1 | P0 |
| UI-2 | The dashboard shows a grid of all active cameras with live status and live video. | F§8 | P0 |
| UI-3 | The client **never builds a stream URL** — it renders the `streamUrl` provided by the API. | F§8.1 | P0 |
| UI-4 | An offline or `unknown` camera renders a **placeholder**, not a player. No connection is attempted against a dead source. | F§8.3 | P0 |
| UI-5 | The event list shows the same vocabulary as the API and the database: camera, type, labels, zones, severity, times, acknowledgement. | §1.4.5 | P0 |
| UI-6 | The event detail shows the tracked objects, the zones touched, the times, and the thumbnail when a real one exists. | D§3.4 | P0 |
| UI-7 | The acknowledge control is rendered only for `operator`/`admin`; the API enforces it independently. | F§5.4, §4.2 | P0 |
| UI-8 | The raw payload viewer is rendered only for `admin`. | §4.2 | P1 |
| UI-9 | The layout is **desktop-first** (§9.7) and remains usable on a phone browser. | §9.7 | P0 |
| UI-10 | Every fatal HLS error maps to a distinct, explicit UI state (reconnecting / stream unavailable) — never a silent black tile. | F§8.3 | P0 |
| UI-11 | The session is bootstrapped via refresh-cookie → `/auth/me` → app, and a failed refresh redirects to login. | F§5.3 | P0 |
| UI-12 | The access token is held in memory only, never in `localStorage`. | F§5.3 | P0 |

### 4.8 Privacy, retention & operations

| ID | Requirement | Source | Priority |
|---|---|---|---|
| OPS-1 | Media files are never stored in the Smart CCTV database. Only paths and IDs are stored. | B§1.3, D§3.4 | P0 |
| OPS-2 | Camera and zone configuration is mirrored from Frigate; no camera is deleted while events reference it (`ON DELETE RESTRICT`). | D§3.2, D§6 | P0 |
| OPS-3 | Deletion of a camera is done by retiring it (`retired_at`), never by `DELETE`. | D§3.2 | P0 |
| OPS-4 | The application fails fast at startup on missing or malformed configuration. | B§9 | P0 |
| OPS-5 | The app is deployed on the user's own hardware; no data leaves the site except notification traffic the user configured. | §1.3 | P0 |
| OPS-6 | The system supports a documented, lawful usage posture: cameras are on property the user controls or is authorised to monitor. | Security role | P0 |
| OPS-7 | Notification traffic is the only outbound traffic, and it targets endpoints the user explicitly configured. | OPS-5 | P0 |

---

## 5. User Stories & Acceptance Criteria

Stories are grouped by epic. Each acceptance criterion is written so that it can be turned directly into a test case by the
QA Engineer. "Given/When/Then" is used where the state matters.

### Epic A — Identity & Access

**A1. Sign in** *(as Dana, `admin`)*
> As an owner I want to sign in with my email and password so that I can see my cameras.

- AC-A1.1 Given valid credentials, when the user submits the sign-in form, then the user is taken to the dashboard and an access token is held in memory.
- AC-A1.2 Given an invalid password, when the user submits, then the response is identical in shape and timing to the response for an unknown email.
- AC-A1.3 Given 5 failed attempts for the same IP+email within 15 minutes, when the user attempts a 6th, then the attempt is rate-limited and the user sees a generic failure message.
- AC-A1.4 Given a signed-in user, when the session is restored on page load, then the client obtains a new access token via the refresh cookie and renders the app.
- AC-A1.5 Given an expired or revoked refresh token, when the client attempts to restore the session, then the user is redirected to the login page.
- AC-A1.6 Given a user opens a page they have no access to, when the API receives the request, then it responds 401/403 and no data is returned.

**A2. Change my password** *(as any role)*
> As a user I want to change my password so that a compromised password can be replaced.

- AC-A2.1 Given the current password is wrong, when the user submits a new password, then the request is rejected and the current password stays in force.
- AC-A2.2 Given a valid change, when the user submits, then all outstanding refresh tokens are revoked and the next request requires a new sign-in.
- AC-A2.3 Given a new password of fewer than 12 characters, when the user submits, then the request is rejected with a validation error.

**A3. Manage users** *(as Alex, `admin`)* — **API only in MVP**
> As an administrator I want to create, update, and deactivate users so that access is controlled.

- AC-A3.1 Given an `admin` creates a user, when the request succeeds, then the user can sign in with the given credentials.
- AC-A3.2 Given a `viewer` or `operator` calls the user endpoints, then the API responds 403.
- AC-A3.3 Given an `admin` deactivates a user, when the user attempts to sign in, then the sign-in is refused.
- AC-A3.4 Given a deactivated user, when their historical acknowledgements are inspected, then the record still attributes the action to them.

**A4. Role-based capability** *(as Sam, `operator` vs. a `viewer`)*
> As the owner I want each role to have a distinct set of capabilities so that access matches trust.

- AC-A4.1 Given a `viewer`, when they call acknowledge, then the API responds 403 and the acknowledge control is not rendered.
- AC-A4.2 Given an `operator`, when they call acknowledge, then the API responds 200 and the event is marked acknowledged.
- AC-A4.3 Given any non-`admin`, when they request an event's raw payload, then the raw payload is not returned.
- AC-A4.4 Given a route with no explicit role or public marker, when an unauthenticated request arrives, then it is rejected (the guard fails closed).

### Epic B — Cameras & Live Status

**B1. See all my cameras** *(as Dana)*
> As an owner I want to see every camera and its state at a glance so that I know the system is working.

- AC-B1.1 Given 4 configured cameras, when the dashboard loads, then all 4 appear with name, status, and last-seen time.
- AC-B1.2 Given a camera that is not currently publishing status, when the dashboard loads, then it shows as `unknown` and **not** as `offline`.
- AC-B1.3 Given a camera disabled in Frigate's config, when the dashboard loads, then it shows as `disabled`.
- AC-B1.4 Given a camera removed from Frigate's config, when the dashboard loads, then it is not in the active grid, but its historical events remain retrievable.
- AC-B1.5 Given the API is unreachable, when the dashboard loads, then a clear error state is shown rather than an empty grid.

**B2. See live video** *(as Dana)*
> As an owner I want to see live video so that I can judge the scene myself.

- AC-B2.1 Given an online camera with a `streamUrl`, when the tile mounts, then the stream plays.
- AC-B2.2 Given a camera with `streamUrl = null`, when the tile mounts, then a placeholder explains that no stream is available — no request is attempted against a fabricated URL.
- AC-B2.3 Given a camera that goes offline while the tile is mounted, when the status change arrives, then the player is torn down and the placeholder is shown.
- AC-B2.4 Given a transient network error, when the player recovers within its retry budget, then the stream resumes without a full page reload.
- AC-B2.5 Given a fatal, unrecoverable player error, when it occurs, then the tile shows "stream unavailable" — never an indefinitely blank tile.

**B3. Automatic camera reconciliation** *(as Dana)*
> As an owner I want cameras I add in Frigate to appear automatically so that I don't have to register them twice.

- AC-B3.1 Given a camera is added to Frigate's config while Smart CCTV is running, when reconciliation runs, then the camera appears in the dashboard without any action from the user.
- AC-B3.2 Given a camera is removed from Frigate's config, when reconciliation runs, then the camera is retired and disappears from the active grid.
- AC-B3.3 Given an event arrives for a camera not yet in the database, when the event is ingested, then it is linked to the correct camera and no orphan event is created.

### Epic C — Events

**C1. See what happened** *(as Dana)*
> As an owner I want a list of what happened so that I can find the moment I care about.

- AC-C1.1 Given 20 events in the last hour, when the user opens the event list, then they are shown newest first with camera, labels, zones, severity, and time.
- AC-C1.2 Given more events than fit on one page, when the user scrolls, then the next page is loaded without losing the current filter or scroll position.
- AC-C1.3 Given a filter of `label=person` on a segment containing person and dog, when the query runs, then the segment is returned.
- AC-C1.4 Given a filter of `label=person&label=car`, when the query runs, then segments matching **either** label are returned.
- AC-C1.5 Given an unknown query parameter, when the request is made, then the API responds 400 with a validation error naming the parameter.
- AC-C1.6 Given a time range filter, when the query runs, then only events whose `startedAt` falls within the range are returned.

**C2. Look at one event** *(as Dana)*
> As an owner I want the detail of a single event so that I can understand it.

- AC-C2.1 Given an event, when the user opens its detail, then the tracked objects, zones touched, start/end times, and duration are shown.
- AC-C2.2 Given the event has a real thumbnail, when the detail renders, then the thumbnail is displayed.
- AC-C2.3 Given the event has no snapshot, when the detail renders, then no broken image is shown — an explicit "no snapshot available" state is shown.
- AC-C2.4 Given a `viewer`, when the detail renders, then the raw payload section is absent.

**C3. Acknowledge an event** *(as Sam, `operator`)*
> As an operator I want to mark an event as seen so that I can tell what has been handled.

- AC-C3.1 Given an unacknowledged event, when the user acknowledges it, then the event shows as acknowledged and the acknowledging user is recorded.
- AC-C3.2 Given an already-acknowledged event, when acknowledge is called again, then the response is identical and the original timestamp does not change.
- AC-C3.3 Given an acknowledged event, when the user filters by `acknowledged=false`, then it does not appear.
- AC-C3.4 Given the API is restarted, when the acknowledgement is read back, then it is still present.

**C4. Events arrive live** *(as Dana)*
> As an owner I want new events to appear without refreshing so that I notice them immediately.

- AC-C4.1 Given a person is detected, when the event is ingested, then it appears in the event list within seconds without a page refresh.
- AC-C4.2 Given a live update arrives for an event already in the list, when the client applies it, then the list and the REST-fetched state agree — the realtime update writes into the query cache.
- AC-C4.3 Given the socket disconnects, when the app detects it, then a visible banner appears and the app continues to work by polling.
- AC-C4.4 Given the socket reconnects, when the connection is re-established, then the banner clears and live updates resume.

**C5. No duplicates, no lost history** *(as Dana)*
> As an owner I want to trust that the list is complete and not padded with duplicates.

- AC-C5.1 Given the same MQTT message is delivered twice, when it is ingested, then exactly one event exists.
- AC-C5.2 Given a `new`, an `update`, and an `end` for one entity, when they are ingested, then they are stored as three distinct records, not collapsed into one.
- AC-C5.3 Given the API is offline while Frigate is producing events, when it reconnects, then the missed events are recovered by resync and appear in the list.
- AC-C5.4 Given an event that ended, when a late `update` for it arrives, then the event is not reopened.

### Epic D — Notifications

**D1. Get told about a person at the front door** *(as Dana)*
> As an owner I want to be notified when something matches my rule so that I can respond.

- AC-D1.1 Given an enabled rule matching `person` in `front_door` and a person is detected there, when the segment is created, then a notification is delivered to each configured channel.
- AC-D1.2 Given a rule with a 15-minute cooldown that has just fired, when another matching event occurs within the cooldown, then no second notification is sent.
- AC-D1.3 Given a segment that lasts 40 seconds, when it produces `new`/`update`/`end` messages, then exactly **one** notification is sent.
- AC-D1.4 Given a rule scoped to `label=car`, when a person is detected, then no notification is sent.
- AC-D1.5 Given a rule scoped to a zone the segment did not touch, when a matching label is detected elsewhere, then no notification is sent.
- AC-D1.6 Given a rule with `minConfidence=0.8`, when a segment's only object has confidence 0.4, then no notification is sent.
- AC-D1.7 Given a rule with a 22:00–06:00 window, when a matching event occurs at 23:00 local site time, then the notification is sent; and when it occurs at 12:00, it is not.

**D2. Trust the notification** *(as Alex, `admin`)*
> As an administrator I want to know whether a notification actually went out so that I can trust the system.

- AC-D2.1 Given a notification was dispatched, when the delivery log is read, then it shows status, channel, rule, event, attempt count, and time.
- AC-D2.2 Given a delivery failed with a permanent error (e.g. a bad token), when the log is read, then the error message contains no secret value.
- AC-D2.3 Given a delivery failed with a retryable error, when the retry budget is exhausted, then the log shows the final failure.
- AC-D2.4 Given a `viewer` or `operator` reads the delivery log, then the API responds 403.

**D3. Configure a rule** *(as Alex, `admin`)* — **API only in MVP**
> As an administrator I want to create rules so that the system alerts me appropriately.

- AC-D3.1 Given a valid rule body, when it is created, then it is accepted and is evaluated on the next matching event.
- AC-D3.2 Given a rule with an invalid channel configuration (e.g. a malformed bot token), when it is saved, then it is **rejected at save time** with a validation error.
- AC-D3.3 Given a rule with an empty filter (no camera, no label, no zone), when it is created, then it matches all events.
- AC-D3.4 Given an `admin` deletes a rule, when the deletion is confirmed, then the rule is removed and stops firing.

### Epic E — Configuration, privacy & operations

**E1. A single self-hosted appliance** *(as Alex)*
> As an administrator I want to run this on my own hardware so that my video never leaves my control.

- AC-E1.1 Given the required environment variables are set, when the app starts, then it starts and serves traffic.
- AC-E1.2 Given `JWT_SECRET` is missing or shorter than 32 bytes, when the app starts, then it **refuses to boot** with a clear message.
- AC-E1.3 Given `CREDENTIALS_ENCRYPTION_KEY` is missing, when the app starts, then the app refuses to boot.
- AC-E1.4 Given the app is running, when the database becomes unreachable, then the health endpoint reports not-ready rather than serving broken responses.
- AC-E1.5 Given the app is running, when a channel credential is stored, then the value at rest in the database is encrypted, and the plaintext secret never appears in logs or API responses.

**E2. Data lifecycle** *(as Alex, `admin`)*
> As an administrator I want metadata to expire on a defined schedule so that I can bound what is retained.

- AC-E2.1 Given an ended event older than 30 days, when the retention job runs, then the event and its child objects are deleted.
- AC-E2.2 Given an **open** event older than 30 days, when the retention job runs, then it is **not** deleted.
- AC-E2.3 Given the retention job deletes a batch, when it completes, then the deleted ids and time range are recorded in an audit table.
- AC-E2.4 Given a delivery record older than 90 days, when the retention job runs, then it is deleted.

**E3. A camera that disappears is not silently dropped** *(as Dana)*
> As an owner I want to know when a camera goes quiet so that I don't trust a false picture of my property.

- AC-E3.1 Given a camera that was online and stops publishing, when the debounce window elapses, then its status becomes `offline` and the dashboard reflects it.
- AC-E3.2 Given a camera that flaps offline and back within the debounce window, when the flapping settles, then the status never flipped and no spurious offline was shown.
- AC-E3.3 Given a camera that was never seen at all, when the dashboard loads, then it shows as `unknown`.

---

## 6. Prioritization

### 6.1 MoSCoW

| Priority | Meaning | Items |
|---|---|---|
| **Must have** | The MVP is not shippable without it. | Auth & RBAC (AUTH-1…13), camera list & status (CAM-1…9), event ingestion & durability (EVT-1…14), core event browsing & filtering (EVT-4…6, EVT-13, UI-1…6, UI-10), acknowledgement (EVT-7, UI-7), notification rules engine + Telegram/webhook (NTF-1…17), realtime push (RT-1…7), startup validation & secret handling (AUTH-12, AUTH-13, OPS-4, E1.1…E1.5), retention with provable deletion (EVT-15…17, E2.1…E2.4) |
| **Should have** | Strong value; ship if the schedule holds. | `lastMotionAt` (CAM-10), camera retirement detail (CAM-7), admin raw-payload viewer (UI-8) |
| **Could have** | Nice to have; drop without harm. | Per-camera `lastSeenAt` precision, event search by severity in the UI, delivery-log UI (API-only in MVP per §9.1) |
| **Won't have (this release)** | Explicitly out. | Face/LPR workflows, per-camera ACLs, AI event summarisation, mobile app, video proxying, multi-tenancy (§1.3) |

> **Note on `NTF-8`.** Site-timezone rule windows, including overnight windows that cross midnight, are a **Must have**.
> The Backend spec routes the `SITE_TIMEZONE` question to Product because overnight windows are a user-facing expectation, and
> `AC-D1.7` tests them directly. The semantics are pinned in §9.5.

### 6.2 Delivery order

Sequenced by dependency, and aligned to the Backend and Frontend phase plans so the team's existing phasing is not
disturbed. **The MVP's first vertical slice is: login → dashboard with camera status → live event → acknowledge.**

| Slice | Slice name | Why it is here | Stories |
|---|---|---|---|
| 0 | **Toolchain & bootstrap** | Nothing builds until the version pins are proven. | E1.1 |
| 1 | **Identity** | Everything else requires an authenticated actor. | A1, A2, A4, E1.2, E1.3 |
| 2 | **Cameras & ingestion** | The data has to exist before it can be shown. | B1, B3, C5, EVT-1…3, EVT-8…11 |
| 3 | **Dashboard & events UI** | The first slice the user actually experiences. | B2, C1, C2, C3, C4, UI-1…7, UI-10, RT-1…7 |
| 4 | **Notifications** | Needs real events to evaluate against. | D1, D2, D3, NTF-1…17 |
| 5 | **Users, admin API, retention** | Completes the API surface; UI deferred per §9.1. | A3, E2 |
| 6 | **Hardening & observability** | Before the appliance is trusted in a real home. | E1.4, E1.5, E3, EVT-18, UI-8, UI-12 |

### 6.3 Explicitly deferred beyond the MVP

Recorded here so they are *decided*, not merely *missing*:

| Deferred item | Reason | Revisit when |
|---|---|---|
| Admin web UI (users, rules, delivery log) | API is complete; UI would extend the critical path (§9.1) | After MVP is in use and the API is proven |
| Mobile-optimised layout | Desktop-first was chosen (§9.7) | When field use shows phone use is real |
| Face/LPR enrollment and matching | Out of MVP; privacy-heavy (§9.4) | Security & Privacy has a lawful-basis position |
| Per-camera access control | MVP is site-wide access (§9.2) | A second site or a shared-but-trusted user appears |
| Delivery-log UI | API-only in MVP | With the other admin screens |
| Event search by free text | No search index is justified at 4–8 cameras | Event volume or camera count grows materially |

---

## 7. Success Metrics

The MVP is a small appliance; the useful metrics are operational, not vanity.

| Metric | Target | How it is measured |
|---|---|---|
| Time from detection to visible in the dashboard | < 5 s (p95) | Socket push latency, measured in the QA end-to-end suite |
| Time from detection to notification delivered | < 10 s (p95) | Dispatch timestamp minus event `startedAt` |
| Event duplication rate | 0 | Asserted by the idempotency test (AC-C5.1) — 8 concurrent inserts of one key → exactly 1 row |
| Event loss rate across an API restart | 0 | Resync test (AC-C5.3) |
| Camera state accuracy | No camera shown `offline` unless it actually failed | Unreachable-camera test (AC-E3.1) + never-seen camera test (AC-E3.3) |
| Notification delivery success (no channel error) | > 99% over a 7-day soak | Delivery log |
| False-positive notifications (rule fired on a non-matching event) | 0 in the rule test matrix | AC-D1.4 … AC-D1.7 |

---

## 8. Risks & Mitigations (Product view)

The full risk registers live in the Backend (§14) and Frontend (§14) specs. These are the **product-level** risks — ones
that would make the shipped product wrong, not merely imperfect.

| Risk | Impact | Mitigation |
|---|---|---|
| The MVP is scoped around a "home owner" persona but the product is sold as CCTV, where buyers expect retention, audit, and multi-user control | Product–market mismatch; a business buyer finds the MVP unusable | Keep the three-role model and the complete admin **API** in the MVP (§3.2) so the missing screens are additive, not architectural. Re-validate the persona before building the admin UI. |
| Frigate's MQTT contract shifts in a minor version | Ingestion silently breaks — the core value proposition | Version-tolerant schemas with a retained raw payload (EVT-12); the version floor is a documented deployment constraint, not a code path |
| A user fabricates an expectation of "the camera is down" that the system reports as `unknown` | The operator does not trust the status | `unknown` is surfaced with an explicit explanation in the UI, not as a fourth flavour of offline. See §1.4.2. |
| Notifications are the product's "it works" moment and a silently failing Telegram token is invisible | The user disables the system and never returns | Validated at save time (NTF-16), recorded delivery outcomes (NTF-17), and a visible failure state in the delivery log. The **admin UI is deferred** (§9.1), so in the MVP this is visible via the API only — a real cost of that decision, recorded here deliberately. |
| The first live install has no notification channel configured, so the user experiences only a dashboard | Low perceived value | Ship with a documented one-command webhook (e.g. to a self-hosted receiver) so the path is provable without a third-party account |
| Retention is a privacy liability if it is unprovable | Legal exposure | Provable deletion with an audit trail is a **Must have** (EVT-17), not a Phase 5 nicety |
| Frigate's per-role camera status needs 0.17+, but 0.14–0.16 is in the wild | A 0.16 user sees every camera as `unknown` forever | Document 0.17+ as the recommended baseline; the `unknown` state is honest rather than broken. Tier 1 (events only) still works on 0.14+. |
| The API's data model and the database's model are reconciled only in prose, and the three known corrections are unapplied | Events persist with null objects/zones — the central feature is empty | The corrections are called out as a blocking pre-implementation item in §10, routed to the Backend Engineer, and are checked by the QA suite |

---

## 9. Product Decisions

Decisions made in this role, with rationale. These are the answers to questions other roles routed here, plus the scoping
decisions confirmed with the user.

### 9.1 Admin screens are **not** in the MVP web UI

**Decision.** The web UI ships: login, dashboard, event list, event detail, acknowledge. User management, notification rule
management, and the delivery log are **API-only** in the MVP.

**Rationale.** The API surfaces, RBAC, and data model for all three are already designed (Backend §4.2, §6, §8.1). Building
the screens is additive work that does not block the core loop. This keeps the MVP's critical path short and lets the
screens be built against a proven API.

**Consequence, recorded honestly.** In the MVP, configuring a notification rule requires an API call. That is a real cost to
the "operator can be told" story, and it is why the *delivery log* being API-only is called out as a risk in §8. It is
accepted deliberately, and it is the first candidate for post-MVP work (§6.3).

**Answers:** Frontend open question Q6.

### 9.2 The role set is `admin` / `operator` / `viewer`, with **site-wide** access

**Decision.** The MVP uses the three roles already defined in Backend §4.3, with the permission matrix in §4.2. There is **no
per-camera access control** in the MVP. The role order is `viewer` < `operator` < `admin`, and the UI's `roleAtLeast` helper
uses exactly that ordering.

**Rationale.** The DB design confirms a single site with 4–8 cameras (D§1). Per-camera ACLs multiply the rule-matching
surface (every rule, every event query, every socket room) for a deployment that does not need it. The single-tenant posture is
already a non-goal (B§1.3). "Every camera is accounted for" (G1) is a stronger MVP promise than fine-grained authorization
that no current user needs.

**Revisit trigger.** A second site, a client-facing dashboard, or a user who must not see a specific camera.

**Answers:** Backend open question Q3; Frontend open question Q5; Frontend open question Q8.

### 9.3 The camera DTO carries `streamUrl`; there is no dedicated stream endpoint

**Decision.** `streamUrl` is a field on the camera DTO, `null` when unavailable. There is **no** separate
`GET /cameras/:id/stream` in the MVP.

**Rationale.** The dashboard renders N tiles; N extra requests per render is wasteful and adds a failure mode. A DTO field
lets every tile render in one pass. `null` is an explicit "no stream available" state, which satisfies the "never fabricate"
principle (§1.4.1).

**Consequence.** The API must be able to produce a *real* absolute or root-relative HLS URL, or `null`. This depends on the
Video & Computer Vision Engineer pinning Frigate's public HLS path (Frontend Q2) — see §10.

**Answers:** Frontend open question Q1, and partially Q4.

### 9.4 Face recognition / LPR is **out of the MVP**

**Decision.** The MVP stores `subLabel` and `attributes` when Frigate supplies them, and shows them in event detail as a
**passive label**. There is no enrollment UI, no face/plate matching, no alerting on a recognised face, and no LPR search.

**Rationale.** Face and plate recognition is the most privacy-sensitive feature in the whole space: it identifies *people*, it
needs a lawful basis, it needs a data-subject story, and it needs storage for enrolled templates — none of which is in
scope for a metadata appliance. The underlying Frigate integration is already covered by the *ingestion* requirements
(EVT-9…EVT-11), so the data path is proven; only the *product* surface is withheld.

**Data-model constraint, carried forward.** `subLabel` is a **plain string** in `frigate/reviews` `data.sub_labels` but a
`[value, score]` tuple in `frigate/events`. Storing the tuple into a `text` column would yield the literal `("Bob", 0.95)`.
The API must normalise to a string at the boundary (EVT-11). This is one of the three factual corrections the Database &
Messaging Engineer raised against the Backend spec (§10).

**Answers:** Backend open question Q9 (partially — the snapshot mechanism is Video & CV's), and the `subLabel` correction in
Database & Messaging §3.9.

### 9.5 `SITE_TIMEZONE` semantics — local wall-clock, with overnight windows supported

**Decision.** `SITE_TIMEZONE` is an IANA timezone name (e.g. `Asia/Jakarta`) that defines the site's local civil time. All
rule time windows are interpreted in that timezone, and **overnight windows are supported**: a window with `activeFrom =
22:00` and `activeTo = 06:00` is active across midnight.

**Rationale.** "Notify me between 10pm and 6am" is the canonical user request and it is meaningless against a UTC
comparison. The backend already defaults `SITE_TIMEZONE` to UTC and the rule engine is timezone-aware; this decision only
pins the semantics so the implementation and the test matrix agree.

**Acceptance hook:** `AC-D1.7` — a 22:00–06:00 rule fires at 23:00 local and does not fire at 12:00 local.

**Answers:** Backend open question Q7.

### 9.6 Notification channels in the MVP: **Telegram + generic signed webhook**

**Decision.** Both channels ship in the MVP. Email/SMTP is deferred.

**Rationale.** Telegram is the pragmatic mobile push path for a home owner (the target persona) and needs no inbound
infrastructure. The generic webhook is the extension point that proves the adapter interface is genuinely pluggable
(NTF-10) and gives an operator a self-hosted path with no third-party account. Email would add a third adapter, SMTP
credential handling, and a delivery-reliability surface for a channel the target persona does not ask for.

**Answers:** Backend §6.2 channel table is adopted as-is.

### 9.7 The UI is **desktop-first**, and remains usable on a phone

**Decision.** The dashboard, event list, and event detail are designed for a desktop browser first. They must remain
*usable* on a phone browser — readable, navigable, and not broken — but the layout is not optimised for the phone, and there
is no phone-specific feature in the MVP.

**Rationale.** The persona is a home owner who checks a desktop dashboard and receives a *notification* on their phone. The
notification channel is the phone's job; the dashboard is not. Optimising the grid for a phone would cost layout effort that
the primary usage does not benefit from.

**Consequence, recorded honestly.** A phone user can acknowledge an event but will not have a good live-grid experience. The
UI/UX Designer should still pick breakpoints that keep the phone layout coherent, and the frontend spec's own "responsive
breakpoints" item (Phase 6, `F§12`) should be treated as **in-scope for the MVP** rather than a polish item, because
"usable on a phone" is a stated requirement here (UI-9).

### 9.8 The MVP targets a **single site, 4–8 cameras**

**Decision.** Confirmed, matching the Database & Messaging design's confirmed assumption (D§1). No sharding, no partitioning,
no multi-site.

**Rationale.** It is the assumption the entire index and retention design is built on and it was verified against a live
PostgreSQL instance at 200k rows. Changing it invalidates measured work.

**Note for the record.** The DB spec names a scale threshold of ~500k event rows before `events` is partitioned. The
Product-side view is that this threshold should be *re-checked* against the actual install, not treated as a promise — a
4–8 camera site with aggressive detection could plausibly reach it faster than "small" suggests.

### 9.9 The MVP keeps the API as the source of truth and the UI as a mirror

**Decision.** Business rules live in the API. The UI hides what a role cannot do, but the UI is never the only enforcement
point.

**Rationale.** It keeps the two admin surfaces (API now, UI later) behaviourally identical, and it means the deferred admin
UI (§9.1) is a rendering exercise rather than a re-implementation.

---

## 10. Assumptions, Unknowns & Routing

### 10.1 Assumptions this document makes

| # | Assumption | Risk if wrong | Owner to confirm |
|---|---|---|---|
| A1 | The deployment is a single self-hosted site with 4–8 cameras. | Index, retention, and pagination design change materially. | Video & CV + Tech Lead |
| A2 | Frigate is the video engine and the API never touches RTSP or media files. | A whole subsystem is missing. | System Architect (already aligned across all three specs) |
| A3 | The target user is a home / small-site owner, not a professional security operator. | Notification channels, terminology, and default rules are wrong. | Product (confirmed with the user) |
| A4 | The appliance runs on the user's own hardware and network, with no cloud dependency. | Auth design (local JWT vs. external IdP) and the "never fabricate" rule change. | Already confirmed across Backend/Frontend specs |
| A5 | The user's phone is reachable through a third-party push service (Telegram) rather than a first-party app. | The notification story needs a different channel. | Product (confirmed) |
| A6 | The notification log is sufficient evidence that "the system told me" — no separate alert-delivery UI is needed in the MVP. | The user has no visible proof that notifications work. | Product (accepted, with the cost recorded in §8) |

### 10.2 Unknowns — who must answer them

| # | Unknown | Owner | Blocking? |
|---|---|---|---|
| U1 | The exact public HLS URL through Frigate's nginx → go2rtc (Frontend Q2). The API must return a real URL or `null`. | Video & Computer Vision | **Yes — MVP slice 3** (the player cannot be built) |
| U2 | The mechanism for the dashboard to obtain a snapshot. Frigate publishes only `has_snapshot`/`has_clip` flags and a `thumbnail` path — **not** snapshot/clip paths. The API must never fabricate one. | Video & Computer Vision | **Yes — MVP slice 3** |
| U3 | The three factual corrections to the Backend spec: the review payload is nested under `data`; the §5.5 "subscribe but do not model reviews" contradiction; and the `sub_label` type asymmetry. | Backend Engineer (source) | **Yes — before Phase 2 / slice 2** |
| U4 | Retention windows (30d events / 7d ledger / 90d deliveries) need a lawful-basis assessment. | Security & Privacy | **Yes — slice 5** |
| U5 | Whether `event_sources.payload_hash` (a hash of camera-derived content) is acceptable under the privacy policy. | Security & Privacy | Yes — slice 5 |
| U6 | The Frigate HTTP API credential for resync (`GET /api/config`, `GET /api/review`) must be injected at runtime and never committed. | Tech Lead + Security | **Yes — slice 2** |
| U7 | Whether to require Frigate 0.17+ outright (per-role camera status) or support the degraded 0.14–0.16 path. | Tech Lead | No — but it changes CAM-3/CAM-4 behaviour for 0.16 users |
| U8 | Whether the `admin` screens deferred in §9.1 should be pulled into the MVP if the notification story proves to be the primary value driver. | Product (revisit after slice 4) | No |
| U9 | The broker's maximum message age and persistence settings, which must be exceeded by the 7-day dedupe window. | Tech Lead | No — slice 2 |
| U10 | The scale threshold for partitioning `events` (~500k rows) against the real install's event rate. | Database & Messaging | No — slice 5 |

### 10.3 Items routed *out* of Product

| Question | Routed to | Why |
|---|---|---|
| Q1 — final MQTT topic layout | Database & Messaging | Contract detail; already answered in D§3.9 |
| Q2 — `Event` schema & retention | Database & Messaging | Already answered in D§3.9 |
| Q4 — `frigateId` = Frigate config ID | Database & Messaging | Already answered in D§3.9 |
| Q5 — retention vs. Frigate's own retention | Security & Privacy | Lawful-basis question |
| Q8 — Prisma 7 driver-adapter path | Tech Lead | Toolchain decision |
| Q9 — snapshot mechanism | Video & Computer Vision | Integration detail |
| Q10 — SWC vs. Rspack | Tech Lead | Toolchain decision |
| Q11 — `class-validator` vs. Zod | Tech Lead | Toolchain decision |
| Q13 — Frigate HTTP API credential injection | Tech Lead + Security | Deployment + secrets |
| Q14 — publish a normalized `smart-cctv/events` stream | Tech Lead + Database & Messaging | Architecture decision |

---

## 11. Review Checklist for Tech Lead & DevOps

- [ ] Persona confirmed as a home / small-site owner (§2.1) and reflected in the notification-channel choice
- [ ] MVP scope (§3.1) and the explicit non-goals (§1.3) accepted
- [ ] Admin-UI deferral (§9.1) accepted, including the accepted cost recorded in §8
- [ ] Role/permission matrix (§4.2) accepted as the single source of truth for both API and UI
- [ ] Role set confirmed as site-wide, with no per-camera ACL in the MVP (§9.2)
- [ ] `streamUrl` on the camera DTO accepted; no dedicated stream endpoint (§9.3)
- [ ] Face/LPR deferred to post-MVP, with `subLabel` normalisation to a string still required in the MVP (§9.4)
- [ ] `SITE_TIMEZONE` semantics confirmed, including overnight windows (§9.5)
- [ ] Telegram + webhook confirmed as the MVP channels (§9.6)
- [ ] Desktop-first layout accepted, with phone usability still required (§9.7)
- [ ] Delivery order (§6.2) accepted and consistent with the Backend and Frontend phase plans
- [ ] The three Backend-spec corrections (U3) are applied before Phase 2
- [ ] The blocking unknowns (U1, U2, U6) have named owners
- [ ] Confirmation that **no code, no dependency installation, and no commit** was made in this repo for this document

---

*End of requirements document.*
