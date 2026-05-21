# Analytics Schema — Cross-Portal Reference

This document describes the MongoDB collections used by the user-journey analytics system. Both `events-jetzy-com` (event portal) and `JetzySocial` (admin portal) read from the same database, so any consumer can query these collections directly. All ingestion happens from the event portal; the admin portal is read-only.

---

## What this analytics system achieves

Custom in-house user-journey tracking — no third-party tools (no GA, no Mixpanel, no Hotjar). Tracks **both authenticated users and anonymous guests** with the same fidelity, then stitches a guest's journey to their account when they sign up (via `anonId` persisted in `localStorage`).

### Signals captured (per visitor, per session, per page)

| Signal | What it answers | Collection |
|---|---|---|
| Page views | Which pages users visit, in what order, how long they stay | `pageviews` |
| Sessions | Visit start/end, duration, entry/exit page, device, browser, referrer, UTM | `usersessions` |
| Clicks | Every button/link click — element text, `data-track` label, href, x/y coords, viewport size | `analytics_web_clicks` |
| Rage clicks | 3+ clicks within 50px in 1 second on same element (frustration signal) | `analytics_web_clicks.isRageClick` |
| Scroll depth | How far down each page users scroll — milestones 25%, 50%, 75%, 100% | `analytics_web_scroll` |
| Form interactions | Which forms users focus, which they submit, which they abandon. Field **names only**, never values | `analytics_web_forms` |
| Event interactions | View, ticket select, booking start, share, click — scoped to a specific event | `eventinteractions` |
| Journey timeline | Ordered merged sequence of every action in a session — page views + clicks + scrolls + form events + event interactions | `userjourneys` |

### Questions the admin portal can answer

**Per-platform (overall):**
- How many sessions, unique visitors, page views over a date range?
- How many sessions are logged-in vs anonymous guests?
- Guest → signup conversion rate
- Bounce rate (sessions with ≤1 page view)
- Top entry pages, exit pages, most viewed pages
- Top referrers, UTM campaign performance, device/browser breakdown
- Most active users (sessions, page views, actions, event interactions, activity score)

**Per-event:**
- Funnel: `view → ticket_select → booking_start → booking_complete` with drop-off % at each stage
- Click heatmap: x/y click coordinates rendered on a canvas (rage clicks in red)
- Top click targets: which buttons/links get clicked most on this event's pages
- Dwell time per page: avg, p50, p90, plus avg scroll depth
- Recent event interactions feed

**Per-session (drill-down):**
- Full chronological timeline of everything the visitor did
- Page-view durations, click targets, rage clicks, scroll depth per page, form interactions
- Linked back to user (if logged in) or anonymous fingerprint (`anonId`)

**Guest analytics:**
- Guest vs auth session breakdown
- Top guest entry pages (where guests land before signing up)
- Top guests by session count (anonymous fingerprints with most repeat visits)
- Guest → auth conversion: % of `anonId`s that eventually had a logged-in session

### Read APIs the admin portal can hit directly

All under `/api/analytics/journey/*` — see the **Read APIs exposed by the event portal** section below for the full list and response shapes. Alternatively, query the collections directly in MongoDB; sample queries are in the **Recommended Mongo queries** section.

### What is **not** tracked (by design)

- Form field values (only field names) — privacy
- IP geolocation (IP is stored but not enriched)
- Off-site activity (only events on the events portal domain)
- Anything inside `data-analytics-ignore` elements (logout buttons opt out to keep `signOut` reliable)

---

## Identity model

Three identifiers track a visitor across the journey:

| ID | Scope | Storage | Notes |
|---|---|---|---|
| `userId` | Authenticated user | NextAuth session | `ObjectId` ref to `users`. Present only when logged in. |
| `sessionId` | Per-tab session | `sessionStorage.analytics_session_id` | Resets when tab closes. Generated server-side on `track-session-start`. |
| `anonId` | Per-browser visitor | `localStorage.analytics_anon_id` | Stable across sessions in the same browser. Allows stitching guest → signup journeys. Cleared by the logout button. |

`isLoggedIn` flag on `UserSession` is set at session-start time. A single browser may have multiple sessions, some logged in and some guest, all sharing the same `anonId`.

---

## Collections

### Existing (untouched by this work — used by the legacy `/console/analytics` page)

