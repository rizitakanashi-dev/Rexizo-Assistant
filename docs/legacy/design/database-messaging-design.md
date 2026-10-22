# Database & Messaging Design — Smart CCTV

**Author:** Database & Messaging Engineer
**Status:** Draft for Tech Lead & DevOps review
**Date:** 2026-10-21
**Scope:** PostgreSQL schema, event schema, MQTT topic contract, idempotency, indexes, retention.

---

## 1. Design Inputs & Confirmed Assumptions

| Decision | Value | Rationale |
|---|---|---|
| Deployment scale | Single site, 4–8 cameras | No sharding required; keeps index/partition design simple. |
| Frigate baseline | 0.14+ (`frigate/reviews` + `frigate/events`) | `reviews` and `events` both exist since 0.14.0 (verified against upstream tags). |
| Camera/zone ownership | Mirror Frigate, read-only | Frigate config API is the single source of truth. Smart CCTV never writes cameras/zones back. |
| Retention engine | PostgreSQL partition drops | Avoids a cron dependency for the metadata tier; `pg_cron` remains an optional belt-and-braces. |

**Non-goals for this document:** authentication schema (Backend/Security own it), NestJS code
structure, React models, Frigate RTSP/stream config. The `users`/`api_keys` tables below are
described only as integration points, not authored by this role.

### 1.1 Frigate version floor for camera status

Camera role health moved to `frigate/<camera>/status/<role>` in **0.17**. Versions 0.14–0.16 do not
publish it. The contract therefore splits into two tiers:

- **Tier 1 (0.14+)** — event stream: `frigate/reviews`, `frigate/events`. Required.
- **Tier 2 (0.17+)** — camera health: `frigate/<camera>/status/<role>`.

The consumer must **detect** which tier is available at connect time rather than assume. A camera
whose status topics never appear must be reported as `unknown`, never silently as `offline`.

---

## 2. Frigate MQTT Contract (verified against upstream source)

All topic names below were verified against `docs/docs/integrations/mqtt.md` and the
`frigate/comms/*` sources in the upstream `dev` branch and tagged releases.

### 2.1 Topics consumed

| Topic | Retained | Payload | Use |
|---|---|---|---|
| `frigate/available` | **yes** | `online` / `stopped` / `offline` | Broker-level liveness of Frigate itself. |
| `frigate/reviews` | no | `{type, before, after}` | **Primary user-facing event stream** (review segments). |
| `frigate/events` | no | `{type, before, after}` | Tracked-object detail (per-object metadata). |
| `frigate/<camera>/status/<role>` | no | `online` / `offline` / `disabled` | Per-role camera health. 0.17+. |
| `frigate/stats` | no | stats object | Optional periodic counters. |
| `frigate/camera_activity` | no | snapshot JSON | Reconnect resync of camera config/activity. |
| `frigate/profile/state` | **yes** | profile name or `none` | Active detection profile. |
| `frigate/tracked_object_update` | no | `{type, id, ...}` | Face/LPR/description/classification updates. |

Roles published under `status/<role>`: `detect`, `record`, `record_sub`, `audio`.
`record_sub` exists only when sub-stream recording is enabled.

### 2.2 Topics published by Smart CCTV

| Topic | Retained | Payload |
|---|---|---|
| `smart-cctv/events` | no | Normalized Smart CCTV event envelope (see §4). |
| `smart-cctv/camera/<camera>/status` | **yes** | Current aggregated camera status (see §4.3). |

Smart CCTV must publish to its own topic prefix only. It never writes to `frigate/*`.

### 2.3 Critical upstream behaviours that shape the design

These were verified in source and each one breaks a naive implementation:

1. **Status topics are NOT retained.** `frigate/comms/dispatcher.py:487` forwards unmatched
   inter-process topics with `retain=False`. A late subscriber receives **no** camera status.
2. **Status topics resend every ~10s.** `frigate/video/ffmpeg.py:121-138` (`RoleStatus.send`)
   republishes when `now - last_update_time >= resend_interval`, where `resend_interval` is
   `ffmpeg.retry_interval` (default **10.0s**, `frigate/config/camera/ffmpeg.py:87`).
   → The consumer must treat status as a **level, not an edge**, and must not treat the 10s
   resend as a new event.
3. **An unreachable camera flaps.** The upstream docs state the status reflects the health of
   Frigate's *process* for that role, not camera reachability, so an unreachable camera
   alternates `offline` → `online` as the watchdog restarts ffmpeg. → Debounce required (§4.3).
4. **`reviews` and `events` are NOT retained** (`retain=False` in
   `frigate/track/object_processing.py:157,198` and `frigate/comms/dispatcher.py:350`).
   → A reconnecting consumer **loses events** and must resync from the HTTP API (§5.3).
5. **`type: "new"` carries identical `before` and `after`.** Confirmed at
   `frigate/review/maintainer.py:339-341` and `frigate/track/object_processing.py:154-156`.
   → Idempotency keys must be derived from `(entity, id, type)`, **not** from a hash of
   `before`+`after`, or the `new` event would collapse incorrectly.
