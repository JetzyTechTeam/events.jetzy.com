# Booking flow — complete contract for the mobile app (front-end + back-end)

**Revision 2 — 2026-11-11.** Written for the mobile front-end and back-end engineers.
Revision 1 was 2026-10-15. **Start with §0** — it lists everything that changed since Revision 1
and the work the app still has to do. Companion document for tickets: `TICKET_SCHEMA.md`
Revision 6.

The mobile back-end builds **its own API** on the **same MongoDB** and the **same Stripe account**
as this web portal (`events.jetzy.com`). Everything below is what that API must do so that a
booking approved, edited or cancelled in the app is **indistinguishable** from one handled on the
web: the same documents, the same statuses, the same Stripe calls, the same amounts charged.

**Who builds what:**

| Part | Built by |
|---|---|
| **Buying a ticket** — checkout, Stripe payment page, creating the booking, the booking webhooks | **The web. Not the app.** The app sends the buyer to our web page (§5.0) and reads the booking back from the database. §5 is here so you understand the documents it creates. |
| Approve / approve fewer / reject (§7), edit (§8), cancel / delete (§9), waiting list (§10), check-in (§11), all the lists and screens (§13–14) | **The app** (front-end + back-end), following this document. |

How to read it:

- **MUST / MUST NOT** are hard rules. Most of them exist because breaking them charges someone the
  wrong amount, and **this platform issues no refunds** — there is no way to repair it afterwards.
- Every rule names the web file that implements it (`src/…`). When this document and the code
  disagree, the code wins — tell us and we will fix the document.
- Helper functions in §4 are given as TypeScript. **Port them line for line**; most of the edge
  cases live in them.
- `TICKET_SCHEMA.md` remains the contract for the **ticket** sub-document (`events.tickets[]`:
  price, `requireApproval`, `memberships`, `membershipInterval`, `membershipFreeMonths`,
  `quantity`) and for **availability counting** (§10–11). This document covers everything that
  happens to a **booking**. `TICKET_SCHEMA.md` §12–13 are **superseded** by §7–§8 here.

---

## Contents