| Collection (Mongo name) | Mongoose model | Purpose |
|---|---|---|
| `pageviews` | `PageView` | One doc per page view. Has `timeSpent`, UTM params, device/browser, referrer. |
| `usersessions` | `UserSession` | One doc per session. `startTime`, `endTime`, `duration`, `entryPage`, `exitPage`, `pageCount`, `isLoggedIn`, **`anonId` (added)**. |
| `userjourneys` | `UserJourney` | One doc per session with a `journey: [{ action, page, eventId?, timestamp, duration?, metadata? }]` array. **`anonId` (added)**. |
| `eventinteractions` | `EventInteraction` | Event-scoped interactions: `view`, `click`, `share`, `ticket_select`, `booking_start`. |
| `useractions` | `UserAction` | Generic action tracking (legacy). |

### New (added with the journey analytics feature)

| Collection | Mongoose model | Purpose |
|---|---|---|
| `analytics_web_clicks` | `WebClick` | Raw click events. `x`, `y`, `viewportW/H`, `elementTag`, `elementText`, `elementId`, `elementClass`, `dataTrack`, `href`, `isRageClick`, `isDeadClick`, `eventId?`. |
| `analytics_web_scroll` | `WebScroll` | One doc per `(sessionId, page)`. `maxDepthPct` + `reachedMilestones` (subset of `[25, 50, 75, 100]`). |
| `analytics_web_forms` | `WebForm` | Form interactions: `focus`, `submit` (`field_change` and `abandon` reserved). `formName` from `data-form` / `name` / `id` / `action`. Field values are **never** stored — only `fieldName`. |

All new collections include `sessionId`, `userId?`, `anonId?`, `page`, `eventId?`, `timestamp`, and `timestamps: true`.

---

## Indexes (key)

**WebClick:** `{ sessionId: 1, timestamp: 1 }`, `{ eventId: 1, timestamp: -1 }`, `{ page: 1, timestamp: -1 }`, `{ isRageClick: 1 }`
**WebScroll:** `{ sessionId: 1, page: 1 }` (unique), `{ eventId: 1, maxDepthPct: -1 }`
**WebForm:** `{ sessionId: 1, timestamp: 1 }`, `{ eventId: 1, interactionType: 1 }`, `{ formName: 1, interactionType: 1 }`

---