6. **`frigate/available` is retained and has a will message.**
   `frigate/comms/mqtt.py:288-293` sets `will_set(.../available, "offline", qos=1, retain=True)`.
   → Broker-delivered `offline` means Frigate died without a clean shutdown. A clean stop
   publishes `stopped`; a crash publishes `offline`. These are **different** conditions and are
   stored distinctly.
7. **Face/LPR/description updates arrive out-of-band** on `frigate/tracked_object_update`,
   keyed only by event `id`. → These must be applied as **patches to an existing row**, not as
   new events, and must be safe to apply twice.

---

## 3. PostgreSQL Schema

Target: **PostgreSQL 16+** (developed and validated against 18.6). All DDL in this document is
executed and verified in §6.

### 3.1 Entity model

```
cameras ──┬──< camera_health        (current per-role status, one row per camera+role)
          ├──< events               (normalized user-facing events)
          ├──< event_objects        (objects detected within an event)
          └──< notification_rules ──< notification_deliveries

zones ────┬──< camera_zones         (Frigate zones, mirrored read-only)
          └──< events               (via event_zones)

event_sources  (idempotency ledger: every consumed MQTT message)
```

### 3.2 `cameras` — mirrored Frigate cameras

```sql
CREATE TABLE cameras (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    frigate_id        text NOT NULL UNIQUE,   -- Frigate config ID, e.g. 'front_door'
    friendly_name     text,
    enabled           boolean NOT NULL DEFAULT true,
    detect_enabled    boolean NOT NULL DEFAULT true,
    record_enabled    boolean NOT NULL DEFAULT true,
    audio_enabled     boolean NOT NULL DEFAULT false,
    sub_stream_record boolean NOT NULL DEFAULT false,
    width             integer,
    height            integer,
    fps               integer,
    config_hash       text,                   -- changes when Frigate config changes
    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_at      timestamptz NOT NULL DEFAULT now(),
    retired_at        timestamptz,             -- set when camera removed from Frigate
    raw_config       jsonb                    -- verbatim Frigate camera config
);

CREATE INDEX idx_cameras_active ON cameras (frigate_id) WHERE retired_at IS NULL;
```

`frigate_id` is the Frigate **config ID**, not the friendly name. Upstream is explicit: topics
use the config ID (`frigate/back_yard/...`, not `frigate/Back Yard/...`).

### 3.3 `camera_health` — current per-role status (level, not log)

```sql
CREATE TABLE camera_health (
    camera_id     uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    role          text NOT NULL,   -- 'detect' | 'record' | 'record_sub' | 'audio'
    status        text NOT NULL,   -- 'online' | 'offline' | 'disabled' | 'unknown'
    since         timestamptz NOT NULL,  -- when this status was first observed
    last_message_at timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (camera_id, role),
    CONSTRAINT camera_health_role_check
        CHECK (role IN ('detect','record','record_sub','audio')),
    CONSTRAINT camera_health_status_check
        CHECK (status IN ('online','offline','disabled','unknown'))
);

CREATE INDEX idx_camera_health_status ON camera_health (status, updated_at);
```

This is a **state table**, deliberately not a history table. The 10s resend (§2.3 #2) updates
`last_message_at` without creating a row, so it does not inflate storage. History of health
transitions belongs in the metrics/logging tier, not here.

`role` and `status` are `text` with `CHECK` constraints rather than PostgreSQL `ENUM` types:
adding a value to an enum requires `ALTER TYPE` and locks the table, whereas a `CHECK` constraint
can be relaxed with a short, non-blocking `NOT VALID` + `VALIDATE` migration.

### 3.4 `events` — the user-facing event record

Frigate's native "event" (`frigate/events`, a tracked object) and "review" (`frigate/reviews`, a
segment aggregating objects) are **different things**. The Smart CCTV UI is segment-oriented, so
the canonical table models the **review segment**, with tracked objects attached underneath.

```sql
CREATE TABLE events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    frigate_review_id   text UNIQUE,       -- Frigate review segment ID
    frigate_event_ids   text[] NOT NULL DEFAULT '{}',  -- member tracked-object IDs

    camera_id           uuid NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,

    type                text NOT NULL,     -- 'detection' | 'alert'
    status              text NOT NULL DEFAULT 'open',  -- 'open' | 'ended'

    started_at          timestamptz NOT NULL,
    ended_at            timestamptz,
    duration_seconds    integer GENERATED ALWAYS AS (
                            EXTRACT(EPOCH FROM (ended_at - started_at))::integer
                        ) STORED,

    severity            text,              -- Frigate severity, denormalised
    thumbnail_path      text,
    clip_path           text,

    objects             text[] NOT NULL DEFAULT '{}',  -- object labels
    sub_labels          text[] NOT NULL DEFAULT '{}',
    zones               text[] NOT NULL DEFAULT '{}',
    has_snapshot        boolean NOT NULL DEFAULT false,
    has_clip            boolean NOT NULL DEFAULT false,

    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- raw 'after' for audit/debug

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT events_type_check CHECK (type IN ('detection','alert')),
    CONSTRAINT events_status_check CHECK (status IN ('open','ended')),
    CONSTRAINT events_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_events_camera_started ON events (camera_id, started_at DESC);
CREATE INDEX idx_events_started ON events (started_at DESC);
CREATE INDEX idx_events_status_started ON events (status, started_at DESC) WHERE status = 'open';
CREATE INDEX idx_events_objects ON events USING gin (objects);
CREATE INDEX idx_events_zones ON events USING gin (zones);
```

