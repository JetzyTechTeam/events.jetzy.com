# CEO Daily Report — Metric Reference & Events Integration Plan

> Goal: document what each metric in the existing "Daily Users Overview" CEO email means,
> where it should come from, and how to add an **Events** section sourced from this repo
> (`events.jetzy.com`) using the same Last 24h / 7 Days / 30 Days / 60 Days shape.

---

## 0. Scope — read this first

This repo is a **separate codebase** from the Migozz mobile app that the CEO report describes:

- Migozz mobile app: Flutter, Firebase Auth, **Firestore**, Cloud Functions (Node.js).
- `events.jetzy.com` (this repo): Next.js 14 + **MongoDB/Mongoose**. Firebase is wired up here
  only for `firebase/auth` (Google/Apple sign-in) — see [src/configs/firebase.ts](src/configs/firebase.ts)
  and [src/configs/firebase-admin.ts](src/configs/firebase-admin.ts). There is **no Firestore usage anywhere
  in this repo**, and no cron/scheduled-email code either (confirmed by search).

Consequence: **Part 1** below (mapping your existing metrics to Firestore collections) is
*inferred* from the app's documented module structure (auth, profile, chat, wallet, match,
search, verification, notifications, social) — not verified against source, because that
source lives in a repo not available here. Treat it as a starting hypothesis to confirm
against the actual Cloud Functions / Firestore security rules. **Part 2** (the events side) is
fully verified against this repo's models and existing `/api/analytics/*` routes.

---

## 1. Data quality finding from your pasted numbers

Checking arithmetic across your table: **`Active Users = New Users + Returning Users`** holds
exactly for every window except one:

| Window | New + Returning | Active | Match? |
|---|---|---|---|
| Last 24h | 4 + 7 = 11 | 11 | ✅ |
| 7 Days | 25 + 33 = 58 | 58 | ✅ |
| 30 Days | 160 + 102 = 262 | 262 | ✅ |
| 60 Days | 700 + 0 = 700 | 612 | ❌ off by 88, and Returning=0 is suspicious on its own |

This confirms the definition your report already uses (`Active = New + Returning`), and shows
the **60-day "Returning Users" figure is broken** — it's returning `0` instead of the ~88+
you'd expect given 700 new and 612 active. Worth raising with whoever owns that Cloud Function;
likely a query bound (e.g. a `<=30` day cap left in a `Returning` clause, or a limit/timeout
truncating a larger aggregation) rather than a real product signal.

Use `Active = New + Returning` as the reconciliation check for the Events-side metrics in
Part 2 as well — any window where it doesn't balance means the two queries disagree on identity
(e.g. one counts by `userId`, the other by session) and needs fixing before it ships.

---

## 2. Part 1 — Existing report metrics → likely Firestore collections (INFERRED — verify)

| Metric | What it measures | Likely Firestore collection(s) | Notes |
|---|---|---|---|
| Active Users | Distinct users with any activity in the window | `users` (`lastActiveAt`/`lastSeenAt`) or a Cloud-Functions-written activity/analytics collection | If this is powered by Firebase Analytics → BigQuery export rather than raw Firestore, the *true* source is a BigQuery dataset, not a collection — confirm this first, it changes the whole integration approach. |
| Returning Users | Active in window AND account existed before window start | `users.createdAt` vs activity timestamp | See the 60-day bug above — check this query specifically. |
| New Users | `users` created within window | `users` collection, `auth` module (`createdAt`) | |
| Posts Created / Organic Posts / Managed Posts | Content creation, split by source | `posts` (profile/social module), likely a `source`/`type` field (`organic` vs `managed`/scheduled) | "Managed" suggests brand/admin-scheduled posts — check for a `postSource` or `createdBy.type` field. |
| Hotels Booked / Restaurant Reservations / Event Tickets Booked | Bookings by category | `bookings`/`reservations` collection filtered by a `category`/`type` field | **Event Tickets Booked is worth double-checking**: if the mobile app's event ticketing reads/writes into *this* repo's MongoDB (via the shared `events` collection documented in `TICKET_SCHEMA.md`), the true source of truth for that one row may already be `events.jetzy.com` → `Bookings` (Part 2), not Firestore at all. |
| Hotel Feed/Detail Visitors, Hotel Searched, Hotel Booking Page Reached, Number of Opening of Event Page | Screen/page view funnels | Firebase Analytics custom events (`screen_view`, named events) — probably **not** raw Firestore | Classic GA4/Firebase Analytics shape (funnel counts, conversion %). If so, source is BigQuery export tables, not Firestore documents. |
| Discovery Conversion (%) | Ratio of two of the above | Computed at report-build time, not stored | |
| Number of Users Chatting / Number of Chats | `chat` module activity | `chats`/`conversations` (+ `messages`) | |
| User Search Filters Used | `search` module usage | Search-log collection or Firebase Analytics custom event | |
| Deals Section Chosen / Social Section Chosen / Top Users Page Scrolled / User Profile Opened | Tab/section navigation | Firebase Analytics custom events with a `section` param | |
| New Users by Referral Code | New signups grouped by referral code | `users.referralCode` grouped by `createdAt` window | Referral code registry likely lives alongside `verification`/growth logic. |