## Read APIs exposed by the event portal

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /api/analytics/journey/sessions` | admin | Paginated session list with `clickCount`, `pageCount`, user info. |
| `GET /api/analytics/journey/session/[sessionId]` | admin OR event owner (if session touched their event) | Full merged timeline of page views, clicks, scrolls, forms, event interactions. |
| `GET /api/analytics/journey/funnel?eventId=` | admin OR event owner | view → ticket_select → booking_start → booking_complete with drop-off %. |
| `GET /api/analytics/journey/heat?eventId=&page=` | admin OR event owner | Click coordinates + top click targets for heatmap. |
| `GET /api/analytics/journey/dwell?eventId=` | admin OR event owner | Avg / p50 / p90 time-on-page + avg scroll depth per page. |
| `GET /api/analytics/journey/guests` | admin | Guest vs auth split, top guest entry pages, guest→auth conversion %. |
| `GET /api/analytics/journey` (legacy) | admin | Raw `UserJourney` documents. Kept for backward compat. |

---

## Write APIs (anonymous-friendly)

| Endpoint | Notes |
|---|---|
| `POST /api/analytics/track-session-start` | Returns `sessionId`. Accepts optional `anonId`. |
| `POST /api/analytics/track-session-end` | Idempotent. Fired on `beforeunload`, `pagehide`, `visibilitychange(hidden)`. |
| `POST /api/analytics/track-page` | Page view + dwell. Updates `UserJourney` and `UserSession.exitPage`. Accepts `anonId`. |
| `POST /api/analytics/track-event-interaction` | Event-scoped interactions. |
| `POST /api/analytics/track-action` | Generic action. |
| `POST /api/analytics/track-click` | Click + rage-click detection. |
| `POST /api/analytics/track-scroll` | Scroll milestones. Upserts on `(sessionId, page)`. |
| `POST /api/analytics/track-form` | Form `focus` / `submit`. |

---

## Named-Event Tracking (hotel-style: Category / Event Name / Total Events / Unique Users)

Our system captures the equivalent of GA4/Firebase "custom events" spread across four collections. The table below maps the hotel-project spreadsheet columns to our data:

| Hotel column | Our equivalent | Collection | Field |
|---|---|---|---|
| Category | Interaction domain | — | see rows below |
| Event Name | Action identifier | `eventinteractions` | `interactionType` (`view`, `ticket_select`, `booking_start`, `share`, `click`) |
| Event Name | Named CTA click | `analytics_web_clicks` | `dataTrack` (set via `data-track="..."` on any element) |
| Event Name | Page visited | `pageviews` | `page` (URL path) |
| Event Name | Form action | `analytics_web_forms` | `formName` + `interactionType` |
| Total Events | Raw occurrence count | any | `$sum: 1` |
| Unique Users | Auth + anonymous visitors | any | distinct `userId` ∪ distinct `anonId` |

### Query 1 — Event interactions table (maps 1:1 to hotel spreadsheet)
```js
db.eventinteractions.aggregate([
  // add { $match: { timestamp: { $gte: startDate } } } for date filtering
  {
    $group: {
      _id: "$interactionType",
      totalEvents: { $sum: 1 },
      uniqueAuthUsers: { $addToSet: "$userId" },
      uniqueAnonUsers: { $addToSet: "$anonId" },
    }
  },
  {
    $project: {
      category: { $literal: "Event Interactions" },
      eventName: "$_id",
      totalEvents: 1,
      uniqueUsers: {
        $size: {
          $setUnion: [
            { $filter: { input: "$uniqueAuthUsers", cond: { $ne: ["$$this", null] } } },
            { $filter: { input: "$uniqueAnonUsers",  cond: { $ne: ["$$this", null] } } },
          ]
        }
      }
    }
  },
  { $sort: { totalEvents: -1 } }
])
```

### Query 2 — CTA click named table (requires `data-track` labels on elements)
```js
db.analytics_web_clicks.aggregate([
  { $match: { dataTrack: { $ne: null } } },
  {
    $group: {
      _id: "$dataTrack",
      totalEvents: { $sum: 1 },
      uniqueAuthUsers: { $addToSet: "$userId" },
      uniqueAnonUsers: { $addToSet: "$anonId" },
    }
  },
  {
    $project: {
      category: { $literal: "CTA Clicks" },
      eventName: "$_id",
      totalEvents: 1,
      uniqueUsers: {
        $size: {
          $setUnion: [
            { $filter: { input: "$uniqueAuthUsers", cond: { $ne: ["$$this", null] } } },
            { $filter: { input: "$uniqueAnonUsers",  cond: { $ne: ["$$this", null] } } },
          ]
        }
      }
    }
  },
  { $sort: { totalEvents: -1 } }
])
```

### Query 3 — Combined cross-collection table (all categories, hotel-spreadsheet format)

Requires MongoDB 4.4+ for `$unionWith`. Alternatively run the per-collection queries in `Promise.all` and merge in application code.

```js
db.eventinteractions.aggregate([
  {
    $group: {
      _id: "$interactionType",
      category: { $first: "Event Interactions" },
      total: { $sum: 1 },
      users: { $addToSet: { $ifNull: ["$userId", "$anonId"] } }
    }
  },
  {
    $unionWith: {
      coll: "analytics_web_clicks",
      pipeline: [
        { $match: { dataTrack: { $ne: null } } },
        { $group: { _id: "$dataTrack", category: { $first: "CTA Clicks" },
            total: { $sum: 1 }, users: { $addToSet: { $ifNull: ["$userId", "$anonId"] } } } }
      ]
    }
  },
  {
    $unionWith: {
      coll: "pageviews",
      pipeline: [
        { $group: { _id: "$page", category: { $first: "Page Views" },
            total: { $sum: 1 }, users: { $addToSet: { $ifNull: ["$userId", "$anonId"] } } } }
      ]
    }
  },
  {
    $unionWith: {
      coll: "analytics_web_forms",
      pipeline: [
        { $group: { _id: { form: "$formName", type: "$interactionType" },
            category: { $first: "Form Events" },
            total: { $sum: 1 }, users: { $addToSet: { $ifNull: ["$userId", "$anonId"] } } } },
        { $project: { _id: { $concat: ["$_id.form", " / ", "$_id.type"] },
            category: 1, total: 1, users: 1 } }
      ]
    }
  },
  {
    $project: {
      category: 1,
      eventName: "$_id",
      totalEvents: "$total",
      uniqueUsers: { $size: "$users" }
    }
  },
  { $sort: { totalEvents: -1 } }
])
```

### Instrumenting new named events

To add a named event to the **CTA Clicks** category, add `data-track="your-label"` to any button or link. The SDK captures it automatically and stores it in `analytics_web_clicks.dataTrack`. No backend changes required. Examples:

```html
<button data-track="book-now-hero">Book Now</button>
<a data-track="share-event-copy-link" href="...">Copy Link</a>
```

---

## Recommended Mongo queries

### Per-event funnel (sessions per stage)
```js
db.eventinteractions.aggregate([
  { $match: { eventId: ObjectId("...") } },
  { $group: { _id: "$interactionType", sessions: { $addToSet: "$sessionId" } } },
])
// + db.bookings.countDocuments({ eventId: ObjectId("..."), status: { $in: ["confirmed","approved"] } })
```

### Top click targets in last 7 days
```js
db.analytics_web_clicks.aggregate([
  { $match: { timestamp: { $gte: new Date(Date.now() - 7*24*60*60*1000) } } },
  { $group: { _id: { text: "$elementText", dataTrack: "$dataTrack" },
              count: { $sum: 1 },
              rage: { $sum: { $cond: ["$isRageClick", 1, 0] } } } },
  { $sort: { count: -1 } }, { $limit: 50 },
])
```

### Guest → signup conversion
```js
const guestAnon = db.usersessions.distinct("anonId", { isLoggedIn: false, anonId: { $ne: null } })
const converted = db.usersessions.countDocuments({ anonId: { $in: guestAnon }, isLoggedIn: true })
// conversion = converted / guestAnon.length
```

### Dwell distribution for a page
```js
db.pageviews.aggregate([
  { $match: { page: "/events/abc123", timeSpent: { $gt: 0 } } },
  { $group: { _id: null, avg: { $avg: "$timeSpent" }, count: { $sum: 1 } } },
])
```

### Rage clicks per page
```js
db.analytics_web_clicks.aggregate([
  { $match: { isRageClick: true } },
  { $group: { _id: "$page", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
])
```

### Sessions that touched a specific event
```js
db.eventinteractions.distinct("sessionId", { eventId: ObjectId("...") })
```

---

## Client SDK behavior

Lives in [src/contexts/AnalyticsContext.tsx](src/contexts/AnalyticsContext.tsx). Runs on every page via `_app.tsx`.

- **Session start** — `POST /api/analytics/track-session-start` on first load. Returns `sessionId`, stored in `sessionStorage`. Also reads/creates `anonId` in `localStorage`.
- **Page view** — fired on every `routeChangeComplete` with `timeSpent` of previous page.
- **Click** — **bubble phase** delegated listener on `document`. Tracks `<button>`, `<a>`, `[role=button]`, `[data-track]`. **Short-circuits if any ancestor has `data-analytics-ignore`** (logout buttons opt out this way). No `keepalive` — clicks during navigation are dropped. Throttled to 20/sec.
- **Scroll** — passive `window` listener. Fires `track-scroll` only on crossing 25/50/75/100% milestones. Resets per route.
- **Form** — `focusin` (first focus per form) + `submit` in bubble phase. Respects `data-analytics-ignore`. Field values never sent.
- **Session end** — `visibilitychange (hidden)` + `pagehide` + `beforeunload`. Idempotent. Flushes final-page dwell via beacon, then sends `track-session-end`.

### Adding tracking to a CTA
Add `data-track="checkout-pay-now"` to the element. The listener picks it up automatically and stores it in `WebClick.dataTrack`. To opt OUT, add `data-analytics-ignore` on the element or any ancestor.

---

## Privacy notes

- IP and user-agent captured on `pageviews` / `usersessions` (existing behavior).
- Form field values are **never** captured — only field names.
- `anonId` is a random UUID with no PII. Cleared on logout.
- `dataTrack` should be a stable identifier, not user input.

---

## Retention

No TTL configured. For high-traffic deployments, consider a TTL index on `timestamp` for `analytics_web_clicks` (e.g. 180 days).