**Verified index roles** (measured with `EXPLAIN (ANALYZE)` against a 200k-row table — see §6):

| Index | Serves | Condition for use |
|---|---|---|
| `idx_events_camera_started` | Per-camera time-window queries | Needs **both** `camera_id` and a `started_at` range predicate. A camera-only filter falls back to `idx_events_started`. |
| `idx_events_started` | Global recency lists, camera-only filters | Chosen by the planner when the query has no `camera_id` equality, or when the camera filter alone is not selective enough. |
| `idx_events_status_started` | Open-event lookups | Partial index; used when `status = 'open'` is an equality predicate. |
| `idx_events_objects` / `idx_events_zones` | Label and zone filters | GIN; used when the searched label is **selective**. A label matching most rows falls back to a sequential scan — correct behaviour, not a defect. |

> **No `now()`-based CHECK constraint.** An earlier draft constrained `started_at >= now() - 30 days`
> to enforce retention at the row level. It was **removed** after testing: it rejected legitimate
> historical backfills (§5.2 resync, and any import of past events), and a constraint that depends
> on wall-clock time is not re-evaluated as time passes — it only bites at insert time. Retention
> is enforced by the §7 retention job instead, which is both correct and provable.

`duration_seconds` is a `GENERATED ALWAYS ... STORED` column: PostgreSQL maintains it, so it can
never drift from `started_at`/`ended_at`, and the API never has to compute it in two places.

`payload` keeps the raw `after` object verbatim. It is the forensic fallback when the normalized
columns are not enough, and it makes a schema change on the Frigate side recoverable without
data loss.

### 3.5 `event_objects` — tracked objects within an event

```sql
CREATE TABLE event_objects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    frigate_event_id  text NOT NULL UNIQUE,   -- Frigate tracked-object ID
    label             text NOT NULL,           -- 'person', 'car', ...
    sub_label         text,
    zone              text,
    score             real,
    top_score         real,
    false_positive    boolean NOT NULL DEFAULT false,
    stationary        boolean NOT NULL DEFAULT false,
    snapshot          jsonb,
    attributes        jsonb,                   -- face score, LPR, etc.
    started_at        timestamptz NOT NULL,
    ended_at          timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_objects_time_check
        CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_event_objects_event ON event_objects (event_id);
CREATE INDEX idx_event_objects_label_time ON event_objects (label, started_at DESC);
CREATE INDEX idx_event_objects_frigate ON event_objects (frigate_event_id);
```

This is where `frigate/events` data lands. It is a **separate table** from `events` because the
two Frigate streams have different cardinality and update cadence: a review segment is updated
whenever severity or membership changes, while a tracked object is updated on every detection
frame.