**Action item for you**: pull up the actual Cloud Function (or scheduled job) that assembles
this email and confirm (a) whether it queries Firestore directly or a BigQuery export, and (b)
the real collection/field names. I'd rather you correct this table from source than trust an
inference — happy to redo this section properly if you can point me at that repo.

---

## 3. Part 2 — Events portal (this repo) equivalents — VERIFIED

Everything below is grounded in this repo's actual models and existing admin analytics API
(`src/pages/api/analytics/overview.ts`, `visitors.ts`, `bookings.ts`), which already computes
several of these numbers today (see [PROJECT_KNOWLEDGE.md](PROJECT_KNOWLEDGE.md) and
[ANALYTICS_SCHEMA.md](ANALYTICS_SCHEMA.md) for the full existing reference).

### 3.1 Identity & activity sources

| Concept | Collection | Model | Key fields |
|---|---|---|---|
| Registered event-portal user | `event-users` | `EventUsers` ([src/models/eventUsersModal.ts](src/models/eventUsersModal.ts)) | `createdAt`, `refCode`, `signupSource`, `signupSessionId` |
| Legacy/admin user | `users` | `Users` ([src/models/userModal.ts](src/models/userModal.ts)) | `createdAt` |
| Session activity (auth + guest) | `usersessions` | `UserSession` | `startTime`, `isLoggedIn`, `userId`, `anonId` |
| Page-level activity | `pageviews` | `PageView` | `timestamp`, `page`, `userId`/`anonId` |
| Event-scoped interactions | `eventinteractions` | `EventInteraction` | `interactionType` (`view`/`ticket_select`/`booking_start`/`share`/`click`), `timestamp` |
| Referral-attributed visits | `event-traffic` (`EventTraffic`) | [src/models/events/event-traffic.ts](src/models/events/event-traffic.ts) | `referralCode`, `visitorId`, `userId`, `timestamp` |

No existing query currently computes "New" vs "Returning" for the events portal — only
`activeUsers` (via `lastActiveAt`, which `EventUsers`/`Users` don't actually carry a live
`lastActiveAt` field for — the existing `overview.ts` activeUserFilter assumes one; **this looks
like a second latent bug**, worth checking whether `lastActiveAt` is ever written anywhere in
this repo). For the CEO report, define activity by `usersessions.startTime` instead — it's
populated on every visit, logged-in or not, and is the deliberately-tracked source (see
`ANALYTICS_SCHEMA.md`).

### 3.2 Proposed "Daily Events Overview" table — definitions

Use the **same reconciliation rule as Part 1**: `Active = New + Returning`.