0. [Handoff — what changed in Revision 2, and what the app must build](#0-handoff)
1. [Rules that must never break](#1-rules-that-must-never-break)
2. [Roles and permissions — admin vs host vs guest](#2-roles-and-permissions)
3. [Data model](#3-data-model)
4. [States and the helpers to port](#4-states-and-the-helpers-to-port)
5. [Checkout — creating a booking](#5-checkout--creating-a-booking)
6. [Capacity](#6-capacity)
7. [Approvals — approve, approve fewer, reject, expiry](#7-approvals)
8. [Editing a booking — name and ticket quantity](#8-editing-a-booking)
9. [Cancellation and deletion](#9-cancellation-and-deletion)
10. [Waiting list](#10-waiting-list)
11. [Check-in](#11-check-in)
12. [Emails and notifications](#12-emails-and-notifications)
13. [Guest-facing reads](#13-guest-facing-reads)
13b. [Host / admin screens — the Bookings module](#13b-host--admin-screens--the-bookings-module)
13c. [Describing a booking's memberships](#13c-describing-a-bookings-memberships--one-wording-everywhere-rev-2)
14. [Mobile front-end checklist](#14-mobile-front-end-checklist)
15. [Mobile back-end checklist](#15-mobile-back-end-checklist)
16. [Test scenarios](#16-test-scenarios)
17. [Known gaps](#17-known-gaps)
18. [Changelog vs TICKET_SCHEMA.md Revision 5](#18-changelog)

---

## 0. Handoff

### 0.1 What changed since Revision 1 (2026-10-15)

Every change below is now written into the section it belongs to. This list tells you where to
look.

| # | Change | Where | Affects |
|---|---|---|---|
| 1 | **Full Concierge includes Jetzy Premium.** A Concierge member counts as a Premium member everywhere. A pending Premium membership row is **released, not started**, when the guest holds Concierge or a Concierge row on the same booking is being started. | §3.6, §7.1 step 6.3, §7.4a | approve |
| 2 | **Concierge sells yearly** as a separate Stripe product. Detect a membership by **any** of its product ids. | §3.6, §7.4 | approve, reads |
| 3 | **A yearly ticket upgrades a monthly Concierge member.** New field `payment.memberships[].upgradeFrom`. Approve re-checks Stripe and either replaces the monthly subscription, starts a new one, or releases the row. | §3.3, §7.1 step 6.3, §7.4 | approve, screens |
| 4 | **A cancelled member buying a membership ticket keeps the membership.** When a booking is **confirmed**, a membership the ticket sells that the guest had cancelled is switched back on (unless this order charged for it). | §7.4b | approve |
| 5 | **Separate welcome email** for a membership a booking **creates**. | §7.4, §12 | approve |
| 6 | **Membership wording helpers** — one way to describe a booking's memberships on every screen and email. | §13c | all screens |
| 7 | **Cancelling never cancels a membership**, and the cancel dialog / emails now say so. | §9.1, §13c | cancel |
| 8 | **More Stripe ids are stripped** from every client-facing booking response. | §13 | all reads |
| 9 | **Admin approval notices go to `ADMIN_NOTIFICATION_EMAIL`** (was the sender address, which silently dropped them). | §12 | emails |
| 10 | Corrected: the "does the customer already subscribe?" check before **creating** a subscription accepts `active`/`trialing` only; the wider four-status list belongs to the double-subscribe guard. | §5.3, §7.4 | approve |
| 11 | New helper `canGuestCancel`. | §4.3 | guest cancel |
| 12 | Every created membership writes one row to `membership_purchases`, and a Concierge one is mirrored to selectmember.jetzy.com. | §3.6, §7.4 | approve |

### 0.2 What the app must build — in order

Ticket **buying** stays on the web (§5.0). Everything else here is the app's job.

**Back-end**

1. [ ] **Approve** — §7.1, all eleven steps, including the membership resolution in step 6.3
   (Concierge-includes-Premium, upgrade re-check) and step 9b (reactivation). Highest risk: it
   moves money.
2. [ ] **Start a membership** — §7.4 (`startMembershipSubscription`) and §7.4a
   (`heldMemberships`). Shared by approve; nothing else in the app creates subscriptions.
3. [ ] **Reject** — §7.5.
4. [ ] **Edit a pending request** — §8.2. **Edit a confirmed booking** — §8.3 + §8.4.
5. [ ] **Cancel** — §9.1. **Delete** — §9.2.
6. [ ] **Waiting list** — join / list / approve / remove, §10.
7. [ ] **Check-in** — §11.
8. [ ] **Reads** — my bookings, booking by reference, my booking for one event, an event's
   bookings with filters, pending count, counters, availability — §6, §13, §13b. Strip the ids in
   §13 from every response.
9. [ ] **Emails** — the triggers in §12. Either call the web's templates' equivalents or send your
   own with the same content. **Never send hold-expiry emails** (the web's webhook does).
10. [ ] **Do not** handle Stripe booking webhooks (§15).

**Front-end**

1. [ ] Hand off to the web for buying, and come back (§5.0).
2. [ ] One Bookings screen per event: Bookings · Waiting List · Approvals tabs (§13b), the
   Approvals tab shown by `showApprovalsSurface`.
3. [ ] Approvals queue + approve sheet (§14), with "Approve N of M" (§7.2) and the charge preview
   from `approvalCaptureCents`.
4. [ ] One Edit sheet for every booking (§8, §14).
5. [ ] Cancel dialogs that state the money consequence **and** the membership note (§9.1, §13c).
6. [ ] Guest: My bookings, cancel, "you're registered" on the event (§13).
7. [ ] Describe memberships only through the §13c helpers.

**Port these files line for line** (they are pure, no database): `booking-status.ts`,
`booking-cancellation.ts` (§4.3), `booking-memberships.ts` (§3.3), `booking-approval.ts` (§7.3,
§7.6), `booking-request-edit.ts` (§8.6), `ticket-approval.ts` (§13b.2), `booking-membership-display.ts`
(§13c), `memberships.ts` registry (§3.6).

---

## 1. Rules that must never break

1. **No refunds. Ever.** Never call `stripe.refunds.create`. Every charge lands in Jetzy's own
   balance (no Stripe Connect) and Stripe keeps its fee on a refund. Cancelling a booking whose
   money was **captured** keeps the money and says so to the guest.
2. **Releasing an uncaptured hold is NOT a refund** — it costs nothing and the guest was never
   charged. It MUST always happen when a held request is rejected, cancelled or deleted
   (`stripe.paymentIntents.cancel`).
3. **Never capture more than the hold.** Stripe refuses it anyway. A paid request can be approved
   for **fewer** tickets, never more. There is no way to add tickets to a paid booking without
   the guest paying again.
4. **A PENDING request does not hold a seat.** Seats are consumed at approval. A ticket with 3
   seats may collect four requests for 2 each.
5. **One membership per ORDER, not per ticket.** A Premium ticket × 2 sells one membership,
   charged once. Changing the ticket count never changes how many memberships exist.
6. **`booking.total` is what the TICKETS cost. `booking.payment.amount` is what the CARD was held
   for or charged** (tickets + any membership's first period). Never use one for the other.
7. **`status` is not a closed set.** `checked_in` is written by the mobile app today. Decide
   "live" by **exclusion** (not cancelled / rejected / failed), never by an allow-list.
8. **`customerEmail` is not lower-cased in the database.** Every lookup by email MUST be
   case-insensitive (`{ $regex: "^<escaped>$", $options: "i" }`).
9. **`isDeleted: { $ne: true }`, never `isDeleted: false`** when counting or listing. Rows written
   by other clients may carry no `isDeleted` field at all.
10. **Absent ≠ empty ≠ false.** Many fields have no default on purpose (audit trails, plans,
    `requireApproval` on a ticket). Don't write `[]`, `0` or `false` where the field was absent.
11. **Money is decided on the server from the EVENT record**, never from prices or flags in the
    request body.
12. **Cancelling, rejecting or deleting a booking never touches a membership subscription.** Once
    a membership exists it is the member's, managed at Manage membership.
13. **Premium = `premiumSubscription.active` OR `conciergeSubscription.active`.** Full Concierge
    includes Jetzy Premium. Never charge or start Premium for a Concierge member.
14. **Never put a Stripe id in a response to a client** (full list in §13).

---

## 2. Roles and permissions

User roles: `"user"`, `"admin"`, `"super admin"`. **Admin** below means `admin` **or** `super
admin`.

**Host** means a non-admin user who **owns the event**: `String(event.ownerId) === String(user._id)`.
An event with no `ownerId` (created before ownership existed) is manageable by **admins only**.

**Guest / booker** is whoever the booking belongs to: `booking.bookerUserId === user._id`, **or**
`booking.customerEmail` equals the user's email case-insensitively. (`src/lib/booking-identity.ts`)

| Action | Guest (booker) | Host (own events only) | Admin (any event) |
|---|---|---|---|
| Book a ticket (login optional) | ✅ | ✅ | ✅ |
| See their own bookings | ✅ | ✅ | ✅ |
| Cancel their own booking | ✅ until the event **starts** | — | — |
| Cancel via the emailed link, not logged in (`bookingRef` = bearer) | ✅ until start | — | — |
| List an event's bookings / guests / waiting list | ❌ | ✅ | ✅ |
| Approve / reject a request | ❌ | ✅ | ✅ |
| Approve **fewer** tickets than requested | ❌ | ✅ | ✅ |
| Edit a **pending request** (name, ticket quantity) | ❌ | ✅ | ✅ |
| Edit a **confirmed booking** (name; quantity only if free) | ❌ | ✅ | ✅ |
| Cancel any booking at any time (even after start) | ❌ | ✅ | ✅ |
| Delete a booking record | ❌ | ✅ (API) — see §9 | ✅ |
| Check guests in | ❌ | ✅ | ✅ |
| Approve someone off the waiting list | ❌ | ✅ | ✅ |
| Put a membership (Premium / Concierge) on a ticket | ❌ | ❌ | ✅ |

The booking rules are **identical for host and admin** on an event they may manage. The only
differences:

- **Scope:** an admin may act on every event; a host only on events they own. Every host
  endpoint MUST load the event and check ownership **before** doing anything else (and before any
  Stripe call). Reference block, used in ~38 web routes:
  ```ts
  const isAdmin = role === "admin" || role === "super admin"
  if (!isAdmin && String(event.ownerId) !== String(user._id)) return 403
  ```
- **Notifications** route differently (§12): on a host-owned event the host is told; on an
  admin-owned event the Jetzy inbox is.
- **Audit fields** record who acted: `"admin"` or `"host"` (§3).
- Only admins see or set membership options on tickets (ticket form; `TICKET_SCHEMA.md` §6).

---

## 3. Data model

Database: `NEXT_EVENTS_DB_URL`. Mongoose models (collection names are Mongoose's pluralised
lower-case of these):

| Model | Purpose | Source |
|---|---|---|
| `Bookings` | one document per order / request | `src/models/events/bookings.ts`, `types.ts` |
| `Events` (`tickets[]` embedded) | the event and its ticket types | `src/models/events/index.ts` |
| `CheckIn` | one per booking, created at first check-in | `src/models/checkIn.ts` |
| `EventTracker` | `bookedTickets` counter — a **mirror only** | `src/models/events/event-tracker.ts` |
| `ReferralCodes` | `usageCount` / `maxUses` per event | `src/models/events/referral-codes.ts` |
| `WaitingList` | waiting-list entries | `src/models/waitingList.ts` |

### 3.1 Booking document

```jsonc
{
  "_id": ObjectId,
  "bookingRef": "JZ-<20 chars>",        // UNIQUE index. The public id: QR code, emails, cancel link.
  "eventId": ObjectId,
  "bookerUserId": ObjectId,             // optional — the LOGGED-IN user at checkout, if any
  "checkoutUserId": ObjectId,           // optional — the Users account behind the CHECKOUT EMAIL (guests too)
  "tickets": [ { "ticketId": ObjectId, "quantity": 2 } ],  // ticketId = events.tickets[]._id. Empty = register-only booking.
  "status": "pending",                  // §4.1
  "customerName": "Mira Haleem",        // required; editable by host/admin (§8)
  "customerEmail": "Mira@Example.com",  // required; NOT lower-cased (rule 8); never editable
  "customerPhone": "…",                 // required (may be "")
  "subTotal": 100,                      // tickets before discount
  "discountAmount": 50,                 // referral discount, in dollars
  "total": 50,                          // what the TICKETS cost (rule 6)
  "tax": 0,                             // always 0
  "referralCode": "SPRING",             // optional — the code string used
  "referralDiscountPercentage": 50,     // optional, no default
  "premiumMemberDiscountApplied": false,// legacy, retired feature — write false or leave
  "premiumMemberDiscountPercentage": 0, // legacy — never write for new bookings
  "customAnswers": [ { "questionId": "q1", "answer": "…" } ],
  "acceptedTerms": true, "acceptedTermsAt": ISODate,
  "payment": { … },                     // §3.2 — ABSENT on a plain free booking
  "cancelledAt": ISODate, "cancelledBy": "guest" | "host" | "admin",   // set on cancel only

  // ---- Edits (§8). No defaults on any of these: absent = never edited. ----
  "adjustedTickets": [ { "ticketId": ObjectId, "quantity": 1 } ],  // the LOWER number a host plans to approve (pending only)
  "adjustedTicketsAt": ISODate, "adjustedTicketsBy": "host" | "admin",
  "ticketsEditedAt": ISODate, "ticketsEditedBy": "host" | "admin",
  "ticketsEditHistory": [ { "at", "by", "byUserId", "from": [ {ticketId, quantity} ], "to": [ … ] } ],
  "customerNameEditHistory": [ { "at", "by", "byUserId", "from": "Old name", "to": "New name" } ],

  "isDeleted": false,
  "createdAt": ISODate, "updatedAt": ISODate
}
```

`bookingRef` format: `"JZ-" + 20 random alphanumerics`. It MUST be unique (there is a unique
index); generate it before creating the Stripe session so the session metadata can carry it.

### 3.2 `booking.payment` — money state

```jsonc
"payment": {
  "provider": "stripe",
  "checkoutSessionId": "cs_…",          // NEVER send to a client
  "paymentIntentId": "pi_…",            // NEVER send to a client. Absent when no PaymentIntent exists.
  "paymentMethodId": "pm_…",            // ONLY on a setup-mode session (free ticket + free months, §5.3 E2)
  "captureMethod": "manual",            // "manual" on an approval hold, else "automatic"
  "status": "authorized",               // §4.2 — ABSENT when no money moved
  "amount": 120,                        // what the CARD is held for / was charged (tickets + memberships)
  "currency": "usd",
  "authorizedAt": ISODate, "authExpiresAt": ISODate,   // holds only
  "capturedAt": ISODate, "canceledAt": ISODate,
  "lastError": "…",
  "memberships": [                      // §3.3 — only when the order sold a membership
    { "key": "premium", "status": "pending", "amount": 10, "priceId": "price_…",
      "interval": "month", "trialMonths": 1, "renewalAmount": 10, "subscriptionId": "sub_…", "lastError": "…" },
    { "key": "concierge", "status": "pending", "amount": 595, "priceId": "price_…", "interval": "year",
      "upgradeFrom": { "subscriptionId": "sub_…", "customerId": "cus_…", "paidThrough": "2026-12-01T00:00:00.000Z" } }
  ],
  // Legacy single-membership shape (bookings from before Concierge). READ it, never write it:
  "premiumStatus": "pending", "premiumAmount": 20, "premiumPriceId": "price_…", "premiumInterval": "month", "subscriptionId": "sub_…"
}
```

**A plain free booking has no `payment` at all.** A free ticket whose membership is also free for a
while has a `payment` with `memberships` and `paymentMethodId` but **no `status`**.

### 3.3 `payment.memberships[]`

One row per membership the order sold (`key`: `"premium"` or `"concierge"`; `key` has no enum —
store unknown values, ignore them on read).

| Field | Meaning |
|---|---|
| `status` | `pending` (held / paid, subscription not created yet) · `active` (subscription exists, or the buyer already had one) · `failed` (money taken, subscription could not be created — someone is owed one) |
| `amount` | this membership's share of `payment.amount` — the first period. **0** when it was given free (`trialMonths`) |
| `priceId`, `interval` | the exact price quoted. **Stored, never re-resolved** — a price change while a request waits must not move the buyer |
| `trialMonths`, `renewalAmount` | free months given, and what it renews at afterwards |
| `subscriptionId`, `lastError` | after creation / failure |
| `upgradeFrom` | **(Rev 2)** present only when this row moves a **monthly** member onto **yearly** billing: `{ subscriptionId, customerId?, paidThrough? }` — the monthly subscription to replace, the Stripe customer it lives on (may be selectmember.jetzy.com's), and the end of the month already paid for (ISO). No default; absent = an ordinary sale. Upgrade rows never carry `trialMonths`. Client responses keep only `paidThrough` (§13). |

A row can also end up `status: "active"` with `amount: 0` and no `subscriptionId`: the guest
already held that membership at approval (or another row on the same booking includes it), so
that part of the hold was released and nothing was created. §13c calls this kind `held` /
`included`.

Read with this (legacy flat fields → one synthesised `premium` row):

```ts
const bookingMemberships = (payment) => {
  if (!payment) return []
  if (Array.isArray(payment.memberships) && payment.memberships.length > 0) return payment.memberships
  if (payment.premiumStatus) return [{ key: "premium", status: payment.premiumStatus, amount: payment.premiumAmount,
    priceId: payment.premiumPriceId, interval: payment.premiumInterval, subscriptionId: payment.subscriptionId }]
  return []
}
const bookingMembershipTotal = (payment, rows = bookingMemberships(payment)) =>
  Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100
```
(`src/lib/booking-memberships.ts`)

### 3.4 `CheckIn` (one per booking)

`bookingId` (unique), `eventId`, `bookingRef`, `customerEmail`, `customerName`, `totalTickets`,
`checkedInCount`, `isFullyCheckedIn`, `checkInHistory[] {count, timestamp, adminId, adminName}`,
`firstCheckInAt`, `lastCheckInAt`. **It copies the name and ticket total at first check-in**, so
edits must keep it in step (§8.4) and cancellation deletes it (§9).

### 3.5 `EventTracker.bookedTickets`

A running counter the mobile app and admin portal read. **It is NOT what capacity is decided
from** (capacity is counted from bookings, §6). Keep it in step anyway:

- `+ticket count` when a booking becomes **CONFIRMED** (checkout or approval). Never for PENDING.
- `−count` (clamped at 0) when a CONFIRMED booking is cancelled or deleted.
- `±delta` (clamped at 0) when a CONFIRMED booking's quantity is edited.
- No tracker row → do nothing (never upsert one).

Clamped update used on the web (`src/lib/event-tracker-sync.ts`):
```js
EventTracker.findOneAndUpdate({ eventId },
  [{ $set: { bookedTickets: { $max: [0, { $add: [{ $ifNull: ["$bookedTickets", 0] }, delta] }] } } }])
```

### 3.6 Memberships — registry, user fields, sale records (Rev 2)

Only **approve** (§7) creates or changes membership subscriptions in the app. This is what it
reads and writes.

**Registry** (`src/lib/memberships.ts` — port it; nothing else may hardcode a product):

| key | label | receipt label | user field | includes | upgrade on ticket | SelectMember plan |
|---|---|---|---|---|---|---|
| `premium` | Jetzy Premium | Jetzy Premium membership | `premiumSubscription` | — | no | — (ours) |
| `concierge` | Full Concierge Membership | Full Concierge Membership | `conciergeSubscription` | `["premium"]` | **yes** | `select_monthly` / `select_yearly` |

**Stripe products.** A membership is detected by **product id**, never price id, and by **any**
of its products:

| | Test | Live |
|---|---|---|
| Premium (monthly + yearly prices on one product) | `prod_Uxn2R9FQd5F3sp` | `prod_UzMR33CL777c3R` |
| Concierge monthly | `prod_UjabUJ9OXWhLPJ` | `prod_UlQTOgXS73TAEV` |
| Concierge **annual** (separate product, $595/yr default) | `prod_UlPxrsQgIknFRQ` | `prod_UlQT3lIpJo2PK6` |

`isMembershipProduct(key, productId)` must match **every** id in the row (both modes' ids may sit
in the list — a test id never matches live data). Unknown product → not a membership: leave it
alone.

**On the user document** (`users` **and** `eventusers` — one person can have both; search both,
email case-insensitive):

```jsonc
"stripeCustomerId": "cus_…",            // ROOT — billing identity (older docs may have it only inside a sub-doc)
"premiumSubscription":   { "active": true, "stripeCustomerId": "cus_…", "stripeSubscriptionId": "sub_…",
                           "status": "trialing", "currentPeriodEnd": ISODate, "cancelAtPeriodEnd": false },
"conciergeSubscription": { …same shape… }
```

Customer id read order: `stripeCustomerId` → `premiumSubscription.stripeCustomerId` →
`conciergeSubscription.stripeCustomerId`.

**Entitlement** — never read `premiumSubscription.active` alone:

```ts
const MEMBERSHIP_KEYS = ["premium", "concierge"]
const INCLUDES = { premium: [], concierge: ["premium"] }
const USER_FIELD = { premium: "premiumSubscription", concierge: "conciergeSubscription" }
export const expandEntitlements = (held) => {
  const all = new Set(held)
  held.forEach((k) => (INCLUDES[k] || []).forEach((i) => all.add(i)))
  return MEMBERSHIP_KEYS.filter((k) => all.has(k))
}
export const membershipsIncluding = (key) => MEMBERSHIP_KEYS.filter((o) => (INCLUDES[o] || []).includes(key))
export const isMembershipEntitled = (doc, key) =>
  expandEntitlements(MEMBERSHIP_KEYS.filter((k) => !!doc?.[USER_FIELD[k]]?.active)).includes(key)
```

**`membership_purchases`** — one row per membership **sale**, written once, never updated; the
growth report reads it. Upsert on `stripeSubscriptionId` with `$setOnInsert` (unique sparse index —
a replay must not double-count). Fields: `key`, `source` (`"ticket"` for an approval-started
membership, `"upgrade"` for a monthly→yearly replacement), `email`, `name`, `userId`,
`stripeCustomerId`, `stripeSubscriptionId`, `priceId`, `interval`, `amount` (the price's
`unit_amount / 100`), `currency`, `referralCode` (if the booking had one), `trialMonths`,
`trialEndsAt` (= the subscription's `trial_end`), `eventId`, `bookingRef`, timestamps.

---

## 4. States and the helpers to port

### 4.1 `booking.status`

| Value | Meaning | Written by |
|---|---|---|
| `pending` | awaiting the host's approval | checkout when the ticket requires approval |
| `confirmed` | a real ticket | checkout (no approval), approve, waiting-list approve |
| `cancelled` | cancelled after it was made (guest, host or admin) | cancel |
| `rejected` | the host declined the request | reject |
| `failed` | the card hold **expired** before anyone approved | Stripe webhook / approve |
| `checked_in` | written by the **mobile app** today — treat as live | mobile |
| `approved`, `refunded` | in the enum, **never written**. Don't start. | — |

Transitions:

```
                 ┌──────────── approve ───────────┐
 checkout ──► pending ── reject ──► rejected       ▼
    │            ├── cancel ───► cancelled     confirmed ── cancel ──► cancelled
    │            └── hold expires ──► failed       ▲
    └────────────────────────────── (no approval) ─┘
 Any status ── delete (admin/host) ──► document removed
```

### 4.2 `booking.payment.status`

| Value | Meaning | Next |
|---|---|---|
| *(absent)* | no money moved (free, or free ticket + free months) | — |
| `authorized` | card held, not charged (approval request) | `capturing`, `canceled`, `expired`, `failed` |
| `capturing` | capture in flight — a **latch**, never a resting state | `captured`, `failed`, back to `authorized` |
| `captured` | money taken | stays `captured` even if the booking is cancelled |
| `failed` | a capture attempt failed; booking stays PENDING; **retryable** | `capturing` (retry) |
| `canceled` | hold released by us (reject / cancel / delete) | — |
| `expired` | Stripe let the authorization lapse (~7 days) | — |

### 4.3 Helpers — port these exactly

```ts
// ---- src/lib/booking-status.ts ----
export const isCancelledBooking = (b) => b?.status === "cancelled" || b?.status === "rejected" || b?.status === "failed"
export const isPendingBooking   = (b) => b?.status === "pending"
export const isHoldExpired = (b) => {
  if (b?.payment?.status === "expired") return true
  if (b?.payment?.status !== "authorized" || !b?.payment?.authExpiresAt) return false
  return new Date(b.payment.authExpiresAt) < new Date()
}

// ---- src/lib/booking-cancellation.ts ----
// "free" | "hold" | "captured" | "released" | "unknown"
export const bookingMoneyState = (b) => {
  const status = b?.payment?.status
  if (!b?.payment || !status) return Number(b?.total ?? 0) > 0 ? "unknown" : "free"
  if (status === "authorized" || status === "capturing") return "hold"
  if (status === "captured") return "captured"
  return "released"
}
export const bookingMoneyAmount = (b) => Number(b?.payment?.amount ?? b?.total ?? 0) || 0
// Guest cut-off is the exact start instant. No date (TBD / date poll) = not started.
export const hasEventStarted = (event, now = Date.now()) =>
  !!event?.startsOn && !Number.isNaN(new Date(event.startsOn).getTime()) && new Date(event.startsOn).getTime() <= now
export const EVENT_STARTED_MESSAGE = "This event has already started, so the booking can no longer be cancelled."
// (Rev 2) The guest-side cancel rule. Hosts/admins have no cut-off.
export const canGuestCancel = (booking, event, now = Date.now()) => {
  if (!booking) return { allowed: false, reason: "Booking not found." }
  if (isCancelledBooking(booking)) return { allowed: false, reason: "This booking is no longer active." }
  if (hasEventStarted(event, now)) return { allowed: false, reason: EVENT_STARTED_MESSAGE }
  return { allowed: true }
}
```

`unknown` = a priced total with no payment record (238 legacy rows, and every waiting-list
booking, §10). **Never** show it as "free" and never claim it was charged.

The edit and approval helpers are in §7.6 and §8.6.

---

## 5. Checkout — creating a booking

> **The app does NOT build this section.** Ticket buying happens on our web app. Read §5.0 for the
> handoff; §5.1–5.5 describe what the web does, so you know what the bookings you read look like.

### 5.0 Sending a buyer from the app to the web, and back

1. **Open the event's web page in the system browser** (not a webview):
   `https://events.jetzy.com/<event slug>?src=app` (the event id also works in place of the slug).
   Always add **`src=app`**, for logged-in and logged-out users alike — it is how the web knows to
   offer the way back into the app. (A logged-in hand-off that goes through `/login` with
   `external=true` is also recognised.) Build the slug part URL-encoded — slugs can contain spaces
   and accents.
2. The buyer picks tickets and pays on the web. Paid orders go through Stripe; free ones don't
   leave our site. The web carries the "came from the app" flag through Stripe on its own.
3. On the web's confirmation page, an app buyer sees a **"Return to Jetzy App"** button. It is
   a link the buyer taps — the web never redirects automatically (iOS ignores an automatic
   universal link, and the fallback page is a 404):
   ```
   https://jetzy.com/jetzy_event?eventId=<eventId>&bookingRef=<JZ-…>&status=<confirmed|pending_approval|cancelled>
   ```
   `status=cancelled` means the buyer backed out of payment. The base URL comes from the web's
   `NEXT_PUBLIC_APP_RETURN_URL`; when it isn't set in an environment the button doesn't appear.
4. Back in the app, **re-read the booking from the database** (by `bookingRef`, or the user's
   bookings). The booking is written by the web when Stripe confirms the payment, which can take a
   few seconds — if it isn't there yet, retry briefly rather than showing "no booking".

Reference: `src/lib/app-return.ts`, `src/pages/success.tsx`, `src/pages/cancel.tsx`.

### What the web does (for reference)

Web reference: `src/pages/api/checkout/index.ts` (Stripe), `src/pages/api/checkout/free-events.ts`
(no payment), `src/lib/checkout-fulfillment.ts` (creates the booking after Stripe),
`src/pages/api/webhooks/stripe.ts`.

### 5.1 Checks before anything is created (both paths)

In this order; the first failure is the reply:

1. Event exists and `isDeleted` is not true.
2. Event is **not awaiting admin review**: refuse when `event.privacy === "public"` **and**
   `event.adminApprovalStatus === "pending"` → `"This event is awaiting admin approval and can't
   be booked yet."` (403). (`isPendingAdminApproval`, `src/lib/event-approval.ts`)
3. `acceptedTerms === true` → `"You must agree to the Terms & Conditions to register."`.
4. Buyer has `firstName`, `lastName`, `email`.
5. Create or update the **Users** account behind the checkout email (case-insensitive match) — its
   id is `checkoutUserId`. Non-fatal if it fails.
6. **Referral code** (if any): active, not deleted, under `maxUses`, belongs to THIS event, and
   (if scoped with `ticketIds`) covers at least one selected ticket. Codes are unique **per event**
   — always look up by `{ code: CODE.toUpperCase(), eventId }`. (`src/lib/referral-validation.ts`)
7. **Required custom questions** answered → `Required question "<title>" is missing an answer.`
8. **Membership caps** (tickets that sell Premium/Concierge): at most **2 per order** and **2 per
   email per event per membership**, counting every order that email placed for the event except
   `failed`/`rejected` ones. Cancelled ones still count. (`src/lib/premium-ticket-limit.ts`)
9. **Capacity** (§6). Refusal is a *routing* reply, **`status: true`**, so the app can offer the
   waiting list:
   ```jsonc
   { "status": true, "message": "Only 1 spot is left for \"VIP\". Would you like to join the waiting list?",
     "data": { "atCapacity": true, "availableCapacity": 1, "requestedTickets": 2, "ticketId": "…", "ticketName": "VIP", … } }
   ```
   **Check `data.atCapacity` before `status`.**
10. Stripe minimum: a priced order under **$0.50** is refused.

Prices, approval flags, membership flags, interval and free months are **all read from the stored
event tickets**, never from the request body.

### 5.2 Free or Stripe?

Decided on the **priced total after discount** (`buildTicketPricing`, `src/lib/ticket-pricing.ts`)
and on whether a membership is still owed:

| Situation | Path |
|---|---|
| Total is 0 **and** no membership still owed (none sold, or buyer already holds every one) | **Free path** — no Stripe |
| Total is 0 **but** a membership is still owed (even if its months are free) | **Stripe** (a card must be collected) |
| Total > 0 | **Stripe** |

Two routing replies keep client and server in step (`TICKET_SCHEMA.md` §7a):

- Free path called but a membership is owed → `{ status: false, data: { needsCheckout: true, owed: ["premium"] } }`
  → the app re-submits through Stripe checkout.
- Stripe path called but nothing is chargeable and no free-month membership is involved →
  `{ status: true, data: { freeOrder: true } }` → the app re-submits through the free path.

Each may hop to the other **once**.

### 5.3 The Stripe session shapes

Every session carries `metadata` (≤ 500 chars per value — Stripe rejects the whole session
otherwise): `bookingRef`, `eventId`, `firstName`, `lastName`, `email`, `phone`,
`tickets` (JSON `[{id,name,price,quantity}]`), `requiresApproval` (`"true"`/`"false"`),
`acceptedTerms`, `acceptedTermsAt`, `ticketSubtotal`, `ticketTotal`, optional `bookerUserId`,
`checkoutUserId`, `referralCode`, `referralDiscountPercentage`, `referralSubtotal`, `ans_<questionId>`,
and for memberships `purpose: "ticket+membership"`, `membershipUserId`, `memberships` (JSON lines).

| Shape | When | Key parameters |
|---|---|---|
| **A. Paid now** | priced, no approval, no membership | `mode: "payment"`, `customer_email`, ticket `line_items` (`price` = `ticket.stripeProductId`, which holds a PRICE id) |
| **B. Approval hold** | priced, requires approval, no membership | as A + `payment_intent_data: { capture_method: "manual", metadata: { bookingRef, eventId, requiresApproval } }` + `submit_type: "book"` + `custom_text` saying they won't be charged now |
| **C. Ticket + membership** | a membership still owed with something to charge | `mode: "payment"`, `customer` (one Stripe Customer per user — `resolveStripeCustomerForUser`), ticket lines **plus one `price_data` line per membership first period** (`quantity: 1`), `payment_intent_data.setup_future_usage: "off_session"` (renewals need the card). With approval: also `capture_method: "manual"`. Membership lines given free months are **left out** of `line_items` |
| **D. Free ticket + ONE free-month Premium, no approval** | nothing chargeable, exactly one trial membership, it is Premium, ticket genuinely $0 | `mode: "subscription"`, `line_items: [{ price: <membership priceId> }, ...ticket lines]`, `subscription_data.trial_end`, `subscription_data.metadata.membershipKey` — Stripe creates the subscription |
| **E. Free ticket + free months, other cases** | nothing chargeable, trial membership(s), not D | `mode: "setup"`, `customer`, `setup_intent_data.metadata`, `custom_text` stating what is free, until when, and what is charged after |

Referral discount on Stripe: a **coupon** (`percent_off`, `duration: "once"`, name ≤ 40 chars).
On a membership order, or a code scoped to some tickets, set `applies_to.products` to the ticket
**products** only (read off `stripe.prices.retrieve(priceId).product`), so the code never
discounts Jetzy's membership revenue.

Before adding a membership line, the web decides what the buyer already holds by **checkout
email** (`heldMemberships`, §7.4a — returns entitlements, so a Concierge member holds Premium) and
asks **Stripe** per customer (`hasActiveMembershipSubscription(customerId, key)` — any product of
the membership, statuses **`active` / `trialing` only**). If they hold it, it isn't sold again.
(The separate double-subscribe guard `findActiveSubscriptionForProduct` also counts `past_due` and
`unpaid`.)

What the order charges is split by `splitBundleCharges` (`src/lib/premium-bundle.ts`):
memberships already held are skipped; a membership another one **being charged on this order**
includes is `included` — no line item, no subscription, no `payment.memberships` row (a ticket
selling Concierge + Premium bills Concierge only); a **monthly** Concierge member on a ticket that
sells Concierge **yearly** is an `upgrade` — charged the yearly price with no free months, line
item named "Full Concierge Membership — first year (replaces your monthly plan)", row carries
`upgradeFrom`.

The membership price for a ticket set to annual: the yearly price across **all** the membership's
products if one exists (Premium yearly; Concierge Annual product), else its default monthly price.
(`findMembershipPriceForInterval(key, "year") || getMembershipPrice(key)`; `TICKET_SCHEMA.md` §6)

### 5.4 Fulfilment — turning a finished session into a booking

Triggered by **both** the webhook `checkout.session.completed` (authoritative) and the app's
"payment finished" return (fast path). **Idempotent on `bookingRef`**: look it up first; on a
duplicate-key error (11000) re-read and treat it as already done.

Retrieve the session with `expand: ["payment_intent", "payment_intent.latest_charge",
"invoice.payment_intent", "setup_intent", "subscription"]`, then:

| Flag | Test |
|---|---|
| `isPaidNow` | `session.payment_status === "paid"` |
| `isAuthorized` | not paid, `requiresApproval`, and the PaymentIntent is `requires_capture` |
| settled with no charge | session `complete` and `payment_status === "no_payment_required"` (or a subscription session whose first invoice is $0) |
| none of these | **not payable — create nothing** |

Write the booking:

- `status`: **`confirmed`** if (paid now **or** no money moved) **and** the order does not require
  approval; otherwise **`pending`**.
- `tickets`, names, contact fields, `customAnswers` from metadata.
- `subTotal` / `total` from `metadata.ticketSubtotal` / `ticketTotal` — **never
  `session.amount_total`** (on a membership order that includes the membership).
- `discountAmount` = `referralSubtotal × percent / 100`.
- `payment`: `checkoutSessionId`, `paymentIntentId`, `captureMethod`, `amount` = ticket total +
  sum of membership `amount`s, `currency`;
  - held → `status: "authorized"`, `authorizedAt`, **`authExpiresAt` from
    `latest_charge.payment_method_details.card.capture_before`** (fall back to +7 days);
  - charged → `status: "captured"`, `capturedAt`;
  - **no money moved → no `status`** (so it reads as free);
  - setup session → `paymentMethodId` from the SetupIntent;
  - membership lines → `memberships[]` rows with `status: "pending"`.

Then:

- **Pending (approval):** email the guest "request received" (with the hold amount and expiry),
  notify the approver (§12). Do **not** touch the tracker, do **not** count the referral code.
- **Confirmed:** tracker `+count`, referral `usageCount + 1`, add the buyer to the event's members,
  **start each membership** (§7.4) — a failure there sets that row to `failed` and never undoes
  the booking — reactivate any cancelled membership the ticket sells (§7.4b), send the ticket
  confirmation with QR, a welcome email per membership created (§12), notify the host of the
  sale (§12).

### 5.5 Free path

Rebuild every price from the event (abort on an unknown ticket id or quantity ≤ 0). Refuse unless
the discounted total is exactly 0 and no membership is owed (§5.2). Check capacity. Create the
booking with **no `payment`**, `total: 0`, `status` `pending` (approval) or `confirmed`. Confirmed →
tracker, referral usage **only if the code actually discounted something**, event member, ticket
confirmation, host notice. Pending → request-received email + approver notice.

---

## 6. Capacity

Full spec: `TICKET_SCHEMA.md` §10–11. In short (`src/lib/ticket-availability.ts`):

- Sold = sum of `tickets.quantity` over this event's bookings where
  `isDeleted: { $ne: true }` and `status` **not in** `["cancelled", "rejected", "failed", "pending"]`.
- A register-only booking (no ticket rows) counts as **1** against the event total.
- Ticket limit: `ticket.quantity` (`undefined`/`null` = unlimited, `0` = closed). Event ceiling:
  `event.capacity` (`0`/absent = unlimited). Both apply; the smaller wins.
- Checked at: **checkout** (paid and free), **approval** (with the booking itself excluded, on the
  number actually being approved), **waiting-list approval**, and a **confirmed** booking's
  quantity increase (booking excluded). **Not** checked when a pending request is edited — a
  request holds no seat; approval decides.
- Two buyers can pass the check at the same moment. Accepted — refusing at fulfilment would mean
  taking money and giving no ticket.
- Public read for the UI: `GET /api/events/:eventId/availability` on the web (or compute it the
  same way).

---

## 7. Approvals

Web reference: `src/pages/api/bookings/approve.ts`, `reject.ts`, `src/lib/booking-approval.ts`,
`src/components/console/approvals/*`.

### 7.1 Approve — the exact sequence

Input: `bookingRef`, optional `tickets` (a reduced selection — "approve 1 of 2").

1. **Auth**: logged in; admin, or host of this event.
2. Booking exists and `status === "pending"` → else `"This booking is not awaiting approval."`
3. **Saved plan** (§8.2): `plannedRows = plannedTickets(booking)`. If it is lower than the request:
   - no `tickets` in the body → use the plan as the reduced selection;
   - `tickets` given but any row **above** the plan → 400
     `"This request was edited since you opened it — refresh and try again."`
4. **Validate a reduced selection** (if any): same ticket id set as `booking.tickets`, every
   quantity ≤ stored, total ≥ 1, total ≤ original. If total < original it is a **partial
   approval**: run `partialApprovalRefusal` (§7.6) — a booking spanning more than one ticket type
   is refused.
5. **Capacity** on the number being approved, excluding this booking → `"Cannot approve: <reason>"`.
6. If there is a live hold (`paymentIntentId` and `payment.status` in `authorized | capturing | failed`):
   1. **Latch**: atomic `findOneAndUpdate({ _id, status: "pending", "payment.status": { $in: ["authorized","failed"] } },
      { $set: { "payment.status": "capturing" } })`. No match → `"This request is already being processed."`
   2. **Re-check the plan** on the latched document. If `plannedTickets(latched)` differs from step 3,
      put `payment.status` back to its previous value and refuse
      `"This request was edited while it was being approved — refresh and try again."`
   3. **Which pending membership rows are NOT started now?** (Computed before the latch on the web;
      it only reads. `pendingRows = bookingMemberships(payment).filter(r => r.status === "pending")`.)
      Those rows are **released**, not charged; their `amount`s summed (to the cent) are
      `releasedAmount`.
      - **Ordinary row** (no `upgradeFrom`): skip it when
        `heldMemberships(booking.customerEmail, pendingRows.map(r => r.key))` includes its key
        (§7.4a — entitlements, so a Concierge member skips a Premium row).
      - **Upgrade row** (`upgradeFrom.subscriptionId` set): "already held" can't decide it — the
        guest holds Concierge monthly, that's why it's an upgrade. Re-ask Stripe with
        `liveMembershipSubscriptionsByEmail(email)` (§7.4a):
        - Stripe unreachable (`null`) → start it, replacing `upgradeFrom.subscriptionId`.
        - a live subscription to this membership at the row's interval (`year`) already exists →
          **skip** (they went yearly meanwhile).
        - else `findMembershipUpgrade(email, key, row.interval || "year", live)` → found: start it,
          replacing **that** subscription id; not found (monthly gone): start a fresh one, no
          replacement.
      - **Included row**: after the two rules above, skip any row whose key is included by
        another row that **is** being started (`membershipsIncluding(row.key)` ∩ starting keys) —
        a Premium row beside a Concierge row (bookings held before the Concierge-includes-Premium
        rule).
      - The lookup throws → skip nothing, capture in full, start everything. (Charging for a
        membership we then create is recoverable; refusing the approval is not.)
   4. **Capture** — full: `paymentIntents.capture(pi)`; with a membership released or a partial
      approval: `paymentIntents.capture(pi, { amount_to_capture })` using **`approvalCaptureCents`**
      (§7.3).
   5. Capture errors:
      - `payment_intent_unexpected_state` + PI already `succeeded` → treat as captured, continue;
      - … + PI `canceled` → booking `status: "failed"`, `payment.status: "expired"`, stop;
      - … + anything else → put `payment.status` back to `authorized`, stop;
      - any other error → `payment.status: "failed"`, `lastError`, **booking stays pending**,
        stop. The host sees **Retry charge**.
   6. **Only now** apply the reduction to the booking (step 7). **Never write the reduced tickets
      before the capture succeeds**: if you do and the capture fails, the booking is saved with
      fewer tickets and the full hold, and the retry then captures the full hold for fewer tickets —
      an overcharge you cannot refund. (This was a real bug on the web, fixed 2026-10-13.)
   7. `payment.status: "captured"`, `capturedAt`, `amount` = amount actually captured,
      `booking.total = amountCharged − capturedMembershipAmounts`.
7. **Apply a partial reduction** (after capture, or straight away when there was no hold):
   `tickets` = reduced rows (drop zero rows); scale `subTotal`, `discountAmount`, `total` by
   `approved / requested` (round to cents); append to `ticketsEditHistory`, set
   `ticketsEditedAt/By`.
8. **Start memberships** owed (§7.4) — also when there was **no hold** (a free ticket with free
   months; step 6.3's skip rules apply here too, they are not hold-only). For each pending row:
   - **skipped** in 6.3 → row `status: "active"`, `amount: 0`; nothing created.
   - else `startMembershipSubscription({ key, priceId: row.priceId, interval: row.interval,
     trialMonths: row.trialMonths, customerId, paymentMethodId, email: booking.customerEmail,
     name: booking.customerName, subscriberId: booking.bookerUserId, metadata: { bookingRef,
     eventId, approvedAt }, replaces: <id from 6.3, if any> })`.
     - `customerId` = the captured PaymentIntent's `customer`; no hold → resolve/create the
       user's Stripe customer from `checkoutUserId || bookerUserId` (§7.4).
     - `paymentMethodId` = the captured PaymentIntent's `payment_method`, else
       `booking.payment.paymentMethodId` (setup-mode orders).
     - Success → row `status: "active"`, `subscriptionId`, clear `lastError`. If a subscription
       was **created** and it is **not** an upgrade → send the membership welcome email (§12).
     - Throws → row `status: "failed"`, row `lastError`, and `payment.lastError =
       "<label> not started: <message>"`. Continue with the next row.
   - Rows are independent; a failure never undoes the capture or the booking. Before writing,
     normalise a legacy flat-field booking onto `payment.memberships` (`bookingMemberships`).
9. `status: "confirmed"`, save. Tracker `+approved count`.
   **9b. Reactivate** (§7.4b) with `keys` = memberships the booking's tickets sell (from the event's
   stored tickets) and `chargedKeys` = pending rows **not** skipped. Best-effort.
   Add the buyer (`checkoutUserId || bookerUserId`) to the event's members.
10. **Referral usage** `+1` if a hold was captured **or** the booking had any pending membership
    row, and the booking has a `referralCode` — looked up by `{ code: UPPER, eventId, isDeleted:
    false }`.
11. **Emails**: ticket confirmation with QR to the guest (with the partial-approval note, §12; its
    membership lines list only rows this approval actually started, by receipt label); one welcome
    email per membership created (step 8); approval notice to the Jetzy inbox on an admin-owned
    event only.

Response: `{ bookingRef, status, payment: { status, amount, capturedAt }, amountCharged,
requestedTickets, approvedTickets, partial }`.

### 7.2 Partial approval — when it is offered and allowed

- **Server:** any valid reduction is allowed (step 4) — not only one that capacity forces.
  Refused only when the booking has **more than one ticket type** (no per-ticket price is stored,
  so the proportional capture would be wrong) or nothing fits at all.
- **A membership on the ticket is NOT a reason to refuse** (it was before 2026-10-14). Membership
  is once per order; the capture formula charges it in full.
- **UI:** when a request doesn't fit what's left (`approvalFit`, §7.6), don't show a plain
  Approve — it can only be refused. Show **"Approve N of M"** if the refusal is null, otherwise the
  refusal message and only Reject.

### 7.3 What a partial approval charges

```ts
// src/lib/booking-approval.ts
export const partialCaptureCents = (ticketPortion, approved, requested) =>
  Math.max(0, Math.round(ticketPortion * (approved / requested) * 100))

export const approvalCaptureCents = ({ held, membershipHeld = 0, membershipKept = 0, approved, requested }) => {
  if (!(Number(membershipHeld) > 0) && !(Number(membershipKept) > 0)) return partialCaptureCents(Number(held) || 0, approved, requested)
  const heldCents = Math.max(0, Math.round((Number(held) || 0) * 100))
  const membershipHeldCents = Math.min(heldCents, Math.max(0, Math.round((Number(membershipHeld) || 0) * 100)))
  const membershipKeptCents = Math.min(membershipHeldCents, Math.max(0, Math.round((Number(membershipKept) || 0) * 100)))
  const ticketHeldCents = heldCents - membershipHeldCents
  const ticketCents = requested > 0 ? Math.max(0, Math.round(ticketHeldCents * (approved / requested))) : ticketHeldCents
  return Math.min(heldCents, membershipKeptCents + Math.min(ticketHeldCents, ticketCents))
}
```

Call it with `held = payment.amount`, `membershipHeld = bookingMembershipTotal(payment, pendingRows)`,
`membershipKept = membershipHeld − releasedAmount`.

| Hold | Approve | Captured | Released |
|---|---|---|---|
| $60 = 3 tickets | 2 | **$40** | $20 |
| $120 = 2 tickets ($100) + Premium month ($20) | 1 | **$70** ($50 + $20) | $50 |
| same, guest already has Premium by approval | 1 | **$50** | $70 |
| $100 = 2 tickets, Premium given free (row `amount: 0`) | 1 | **$50** | $50 |
| $20 = $0 tickets + Premium month | 1 of 2 | **$20** | $0 |

Capturing under the authorization is **not a refund**: Stripe releases the rest at no cost.

### 7.4 Starting a membership — `startMembershipSubscription` (`src/lib/membership-subscriptions.ts`)

Throws on failure; the caller (§7.1 step 8) records it on the row. In order:

1. Refuse if no `customerId` or no `priceId`.
2. **Upgrade only** (`replaces` given): `stripe.subscriptions.retrieve(replaces.subscriptionId)`.
   - `resource_missing` → no replacement; carry on as a plain start.
   - any other error → **throw** ("couldn't read the monthly subscription being upgraded") — falling
     through would see the live monthly plan, say "already subscribed", and leave a member charged
     $595 with no yearly subscription.
   - status not `active` / `trialing` → no replacement.
3. **Duplicate guard.**
   - With a replacement: list the customer's subscriptions; if any **other** `active`/`trialing`
     subscription is on a product of this membership → return `{ created: false }`.
   - Without: `hasActiveMembershipSubscription(customerId, key)` (`active`/`trialing`, any product of
     the key) → return `{ created: false }`.
4. **`trial_end`** (the date of the first real charge):
   - upgrade → `subscriptionPaidThrough(replaced) + 1 × interval` (the paid month is never wasted).
     `subscriptionPaidThrough` = the subscription's `trial_end` if trialing, else
     `current_period_end`.
   - `trialMonths > 0` → now + `trialMonths` months (the gift itself).
   - else → now + 1 × `interval` (the first period was just captured).
5. **Card.** `cardId = paymentMethodId`. On an upgrade with no card, use the customer's
   `invoice_settings.default_payment_method`; still none → **throw** "no card to bill the yearly
   membership on". (SelectMember's backend reads trialing + long trial + no default card as a
   GIFTED membership — an upgrade must always have a card.)
6. Create:
   ```js
   stripe.subscriptions.create({
     customer: customerId,
     items: [{ price: priceId }],                  // the STORED price — never re-resolved
     trial_end: trialEnd,
     ...(cardId ? { default_payment_method: cardId }
                : { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } }),
     metadata: { bookingRef, eventId, approvedAt, membershipKey: key,   // membershipKey REQUIRED — the webhooks key on it,
                 ...(replaced ? { upgradedFrom: replaced.id } : {}) }    // and SelectMember skips its welcome for it
   })
   ```
7. **Upgrade only — stop the old one, after the new one exists** (never before):
   `subscriptions.update(replaced.id, { cancel_at_period_end: true, metadata: { ...replaced.metadata,
   cancelledReason: "upgraded_to_yearly", replacedBy: <new id> } })`. Best-effort: log a failure,
   never roll back the yearly one. Never send SelectMember a `cancelled` for the replaced monthly
   (the web's webhook knows `replacedBy` and stays silent).
8. **Activate on the user** — write `<userField>.{active, stripeCustomerId, stripeSubscriptionId,
   status, currentPeriodEnd, cancelAtPeriodEnd}` and root `stripeCustomerId`, on the account whose
   `stripeCustomerId` is this customer (fallback: Stripe customer's email, case-insensitive, both
   collections — and link the id onto it if it has none), and also on `subscriberId` if given.
   `active` = status `active` or `trialing`.
9. **Concierge only — retire an included Premium**: if the customer has a separate Premium
   subscription (`active`/`trialing`/`past_due`, not already ending), set it
   `cancel_at_period_end: true`, `metadata.cancelledReason = "included_with_concierge"`,
   `metadata.includedWith = "concierge"`. No refund; they keep the period paid for. Best-effort.
10. **Concierge only — mirror to selectmember.jetzy.com** (best-effort, 8 s timeout, never fails
    the approval):
    ```
    PATCH <SELECT_MEMBER_API_URL>/api/v1/subscription/select       (prod https://prod-api.jetzy.com, staging https://test.jetzy.com)
    headers: Content-Type: application/json, x-api-key: <SELECT_MEMBER_API_KEY>
    { "email", "source": "external_portal", "status": "active",
      "plan": "select_monthly" | "select_yearly",                    // from the subscription's price interval
      "externalSubscriptionId": "sub_…", "startedAt": ISO, "expiresAt": ISO(current_period_end) }
    ```
11. **Record the sale** in `membership_purchases` (§3.6), `source: replaced ? "upgrade" : "ticket"`.
    Best-effort.
12. Return `{ created: true, subscriptionId, firstRenewalAt: trialEnd, replacedInterval?, startsAt? }`
    (the last two only on an upgrade, for the receipt).

**Who resolves the Stripe customer when there is no hold** (`resolveStripeCustomerForUser(userId,
email)`): read the user (both collections); existing customer id (read order in §3.6) → use it
and copy it to root if missing; none → `stripe.customers.create({ email, metadata: { userId } })`
and store it at root.

### 7.4a "What does this email already hold?" — port these

```ts
// Every live (active/trialing) membership subscription on ANY Stripe customer with this email.
// null = Stripe couldn't be asked (≠ none). customers.SEARCH, not list — list is exact-match and
// neither site lowercases emails. One person may have a customer on each site.
async function liveMembershipSubscriptionsByEmail(email) {
  const q = email.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  try {
    const customers = await stripe.customers.search({ query: `email:"${q}"`, limit: 10 })
    const found = []
    for (const c of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 100 })
      for (const s of subs.data) {
        if (s.status !== "active" && s.status !== "trialing") continue
        for (const item of s.items.data) {
          const productId = typeof item.price?.product === "string" ? item.price.product : item.price?.product?.id
          const key = MEMBERSHIP_KEYS.find((k) => isMembershipProduct(k, productId))
          if (!key) continue
          found.push({ key, subscriptionId: s.id, customerId: c.id, interval: item.price?.recurring?.interval || "month",
            status: s.status, cancelAtPeriodEnd: !!s.cancel_at_period_end, cancelledReason: s.metadata?.cancelledReason,
            paidThrough: new Date(((s.status === "trialing" && s.trial_end) || s.current_period_end) * 1000) })
          break
        }
      }
    }
    return found
  } catch { return null }
}

// Upgrade = Concierge only, target yearly, a live MONTHLY (a cancelling one counts too, a renewing
// one preferred), and NO live yearly one.
function findMembershipUpgrade(email, key, targetInterval, live) {
  if (key !== "concierge" || targetInterval !== "year" || !live) return null
  const ofKey = live.filter((s) => s.key === key)
  if (ofKey.some((s) => s.interval === "year")) return null
  const monthly = ofKey.find((s) => s.interval === "month" && !s.cancelAtPeriodEnd)
               || ofKey.find((s) => s.interval === "month" && s.cancelAtPeriodEnd)
  return monthly ? { key, subscriptionId: monthly.subscriptionId, customerId: monthly.customerId,
                     paidThrough: monthly.paidThrough.toISOString() } : null
}
```

`heldMemberships(email, scope)` — entitlements the address holds (`src/lib/premium-eligibility.ts`):

1. `users` and `eventusers`, email case-insensitive regex, project only
   `premiumSubscription.active conciergeSubscription.active`. A key is held if `active` on
   **either** doc.
2. Look-up set = `scope` + every membership that includes a scoped key (asking about `premium`
   also asks about `concierge`). For keys in it still not held: `liveMembershipSubscriptionsByEmail`
   — any live subscription of that key counts. `null` → remember "Stripe failed".
3. Still missing and the key has a SelectMember plan (Concierge):
   `GET <SELECT_MEMBER_API_URL>/api/v1/subscription/select/status?email=<encoded>` (same headers as
   §7.4 step 10; failure = no answer). Counts only when `status === "active"` **and** (`isConcierge === true` or
   `includesPremium === true` or `plan` ∈ `{select_monthly, select_yearly}`) — or, only when Stripe
   failed, a bare active with no `plan`. (A bare "active" can be a hotels-only member.)
4. Return `expandEntitlements(held)`.

### 7.4b Reactivating a cancelled membership (`reactivateHeldMemberships`, `src/lib/membership-upgrade.ts`)

Runs when a booking becomes **confirmed** through checkout or approval (the web: paid fulfilment,
free path, approval — so in the app: **approval**). Waiting-list approval does not run it. Never
for a pending request.
Best-effort: log, never throw.

1. `keys` = memberships the booking's tickets sell, minus `chargedKeys` (rows started or upgraded
   on this order).
2. For each key: `live = liveMembershipSubscriptionsByEmail(email)`, rows of that key. Only when
   **every** one is `cancelAtPeriodEnd` (a renewing one = nothing to undo), and excluding ones **we**
   ended (`cancelledReason` `"included_with_concierge"` or `"upgraded_to_yearly"` — switching those
   back on bills Premium twice / revives a replaced plan). Pick the one with the latest
   `paidThrough`.
3. Re-retrieve it; if still `cancel_at_period_end`, `subscriptions.update(id, {
   cancel_at_period_end: false, metadata: { ...metadata, reactivatedBy: bookingRef } })`.

No charge today — the current period is already paid; it renews as before. (Disclosed to the buyer
at web checkout: "Your … was set to end… Booking this ticket keeps it.")

### 7.5 Reject, and a hold that expires

**Reject** (`reject.ts`): auth as approve; booking must be `pending`. If there is a live hold,
`paymentIntents.cancel(pi, { cancellation_reason: "abandoned" })` **before** changing status:

- already `canceled` at Stripe → fine;
- already `succeeded` → **refuse**: set `payment.status: "captured"` and reply
  `"This booking has already been charged. Approve it instead…"` (never strand a real charge);
- other errors → refuse, change nothing.

Then `payment.status: "canceled"`, `canceledAt`, `status: "rejected"`; email the guest (§12).
No tracker change (a pending booking never consumed a seat). No membership is touched: the
decline email says the membership on the request "was not started" — or, on an upgrade row, that
the guest "stays on monthly billing" (`membershipRowsForEmail`, §13c).

**Hold expiry** — handled by the **web's** Stripe webhook for every booking on the shared account.
**The app must not handle it too** (the guest would get two emails). What it does, so you can show
it:
find the booking by `payment.paymentIntentId`; skip if `captured`, `rejected` or `cancelled`. If
`cancellation_reason === "automatic"` → `payment.status: "expired"`, `status: "failed"`,
`canceledAt`, and email the guest ("request wasn't reviewed in time, you were not charged") and the
approver. Otherwise `payment.status: "canceled"`.

`payment_intent.payment_failed` → `payment.status: "failed"` + `lastError` where it was
`authorized`/`capturing`.

### 7.6 Approval helpers

```ts
export const bookingTicketCount = (tickets) => (tickets || []).reduce((s, t) => s + (Number(t?.quantity) || 0), 0)
export const bookingTicketTypeCount = (tickets) =>
  new Set((tickets || []).filter((t) => (Number(t?.quantity) || 0) > 0).map((t) => String(t.ticketId))).size

// "multiple_ticket_types" | "nothing_fits" | null
export const partialApprovalRefusal = (tickets, { seatable }) => {
  if (bookingTicketTypeCount(tickets) > 1) return "multiple_ticket_types"
  if (seatable !== null && seatable < 1) return "nothing_fits"
  return null
}
export const PARTIAL_REFUSAL_MESSAGE = {
  multiple_ticket_types: "This request covers more than one ticket type, so it can't be partly approved. Approve it when more spots free up, or decline it.",
  nothing_fits: "There are no spots left at all, so none of this request can be approved right now.",
}

// Does the request fit what's left? `availability` from §6. Missing = unlimited.
export const approvalFit = (tickets, availability) => {
  const requested = bookingTicketCount(tickets)
  if (!availability) return { requested, seatable: null, fits: true }
  let seatable = null, blockingTicketName
  for (const row of tickets || []) {
    const wanted = Number(row?.quantity) || 0
    if (wanted <= 0) continue
    const info = availability.tickets.find((t) => t.ticketId === String(row.ticketId))
    if (!info || info.remaining === null) continue
    const canSeat = Math.min(wanted, info.remaining)
    seatable = (seatable ?? 0) + canSeat
    if (canSeat < wanted && !blockingTicketName) blockingTicketName = info.name
  }
  if (seatable !== null) {
    const limitedIds = new Set(availability.tickets.filter((t) => t.remaining !== null).map((t) => t.ticketId))
    seatable += (tickets || []).filter((r) => !limitedIds.has(String(r.ticketId))).reduce((s, r) => s + (Number(r?.quantity) || 0), 0)
  }
  if (availability.eventRemaining !== null) seatable = Math.min(seatable ?? requested, availability.eventRemaining)
  if (seatable === null) return { requested, seatable: null, fits: true }
  return { requested, seatable, fits: seatable >= requested, blockingTicketName }
}

// The reduced selection for "approve N of M" (single ticket type only).
export const buildPartialSelection = (tickets, seatable) => {
  const row = (tickets || []).find((t) => (Number(t?.quantity) || 0) > 0)
  return row ? [{ ticketId: String(row.ticketId), quantity: Math.max(0, Math.min(seatable, Number(row.quantity) || 0)) }] : []
}
```

**Judge fit on `plannedTickets(booking)`, not `booking.tickets`** — a request edited down from 3
to 2 needs 2 seats.

---

## 8. Editing a booking

Hosts and admins can correct the **name** on a booking and its **ticket quantity**, from every
screen that lists bookings, through one dialog and one rule. **The email is never editable** —
identity, tickets and memberships follow it; a different email is a different person.

Web reference: `src/lib/booking-request-edit.ts` (rules), `src/pages/api/bookings/update-request.ts`
(pending), `src/pages/api/bookings/update-tickets.ts` (confirmed),
`src/components/console/approvals/EditBookingDialog.tsx` (UI).

### 8.1 The rule table (`bookingEditMode`)

| Booking | Name | Quantity | Applies |
|---|---|---|---|
| Pending, free, no membership | ✅ | **up or down** | changes `tickets` now (still a request) |
| Pending, card hold and/or membership | ✅ | **down only** | saved as a plan (`adjustedTickets`), applied **at approval** |
| Pending, hold spanning >1 ticket type, or membership request with >1 type | ✅ | 🔒 `multiple_ticket_types` | — |
| Pending, `capturing` (approval in progress) | 🔒 | 🔒 `in_progress` | — |
| Pending, hold expired / released | ✅ | 🔒 `hold_gone` (and the UI hides Edit) | — |
| Pending, priced but no payment record | ✅ | 🔒 `unknown_money` | — |
| Confirmed, free, no membership | ✅ | **up or down** | now — capacity on increase, check-in floor on decrease |
| Confirmed, free, sold a membership | ✅ | **down only** | now |
| Confirmed, paid (captured / released / unknown) | ✅ | 🔒 `paid_confirmed` | — |
| Cancelled / rejected / expired | — | — | no Edit at all |

Why "down only" with a hold: Stripe can't capture above the hold, and nothing is refunded.
Why "down only" with a membership: adding tickets would step past the 2-per-person limit
checkout enforces, with nothing paid.

### 8.2 Editing a PENDING request

Reference endpoint: `POST /api/bookings/update-request` `{ bookingRef, customerName?, tickets? }`
(at least one).

1. Auth (admin or host). Booking exists, not deleted, `status === "pending"` →
   else `"This request has already been decided, so it can no longer be edited."`
2. `requestEditMode(booking)`; `in_progress` → refuse everything.
3. **Name** → `normalizeGuestName` (§8.6); if different: `$set customerName`,
   `$push customerNameEditHistory { at, by, byUserId, from, to }`.
4. **Tickets**:
   - `locked` → refuse with `REQUEST_LOCK_MESSAGE[lock]`.
   - `free` → `freeTicketEditRefusal(stored, incoming, event.tickets)`; on change:
     `$set tickets` (stored row order, drop zero rows), `ticketsEditedAt/By`,
     `$push ticketsEditHistory`. No capacity check, no tracker write. `$unset` any plan.
   - `reduce` → `holdPlanRefusal(stored, incoming)`. Equal to the request → `$unset
     adjustedTickets, adjustedTicketsAt, adjustedTicketsBy`. Lower → `$set adjustedTickets` (full
     id set, stored order), `adjustedTicketsAt`, `adjustedTicketsBy`. **Never touch `tickets`,
     `subTotal`, `total`, `discountAmount` or `payment.*`.**
5. **One atomic write**, filtered `{ _id, status: "pending", "payment.status": { $ne: "capturing" } }`.
   No match → `"This request is already being processed — refresh and try again."`
6. Nothing is emailed. The guest is told at approval.

**Why the plan lives beside `tickets` instead of replacing it:** `booking.tickets` must keep saying
what the card is held for until the money moves. Anything that ignores the plan (a stale screen,
a future feature) then charges the full hold for the full tickets — consistent. Rewriting
`tickets` would let a forgetful path capture the full hold for fewer tickets — an overcharge with
no refund. Reject, cancel and hold expiry need no changes because of this.

**Read the plan only through `plannedTickets`.** It ignores a plan that isn't a valid reduction
(wrong ticket id, above the request, booking not pending) and returns the request as made.

### 8.3 Editing a CONFIRMED booking

Reference endpoint: `POST /api/bookings/update-tickets` `{ bookingRef, customerName?, tickets? }`.

1. Auth. Booking exists, not deleted, **not cancelled** (`"This booking is no longer active, so it
   can't be edited."`), **not pending** (pending goes through §8.2 — refuse here).
2. **Name**: any live booking, free or paid. Same normalisation and audit as §8.2.
3. **Tickets** — only when `bookingMoneyState(booking) === "free"`, else
   `REQUEST_LOCK_MESSAGE.paid_confirmed`. Then:
   - `freeTicketEditRefusal(stored, incoming, event.tickets)`;
   - if the booking **sold a membership** (`bookingMemberships(payment).length > 0`) and the total
     **increased** → refuse ("tickets can't be added to it — only fewer");
   - **increase** → capacity check on the new selection, excluding this booking;
   - **decrease** → refuse below `CheckIn.checkedInCount`
     (`"2 guests have already checked in on this booking, so it can't be reduced to 1."`);
   - `$set tickets`, `ticketsEditedAt/By`, `$push ticketsEditHistory`.
   - **Money fields are never recomputed** — no money moved.
4. One write, filtered `{ _id, status: <the status you read> }` (a cancellation in between must win).
5. Tracker `±delta` (only if `status === "confirmed"`).
6. **Keep CheckIn in step** (§8.4). Nothing is emailed; the guest's QR keeps working (it encodes the
   `bookingRef`).

### 8.4 Keeping CheckIn in step

After a confirmed edit, best-effort (never fail the edit for it):

```js
CheckIn.updateOne({ bookingId }, [{ $set: {
  customerName: { $literal: newName },          // $literal: a name starting with "$" would be read as a field path
  totalTickets: newTotal,
  isFullyCheckedIn: { $gte: [{ $ifNull: ["$checkedInCount", 0] }, newTotal] },
} }])
```

(Set only the parts that changed.) Without it, a booking reduced after a partial check-in keeps
reading "Partial" when everyone is in.

### 8.5 How the app shows an edited request

Wherever a pending booking's tickets are shown, show **`plannedTickets(booking)`**, plus
"edited · asked for N" when `isRequestAdjusted(booking)`. The approve screen says "Edited down from
the N they asked for", shows the charge from `approvalCaptureCents` and the released amount, and
the button reads **"Approve 2 of 3"**. The guest's own view keeps showing what they asked for until
approval (that is true until the money moves).

### 8.6 Edit helpers — port exactly

```ts
const ticketRows = (tickets) => (tickets || []).map((t) => ({ ticketId: String(t?.ticketId), quantity: Number(t?.quantity) || 0 }))

export const REQUEST_LOCK_MESSAGE = {
  multiple_ticket_types: "This request covers more than one ticket type, so its quantity can't be changed — the price of each ticket isn't stored separately, so there is no safe way to charge for part of it.",
  in_progress: "This request is being charged right now.",
  hold_gone: "The card hold on this request is no longer active, so its quantity can't be changed.",
  unknown_money: "This request has a price but no payment record, so its quantity can't be changed.",
  paid_confirmed: "This booking has been paid for, so its ticket quantity can't be changed — a payment can't be raised, and payments aren't refunded. Cancel it and ask the guest to book again if the number is wrong.",
  inactive: "This booking is no longer active, so it can't be edited.",
}

// PENDING requests. mode: "free" | "reduce" | "locked"
export const requestEditMode = (b) => {
  const status = b?.payment?.status
  const hasHold = (status === "authorized" || status === "failed") && !isHoldExpired(b)
  const sellsMembership = bookingMemberships(b?.payment).length > 0
  const r = (mode, lock) => ({ mode, ...(lock ? { lock } : {}), hasHold, sellsMembership })
  if (status === "capturing") return r("locked", "in_progress")
  if (status && !hasHold) return r("locked", "hold_gone")
  if (!status && Number(b?.total ?? 0) > 0) return r("locked", "unknown_money")
  if (hasHold || sellsMembership) {
    if (bookingTicketTypeCount(ticketRows(b?.tickets)) > 1) return r("locked", "multiple_ticket_types")
    return r("reduce")
  }
  return r("free")
}

// ANY booking. Adds appliesAt ("approval" | "now") and nameEditable.
export const bookingEditMode = (b) => {
  if (!b || isCancelledBooking(b))
    return { mode: "locked", lock: "inactive", hasHold: false, sellsMembership: false, appliesAt: "now", nameEditable: false }
  if (isPendingBooking(b)) {
    const p = requestEditMode(b)
    return { ...p, appliesAt: "approval", nameEditable: p.lock !== "in_progress" }
  }
  const sellsMembership = bookingMemberships(b?.payment).length > 0
  const base = { hasHold: false, sellsMembership, appliesAt: "now", nameEditable: true }
  if (bookingMoneyState(b) !== "free") return { ...base, mode: "locked", lock: "paid_confirmed" }
  return { ...base, mode: sellsMembership ? "reduce" : "free" }
}

const sameIdSet = (a, b) => {
  const ai = a.map((t) => t.ticketId), bi = b.map((t) => t.ticketId)
  return ai.length === bi.length && new Set(ai).size === ai.length && new Set(bi).size === bi.length && ai.every((id) => bi.includes(id))
}

// A plan for a "reduce" request. Equal to the request = "clear the plan".
export const holdPlanRefusal = (stored, incoming) => {
  const before = ticketRows(stored), after = ticketRows(incoming)
  if (!sameIdSet(before, after)) return "This request changed — refresh and try again."
  const byId = new Map(before.map((t) => [t.ticketId, t.quantity]))
  if (after.some((r) => r.quantity > (byId.get(r.ticketId) ?? 0))) {
    const held = bookingTicketCount(before)
    return `The card is held for ${held} ${held === 1 ? "ticket" : "tickets"}. More can't be added — a hold can't be raised, and payments aren't refunded.`
  }
  if (bookingTicketCount(after) < 1) return "Keep at least one ticket, or decline the request instead."
  return null
}

// THE reader of adjustedTickets.
export const plannedTickets = (b) => {
  const requested = ticketRows(b?.tickets)
  const plan = b?.adjustedTickets
  if (!isPendingBooking(b) || !Array.isArray(plan) || plan.length === 0) return requested
  if (holdPlanRefusal(requested, plan)) return requested
  const planById = new Map(ticketRows(plan).map((t) => [t.ticketId, t.quantity]))
  return requested.map((r) => ({ ticketId: r.ticketId, quantity: planById.get(r.ticketId) ?? r.quantity }))
}
export const isRequestAdjusted = (b) => bookingTicketCount(plannedTickets(b)) < bookingTicketCount(ticketRows(b?.tickets))

// Free bookings / free requests. emptyMessage differs: request → "...decline the request instead."
export const freeTicketEditRefusal = (stored, incoming, eventTickets, opts = {}) => {
  const before = ticketRows(stored), after = ticketRows(incoming)
  if (!sameIdSet(before, after)) return opts.staleMessage || "This booking changed — refresh and try again."
  if (bookingTicketCount(after) <= 0) return opts.emptyMessage || "A booking needs at least one ticket. Cancel it instead."
  const byId = new Map((eventTickets || []).map((t) => [String(t?._id), t]))
  const old = new Map(before.map((t) => [t.ticketId, t.quantity]))
  for (const row of after) {
    const ticket = byId.get(row.ticketId)
    if (!ticket || !(row.quantity > (old.get(row.ticketId) || 0))) continue
    if (Number(ticket.price) > 0) return `"${ticket.name}" is a paid ticket — you can't add seats to it without a payment.`
    if (ticketMemberships(ticket).length > 0) return `"${ticket.name}" sells a membership, so its quantity can't be changed here.`
  }
  return null
}

export const GUEST_NAME_LIMIT = 120
export const normalizeGuestName = (raw) => {
  if (typeof raw !== "string") return { ok: false, message: "Enter a name." }
  const name = raw.replace(/\s+/g, " ").trim()
  if (!name) return { ok: false, message: "Enter a name." }
  if (/[\u0000-\u001F\u007F]/.test(name)) return { ok: false, message: "That name contains characters that can't be used." }
  if (Array.from(name).length > GUEST_NAME_LIMIT) return { ok: false, message: `Keep the name to ${GUEST_NAME_LIMIT} characters or fewer.` }
  return { ok: true, name }
}
```

(`ticketMemberships(ticket)` is the ticket-side resolver from `TICKET_SCHEMA.md` §6.)

---

## 9. Cancellation and deletion

### 9.1 Cancel (`src/pages/api/bookings/cancel.ts`)

Who may cancel:

- **logged in** — admin, the event's host, or the booker;
- **not logged in** — anyone holding the `bookingRef` (the emailed cancel link). Treat it as a
  bearer token.

Rules:

- **Guest / link**: allowed until the event's exact `startsOn` (`hasEventStarted`). No date set =
  still allowed. Refusal: `"This event has already started, so the booking can no longer be cancelled."`
- **Host / admin**: any time. Refused only if already cancelled/rejected/expired.

Steps:

1. Read the money state **before** changing anything (the emails describe it).
2. Live hold (`authorized | capturing | failed`) → `paymentIntents.cancel(pi, { cancellation_reason: "abandoned" })`.
   A failure is logged and does **not** block the cancellation.
3. `$set status: "cancelled", cancelledAt, cancelledBy` (`"admin"` / `"host"` when they are not
   also the booker, else `"guest"`); when the hold was released also
   `payment.status: "canceled", payment.canceledAt`. **A captured payment stays `captured`** — the
   money was taken and is not returned.
4. Delete the `CheckIn` record. Tracker `−count` **only if** the booking was `confirmed`.
5. Emails: the guest's cancellation receipt; a notice to the host **and** the Jetzy inbox (§12).

What the guest is told, by money state:

| State | Copy to show |
|---|---|
| `free` | nothing about money |
| `hold` | "The hold on your card is released. You were not charged." |
| `captured` | "Bookings are non-refundable. Cancelling releases your seat but any payment already made will not be returned." |
| `unknown` | don't claim either — "contact the organiser about any payment" |

**Plus the membership line** (Rev 2), whenever the booking sold one:
`cancellationMembershipNote(bookingMemberships(booking.payment), moneyState, asManager)` (§13c) —
e.g. "$595.00 of this was for Full Concierge Membership, which you keep — cancelling the booking
doesn't cancel the membership. Manage it from Manage membership." On a hold: "The Jetzy Premium
membership on this request will not be started." Show it in the cancel dialog (guest wording, or
`asManager = true` for host/admin) **and** put it in both cancellation emails. Cancelling never
calls Stripe on a subscription.

### 9.2 Delete (`src/pages/api/bookings/delete.ts`)

Removes the document. Admin **or** host by the API; the web shows Delete to admins on the Event
Bookings page and to hosts/admins on the Guests tab. **Prefer Cancel** for a real booking — Delete
is for junk rows and leaves no trace.

- Pending → it is a **decline**: release a live hold first (if the PaymentIntent already
  `succeeded`, refuse: "already been charged"), delete, email the guest the same "not approved"
  notice as Reject.
- Deletes the CheckIn record; tracker `−count` (clamped) if it was confirmed.

---

## 10. Waiting list

Reference: `src/pages/api/waiting-list/*`, model `src/models/waitingList.ts`.

Entry document: `eventId`, `firstName`, `lastName`, `email`, `phone`,
`tickets: [{ ticketId, name, quantity, price }]`, `status` (`"waiting"` by default), timestamps.

| Step | Who | Behaviour |
|---|---|---|
| **Join** | anyone (no login) | Offered when checkout replies `atCapacity` (§5.1). Requires `eventId`, first/last name, email, phone, tickets. **One entry per `(eventId, email)`** — a second join returns the existing entry with `"Already on waiting list"` and `status: true`. Emails the guest a "you're on the list" notice. |
| **List** | host / admin | Entries with `status: "waiting"` for the event, **oldest first**. |
| **Approve** | host / admin | Capacity check for the entry's tickets → create a booking with `status: "confirmed"`, `bookingRef "JZ-…"`, the entry's tickets and contact fields, `subTotal` / `total` from the entry's stored prices, **and no `payment`** → tracker `+count` → set the entry's `status` to `"approved"` (it then drops out of the list) → ticket confirmation to the guest, sale notice to the host. |
| **Remove** | host / admin | Deletes the entry. Nothing is emailed. |

A waiting-list booking on a priced ticket therefore reads as money state **`unknown`** (no card
was ever taken, nothing charged). Don't label it paid or free.

---

## 11. Check-in

Reference: `src/pages/api/check-in/*`. Admin or host.

- Look up by `bookingRef` (starts with `JZ-`, case-insensitive) or by email (case-insensitive),
  `isDeleted: false`.
- **Pending and cancelled/rejected/expired bookings cannot be checked in.** If none of the matches
  is live: `"This booking is not confirmed and cannot be checked in."` An email with several live
  bookings is checked in across them, first booking first.
- The first check-in creates the `CheckIn` document, copying `customerName` and `totalTickets`.
  `isFullyCheckedIn = checkedInCount >= ticket total`.
- Edits keep it in step (§8.4); a confirmed booking can't be reduced below `checkedInCount`;
  cancelling deletes it.

---

## 12. Emails and notifications

"Approver" = **the host** on an event owned by a non-admin; **the Jetzy inbox** on an event owned
by an admin, or when the owner can't be resolved (`src/lib/booking-notify.ts`). A mail failure
MUST NEVER fail a booking, approval, capture or cancellation.

| Trigger | Guest | Host (host-owned event) | Jetzy inbox |
|---|---|---|---|
| Booking confirmed (paid, free, waiting list) | ticket confirmation + QR (+ recurring terms for memberships; "Includes Jetzy Premium" under a Concierge line) | "you made a sale" | `tech@jetzyapp.com` is a second `to` on **every** ticket confirmation, any event |
| **(Rev 2)** A membership was **created** by the booking (instant purchase or approval; paid first period or free months) — not an upgrade, not a reactivation, not one already held | **membership welcome email**, separate from the ticket receipt (`sendMembershipStarted`: amount + interval + next billing date, or "free until <date>" and — with no card — "then it ends unless you add a card") | — | — |
| Request submitted (pending) | "request received" (+ hold amount and expiry; membership sentence: new / free months / upgrade) | approval request with a link to Approvals, quoting the **full** hold (ticket + membership first periods) and itemising memberships | approval request — admin-owned event, or owner not resolvable |
| Approved | ticket confirmation + QR (also to `tech@jetzyapp.com`); if fewer than asked: **partial note** (below) | — (they pressed it) | "request approved" notice — admin-owned event only |
| Rejected, or pending request deleted | "not approved" (+ hold released, not charged) | — | — |
| Hold expired | "wasn't reviewed in time — you were not charged" | — | expiry notice, **every** event (sent by the web's webhook) |
| Cancelled | cancellation receipt with the money line + membership note (§9.1) | cancellation notice (with membership note) | **always** a copy, on every event |
| Edited (name or quantity) | nothing | nothing | nothing |

**Addresses** (web environment variables):
- "Jetzy inbox" for approval notices (request / approved / expired) = **`ADMIN_NOTIFICATION_EMAIL`**
  — `tech@jetzyapp.com`, falling back to `SENDGRID_EMAIL_SENDER` only when unset. **Changed
  2026-10-22**: they used to go to the sender address; once that became `reservations@jetzy.com`
  the mail was sent to itself and SendGrid dropped it. Never address a notice to the sender.
- Cancellation inbox copy = **`ADMIN_NOTIFICATION_EMAIL`** — `tech@jetzyapp.com` (same fallback).
- Every ticket confirmation also goes to `tech@jetzyapp.com` (hard-coded second recipient).
- **Sender** = `SENDGRID_EMAIL_SENDER` (verified, currently `reservations@jetzy.com`), display
  name "Jetzy" on guest-facing mail. On a host-owned event the host-audience approval notice sets
  `replyTo` = the guest.

**QR code**: the confirmation embeds a QR image whose content is **just the `bookingRef` string**
(`QRCode.toDataURL(bookingRef)`, `src/lib/qr-generator.ts`). Check-in looks the booking up by that
reference, so any QR library producing the same content works.

**Partial-approval note** (in the confirmation):
- reduced by capacity: "You asked for **3 tickets**, but the event only had room for **2**. We've confirmed 2 tickets for you."
- reduced by the host's edit: "You asked for **3 tickets**, and the organizer has confirmed **2** of them. We've confirmed 2 tickets for you."
- always: "You have **not** been charged for the other ticket(s) — any hold on your card for it has been released."
- if the order sold a membership: "Your Jetzy Premium membership is not affected — it comes with your order, not with each ticket."

---

## 13. Guest-facing reads

**Strip from EVERY booking you send to a client** (guest or host screens alike — Rev 2 list,
verified on staging data: no `sub_` / `cus_` / `pm_` / `pi_` / `cs_` in any response):

```
payment.paymentIntentId   payment.checkoutSessionId   payment.subscriptionId   payment.paymentMethodId
payment.memberships.subscriptionId
payment.memberships.upgradeFrom.subscriptionId   payment.memberships.upgradeFrom.customerId
```

Keep `payment.memberships.upgradeFrom.paidThrough` — the screens need it to describe an upgrade
(§13c detects an upgrade by `subscriptionId` **or** `paidThrough` for exactly this reason).

- **My bookings**: bookings where `bookerUserId == user._id` **or** `customerEmail` matches the
  user's email case-insensitively, `isDeleted: false`. Classify upcoming/past by the event's
  timezone-aware date. The booking detail itemises its memberships (§13c) and says the membership
  "continues if the booking is cancelled".
- **Booking by reference** (from an emailed link, no login): return **no PII** — only
  `bookingRef`, `status`, ticket count, money state + amount, `canCancel` + reason, and the event's
  name / slug / start / timezone. The reference is a bearer token; someone holding a leaked one must
  not be able to read the booker's email or phone.
- **Booking by reference** also returns `memberships` (no ids) so the cancel page can show the
  membership note (§9.1).
- **The guest's booking for one event** (event page — "You're registered" / Cancel button): the
  booker's newest booking for that event that is **not** cancelled / rejected / failed. Return it
  with `moneyState`, `moneyAmount`, `canCancel`, `cancelBlockedReason`, and — when the event hides
  its address until booking (`locationDisclosedAfterBooking`) — the address, **but only once the
  booking is not pending**: awaiting approval is not being approved. (`api/bookings/my-for-event.ts`)
- A pending request's guest view shows what they **asked for** (not the host's plan) until approval.

---

## 13b. Host / admin screens — the Bookings module

**It is ONE screen: an event's bookings.** The web shows it in two places — the console
(`/console/bookings` → pick an event) and a panel on the event detail page — but both show the
**same bookings, the same three tabs (Bookings · Waiting List · Approvals) and the same actions,
under the same rules.** The app should build **one Bookings screen per event**, reachable from
the event, and take the extras from both:

| | Console (13b.1–13b.2) | Event page panel (13b.4) | Build in the app |
|---|---|---|---|
| Entry point | events list → event | the event page | from the event (+ an events list if you want one) |
| Tabs: Bookings · Waiting List · Approvals | ✅ | ✅ | ✅ |
| Edit, Cancel, Approve, Reject, Approve N of M | ✅ | ✅ | ✅ |
| Filters (status, date, search, amount, tickets, checked-in) + export | ✅ | — | ✅ recommended |
| Delete | admins | — | admins only |
| Counters: active / pending / inactive | — | ✅ | ✅ recommended |
| Status pill + money panel wording | badges | full wording (13b.4) | use 13b.4's wording |

Scope is always: admin → any event; host → events with `ownerId === user._id`. Never send Stripe
ids (`payment.paymentIntentId`, `payment.checkoutSessionId`) to the app.

The subsections below describe each web screen exactly, so either can be matched; they are not
two features.

### 13b.1 Console: the events list (entry point)

Screen (`src/pages/console/bookings/index.tsx`, `src/components/bookings/BookingEventsTable.tsx`):

- Search box "Search events by name or location…" — runs on Enter or **Search**; **Clear** shows
  when a search is active. Search resets to page 1.
- Table columns: **Event** · **Starts On** · **End On** · **Total Bookings** · **Actions →
  View Bookings** (opens the event's bookings, 13b.2). On a phone: one card per event with
  "N bookings" and a View Bookings button.
- Previous / Next and page numbers; 10 events per page. "No events found." when empty.

Data:

- Events with `isDeleted: false` (+ `ownerId: user._id` for a host), optional search on `name`
  **or** `location` (case-insensitive regex, input escaped), sorted by `startsOn` descending,
  `skip/limit` 10.
- Per event, `bookingsCount` = number of booking documents for it — **every status, cancelled
  and pending included** (one `$group` by `eventId` over the page's events).

### 13b.2 One event's bookings — three tabs (console layout)

Header: "← Back to Events", "Event Name: <name>", "Starts on (<date>) - Ends on (<date>)" ("TBD"
when no date). A host opening another host's event is sent back to the events list.

Tabs: **Bookings** · **Waiting List** · **Approvals** (with a badge = pending count).

**Show the Approvals tab when** `showApprovalsSurface(event, pendingCount)` is true, with
`pendingCount` = `countDocuments({ eventId, status: "pending" })` taken **unfiltered** on the
server:

```ts
// src/lib/ticket-approval.ts
const ticketApprovalFlag = (event, ticket) =>
  ticket && typeof ticket.requireApproval === "boolean" ? ticket.requireApproval : !!event?.requireApproval
const eventHasAnyApprovalTicket = (event) => {
  const tickets = event?.tickets || []
  if (tickets.length === 0) return !!event?.requireApproval
  return tickets.some((t) => ticketApprovalFlag(event, t))
}
const showApprovalsSurface = (event, pendingCount) => eventHasAnyApprovalTicket(event) || (pendingCount ?? 0) > 0
```

The second half matters: a host who turns approval **off** while requests are waiting must still
be able to approve, reject or see them — otherwise those card holds sit untouched until they
expire.

**Bookings tab** (`src/pages/console/bookings/[eventId].tsx`, `BookingEventsDetailsTable.tsx`):

- Filters (all optional, combined): `status` (exact value), `date` (created that UTC day),
  `search` (name **or** email, case-insensitive), `amount` (`total >=`), `minTickets` (any ticket
  row with `quantity >=`), `checkedIn` `yes` / `no` (has a CheckIn with `checkedInCount > 0`).
  Sorted newest first.
- Row: reference, amount (`total`), status badge, payment badge, customer name / email / phone,
  ticket count (**planned** for a pending request, with "edited · asked for N"), check-in state,
  created date.
- Status badge for a dead booking — three different things, never one red "Cancelled":

  | `status` | Label | Tooltip |
  |---|---|---|
  | `cancelled` | Cancelled | "This booking was cancelled after it was made. Nothing was refunded." |
  | `rejected` | Rejected | "The host declined this request. The card hold was released and the guest was never charged." |
  | `failed` | Expired | "The card hold lapsed before this request was approved. The guest did not cancel and was never charged — the request timed out." |

  (`src/lib/booking-status.ts` — the guest-facing wording is in `DEAD_BOOKING_TOOLTIP_GUEST`.)
- Payment badge: from `payment.status`; no status + priced total → "Not recorded"; no status + $0 → "Free".
- Actions per row: **Edit** (every live booking, §8), **Cancel** (live bookings), **Delete**
  (admins on this screen, §9.2). Export to spreadsheet.
- When the host returns to this tab after acting in another tab, reload — approvals create and
  change bookings.

**Approvals tab**: §7 and §14. Below the pending queue, a **Processed** list: bookings that are no
longer pending **and** carry a `payment.status`, newest first (by `updatedAt`), 10 per page, with
an outcome badge — "Charged $X" (`captured`), "Hold expired" (`expired`), "Declined — $X released"
or "Cancelled — $X released" (`canceled`). The pending queue is never paged (a hold about to lapse
must not sit on page 2).

### 13b.3 Guests tab (Manage Event)

One row per **person**, not per booking (`src/lib/guest-rows.ts`):

- Join invitations and bookings on the **lower-cased email**. Skip bookings with `isDeleted`.
- Per person: `bookings` (newest first), `pendingBookings`, `live` (not pending, not dead),
  `primaryBooking` = newest live, else newest pending, else newest of any kind.
- `kind`: `invited_and_booked` · `booked` · `invited` (no booking).
- `cancelledOnly`: has bookings, none live, none pending.
- Filter chips: All · Needs approval (has a pending booking) · Booked (has bookings and is not
  cancelled-only) · Invited only · Cancelled / expired. Sort: people with a pending request first,
  then invited-only, then booked, then cancelled-only.
- Actions: per pending booking — Approve / Reject / Edit (two requests are two holds and two
  approvals, never merged); on the row — Edit and Cancel (primary booking, when live), Delete,
  View details.

### 13b.4 The same screen on the event detail page (compact layout + counters)

Shown below the event, **only to an admin or the event's host** (not to guests, not in "preview
as guest" mode, not while a section of the event is being edited inline). Web reference:
`src/components/HostedEvents.tsx` (`EventBookings`, `BookingStatusPill`), shared components
`EventWaitingList`, `ApprovalRequests`.

**The card**: "Bookings & Waiting List", **collapsed by default**; tapping the header opens it.

**Tabs**: **Bookings** (default) · **Waiting List** · **Approvals**.
- Approvals appears when `showApprovalsSurface(event, n)` (13b.2) is true, where `n` is the pending
  count **from the bookings already loaded** — there is no server count here. Once the tab has been
  shown it **stays for as long as the page is open** (latched), so approving the last request on an
  event that no longer requires approval doesn't pull the tab away mid-use.
- Approvals tab badges: the pending count (orange), and a red **"!"** when any pending request's
  card hold expires within 48 hours.

**Bookings tab — counters** at the top (`GET /api/events/:eventId/totals`, public, counts only),
over bookings with `isDeleted: false`, each as **tickets** (sum of quantities; a booking with no
ticket rows counts 1) and **customers** (distinct `customerEmail` — compared exactly as stored
here, so `Ali@x.com` and `ali@x.com` count twice; use a case-insensitive count in the app):

| Line | Bookings counted | Shown |
|---|---|---|
| Active Tickets / Active Customers | not pending and not cancelled / rejected / failed | always |
| Awaiting Approval / Pending Customers | `pending` | only when > 0 |
| Inactive Tickets / Inactive Customers | cancelled / rejected / failed | only when > 0 |

On a phone the same figures are a small grid: rows Active / Pending / Inactive × columns Tickets /
Customers.

**Bookings tab — the list**: every booking for the event (`GET /api/events/:eventId/event-bookings`,
admin or host, Stripe ids removed), 10 per page, dead bookings dimmed. Collapsed row: customer
name, "Ref: <bookingRef>", status pill, total (amber when money is on hold). Status pill text:

| Booking | Pill |
|---|---|
| `payment.status` `authorized` / `capturing`, hold still valid | `pending · $X on hold` (amber) |
| … hold past `authExpiresAt` | `hold expired` (red) |
| `payment.status` `failed` | `charge failed` (red) |
| `payment.status` `expired` | `hold expired` (red) |
| `payment.status` `canceled` | `<status> · hold released` (grey) |
| `payment.status` `captured` | `<status> · charged` (green) |
| no payment, dead | `Cancelled` / `Rejected` / `Expired` (13b.2 table) |
| no payment, `pending` | `pending` (amber) |
| anything else | the status (green) |

Expanded row:

- **Email**, **Phone**, **Created** (date and time).
- **Tickets**: one line per ticket row, "Quantity: N". On a pending request the host edited down:
  the planned number, then "— edited, asked for M". "No-ticket event (registration only)" when
  there are no rows.
- **Subtotal** · **Discount: −$X (CODE)** (only when discounted) · **Tax** (only if non-zero, which
  never happens) · **"On hold:"** instead of **"Total:"** while money is held.
- **Money panel** (only when `payment.status` is set):

  | `payment.status` | Text |
  |---|---|
  | `captured` | "Charged **$X** on <date>." |
  | `authorized` / `capturing` | "Awaiting approval — $X held, not charged." + "Hold expires <date> — after that it is released automatically and cannot be recovered. Approve or decline in the Approvals tab." |
  | `failed` | "Charge failed — the guest has not been charged." + `lastError` |
  | `expired` | "Card hold expired before review. Never charged — the guest must book again." |
  | `canceled` | "Hold of $X released. The guest was not charged." |

  When the order sold memberships, a "What this covers" block: **Ticket** `$total`, then each
  membership "(first month|year)" `$amount`, with "— not started" on a row whose `status` is
  `failed`. Without it the panel shows a $90 total above a $110 charge with nothing explaining it.
- **Actions** at the bottom, so the money state is on screen when the host decides:
  - **Cancel booking** — live, **non-pending** bookings (a request is declined with Reject in
    Approvals). Opens the cancel confirmation (§9.1) stating the money consequence.
  - **Edit name or tickets** — every live booking, pending or confirmed, except a request whose
    hold has lapsed (§8).
- After cancel or edit, refresh: this list, the Approvals list, the counters, availability, and
  check-in figures.

**Waiting List tab**: the same component as Main Bookings — one card per entry with name, email,
phone, "Joined: <date>", the tickets they wanted, and **Approve** / **Remove** (§10).

**Approvals tab**: the same component as Main Bookings (§7, §14).

**Guests card** (separate, below the panel): the event's **invitations** only — name, email, "via
app" when invited through the Jetzy app, and status: Invited / Accepted / Declined / Invite
cancelled. It is not a booking list.

---

## 13c. Describing a booking's memberships — one wording everywhere (Rev 2)

Port `src/lib/booking-membership-display.ts` (pure). **Every** surface that shows a booking's
memberships — approve sheet, edit sheet, bookings panel, guest booking detail, cancel dialogs,
emails — uses it. Before it existed the surfaces disagreed: "Full Concierge Membership membership",
an included Premium shown as charged, an upgrade shown as a new membership.

Input rows: `bookingMemberships(booking.payment)` (§3.3).

```ts
const LABEL   = { premium: "Jetzy Premium", concierge: "Full Concierge Membership" }
const RECEIPT = { premium: "Jetzy Premium membership", concierge: "Full Concierge Membership" }   // never `${label} membership`
const INCLUDES = { premium: [], concierge: ["premium"] }
const isKey = (k) => k === "premium" || k === "concierge"
export const membershipRowName  = (row) => (isKey(row?.key) ? RECEIPT[row.key] : "Membership")
export const membershipRowLabel = (row) => (isKey(row?.key) ? LABEL[row.key] : "Membership")
export const periodWord = (interval) => (interval === "year" ? "year" : "month")
export const formatMembershipDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null :
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }

export const includingRow = (row, rows) => !isKey(row?.key) ? null :
  rows.find((o) => isKey(o.key) && o.key !== row.key && INCLUDES[o.key].includes(row.key) && o.status !== "failed") || null

// "upgrade" | "included" | "held" | "trial" | "failed" | "new"
export const membershipRowKind = (row, rows) => {
  if (row.upgradeFrom && (row.upgradeFrom.subscriptionId || row.upgradeFrom.paidThrough)) return "upgrade"
  if (includingRow(row, rows)) return "included"
  if (row.status === "failed") return "failed"
  if (row.status === "active" && !row.subscriptionId && !(Number(row.amount) > 0) && !(Number(row.trialMonths) > 0)) return "held"
  if (Number(row.trialMonths) > 0) return "trial"
  return "new"
}
export const soldMembershipRows = (rows) => rows.filter((r) => !["included", "held"].includes(membershipRowKind(r, rows)))

export const membershipRowSummary = (row, rows) => {
  switch (membershipRowKind(row, rows)) {
    case "upgrade": { const d = formatMembershipDate(row.upgradeFrom?.paidThrough)
      return d ? `switch from monthly to yearly — the year starts ${d}, when the monthly plan ends`
               : "switch from monthly to yearly — the year starts when the monthly plan's paid month ends" }
    case "included": { const by = includingRow(row, rows); return `included with ${by ? membershipRowLabel(by) : "another membership"} — not charged` }
    case "held": return "already a member — not charged"
    case "trial": { const m = Number(row.trialMonths)
      const then = Number(row.renewalAmount) > 0 ? `, then $${Number(row.renewalAmount).toFixed(2)}/${periodWord(row.interval)}` : ""
      return `${m} ${m === 1 ? "month" : "months"} free${then}` }
    case "failed": return `first ${periodWord(row.interval)} — not started`
    default: return `first ${periodWord(row.interval)}`
  }
}
export const membershipRowCharged = (row, rows) => { const k = membershipRowKind(row, rows)
  return k === "new" || k === "upgrade" || (k === "failed" && Number(row.amount) > 0) }
// Part of a hold approval WILL release for certain (included rows). The approve sheet subtracts it
// from "Card will be charged" before the host presses Approve.
export const includedRowsCents = (rows) => rows.filter((r) => r.status === "pending" && membershipRowKind(r, rows) === "included")
  .reduce((s, r) => s + Math.round((Number(r.amount) || 0) * 100), 0)
export const membershipIncludesLine = (key) => key === "concierge" ? "Includes Jetzy Premium" : null
export const chargedMembershipTotal = (rows) =>
  Math.round(rows.filter((r) => membershipRowCharged(r, rows)).reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100
```

`soldMembershipNames(rows)` = the labels of `soldMembershipRows`, de-duplicated, joined "A", "A and
B", "A, B and C". `cancellationMembershipNote(rows, moneyState, asManager)`:

```ts
export const cancellationMembershipNote = (rows, moneyState, asManager = false) => {
  const sold = soldMembershipRows(rows || [])
  if (sold.length === 0) return null
  const names = soldMembershipNames(rows)
  const upgrade = sold.some((r) => membershipRowKind(r, rows) === "upgrade")
  const who = asManager ? "the guest keeps" : "you keep"
  if (moneyState === "hold") return upgrade
    ? `The ${names} switch to yearly billing will not happen — ${asManager ? "the guest's" : "your"} monthly plan continues unchanged.`
    : `The ${names} on this request will not be started.`
  if (moneyState === "captured" || moneyState === "unknown") {
    const paid = chargedMembershipTotal(rows)
    const part = paid > 0 ? `$${paid.toFixed(2)} of this was for ${names}, which ${who}` : `${names} is separate from the ticket and ${who} it`
    return `${part} — cancelling the booking doesn't cancel the membership${upgrade ? ", and the switch to yearly billing stands" : ""}. ${asManager ? "The guest can manage it" : "Manage it"} from Manage membership.`
  }
  return null
}
```

Where each is used:

| Surface | Show |
|---|---|
| Approve sheet | one line per row: `membershipRowName` · `membershipRowSummary` · amount (only if `membershipRowCharged`). "Card will be charged" = `approvalCaptureCents(...)` minus `includedRowsCents(rows)` |
| Edit sheet, bookings panel "What this covers" | the same per-row lines |
| Guest booking detail / success page | `membershipRowSummary`; an upgrade states the date; a pending request says the membership starts **on approval**, never "is active" |
| Cancel dialogs (guest + host), cancel-by-link page, both cancellation emails | `cancellationMembershipNote` |
| Ticket confirmation / approval emails | `soldMembershipRows` only, by receipt label; "Includes Jetzy Premium" under Concierge |

---

## 14. Mobile front-end checklist

### Host/admin — Approvals (pending requests)
- Sort by `payment.authExpiresAt` ascending (soonest-expiring first). Banner when any hold lapses
  within 48 hours.
- Per row: name, email, **planned** tickets with names (+ "edited · asked for N"), payment badge,
  hold countdown, custom answers, "Has N tickets" when the same email already holds confirmed
  bookings (case-insensitive).
- "Spots left" strip for limited tickets only; "Needs N, M left" badge when `approvalFit` says it
  doesn't fit.
- Actions: **Approve** (label **Retry charge** when `payment.status === "failed"`; disabled when the
  hold expired), **Reject**, **Edit** (hidden when the hold expired).
- Approve sheet: what was asked, itemised money (subtotal and discount scaled to the approved
  number, each membership row via §13c, "Card will be charged $X" = `approvalCaptureCents` −
  `includedRowsCents`, "Released from the hold $Y"), prior bookings warning; buttons per §7.2.
  The final figure can still drop at approval if the guest has bought the membership elsewhere
  meanwhile — the server decides (§7.1 step 6.3).
- A row whose membership `status` is `failed` after approval shows "— not started" and
  `lastError` to admins: money was taken, a subscription is owed (Jetzy support resolves it).
- After any action refresh: the booking list, the guest list, availability, counters.

### Host/admin — Bookings / Guests lists
- **Edit** on every live booking (not cancelled/rejected/expired, not a lapsed-hold request).
- Cancel on live **confirmed** bookings (pending requests use Reject).

### Edit sheet (one sheet for everything)
- Title "Edit request" (pending) / "Edit booking" (confirmed).
- Name field (16pt on iOS; max 120); email shown read-only.
- Ticket steppers driven by `bookingEditMode`: `−` stops at 1 when there is one row; `+` stops at
  the requested number in `reduce` mode; `locked` shows the rows and `REQUEST_LOCK_MESSAGE[lock]`.
- Explanation per case (pending free / pending hold / membership / confirmed free / confirmed
  paid) — the web copy is in `EditBookingDialog.tsx`; preview the charge with `approvalCaptureCents`
  on a held request.
- Run `holdPlanRefusal` / `freeTicketEditRefusal` / `normalizeGuestName` before sending; disable
  Save while invalid or unchanged.

### Guest
- My bookings with money badges from `bookingMoneyState`; Cancel only when `canGuestCancel`
  allows; the cancel confirmation states the money consequence **and** the membership note (§9.1).
- Memberships on a booking described only through §13c.

---

## 15. Mobile back-end checklist

Suggested endpoints, one per web reference:

| Your endpoint | Behaviour | Web reference |
|---|---|---|
| ~~create checkout / free registration / fulfil~~ | **don't build** — the web does it (§5.0) | `api/checkout/*`, `lib/checkout-fulfillment.ts` |
| approve | §7.1 | `api/bookings/approve.ts` |
| reject | §7.5 | `api/bookings/reject.ts` |
| edit pending request | §8.2 | `api/bookings/update-request.ts` |
| edit confirmed booking | §8.3 | `api/bookings/update-tickets.ts` |
| cancel | §9.1 | `api/bookings/cancel.ts` |
| delete | §9.2 | `api/bookings/delete.ts` |
| availability | §6 | `api/events/[eventId]/availability.ts` |
| my bookings / by reference | §13 | `api/bookings/mine.ts`, `preview.ts` |
| check-in | §11 | `api/check-in/*` |
| waiting list — join / list / approve / remove | §10 | `api/waiting-list/{add,[eventId],approve,remove}.ts` |
| guest's booking for one event | §13 | `api/bookings/my-for-event.ts` |
| bookings overview, event bookings list (+ filters), pending count | §13b | `console/bookings/index.tsx`, `[eventId].tsx`, `api/get-bookings.ts`, `api/events/[eventId]/event-bookings.ts` |
| event counters | §13b.4 | `api/events/[eventId]/totals.ts` |

Shared services the approve endpoint needs (Rev 2): `startMembershipSubscription` (§7.4),
`heldMemberships` + `liveMembershipSubscriptionsByEmail` + `findMembershipUpgrade` (§7.4a),
`reactivateHeldMemberships` (§7.4b), `resolveStripeCustomerForUser` (§7.4), the SelectMember
PATCH/GET (§7.4, §7.4a), and the `membership_purchases` writer (§3.6).

Configuration the app's back-end needs (same values as the web's Vercel env, per environment):

| Setting | Purpose |
|---|---|
| Stripe secret key | same account as the web — test on staging, live on prod |
| Premium / Concierge product ids | §3.6 table; test and live ids are entirely different strings — never infer one from the other |
| `SELECT_MEMBER_API_URL`, `SELECT_MEMBER_API_KEY` | Concierge mirror + status (§7.4, §7.4a). Staging → `https://test.jetzy.com`; never point a non-production app at the production URL |
| `ADMIN_NOTIFICATION_EMAIL` | Jetzy inbox (§12) |

Non-negotiables:
- Ownership check before any write or Stripe call.
- Atomic filters exactly as given: the capture latch (§7.1), the pending-edit write (§8.2), the
  confirmed-edit write (§8.3).
- Re-read the plan after the latch; apply a partial reduction only after a successful capture.
- **Stripe webhooks for bookings: do NOT handle them.** The web's webhook already processes
  `checkout.session.completed`, `payment_intent.canceled` and `payment_intent.payment_failed` for
  every booking on the shared Stripe account. A second handler would send duplicate emails and race
  on the same documents. Your Stripe calls are only the ones in §7 (capture, cancel the hold,
  create a membership subscription) and §9 (cancel the hold). When you release a hold, Stripe
  sends `payment_intent.canceled` to the web; the web ignores it because you have already set the
  booking to `rejected` / `cancelled` (or it only marks the payment `canceled`, which you also do).
- Response envelope used on the web: `{ message, status, code, data }`. Return the same refusal
  messages (they are written for the host to read).
- Never return Stripe ids to a client.

---

## 16. Test scenarios

Stripe test mode, card `4242 4242 4242 4242`. Bookings are made by opening the event on the web
from the app (§5.0); then act on them from the app **and** confirm the web shows the same thing
(and vice versa).

0. From the app, open an event with `?src=app`, buy a ticket, tap "Return to Jetzy App" → the
   app opens on that event and finds the booking by `bookingRef`.

1. Paid ticket, no approval → `confirmed`, `payment.status: captured`, tracker +N, confirmation email.
2. Free ticket → `confirmed`, no `payment`, money state `free`.
3. Approval ticket, paid, 3 tickets → `pending`, `authorized`, hold = 3 × price, `authExpiresAt` set, no seat consumed.
4. Approve (3) → captured full hold, `confirmed`, tracker +3.
5. Edit pending paid request 3 → 2: `tickets` still 3, `adjustedTickets` 2, money unchanged → approve → captured 2/3 of the hold, `tickets` 2, `total` scaled, guest note "organizer confirmed 2".
6. Edit 3 → 2 → 3: plan cleared → approve captures the full hold.
7. Plan saved, approve from a screen opened before the edit (no `tickets` sent) → still approves 2.
8. Capacity 1 left, request for 2 → "Approve 1 of 2" → captured half.
9. Membership ticket (Premium monthly $20) + ticket $50 × 2, approval → edit to 1 → approve → captured $70; one subscription created with `trial_end` one month out.
10. Free "1 month free" Premium ticket × 2, approval → edit to 1 → approve → `tickets` 1, subscription created with a 1-month trial, nothing charged.
11. Reject a held request → PI canceled, `rejected`, `payment.status: canceled`.
12. Let a hold expire (or cancel the PI in the Stripe dashboard with reason automatic) → `failed`, `payment.status: expired`, emails.
13. Guest cancels a paid confirmed booking before start → `cancelled`, `payment.status` stays `captured`, "non-refundable" copy.
14. Guest tries after start → refused; host cancels after start → allowed.
15. Confirmed free booking: name change → CheckIn name updated; 3 tickets with 2 checked in → reduce to 1 refused; reduce to 2 → CheckIn `isFullyCheckedIn: true`.
16. Confirmed paid booking: quantity locked, name saves.
17. Non-owner host calls approve / edit / cancel on another host's event → 403.

**Membership scenarios (Rev 2)** — test Concierge product ids in §3.6, test card above:

18. Concierge member (on our records **or** only in Stripe under another customer with the same
    email) has a pending request on a Premium ticket held at $50 + $10 → approve → captured **$50**,
    Premium row `active`/`amount 0`, no Premium subscription created.
19. Pending request holding **both** a Concierge row and a Premium row (legacy shape) → approve →
    one Concierge subscription, Premium row released, its amount not captured.
20. Monthly Concierge member, yearly-Concierge ticket, approval → approve → yearly subscription
    with `trial_end` = monthly paid-through + 1 year, `metadata.upgradedFrom`; the monthly one
    `cancel_at_period_end: true`, `cancelledReason: "upgraded_to_yearly"`, `replacedBy`; no welcome
    email; `membership_purchases.source = "upgrade"`.
21. Same, but the guest went yearly on selectmember.jetzy.com before approval → upgrade row
    released, nothing created.
22. Same, but the monthly plan ended before approval → a fresh yearly subscription, no replacement.
23. Guest who **cancelled** their Concierge (still in the paid period) gets a Concierge-ticket
    request approved, membership not charged on the order → their subscription
    `cancel_at_period_end: false`, `metadata.reactivatedBy = <bookingRef>`.
24. A Premium subscription retired by Concierge (`cancelledReason: "included_with_concierge"`) is
    **never** reactivated by scenario 23.
25. New Premium member via approval → separate welcome email + ticket confirmation; one
    `membership_purchases` row; SelectMember is **not** called (Premium is ours).
26. New Concierge member via approval → SelectMember PATCH with `plan: select_monthly` /
    `select_yearly` to the **staging** URL; a separate Premium subscription on the same customer is
    set to end (`included_with_concierge`).
27. Cancel a captured Concierge booking → booking `cancelled`, subscription untouched, dialog and
    emails carry the membership note.
28. Every booking list response: no `sub_`, `cus_`, `pm_`, `pi_`, `cs_` anywhere.

---

## 17. Known gaps

- **Bookings damaged by the old retry bug** (before 2026-10-13): pending, `payment.status:
  failed`, and a `ticketsEditHistory` entry whose `from` is larger than the current `tickets`.
  Retrying those captures the full hold. Not detected automatically yet.
- `api/events/[eventId]/totals.ts` (public counters) counts a pending request at the quantity
  asked for, not the host's plan, and uses `isDeleted: false`.
- Waiting-list bookings carry no `payment` (money state `unknown` when priced).
- `bookingRef` on waiting-list bookings uses a shorter random suffix than checkout's 20
  characters. Both are unique-indexed.
- Waiting-list approval writes entry `status: "approved"`, which is **not** in the model's enum
  (`waiting | notified | converted`). It is stored anyway because the update skips validation; the
  list only shows `"waiting"`. If you write entries, use `"approved"` for consistency with ours.
- The Bookings overview's `bookingsCount` counts every booking document, cancelled and pending
  included.
- **(Rev 2)** A membership row left `failed` after approval (money captured, subscription not
  created) is not retried automatically. It is visible (`lastError`) and handled by Jetzy support.
- **(Rev 2)** `SELECT_MEMBER_WEBHOOK_SECRET` is still unset on the web, so a Concierge cancelled on
  selectmember.jetzy.com does not stop billing on our side. Not a booking concern; mentioned so it
  isn't mistaken for an app bug.
- **(Rev 2)** No existing double-holders (Concierge + a separate Premium) are cleaned up — by
  decision. Only a Concierge **started** from now on retires a separate Premium (§7.4 step 9).

---

## 18. Changelog

**Revision 2 (2026-11-11):** no new booking behaviour beyond the 2026-10-19 → 10-23 entries
below; those rules are now written into the body (§3.3 `upgradeFrom`, §3.6, §5.3, §7.1 steps
6.3 / 8 / 9b / 11, §7.4, §7.4a, §7.4b, §9.1 membership note, §12, §13 ids, §13c). Corrections:
admin approval notices go to `ADMIN_NOTIFICATION_EMAIL` (since 2026-10-22); the pre-create
"already subscribed" check is `active`/`trialing` only; `canGuestCancel` added to §4.3. New §0
(handoff checklist) and test scenarios 18–28.

**Revision 1 note:** ticket buying stays on the web; the app hands off via §5.0 and builds
everything from §6 on.

Since `TICKET_SCHEMA.md` Revision 5 (2026-09-24), which covered approvals and edits in §12–13:

- **Edit a pending request** (name + quantity) — new; held/membership requests store
  `adjustedTickets`, applied at approval (§8.2).
- **Edit a confirmed booking's name** — new (§8.3). `update-tickets` now refuses pending bookings
  and keeps `CheckIn` in step.
- **Membership requests can be partly approved and reduced** — the old "refused when the ticket
  sells a membership" rule is gone; capture charges the membership in full (§7.2–7.3).
- **A partial reduction is written only after the capture succeeds** — fixes an overcharge on
  retry after a failed capture (§7.1 step 6).
- **New booking fields**: `adjustedTickets`, `adjustedTicketsAt`, `adjustedTicketsBy`,
  `customerNameEditHistory`.
- **Approval email** names a host's reduction ("the organizer has confirmed N") and says the
  membership is not affected.
- **Concierge includes Jetzy Premium (2026-10-19).** Premium = `premiumSubscription.active` OR
  `conciergeSubscription.active`. A Concierge member is never charged for Premium on a bundled
  ticket; a ticket selling BOTH charges Concierge only (Premium gets no line item, no subscription,
  no `payment.memberships` row); at approval a pending Premium row is released when the buyer holds
  Concierge or a Concierge row on the same order is being started. When Concierge starts, a separate
  Premium subscription on the same customer is set `cancel_at_period_end` with
  `metadata.cancelledReason = "included_with_concierge"` (no refund). Web: `splitBundleCharges`,
  `expandEntitlements`, `retireIncludedSubscriptions`.
- **Concierge sells annually (2026-10-19).** Concierge Annual is a SEPARATE Stripe product
  (test `prod_UlPxrsQgIknFRQ`, live `prod_UlQT3lIpJo2PK6`, $595/yr; SelectMember plan name
  `select_yearly`). Price an annual Concierge ticket from the ANNUAL product. Detect a membership by ANY of its products
  (`membershipProductIds`); resolve a ticket's annual price across them (`listMembershipPrices`).
  A ticket's `membershipInterval: "year"` now sells Concierge annually. When one subscription to a
  membership ends while another to the same membership is live (monthly → annual), the record
  stays on the live one.
- **A yearly ticket UPGRADES a monthly member (2026-10-19).** Concierge only (`upgradeOnTicket`).
  A buyer with a live MONTHLY Concierge subscription (on any Stripe customer with their email) and
  no yearly one is charged the yearly price (no free months) instead of "already held". New
  membership-row field **`upgradeFrom: { subscriptionId, customerId?, paidThrough? }`**. The new
  subscription's `trial_end` = the old one's paid-through + 1 year; after it is created the old one
  is set `cancel_at_period_end` with `metadata.cancelledReason = "upgraded_to_yearly"`,
  `replacedBy: <new id>`. At approval, re-check: already yearly → release; monthly gone → start
  fresh. A $0 ticket with an upgrade goes through Stripe. Web: `src/lib/membership-upgrade.ts`.
- **Booking emails + screens describe memberships one way (2026-10-20).** The host's approval-
  request notice now quotes the FULL hold (ticket + membership first period), not the ticket alone,
  and itemises the memberships. Decline / expiry emails say the membership was not started (or, for
  an upgrade, that the monthly plan continues). Cancellation emails and dialogs say cancelling a
  booking does NOT cancel a membership bought with it. Browser-facing booking APIs no longer return
  subscription / customer / payment-method ids. Wording lives in `src/lib/booking-membership-display.ts`.
- **Cancelled members buying a membership ticket (2026-10-22).** A member who cancelled (still in
  the paid period) and buys a ticket selling that membership: yearly ticket + cancelled monthly →
  upgrade (as above); otherwise the cancellation is undone (`cancel_at_period_end: false`,
  `metadata.reactivatedBy = bookingRef`) once the booking is CONFIRMED, at no charge today. A
  subscription we ended ourselves (`cancelledReason` `included_with_concierge` / `upgraded_to_yearly`)
  is never switched back on. Must be disclosed at checkout before purchase.
- **Separate membership welcome email (2026-10-23).** A membership CREATED by a ticket purchase
  (paid or free months; not an upgrade, reactivation or already-held one) now also gets its own
  welcome email, sent when the subscription is started (instant purchase or approval). The ticket
  receipt is unchanged. SelectMember does not send a Concierge welcome for subscriptions we sold.