The `attributes` column holds face/LPR/description data applied by the
`frigate/tracked_object_update` patch path (§2.3 #7).

### 3.6 `zones` and `camera_zones` — mirrored Frigate zones

```sql
CREATE TABLE zones (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    frigate_id    text NOT NULL UNIQUE,
    friendly_name text,
    coordinates   jsonb,
    raw_config    jsonb,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    retired_at    timestamptz
);

CREATE TABLE camera_zones (
    camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    zone_id   uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    PRIMARY KEY (camera_id, zone_id)
);
```

### 3.7 `event_sources` — the idempotency ledger

This is the heart of the "handle duplicate events" requirement.

```sql
CREATE TABLE event_sources (
    id              bigserial PRIMARY KEY,
    source_topic    text NOT NULL,
    source_entity   text NOT NULL,   -- 'review' | 'object' | 'metadata'
    source_id       text NOT NULL,   -- Frigate review ID / tracked-object ID
    message_type    text NOT NULL,   -- 'new' | 'update' | 'end'
    dedupe_key      text NOT NULL UNIQUE,  -- see §4.1
    payload_hash    text,            -- hash of the raw payload, for change detection
    received_at     timestamptz NOT NULL DEFAULT now(),
    applied_at      timestamptz,
    apply_result    text,            -- 'applied' | 'duplicate' | 'ignored' | 'error'
    error_detail    text
);

CREATE INDEX idx_event_sources_lookup ON event_sources (source_entity, source_id, received_at DESC);
CREATE INDEX idx_event_sources_pending ON event_sources (applied_at) WHERE applied_at IS NULL;
```

`dedupe_key` is unique, so a duplicate insert is rejected by the database itself rather than by
application logic. This is the strongest form of idempotency: it holds even if two consumer
instances race, or if the MQTT client reconnects and replays.

### 3.8 `notification_rules` and `notification_deliveries`

The Backend Engineer owns the rule engine; this role defines the persistence contract.

```sql
CREATE TABLE notification_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    enabled         boolean NOT NULL DEFAULT true,
    camera_id       uuid REFERENCES cameras(id) ON DELETE CASCADE,
    zone            text,
    min_severity    text NOT NULL DEFAULT 'detection',  -- 'detection' | 'alert'
    min_score       real,
    cooldown_seconds integer NOT NULL DEFAULT 300,
    channels        text[] NOT NULL DEFAULT '{}',  -- 'webhook' | 'email' | 'push' | 'mqtt'
    config          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_rules_severity_check
        CHECK (min_severity IN ('detection','alert'))
);

CREATE TABLE notification_deliveries (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id      uuid NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
    event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    channel      text NOT NULL,
    status       text NOT NULL DEFAULT 'pending',  -- 'pending'|'sent'|'failed'|'skipped'|'suppressed'
    attempts     integer NOT NULL DEFAULT 0,
    last_error   text,
    sent_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_deliveries_status_check
        CHECK (status IN ('pending','sent','failed','skipped','suppressed')),
    CONSTRAINT notification_deliveries_unique
        UNIQUE (rule_id, event_id, channel)
);

CREATE INDEX idx_notification_deliveries_pending
    ON notification_deliveries (created_at) WHERE status = 'pending';
```

The `UNIQUE (rule_id, event_id, channel)` constraint is the second idempotency barrier: a rule
cannot fire twice for the same event, even if the rule evaluation is retried.

---

### 3.9 Reconciliation with the Backend Engineer's Spec

`docs/backend/backend-api-design.md` (Backend Engineer) states the fields the API requires and routes
four questions to this role. This section answers them and records **three corrections** where the
backend spec's stated payload shape does not match the upstream Frigate 0.14+ contract.

#### 3.9.1 Answers to the routed questions

| # | Question (owner: Database & Messaging) | Answer |
|---|---|---|
| 1 | Confirm the final MQTT topic layout | **Confirmed** — §2.1 is the authoritative list. Topic names are exactly upstream's. The API should keep them configurable (`MQTT_TOPIC_PREFIX`, `MQTT_STATUS_TOPIC_PATTERN`) as the backend proposes; no re-layout needed. |
| 2 | Confirm the exact `Event` schema and retention policy | **§3.4 and §7.** One deviation from the backend's draft: `Event.status` is stored explicitly rather than derived from `endedAt`, and `Event` has a companion `EventObject` table (§3.5). See §3.9.2. |
| 4 | Confirm `frigateId` = Frigate's config camera ID, and the canonical camera list source | **Confirmed.** `cameras.frigate_id` is the config ID from the `cameras:` key in `config.yml` — never `friendly_name`. Canonical source is the Frigate **config API** (`GET /api/config`), mirrored read-only; `frigate/camera_activity` provides the runtime snapshot. See §5.2. |
| 5 | Event retention vs. Frigate's own retention alignment | Metadata retention is **30 days** (§7) and is **independent** of Frigate's media retention. Frigate owns media; Smart CCTV owns metadata only. Routed onward to Security & Privacy. |

#### 3.9.2 Correction 1 — the review payload is nested under `data`

The backend spec (§5.2) shows a **flattened** review envelope, with `detections`, `objects`,
`sub_labels`, `zones` as siblings of `id` and `camera`. The upstream 0.14+ payload nests them
**inside `data`**, and there is no `has_snapshot`, `has_clip`, `duration`, or `type` field at the
review's top level.

Upstream source, `frigate/review/maintainer.py:170-192` (`ReviewSegment.get_data`):

```
{ "id", "camera", "start_time", "end_time", "severity", "thumb_path",
  "data": { "detections", "objects", "verified_objects", "sub_labels",
            "zones", "audio", "classification_state_changes",
            "thumb_time", "metadata" } }
```

**Impact on the schema.** `Event.objects`, `Event.sub_labels` and `Event.zones` map to
**`data.objects` / `data.sub_labels` / `data.zones`**, not to top-level fields. The Zod schema must
read from `data.*` or the columns will be silently null. `Event.type` maps to **`severity`**
(upstream `SeverityEnum` is exactly `alert` | `detection` — verified at
`frigate/review/types.py:4-6`); there is no separate review `type` field.

**Recommendation to the backend:** the §5.2 review example and field table must be corrected
before the Zod schema is written, or every review row will be written with null objects/zones.

#### 3.9.3 Correction 2 — reviews are the canonical event stream, not "not modeled"

The backend spec contradicts itself. §3.1 defines `Event` as "a Frigate *review item*" keyed on
`frigateReviewId`; §5.5 then says "**MVP decision: subscribe but do not model it**" and that
`Event` is "detection-only".

**Resolution:** the §3.1 model is correct and §5.5 is the outlier. `Event` **is** the review
segment — this is what the schema in §3.4 implements, and it is what the notification semantics in
§5.2 describe ("one notification per segment, not one per object"). The `frigate/events` stream is
modelled separately as `EventObject` (§3.5), exactly as §3.1's `EventObject` entity anticipates.

The §5.5 sentence describing a review envelope with `detection_id`, `detection_time` and
`thumb_path2` describes a **pre-0.14 Frigate**. `frigate/reviews` did not exist before 0.14 — the
0.13.1 MQTT documentation has no such topic (verified: `mqtt.md` at tag `v0.13.1` lists only
`frigate/events` and no `frigate/reviews`). That shape must not be used as the 0.14+ contract.

**Recommendation to the backend:** delete the §5.5 legacy payload description and the
"subscribe but do not model it" decision, or restate it as "reviews are modelled as `Event`;
`frigate/events` is modelled as `EventObject`".

#### 3.9.4 Correction 3 — `sub_label` has two different types

| Where | Type | Example |
|---|---|---|
| `frigate/events` → `after.sub_label` | **`[value, score]` tuple or `null`** | `["Bob", 0.95]` |
| `frigate/reviews` → `data.sub_labels` | **list of plain strings** | `["Bob"]` |

Upstream: `frigate/track/tracked_object.py:328` assigns `self.obj_data["sub_label"] =
(max_logo, recognized_logos[max_logo])` — a tuple. `frigate/review/maintainer.py:97` reads
`obj["sub_label"][0]` and stores only that element, so the review's `sub_labels` are bare strings.

**Impact on the schema.** `event_objects.sub_label` is `text` and must be populated from
`sub_label[0]`, with the score kept separately in `attributes` (or `top_score`). Storing the raw
tuple into a `text` column would produce the literal string `("Bob", 0.95)`. The backend's §5.3
rule ("normalize `sub_label` to text, take the string form") is correct and should be applied to
`frigate/events` only.

#### 3.9.5 Agreed schema deltas against the backend's §3.1

| Backend field | This design | Note |
|---|---|---|
| `Camera.lastStatus` | `camera_health.status` (per role) | Split per role: `detect`, `record`, `record_sub`, `audio`. The backend's single column cannot represent a camera whose `detect` is online but `record` is offline. |
| `Camera.lastMotionAt` | *(not in this schema)* | `frigate/<camera>/motion` is a derived counter, not part of the event contract. It can be added as a nullable column on `cameras` without conflict. |
| `Event.status` | `events.status` | Stored explicitly (`open`/`ended`) **and** guarded monotonically. Deriving it from `endedAt` alone cannot express "ended, and a late `update` must not reopen it". |
| `Event.label` | `events.objects` | Naming only — the backend's §14 vocabulary pass already standardises on `label`; this schema uses `objects` for the *array* of labels, and `event_objects.label` for a single object. Flagged to avoid a collision. |
| `Event.enteredZones` | `events.zones` | See above. |
| `Event.confidence` / `Event.currentScore` | `event_objects.top_score` / `.score` | Confidence is a property of a tracked **object**, not of the segment. |
| `Event.acknowledgedAt`, `acknowledgedById` | **not in this schema** | Owned by the backend (users/ack state). They belong on the same `events` table; the column list in §3.4 is what this role owns and the backend adds its two columns in its own migration. |
| `NotificationRule.cameraIds` / `eventLabels` / `zones` | `notification_rules.camera_id` / `.min_severity` / `.zone` | The backend models a single `cameraId` + `eventLabels[]` + `zones[]`; this schema's draft is a simplified single-camera form. **The backend's array form is the better model** and is supported unchanged — §3.7 is a sketch, not a constraint. Reconciled at implementation time by the backend's Prisma migration. |
| `NotificationDelivery.status` enum | `notification_deliveries.status` | Backend's enum is `pending`/`sent`/`failed`/`skipped`; this schema used `suppressed`. **The backend's `skipped` wins** — the column will be `text` + `CHECK` allowing both `skipped` and `suppressed`, so neither side is broken. |

> **Ownership note.** `docs/backend/backend-api-design.md` §3.1 says "The Database & Messaging Engineer owns the final
> schema". This document is that schema. Where the backend's field list is more expressive (notably the array-valued
> `NotificationRule` filters), the backend's version is adopted — the differences above are the only ones, and none of them
> change the entity boundaries.