| Metric | Definition | Collection(s) |
|---|---|---|
| Active Users | Distinct `userId` (fallback `anonId` for guests) with a `UserSession` in the window | `usersessions` |
| New Users | `EventUsers` (+ `Users`) with `createdAt` in the window | `event-users`, `users` |
| Returning Users | Active in window, **and** account `createdAt` before window start | `usersessions` ⨝ `event-users`/`users` |
| Events Created | `Events.createdAt` in window | `events` |
| Events Published | `Events` with `status: "published"` and `createdAt`/`updatedAt` in window (confirm which timestamp reflects publish time — worth adding a dedicated `publishedAt` if not present) | `events` |
| Tickets Booked | `sum(Bookings.tickets[].quantity)` where `status: "confirmed"`, `createdAt` in window | `bookings` |
| Bookings Created | `Bookings.createdAt` in window, any status | `bookings` |
| Revenue | `sum(Bookings.total)` where `status: "confirmed"`, `createdAt` in window | `bookings` |
| Check-ins | `sum(CheckIn.checkedInCount)` where check-in activity in window (or count `checkInHistory[]` entries with a timestamp in window, if per-scan granularity is needed) | `checkIns` (`CheckIn`) |
| Event Page Views | `PageView` where `page` matches an event route (e.g. `/events/:slug`), `timestamp` in window | `pageviews` |
| Ticket-select / Booking-start / Booking-complete funnel | `EventInteraction` grouped by `interactionType`, `timestamp` in window (booking-complete = confirmed `Bookings`, since that interaction type isn't tracked client-side) | `eventinteractions`, `bookings` |
| Discussion Posts Created | `DiscussionPost.createdAt` in window — the closest analog to "Posts Created" | `discussion-posts` (`DiscussionPost`) |
| Waiting List Joins | `WaitingList` docs with `createdAt` in window | `waitinglists` (`WaitingList`) |
| New Users by Referral Code | `EventUsers.refCode` (signup-time) grouped by `createdAt` window — separate from `event-traffic.referralCode`, which is visit-level, not signup-level | `event-users` |
| Album Engagement (bonus, events-specific — no mobile-app analog) | `AlbumView`/`AlbumAccess`/`AlbumPhotoRequest` counts in window | `event-album-views`, `event-album-access`, `event-album-photo-requests` |

### 3.3 Query pattern — one `$facet` per metric across all four windows

Compute all four windows in a single aggregation instead of four separate queries:

```js
const now = new Date()
const since = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

const windowFacet = (dateField) => ({
  last24h: [{ $match: { [dateField]: { $gte: since(1) } } }, { $count: "n" }],
  sevenDays: [{ $match: { [dateField]: { $gte: since(7) } } }, { $count: "n" }],
  thirtyDays: [{ $match: { [dateField]: { $gte: since(30) } } }, { $count: "n" }],
  sixtyDays: [{ $match: { [dateField]: { $gte: since(60) } } }, { $count: "n" }],
})

// Example: New Users
const newUsers = await EventUsers.aggregate([{ $facet: windowFacet("createdAt") }])
```

Worked example — **Active / New / Returning users**, matching the `Active = New + Returning`
identity so the row balances every time:

```js
async function usersOverview(days) {
  const from = since(days)

  const active = await UserSession.aggregate([
    { $match: { startTime: { $gte: from } } },
    { $group: { _id: { $ifNull: ["$userId", "$anonId"] } } },
    { $count: "n" },
  ])

  const activeUserIds = await UserSession.distinct("userId", {
    startTime: { $gte: from },
    userId: { $ne: null },
  })

  const newUsers = await EventUsers.countDocuments({ createdAt: { $gte: from } })

  const returning = await EventUsers.countDocuments({
    _id: { $in: activeUserIds },
    createdAt: { $lt: from },
  })

  return { active: active[0]?.n || 0, new: newUsers, returning }
}
```

Worked example — **Tickets Booked / Revenue** for a window, reusing the pattern already proven
in `overview.ts`:

```js
async function bookingsOverview(days) {
  const from = since(days)
  const [stats] = await BookingsModel.aggregate([
    { $match: { isDeleted: false, status: BookingStatus.CONFIRMED, createdAt: { $gte: from } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$total" },
        totalTickets: {
          $sum: { $reduce: { input: "$tickets", initialValue: 0, in: { $add: ["$$value", "$$this.quantity"] } } },
        },
        bookingsCount: { $sum: 1 },
      },
    },
  ])
  return stats || { totalRevenue: 0, totalTickets: 0, bookingsCount: 0 }
}
```

Every other row in §3.2 follows the same shape: pick the collection, pick the date field,
`$match` on `{ $gte: since(days) }`, `$group`/`$count`/`$sum` as needed. Reuse
`sendResponse`/`ensureDbConnected`/admin-guard patterns already established in
[src/pages/api/analytics/overview.ts](src/pages/api/analytics/overview.ts) if you expose this
as an endpoint (see §4).

### 3.4 Visitor & engagement signals — the population §3.2 doesn't count

§3.2's "Active/New/Returning Users" are all **identity-based** (registered `EventUsers`/`Users`).
That silently drops the biggest group on any ticketing funnel: **anonymous visitors who never
sign up** — people who saw an event page, maybe started checkout, and left. Your pasted mobile
report has the same blind spot (it has no guest/anonymous row at all). This repo already tracks
that population in detail via `anonId` (see `ANALYTICS_SCHEMA.md`), so it's worth surfacing
rather than leaving invisible:

| Metric | Definition | Collection(s) | Notes |
|---|---|---|---|
| Total Visitors (auth + guest) | Distinct `sessionId` in window | `usersessions` | This is the true "everyone who showed up" number — bigger than Active Users, which only counts identified accounts. |
| Guest Visitors | Distinct `anonId` where `isLoggedIn: false` in window | `usersessions` | People §3.2 never counts at all. |
| Guest → Signup Conversion % | `% of window's guest anonIds that ever had an isLoggedIn:true session` | `usersessions` | Query already written in `ANALYTICS_SCHEMA.md` §"Guest → signup conversion". This is your real top-of-funnel health metric — a drop here explains a drop in New Users before New Users itself moves. |
| Bounce Rate | `% of sessions with pageCount <= 1` | `usersessions` | Already computed in `overview.ts`. |
| Avg Session Duration / Dwell Time | `avg(usersessions.duration)`; per-page via `avg(pageviews.timeSpent)` | `usersessions`, `pageviews` | Falling engagement often precedes falling conversion — worth trending alongside bookings, not just as a footnote. |
| CTA Clicks (named) | Count grouped by `dataTrack`, `timestamp` in window | `analytics_web_clicks` | Only populated where `data-track="..."` is present on an element — coverage depends on instrumentation, not just traffic. |
| Rage Clicks | Count where `isRageClick: true`, `timestamp` in window, grouped by `page` | `analytics_web_clicks` | Frustration signal — 3+ clicks within 50px in 1s. High rage-click count on a checkout page is a leading indicator, not a lagging one. |
| Dead Clicks | Count where `isDeadClick: true` | `analytics_web_clicks` | Clicks on things that don't do anything — often a broken button or a misleading non-interactive element. |
| Scroll Depth | `avg(maxDepthPct)` and count reaching each milestone (25/50/75/100), grouped by `page` | `analytics_web_scroll` | Tells you whether people are actually reading the event page or bailing above the fold. |
| Form Interactions | Count of `focus` vs `submit` by `formName`, `interactionType` in window | `analytics_web_forms` | `submit / focus` per form ≈ abandonment rate. Field **values** are never stored (privacy), only which fields/forms were touched. |
| Event-page Funnel Drop-off | `view → ticket_select → booking_start → booking_complete`, sessions per stage, `timestamp` in window | `eventinteractions` + `bookings` | Existing `GET /api/analytics/journey/funnel?eventId=` already computes this per-event; aggregate across all events for the window. |

Query pattern (same `since(days)` helper as §3.3) for guest conversion:

```js
async function guestConversion(days) {
  const from = since(days)
  const guestAnonIds = await UserSession.distinct("anonId", {
    startTime: { $gte: from },
    isLoggedIn: false,
    anonId: { $ne: null },
  })
  const converted = await UserSession.countDocuments({
    anonId: { $in: guestAnonIds },
    isLoggedIn: true,
  })
  return { guests: guestAnonIds.length, converted, rate: guestAnonIds.length ? converted / guestAnonIds.length : 0 }
}
```

Rage/dead clicks and scroll depth per page:

```js
async function frictionSignals(days) {
  const from = since(days)
  const [rage, dead, scroll] = await Promise.all([
    WebClick.aggregate([
      { $match: { isRageClick: true, timestamp: { $gte: from } } },
      { $group: { _id: "$page", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    WebClick.countDocuments({ isDeadClick: true, timestamp: { $gte: from } }),
    WebScroll.aggregate([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: "$page", avgDepth: { $avg: "$maxDepthPct" } } },
    ]),
  ])
  return { rage, dead, scroll }
}
```

Whether these belong *in* the CEO email or in a linked dashboard is a judgment call — a daily
email with 25+ rows stops getting read. My suggestion: keep the email to Active/New/Returning +
Guest Visitors + Guest→Signup% + Bookings/Revenue/Tickets (the numbers that move a business
decision), and link out to the admin analytics dashboard (`/console/analytics`, already built)
for rage clicks / scroll depth / funnel drop-off — those are diagnostic, not headline, metrics.

---

## 4. Part 3 — Merging both into one CEO email

The two systems sit on different databases (Firestore vs MongoDB), so there is no single query
that produces the combined table. Three ways to merge, in order of how much they cost to build:

**Option A — this repo exposes a summary endpoint, the mobile app's Cloud Function calls it (recommended).**
Add `GET /api/analytics/ceo-report-summary` here, returning exactly the §3.2 rows for all four
windows in one JSON payload. Protect it with a service-to-service secret (a header checked
against an env var), not admin session auth, since the caller is a Cloud Function, not a
browser. The Cloud Function that builds the email today fetches this JSON and appends an
"Events" section to the table it already sends. Lowest lift, no new infrastructure, and keeps
each system as the source of truth for its own data.

**Option B — this repo pushes instead of the Cloud Function pulling.**
A Vercel Cron job in this repo computes §3.2 daily and writes it to a Firestore doc (or POSTs to
a Cloud Function HTTP endpoint) that the report already reads when composing the email. Same
result as A, inverted direction — pick this only if the mobile side genuinely cannot make
outbound HTTP calls to Vercel (e.g. Cloud Functions egress restrictions).

**Option C — unify both into a warehouse (BigQuery), report reads one place.**
Bigger lift: export MongoDB collections (via a scheduled job or MongoDB's own BigQuery
connector) alongside the Firebase Analytics/Firestore export you may already have. Only worth
it if you're going to build more cross-system reporting beyond this one email — don't do this
just for one daily table.

**Before building any of these:** confirm the time-zone/day-boundary convention the current
report uses (this repo's own analytics APIs bucket days via `setHours(0,0,0,0)` in the server's
local time — check whether the mobile report buckets by UTC, a fixed business time zone, or
something else, or the two "24h" columns won't line up).

---

## 5. Open questions to resolve with the mobile-app side

1. Is the current report driven by raw Firestore queries or a Firebase Analytics → BigQuery
   export? This determines whether Part 1's collection names are even the right kind of source.
2. What exactly breaks in the 60-day "Returning Users" query (§1)? Worth fixing regardless of
   the events-integration work.
3. Does "Event Tickets Booked" in the existing report already come from this repo's `Bookings`
   collection, or from a separate Firestore mirror? If the mobile app's ticketing UI reads/writes
   the same `events` collection documented in `TICKET_SCHEMA.md`, that row may need to be
   *replaced* by Part 2's numbers rather than added alongside them, to avoid double-counting.
4. What day-boundary/time-zone does the existing report use, per §4.
5. Does the mobile app track **anonymous/pre-signup activity** at all (app opens before login,
   screens viewed before signing up)? Firebase Analytics can via the installation ID even
   without Firebase Auth identity, but it's a separate question from whether anyone is
   currently reading that data. If not, §3.4's guest-visitor and guest→signup-conversion numbers
   would be the *first* pre-signup visibility either system has — worth deciding if that's wanted
   in the daily email or just in a dashboard.