## 4. Event Schema & Idempotency

### 4.1 The dedupe key

```
dedupe_key = sha256( source_entity || ':' || source_id || ':' || message_type )
```

For a review segment `1718987129.308396-fqk5ka`:

| source_entity | source_id | message_type | result |
|---|---|---|---|
| `review` | `1718987129.308396-fqk5ka` | `new` | one row, ever |
| `review` | `1718987129.308396-fqk5ka` | `update` | one row, ever |
| `review` | `1718987129.308396-fqk5ka` | `end` | one row, ever |

**Why `(entity, id, type)` and not a payload hash:** a payload hash would collapse the
legitimate `new` → `update` → `end` progression into a single row, because Frigate re-sends
near-identical payloads. The `(entity, id, type)` triple is monotone in the event lifecycle and
matches the upstream semantics exactly.

**Why not `(entity, id)` alone:** it would allow only one message per entity, dropping all
subsequent `update` messages — losing severity escalation and object membership.

**Duplicate `update` messages:** Frigate may resend the same `update` more than once. The
dedupe key rejects the *second and later* messages of the same `(entity, id, type)`. Because an
`update` is a **state transition** (severity changed, object added), the payload is applied
**idempotently** — a repeated `update` that carries no new information produces no change. The
`payload_hash` column lets the consumer detect "same type, same content" and short-circuit.

> **Ordering caveat.** The dedupe key ignores ordering, so an out-of-order `update` arriving
> after an `end` is still recorded. The `status` column is set by the *message type*
> (`end` → `ended`, `new`/`update` → `open`), and the consumer applies a **monotonic state
> machine**: once an event is `ended`, a late `update` does not reopen it. This is enforced in
> the application layer by an `UPDATE ... WHERE status <> 'ended'` guard.

### 4.2 Idempotent write procedure

Every consumed MQTT message follows this sequence:

```
1. Parse and validate the payload against the expected schema.
2. BEGIN
3.   INSERT INTO event_sources (source_topic, source_entity, source_id,
4.                             message_type, dedupe_key, payload_hash)
5.   VALUES (...)
6.   ON CONFLICT (dedupe_key) DO NOTHING
7.   RETURNING id;                       -- NULL means duplicate
8.   If NULL -> ROLLBACK, log 'duplicate', ACK the message.
9.   Apply the state change to events / event_objects (guarded by
10.  the monotonic state machine).
11.  UPDATE event_sources SET applied_at = now(),
12.                            apply_result = 'applied' WHERE id = ?;
13. COMMIT
```

Step 6's `ON CONFLICT DO NOTHING` is the race-safe primitive: two consumers processing the same
message concurrently cannot both proceed, because only one insert wins.

**Crash safety.** Because the `event_sources` insert and the domain write are in one
transaction, a crash between them rolls back both. A redelivered MQTT message (QoS 1 at-least-once
semantics) is then reprocessed cleanly.

**Note on QoS.** Frigate publishes with the configured `mqtt.qos` (default 1). QoS 1 is
*at-least-once*, so **duplicate delivery is expected and normal**, not an edge case. The
`event_sources` ledger is therefore not optional hardening — it is required for correctness.

### 4.3 Camera status handling (level, not edge)

Camera status requires different treatment from the event stream:

1. **Retain the level, not the event.** Upsert into `camera_health`; update `last_message_at`.
   The 10s resend produces one row update, not a new row.
2. **Debounce the flap.** Frigate's docs state an unreachable camera alternates `offline`/
   `online` as the watchdog restarts ffmpeg. A transition is only **published** to
   `smart-cctv/camera/<camera>/status` after the new value has been held for a configurable
   window (default **15s**), matching the upstream guidance to "wait for the status to hold
   steady". The raw level is still written to `camera_health` immediately.
3. **Never infer `offline` from silence.** Because status topics are not retained, a consumer
   that connects late sees no status at all. A camera with no status row is `unknown`, not
   `offline`. Only an explicit `offline` payload sets `offline`.
4. **Staleness detection.** If `last_message_at` is older than `3 × resend_interval` (default
   30s), the status is treated as **stale** — the producer may have died without publishing
   `offline`. A sweeper marks such rows `unknown` rather than leaving a misleading `online`.
5. **Disabled is not offline.** `disabled` means the camera is intentionally turned off. It is
   a distinct value and must not trigger "camera fault" notifications.

The `smart-cctv/camera/<camera>/status` topic is published **retained**, so a dashboard that
connects late immediately gets the current state.

### 4.4 The normalized Smart CCTV event envelope

Published on `smart-cctv/events` so other consumers (dashboards, Home Assistant, scripts) do not
need to understand Frigate's nested `before`/`after` format:

```json
{
  "version": 1,
  "id": "b8f1c2de-...-uuid",
  "frigate_review_id": "1718987129.308396-fqk5ka",
  "camera": "front_cam",
  "type": "alert",
  "status": "ended",
  "started_at": "2026-10-21T09:00:00.000Z",
  "ended_at": "2026-10-21T09:00:42.000Z",
  "duration_seconds": 42,
  "objects": ["person", "car"],
  "sub_labels": ["Bob"],
  "zones": ["front_yard"],
  "has_snapshot": true,
  "has_clip": true,
  "attributes": {
    "person": { "face": { "name": "Bob", "score": 0.95 } }
  }
}
```

`version` is included from day one so the payload can evolve without breaking consumers.

---

## 5. Resync, Recovery & Consistency

### 5.1 The gap problem

Because `frigate/reviews` and `frigate/events` are **not retained** (§2.3 #4), any disconnect
loses events. This is the single most important operational property of this integration.

### 5.2 Cold start

On a cold start the consumer must reconstruct current state:

1. Publish `frigate/onConnect` → Frigate responds with `frigate/camera_activity`, a snapshot of
   per-camera config and activity. This is Frigate's own supported mechanism for exactly this
   case.
2. Fetch `GET /api/config` → camera and zone definitions → upsert into `cameras` / `zones`.
3. Fetch `GET /api/review?cameras=...` (and `GET /api/events`) for currently-open segments →
   upsert into `events` / `event_objects`.
4. Subscribe to `frigate/reviews`, `frigate/events`, `frigate/available`, and the per-camera
   `status/<role>` topics.

**Ordering matters:** subscribe *before* the HTTP fetch, then de-duplicate the overlap using
`event_sources`. Subscribing first means no gap; the HTTP fetch fills the gap; the dedupe ledger
absorbs the double-count.

### 5.3 Warm reconnect

On reconnect the broker replays retained messages (`frigate/available`, `frigate/profile/state`,
and Smart CCTV's own retained camera status) but **not** the missed events. The consumer must:

1. Detect the disconnect (broker or Frigate liveness).
2. Re-run the cold-start resync (§5.2) to fill the gap.
3. Apply the same dedupe rules, so anything received both live and via resync collapses.

### 5.4 Frigate liveness vs. broker liveness

`frigate/available` is retained with a will message (§2.3 #6). Interpretation:

| Value | Meaning |
|---|---|
| `online` | Frigate is running and has published initial state. |
| `stopped` | Frigate shut down cleanly. |
| `offline` | Frigate crashed or was killed (broker will message). |

`stopped` vs `offline` are **different incidents** and are stored distinctly so the UI can
distinguish "someone stopped Frigate" from "Frigate crashed". A `stopped`/`offline` transition
marks all open events for that site as **ended** (with `ended_at` = the transition time),
because Frigate will never send the `end` message for them.

### 5.5 Source of truth summary

| Data | Source of truth | Smart CCTV role |
|---|---|---|
| Cameras, zones | Frigate config API | Read-only mirror |
| Camera role health | Frigate MQTT `status/<role>` | Mirror + debounce |
| Events / objects | Frigate MQTT + API | Normalize, index, retain |
| Notification rules | Smart CCTV | Authoritative |
| Users, API keys | Smart CCTV (Backend/Security) | Out of scope here |

---

## 6. Validation

The DDL in this document was **executed against a live PostgreSQL 18.6 instance** and every
behaviour claimed above was measured, not assumed.

### 6.1 What was verified

| # | Check | Result |
|---|---|---|
| 1 | All 8 tables, constraints, generated columns, indexes created | Pass |
| 2 | `gen_random_uuid()` available without `pgcrypto` (PG 13+ built-in) | Pass |
| 3 | `duration_seconds` is NULL while an event is open | Pass |
| 4 | `duration_seconds` computes (42) once `ended_at` is set | Pass |
| 5 | `events_time_check` rejects `ended_at < started_at` | Pass |
| 6 | `events_type_check` rejects an invalid `type` | Pass |
| 7 | `events_status_check` rejects an invalid `status` | Pass |
| 8 | `camera_health_role_check` rejects an invalid `role` | Pass |
| 9 | `camera_health_status_check` rejects an invalid `status` | Pass |
| 10 | Duplicate `dedupe_key` rejected by the unique constraint | Pass |
| 11 | `ON CONFLICT (dedupe_key) DO NOTHING` returns 0 rows on replay | Pass |
| 12 | `new` / `update` / `end` for one entity are all retained (3 rows) | Pass |
| 13 | **8 concurrent inserts of one `dedupe_key` → exactly 1 row** | Pass |
| 14 | Monotonic guard: a late `update` does not reopen an `ended` event | Pass |
| 15 | 10 identical camera-status messages → still **1 row** (level, not log) | Pass |
| 16 | `notification_deliveries` UNIQUE rejects a duplicate rule+event+channel | Pass |
| 17 | A different channel for the same rule+event is allowed | Pass |
| 18 | `events.camera_id` FK is `ON DELETE RESTRICT` → camera delete blocked | Pass |
| 19 | Soft-retire via `retired_at` is the supported removal path | Pass |
| 20 | `camera_health` FK cascades on camera delete | Pass |
| 21 | Multiple events with NULL `frigate_review_id` are allowed | Pass |

### 6.2 Index behaviour, measured at 200k rows

| Query | Plan observed |
|---|---|
| `camera_id = X AND started_at > now() - 2 hours` | `Index Scan using idx_events_camera_started` — composite index used |
| `camera_id = X` only (no time bound) | `Index Scan using idx_events_started` + filter — planner prefers the global recency index |
| `status = 'open' ORDER BY started_at DESC` | `Index Scan using idx_events_status_started` — partial index used |
| `objects @> ARRAY['bicycle']` (selective) | `Bitmap Index Scan on idx_events_objects` — GIN used |
| `objects @> ARRAY['person']` (matches most rows) | `Seq Scan` — correct; GIN would not pay off |

### 6.3 Defect found and fixed during validation

An earlier draft included `CHECK (started_at >= now() - interval '30 days')` on `events`,
intended to enforce the 30-day retention window at the row level. Testing showed it to be
**actively harmful** and it was **removed**:

- It **rejected legitimate historical inserts** — a 60-day-old event failed to insert
  (verified). This breaks the §5.2 resync path and any backfill of past events.
- A `CHECK` referencing `now()` is evaluated **only at insert time**. It does not re-evaluate as
  wall-clock time advances, so it never actually enforces a moving retention window. A row
  inserted today would still be there in a year.

Retention is therefore enforced by the §7 retention job, which is both correct and provable
(§7 "deletion must be provable"). The constraint list in §3.4 reflects the corrected DDL.

---

## 7. Retention Policy

Separate policies per table, because the tables have very different access patterns.

| Table | Policy | Rationale |
|---|---|---|
| `events` (ended) | 30 days, then archive/drop | User-facing history; the "recent activity" window. |
| `events` (open) | Never dropped | An open event with no end is a data-integrity problem, not garbage. |
| `event_objects` | Follows parent `events` | No independent lifetime. |
| `event_sources` | 7 days, then drop | Idempotency window only; older replays are not expected. |
| `notification_deliveries` | 90 days | Audit trail for delivery. |
| `camera_health` | Rows retained; timestamps updated | Current-state table. |
| `cameras` / `zones` | Retained with `retired_at` | Config history is cheap and useful. |

**Partitioning.** At the confirmed scale (4–8 cameras) partitioning is **not** required and is
deliberately omitted — it adds operational complexity for no measured benefit. The schema is
partition-ready: `events` has a `started_at` range index, so if volume grows, `events` can be
declaratively partitioned by `RANGE (started_at)` with monthly partitions and a drop-based
retention job, without changing the logical model.

The `events` table should be pre-partitioned only when one of these is true:
- more than ~500k event rows,
- retention is a hard compliance requirement (legal deletion must be provable), or
- vacuum/IO pressure becomes measurable.

**Deletion must be provable** for privacy compliance: a retention job that `DELETE`s in batches
and records the deleted `id`s and time range in an audit table gives the Security & Privacy
Engineer evidence that data was actually removed.

---

## 8. Migration Strategy

Plain SQL migrations, one file per version, applied in order by the backend's migration runner.

- **Up/down pairs** for every migration.
- **Additive first.** New columns are added nullable, backfilled in batches, then constrained.
- **No destructive changes in the same release** that introduces the new column. Expand → migrate
  → contract across separate deploys.
- **Index creation** uses `CREATE INDEX CONCURRENTLY` on tables with live traffic, so it does not
  take a write lock.
- **Constraint validation** uses `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT`,
  which takes only a `SHARE UPDATE EXCLUSIVE` lock.
- **Enum changes are avoided entirely** in favour of `CHECK` constraints (§3.3), so a value
  addition is a cheap, low-lock migration.

---

## 9. Open Items for Review

**Answered** (routed to this role by the Backend Engineer — see §3.9): Q1 topic layout, Q2 `Event`
schema and retention, Q4 `frigateId` semantics and camera list source. Q5 (retention alignment) is
answered in §3.9.1 and still needs Security & Privacy sign-off.

Still open, flagged for the Tech Lead & DevOps Engineer and Security & Privacy Engineer:

1. **Retention windows** (30d events / 7d ledger) are proposals pending the Security & Privacy
   Engineer's lawful-basis and lawful-camera-usage assessment.
2. **`event_sources` retains raw-derived hashes for 7 days** — confirm this is acceptable under
   the privacy policy, as `payload_hash` is a hash of camera-derived content.
3. **De-duplication window vs. MQTT replay window** — 7 days must exceed the broker's maximum
   message age. Confirm the broker's `max_queued_messages` / persistence settings.
4. **Scale threshold** for switching `events` to partitioned tables (§7) — confirm 500k rows is
   the right trigger for this hardware.
5. **Frigate minimum version** — the design needs 0.14+ for the event stream, but 0.17+ for
   per-role camera health. Confirm whether to require 0.17+ outright and drop Tier 1, or support
   the degraded 0.14–0.16 path.
6. **Auth for the Frigate HTTP API** — resync calls `GET /api/config` and `GET /api/review`.
   These require Frigate authentication in recent versions; confirm the credential is injected at
   runtime and never committed (AGENTS.md: no hard-coded API keys).
7. **Backend spec corrections (§3.9.2–§3.9.4) need the backend's acknowledgement** — the review
   payload's `data.*` nesting, the "subscribe but do not model reviews" contradiction, and the
   `sub_label` type asymmetry are all **factual** corrections to `docs/backend/backend-api-design.md`.
   They should be fixed at source before the Zod schemas are written, otherwise reviews will be
   persisted with null `objects`/`zones`. This is the only item in this document that requires an
   action by another role.
8. **`Event.acknowledgedAt` / `acknowledgedById`** are requested by the backend (§3.1) but owned by
   the auth/ack flow. They should be added to the `events` table in the backend's own migration;
   this design deliberately leaves them out so the two migrations do not collide.

---

## Appendix A — Verification Sources

All Frigate behaviours cited in §2.3 were verified against upstream source, not recalled:

| Claim | Source |
|---|---|
| `reviews`/`events` published with `retain=False` | `frigate/track/object_processing.py:157,198`; `frigate/comms/dispatcher.py:350` |
| Status topics not retained (generic IPC forward) | `frigate/comms/dispatcher.py:487` |
| Status resend interval | `frigate/video/ffmpeg.py:121-138` (`RoleStatus.send`) |
| Resend interval default 10.0s | `frigate/config/camera/ffmpeg.py:87` (`retry_interval`) |
| `type: "new"` has identical before/after | `frigate/review/maintainer.py:339-341`; `frigate/track/object_processing.py:154-156` |
| `available` will message | `frigate/comms/mqtt.py:288-293` |
| `available` retained on clean shutdown | `frigate/comms/mqtt.py:349-364` |
| `onConnect` → `camera_activity` snapshot | `frigate/comms/dispatcher.py:208-235, 447` |
| `status/<role>` present from 0.17 | Upstream `docs/docs/integrations/mqtt.md` across tags v0.14.0–v0.18.2 |
| `reviews`/`events` present from 0.14 | Same, tag v0.14.0 |

Upstream tags checked: v0.14.0, v0.15.0, v0.16.0, v0.17.0, v0.18.0, v0.18.1, v0.18.2 (latest
stable), plus the `dev` branch.
