# Ticket create & update — schema contract

For the mobile app / backend, which writes to the same `events` collection this portal does.

**Revision 6 (2026-11-11).** No schema change. Brings the document up to date with the code:
**§0 — handoff** (who builds what, what changed, the remaining work); **§6 rewritten** —
Premium repriced to **$10/month and $100/year** (2026-09-18, new price ids), **Full Concierge now
sells yearly** ($595/yr, a separate Stripe product), **Concierge includes Jetzy Premium** (the
ticket form drops Premium when Concierge is ticked), and **membership options on a ticket are
admin-only**; **§4a — the ticket endpoints**, including the rule that every ticket write clears
`event.draftRevision`; **§7 / §7a** are now marked web-only — the app does not call checkout
(`BOOKING_FLOW.md` §5.0); **§14 — what a buyer must see on a ticket in the app**. Booking rules
(approval, partial approval, edits) live in `BOOKING_FLOW.md` Revision 2.

**Revision 5 (2026-09-24).** Adds three sections, all read/write contracts rather than schema
changes: **§11 — `GET /api/events/:eventId/availability`**, the endpoint that answers "how many
are left" so you don't have to run §10's aggregation yourself; **§12 — approvals**, including the
rule that a PENDING request consumes NO capacity, and the new ability to approve FEWER tickets
than were asked for; and **§13 — a host changing a booking's quantity after the fact**, with the
audit fields that come with it. §1–§10 are unchanged.

**Revision 4 (2026-09-23).** Adds **§10 — per-ticket capacity (`quantity`)**, and changes how
"how many are left" is worked out: it is now COUNTED FROM THE BOOKINGS, not read from
`eventtrackers.bookedTickets`. §3's "also create the capacity row" is therefore advisory rather
than load-bearing — please still write it, but capacity no longer depends on it. Nothing in
§1–§7a changed otherwise.

**Revision 3 (2026-09-16).** Adds **§6b — Full Concierge is live** (tickets selling it must be
sellable, how to show its price) and **§7a — the two routing replies** from the checkout endpoints
(`needsCheckout`, `freeOrder`). Nothing in §1–§6a changed. Written because the app was refusing
Concierge tickets with "offers a membership that isn't available yet" — no server returns that.

**Revision 2 (2026-09-04).** Revision 1 covered ticket creation plus the membership block
(`memberships`, `membershipInterval`). This revision adds **free months of that membership, given
with no code typed** (`membershipFreeMonths`), and **corrects a rule from revision 1 that is now
false**: a membership-selling ticket no longer needs `price > 0`. Sections marked **NEW** are new
in this revision. Sections marked **REVISION 1** are unchanged since the last version but kept for
completeness so the two implementations can still be diffed end to end.

- Database: `NEXT_EVENTS_DB_URL`
- Collection: `events` — tickets are an **embedded array**, `events.tickets[]`, not a collection
- Source of truth: `src/models/events/index.ts` (`eventTicketsSchema`), `src/lib/event-tickets.ts`
  (the create/update resolution logic), `src/lib/premium-bundle.ts` (the read-side resolvers)

---

## 0. Handoff (Rev 6)

### 0.1 Who builds what

| Part | Built by | Section |
|---|---|---|
| Host/admin **creates, edits, deletes** tickets (the ticket form) | **the app** | §1–§6a, §10, §4a |
| **Shows** tickets to a buyer: price, sold out / last one, membership disclosure | **the app** | §10–§11, §14 |
| **Buys** a ticket: checkout, Stripe, the booking | **the web** — the app opens `events.jetzy.com/<slug>?src=app` | `BOOKING_FLOW.md` §5.0; §7 / §7a here are reference only |
| Everything after a booking exists (approve, edit, cancel, check-in…) | the app | `BOOKING_FLOW.md` |

### 0.2 What changed since Revision 5 (2026-09-24)

| # | Change | Section |
|---|---|---|
| 1 | Membership toggles on a ticket are **admin / super-admin only** (2026-09-24). A host editing a ticket must not see them and must not change them — preserve-on-omit keeps an admin's setting. **The web enforces this in its UI only; the app's API must enforce it** (§6 rule 0). | §6 |
| 2 | **Premium repriced** to $10/month, $100/year (2026-09-18). New price ids. Never hardcode a price — read `/api/subscriptions/plan`. | §6 |
| 3 | **Concierge sells yearly** — Concierge Annual is a SEPARATE Stripe product ($595/yr). A ticket's `membershipInterval: "year"` now sells Concierge yearly too. | §6, §6b |
| 4 | **Concierge includes Jetzy Premium.** Ticking Concierge drops/greys Premium on the form; new tickets store `["concierge"]` alone; a legacy ticket with both bills Concierge only. | §6, §6b |
| 5 | The ticket form chooses billing **per membership row** (Monthly / Annual inside each row that offers annual; "Monthly only · $X/month" for one that doesn't). The data is still ONE `membershipInterval` per ticket. Unticking the last annual-capable membership resets it to month. | §6 |
| 6 | A **monthly Concierge member** buying a **yearly-Concierge** ticket is upgraded to yearly (charged on the web). Matters to the app only for disclosure. | §14 |
| 7 | Ticket `desc` is **HTML** (rich-text editor), rendered sanitised; older values are plain text. | §1 |
| 8 | Ticket endpoints secured (admin-or-owner, method guards); delete blocked by any non-dead booking; **every ticket write `$unset`s `draftRevision`**. | §4a |
| 9 | Only the **last** remaining ticket is announced ("Only 1 left"); "Sold out" at 0. | §14 |

### 0.3 Remaining work for the app — checklist

- [ ] Ticket form: name, description (HTML), price (0 or ≥ 0.50), quantity (blank = unlimited,
      sends `null` to clear), require approval (tri-state), and — **admin only** — memberships,
      billing per membership, free months. §1–§6a, §10.
- [ ] Write through the rules in §3–§4 (keep `_id`, preserve-on-omit, new Stripe price only on a
      price change, mirror `includesPremium`) and §4a (`$unset draftRevision`, delete guard).
- [ ] Enforce admin-only memberships server-side (§6 rule 0).
- [ ] Concierge-includes-Premium on the form (§6 rule 6).
- [ ] Buyer display: availability, sold out / last one, stepper caps, membership disclosure with
      live prices (§10, §11, §14).
- [ ] Remove any "membership isn't available yet" block (§6b) and any hardcoded price.
- [ ] Hand buying to the web (`BOOKING_FLOW.md` §5.0).

---

## 1. Ticket sub-document

```jsonc
{
  "_id": ObjectId("6a83365808b397827ee83350"),   // stable; bookings point at this
  "name": "General Admission",
  "desc": "Entry + welcome drink",
  "price": 65,                                    // Number, major units (dollars)
  "stripeProductId": "price_1U16VV…",             // a Stripe PRICE id (see §2)

  "quantity": 50,                                 // NEW — per-ticket capacity, see §10
  "requireApproval": true,                        // OPTIONAL, tri-state — see §5
  "memberships": ["premium"],                     // see §6
  "membershipInterval": "year",                   // see §6
  "membershipFreeMonths": 1,                      // NEW — see §6a
  "includesPremium": true,                        // deprecated mirror — see §6

  "createdAt": ISODate("…"),
  "updatedAt": ISODate("…")
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | **Must survive edits.** Bookings store this id, not the name. |
| `name` | String | yes | Buyer-facing. The web form field is called `title` and is mapped to `name` on write. |
| `price` | Number | yes | Major units, `usd`, 2 decimals (the web writes `price.toFixed(2)`; Mongoose casts to Number). See §2a for the valid range. |
| `desc` | String | no | **HTML** from the web's rich-text editor (older tickets hold plain text — render both). Sanitise before rendering. Read from the event record for receipts, never from a checkout payload. |
| `stripeProductId` | String | yes | **A Stripe price id**, despite the name. |
| `requireApproval` | Boolean | no | `undefined` = inherit `event.requireApproval`. |
| `quantity` | Number | no | **NEW.** How many of this ticket exist. `undefined` = unlimited, `0` = closed. See §10. |
| `memberships` | String[] | no | `["premium"]`, `["concierge"]`, or both. `undefined` = fall back to `includesPremium`. |
| `membershipInterval` | String | no | `"month"` or `"year"`. `undefined` = month. |
| `membershipFreeMonths` | Number | no | **NEW.** `0`–`12`. `undefined` = none. See §6a. |
| `includesPremium` | Boolean | no | Deprecated. Still written for older readers; never the source of truth. |

---

## 2. `stripeProductId` holds a PRICE id — REVISION 1

The field was misnamed early and is now load-bearing in production data. It stores
`price_…`, not `prod_…`.

To get the product from it:

```js
const price = await stripe.prices.retrieve(ticket.stripeProductId)
const productId = typeof price.product === "string" ? price.product : price.product.id
```

---

## 2a. Valid price range — applies to EVERY ticket

```js
const isBelowStripeMinimum = (amount) => Number.isFinite(amount) && amount > 0 && amount < 0.5
```

`price` must be either **exactly `0`** (free) or **`>= 0.50`**. `$0.01`–`$0.49` is rejected —
Stripe won't process a charge that small, and the host would only find out at a buyer's checkout.
This applies to every ticket, whether or not it sells a membership; see the note in §6 about what
used to be a *second*, membership-specific version of this rule.

---

## 3. Creating a ticket

Stripe first, Mongo second — the price id is required on the ticket.

```js
// 1. one Stripe price per ticket
const price = await stripe.prices.create({
  unit_amount: Math.round(ticket.price * 100),   // NOT ticket.price * 100
  currency: "usd",
  product_data: { name: ticket.name },
})

// 2. the ticket
{
  name: ticket.name,
  desc: ticket.description,
  price: ticket.price,
  stripeProductId: price.id,
  memberships: ticket.memberships ?? [],
  includesPremium: (ticket.memberships ?? []).includes("premium"),
  // omit requireApproval, membershipInterval and membershipFreeMonths unless explicitly chosen —
  // don't write 0 / "month" / false as defaults on a brand-new ticket either; just leave the key
  // out, same as an edit that doesn't touch it (see §4).
}
```

`Math.round` matters: `19.99 * 100` is `1998.9999999999998` in floating point and Stripe rejects a
non-integer `unit_amount`.

**Every ticket gets a Stripe price, including a $0 one** (`unit_amount: 0`) — `stripeProductId` is
required. **An event created with no tickets gets one** on the web: `{ name: "General Admission",
price: 0, desc: "Free ticket for this event." }`. `memberships` on create is written as the
resolved array (`[]` when none); `membershipInterval` / `membershipFreeMonths` / `requireApproval`
/ `quantity` are written only when the host chose a value.

**`event.isPaid`** means "the event has tickets", not "costs money": the web's tickets endpoint
sets `isPaid: tickets.length > 0`, and the buyer's quantity stepper only renders when `isPaid` is
true. Keep it in step whenever you write `tickets`.

**Also create the capacity row** for a new event:

```jsonc
// collection: eventtrackers
{ "eventId": ObjectId("…"), "bookedTickets": 0, "eventCapacity": 150 }   // 0 = unlimited
```

**(Rev 4) This is now advisory, not load-bearing.** It used to be the only thing standing between
an event and unlimited overselling — a missing row meant every capacity check passed silently.
Capacity is now counted from the bookings themselves (§10), so a missing tracker no longer
disables the limit. Keep writing it: the admin portal still reads it, and web still keeps it in
step. Just don't treat it as the source of truth, and never compute remaining spots from it.

---

## 4. Updating a ticket

Two behaviours to copy exactly.

**Keep `_id`.** Match incoming tickets to stored ones and re-emit the id. Replacing
`events.tickets` wholesale mints new ids and detaches every existing booking.

**Preserve on omit.** If the payload doesn't mention `requireApproval`, `memberships`,
`membershipInterval`, `membershipFreeMonths` or `quantity`, keep the stored value:

```js
const resolved = incoming.membershipInterval !== undefined
  ? incoming.membershipInterval
  : existing?.membershipInterval          // may itself be undefined — that's fine
```

Without this, an older client or a stale form silently moves an annual ticket back to monthly, or
withdraws a free-months offer the host is already advertising, either of which changes what the
next buyer's card is charged.

**`membershipFreeMonths` needs one extra step: clamp on write, and `0` is a real value, not an
omission.** A host clearing the field is saying "no months" — that must overwrite whatever was
stored, not fall through to it. Only an **absent key** means "leave it alone".

```js
const MAX_MEMBERSHIP_FREE_MONTHS = 12

const clamp = (n) => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v > 0 ? Math.min(v, MAX_MEMBERSHIP_FREE_MONTHS) : 0
}

const resolvedFreeMonths =
  incoming.membershipFreeMonths !== undefined
    ? clamp(incoming.membershipFreeMonths)          // includes the "cleared to 0" case
    : existing?.membershipFreeMonths !== undefined
      ? clamp(existing.membershipFreeMonths)         // re-clamp even the stored value
      : undefined                                    // truly never set — omit the key
```

**Price change ⇒ new Stripe price.** Stripe prices are immutable:

```js
const priceChanged = !existing || Number(existing.price) !== incoming.price
const stripeProductId = priceChanged
  ? (await stripe.prices.create({ unit_amount: Math.round(incoming.price * 100), currency: "usd",
      product_data: { name: incoming.name } })).id
  : existing.stripeProductId
```

Bookings already made keep the old price id. That is correct — it is what the buyer paid.

---

## 4a. NEW (Rev 6) — the web's ticket endpoints, and two rules every ticket write follows

If the app writes tickets **through the web**, these are the endpoints. If it writes the
`events` document **directly**, it must reproduce what they do — especially the two rules below.

| Endpoint | Auth | Body | Does |
|---|---|---|---|
| `PATCH /api/events/:eventId/tickets` | session, admin **or** owner | `{ tickets: [IncomingTicket] }` (shape below) | Replaces the ticket list via `resolveTickets` (§4) — `_id`s and price ids survive; sets `isPaid: tickets.length > 0`; `$unset draftRevision`. Returns `{ _id, tickets, isPaid }`. Writes nothing else on the event. |
| `PUT /api/events/:eventId/tickets/:ticketId/update` | session, admin or owner | `{ title, description }` — both required, non-empty | Renames one ticket (`name`, `desc`) in place; `$unset draftRevision`. |
| `DELETE /api/events/:eventId/tickets/:ticketId/delete` | session, admin or owner | — | Refused (400 "Ticket has bookings and cannot be deleted") when any booking **on this event** for this ticket has a status **not** in `cancelled / rejected / failed / refunded` (exclusion, never an allow-list — `checked_in` must block). Else `$pull` the ticket, `$unset draftRevision`. |
| `PUT /api/events/:eventId/update` | session, admin or owner | the **whole** event | Full-document replace — tickets included. Don't use it just to edit tickets: an omitted key there resets timezone, status, poll, etc. |

All return the `{ message, status, code, data }` envelope, 405 on the wrong method, 400 on a
malformed id, 403 for a non-owner host.

`IncomingTicket` (the wire shape — note `title` / `description`, not `name` / `desc`):

```jsonc
{
  "id": "<stored _id string, or any new client id for a new ticket>",
  "title": "VIP",                       // required, non-empty — "Give this ticket a name."
  "description": "<p>…</p>",            // optional
  "price": 120,                         // number, ≥ 0, never 0.01–0.49
  "requireApproval": true,              // optional — omit = unchanged
  "quantity": 50,                       // optional int ≥ 0; null = clear to unlimited; omit = unchanged
  "memberships": ["concierge"],         // optional — omit = unchanged (ADMIN only, §6 rule 0)
  "membershipInterval": "year",         // optional "month" | "year"
  "membershipFreeMonths": 1,            // optional int 0–12
  "includesPremium": false              // deprecated, still accepted
}
```

**Rule 1 — every ticket write clears the event's autosave shadow draft:** `$unset: {
draftRevision: "" }` in the same update. The web's Manage Event screen seeds its form from
`draftRevision` when one is current, so a draft written before your edit would show the old
tickets and republish them on the host's next Save. (`draftRevision` is `select: false`.)

**Rule 2 — check ownership before any Stripe call.** Creating a price for a request that is then
refused leaves an orphan price in Stripe.

---

## 5. `requireApproval` is tri-state — REVISION 1

| Stored | Meaning |
|---|---|
| `undefined` | Inherit `event.requireApproval` |
| `true` | This ticket always needs host approval |
| `false` | This ticket never does, even if the event says otherwise |

Never write `false` as a default. It pins legacy tickets to OFF the first time they're saved.

Resolution:

```js
const requiresApproval = ticket.requireApproval !== undefined
  ? ticket.requireApproval
  : !!event.requireApproval
```

---

## 6. Memberships sold with a ticket — REVISION 1

A ticket can sell **Jetzy Premium** and/or **Full Concierge** alongside itself. A buyer who
doesn't already hold the membership pays the ticket price **plus the first period** of each (unless
free months apply — see §6a), in one payment; the subscription is created afterwards, server-side.

### Fields

```jsonc
"memberships": ["premium"],        // authority
"membershipInterval": "year",      // "month" | "year"; absent = month
"includesPremium": true            // deprecated mirror, still written
```

### Resolution — use exactly this logic

```js
// which memberships does this ticket sell?
function ticketMemberships(ticket) {
  if (Array.isArray(ticket.memberships)) return ticket.memberships   // authority, even if []
  return ticket.includesPremium ? ["premium"] : []                   // legacy fallback
}

// at what interval?
function ticketMembershipInterval(ticket) {
  return ticket.membershipInterval === "year" ? "year" : "month"     // anything else = month
}
```

Note the first function: an **empty array is an answer** ("sells nothing"), not a missing value.
Only `undefined` falls through to `includesPremium`.

### Prices (Rev 6 — repriced 2026-09-18; Concierge Annual added 2026-10-19)

**Never hardcode a price or price id in the app.** Read `GET /api/subscriptions/plan?membership=…`
(§6b rule 3). The ids below are for recognising products and for testing.

| | Test | Live |
|---|---|---|
| Premium product | `prod_Uxn2R9FQd5F3sp` | `prod_UzMR33CL777c3R` |
| Premium **$10/month** (product default) | `price_1TxrSKB7XccR5GE0D3uPXEF5` | `price_1TzNi9B7XccR5GE0JT9sMe3b` |
| Premium **$100/year** | `price_1UGhmtB7XccR5GE0n4uLaXjp` | `price_1UH2dpB7XccR5GE07ESXO7Qg` |
| ~~Premium $20/mo, $200/yr~~ | retired — existing subscribers are being moved off them | |
| Concierge monthly product | `prod_UjabUJ9OXWhLPJ` ($59.50/month) | `prod_UlQTOgXS73TAEV` |
| Concierge **Annual** product (separate) | `prod_UlPxrsQgIknFRQ` ($595/year default) | `prod_UlQT3lIpJo2PK6` ($595/year default) |

Both Premium prices are on the **same product** — membership is detected by product id. Never
create a new Premium price or product. **Concierge is the exception**: its annual price lives on a
separate product, so detect Concierge by **either** product id (`isMembershipProduct`,
`BOOKING_FLOW.md` §3.6).

**What a ticket set to `membershipInterval: "year"` charges, per membership:** that membership's
yearly price if one exists across its products, else its default monthly price
(`findMembershipPriceForInterval(key, "year") || getMembershipPrice(key)`). Today **both**
memberships have a yearly price, so a yearly ticket sells Premium at $100/yr and Concierge at
$595/yr. Resolve it from `/api/subscriptions/plan`'s `prices[]` rather than assuming — the fallback
exists for a membership that loses its yearly price.

### Rules

0. **(Rev 6) Membership options are ADMIN / SUPER-ADMIN only.** A host (non-admin owner) may
   create and edit tickets, but must neither see nor change `memberships`, `membershipInterval` or
   `membershipFreeMonths`. Their form omits those keys, and preserve-on-omit (§4) keeps whatever an
   admin set. **On the web this is enforced by the UI only** — the endpoints accept the keys from a
   host. **The app's API must enforce it**: for a non-admin, ignore (don't 403) any membership keys
   in the payload and keep the stored values; on create, write `memberships: []`.

1. **~~A ticket selling a membership must have `price > 0`.~~ THIS RULE IS REVERSED (2026-09-03).**
   A membership-selling ticket may now be **`$0`**. The membership is the thing being sold and
   carries its own charge, so a free ticket simply means a non-member pays for the membership
   alone and an existing member registers instantly with nothing to collect. Only §2a's ordinary
   $0.50 floor still applies. If your checkout implementation also has to handle this — see the
   note at the end of §7.
2. **Write both fields.** `memberships` is what everything reads; `includesPremium` is mirrored so
   older readers still see a bundled Premium ticket. Set it to
   `memberships.includes("premium")`.
3. **~~Only Premium is sold annually.~~ (Rev 6: false since 2026-10-19 — Concierge sells yearly
   too.)** `membershipInterval` is still ONE value per *ticket*; each membership on it resolves that
   interval against its own prices (above). The web's form puts the Monthly / Annual choice
   **inside each membership's row** that offers annual, and shows "Monthly only · $X/month" in the
   row of one that doesn't. Unticking the last annual-capable membership sets the interval back to
   `"month"` in the **same** write as the membership change.
4. **Disclosure follows the RESOLVED interval of each membership.** Any screen showing the ticket
   must state the real recurring amount and interval before purchase — "$100/year", not
   "$10/month", on an annual ticket; one line per membership. This is a card-network requirement,
   not a preference.
5. **Approval and memberships can coexist.** A bundled ticket may require approval; it is held as a
   manual-capture authorization and the subscription is created when the host approves
   (`BOOKING_FLOW.md` §7). On an approval ticket, the hold includes the membership's first period —
   up to $595 + ticket for ~7 days on a yearly Concierge ticket; warn the admin when setting it.
6. **(Rev 6) Concierge INCLUDES Jetzy Premium.** A Concierge member is a Premium member for every
   purpose, billed for Concierge only. On the ticket form, ticking Concierge greys out Premium
   ("Included with Concierge", disabled), and the stored list drops any membership another ticked
   one includes:
   ```js
   const INCLUDES = { premium: [], concierge: ["premium"] }
   const toggle = (current, key, checked) => {
     const ticked = ["premium", "concierge"].filter((k) => (k === key ? checked : current.includes(k)))
     return ticked.filter((k) => !ticked.some((o) => o !== k && INCLUDES[o].includes(k)))   // ["premium","concierge"] → ["concierge"]
   }
   ```
   New tickets therefore store `["concierge"]`, never both. A legacy ticket that stores both still
   sells — checkout bills Concierge only — and is tidied by the admin's next toggle. `includesPremium`
   mirrors the stored array, so it is `false` on a `["concierge"]` ticket.

### Examples

```jsonc
// plain paid ticket
{ "name": "General", "price": 40, "stripeProductId": "price_…", "memberships": [] }

// ticket + Premium, monthly ($40 + $10 today, then $10/month)
{ "name": "Member Entry", "price": 40, "stripeProductId": "price_…",
  "memberships": ["premium"], "includesPremium": true }

// ticket + Premium, ANNUAL ($40 + $100 today, then $100/year)
{ "name": "Founding Member", "price": 40, "stripeProductId": "price_…",
  "memberships": ["premium"], "membershipInterval": "year", "includesPremium": true }

// ticket + Concierge, ANNUAL ($120 + $595 today, then $595/year; includes Jetzy Premium)
// what the form stores when the admin ticks Concierge (Premium is dropped — rule 6)
{ "name": "Full Access", "price": 120, "stripeProductId": "price_…",
  "memberships": ["concierge"], "membershipInterval": "year",
  "includesPremium": false }

// LEGACY — both stored (saved before rule 6). Still sells; billed as Concierge only.
{ "name": "Full Access (old)", "price": 120, "stripeProductId": "price_…",
  "memberships": ["premium", "concierge"], "includesPremium": true }

// approval-gated bundled ticket — allowed
{ "name": "Vetted Entry", "price": 75, "stripeProductId": "price_…",
  "requireApproval": true, "memberships": ["premium"], "includesPremium": true }

// FREE ticket + Premium — allowed since 2026-09-03 (was rejected before)
{ "name": "Community Meetup", "price": 0, "stripeProductId": "price_…",
  "memberships": ["premium"], "includesPremium": true }
```

---

## 6a. NEW — Free months, given with no code typed

**What it is.** A host can now give away the first N months of a bundled membership on a specific
ticket, with **no code required at checkout**. Every buyer of that ticket gets the offer by
default. It coexists with, but is a separate mechanism from, a referral code's own
`freeMembershipMonths` (a different field, on a different collection — `referral-codes`, not
`events`); see the combine rule below.

### Field

```jsonc
"membershipFreeMonths": 1     // 0-12, integer. Absent/0 = no gift. Clamped on write — see §4.
```

### Resolver — use exactly this logic

```js
const MAX_MEMBERSHIP_FREE_MONTHS = 12

function ticketMembershipFreeMonths(ticket) {
  const raw = Math.floor(Number(ticket.membershipFreeMonths))
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_MEMBERSHIP_FREE_MONTHS) : 0
}
```

### The combine rule — BEST OFFER WINS, they never stack

If a buyer also has a referral code that grants free months (Premium-only, on the
`referral-codes` collection), the two do **not** add together. The larger one applies:

```js
// key = "premium" | "concierge"
function resolveFreeMonthsForKey(key, ticketMonths, referralMonths) {
  return Math.max(
    Number(ticketMonths) || 0,
    key === "premium" ? Number(referralMonths) || 0 : 0,   // referral months are Premium-only
  )
}
```

- A referral code worth **less** than the ticket's own gift (including a code worth `0`, i.e. an
  ordinary discount code with no membership offer on it) **never removes** the ticket's months.
- The ticket's own months apply to **every** membership it sells — Premium **and** Concierge. A
  referral code's months apply to **Premium only** — Concierge is sold on selectmember.jetzy.com's
  terms, and a discount code is not the host making a deliberate choice about that product.
- This function is the single source of truth on the web side (`src/lib/premium-bundle.ts`,
  `resolveFreeMonthsForKey`) and is called from the checkout endpoint, the free-ticket endpoint,
  and the buyer-facing price preview. **Implement it exactly once on your side too** — if your
  checkout UI computes the disclosed offer one way and your checkout backend charges based on a
  different computation, a buyer can be shown one deal and charged another.

### What "free months" actually changes

Nothing about the ticket price. It changes what the **membership** costs on its first period:
instead of charging the membership's normal rate today, the subscription is created with a trial
covering N calendar months, and it bills the normal rate automatically once the trial ends. The
buyer still enters a card at checkout (so the renewal has something to charge) — the months are
free, not the membership.

### Examples

```jsonc
// $50 ticket + Premium, host gives 1 free month, no code needed
// buyer pays $50 today; Premium is $0 for month 1, then $10/month
{ "name": "Launch Party", "price": 50, "stripeProductId": "price_…",
  "memberships": ["premium"], "membershipFreeMonths": 1, "includesPremium": true }

// FREE ticket + Premium + 2 free months
// buyer pays $0 today for everything, but a card is still collected so month 3 can bill $10
{ "name": "Community Meetup", "price": 0, "stripeProductId": "price_…",
  "memberships": ["premium"], "membershipFreeMonths": 2, "includesPremium": true }

// ticket gives 1 month; buyer separately enters a referral code worth 3 months on Premium
// -> resolved offer is 3 months (the LARGER of the two), never 4
```

### Cap, for context (checkout-side, not ticket-side)

Unrelated to this field but easy to confuse with it: a **buyer** may purchase at most
`PREMIUM_TICKET_MAX_PER_ORDER = 2` membership-bundled tickets in one order, and at most
`PREMIUM_TICKET_LIMIT_PER_EVENT = 2` across every order they place for one event (per product,
per event — buying two Premium tickets doesn't touch their Concierge allowance). This has nothing
to do with `membershipFreeMonths`; it exists to stop one person collecting the membership many
times over on one event. Mentioned here only so it isn't mistaken for a limit on the free-months
field itself, which has its own independent cap (`MAX_MEMBERSHIP_FREE_MONTHS = 12`, per ticket).

---

## 6b. NEW (Revision 3) — Full Concierge is live: don't block it

**Concierge has been sold with tickets on the web since 2026-09-03.** There is no "coming soon"
state anywhere on the server — hosts can tick it, `/api/checkout` charges it, the subscription is
created, renewals and cancellation emails run. A ticket whose `memberships` contains `"concierge"`
is an ordinary sellable ticket.

If the app shows **"Ticket … offers a membership that isn't available yet"**, that message comes
from the app itself. Remove the check that produces it.

### Rules

1. **Accept both keys.** Valid values of `memberships` are `[]`, `["premium"]`, `["concierge"]` and
   `["premium", "concierge"]`. Read them with `ticketMemberships()` from §6.
2. **An unknown key is ignored, not fatal.** If a future key appears that the app doesn't
   recognise, drop that key and keep selling the ticket — the server does the same
   (`sanitizeMembershipKeys`). Blocking the whole ticket over one unrecognised entry is what caused
   this bug.
3. **Get the price from the server, don't hardcode it.** Concierge's rate is set in Stripe and
   differs between environments:

   ```
   GET /api/subscriptions/plan?membership=concierge     // unauthenticated
   GET /api/subscriptions/plan?membership=premium
   ```

   ```jsonc
   "data": {
     "membership": "concierge",
     "name": "Full Concierge Membership",   // use this label
     "unitAmount": 5950,                    // CENTS — the default price
     "currency": "usd",
     "interval": "month",
     "prices": [                            // one per interval, cheapest first
       { "id": "price_…", "unitAmount": 5950, "currency": "usd",
         "interval": "month", "intervalCount": 1, "isDefault": true }
     ]
   }
   ```

   Pick the entry in `prices[]` whose `interval` matches the ticket's interval. If there isn't one,
   use the default (`isDefault`). The server charges the same way. **(Rev 6)** Concierge's `prices[]`
   now includes a `"year"` entry gathered from the Concierge Annual product. For reference, test
   mode is currently Concierge **$59.50/month, $595/year**; Premium **$10/month, $100/year**.
   `productId` is also returned (the main product only — don't use it for detection).
4. **Use these names** in the disclosure:

   | key | Buyer-facing label | Receipt line |
   |---|---|---|
   | `premium` | Jetzy Premium | Jetzy Premium membership |
   | `concierge` | Full Concierge Membership | Full Concierge Membership |

   (Don't append "membership" to the Concierge label — it already contains the word.)
5. **~~Concierge is monthly only.~~ (Rev 6: false.)** On a ticket with `membershipInterval:
   "year"`, Concierge is quoted and charged yearly ($595/yr). Show **one recurring line per
   membership charged** — one line for two charges fails disclosure (§6 rule 4). Under a Concierge
   line, also show **"Includes Jetzy Premium"**.
5a. **(Rev 6) Concierge includes Premium on the BUYER side too.** A ticket storing both (legacy)
   shows and charges Concierge only, with Premium "included with Full Concierge Membership". A
   buyer who already holds Concierge is never charged for Premium; the web's checkout says
   "Jetzy Premium — included with your Full Concierge Membership. You won't be charged for it."
6. **Free months:** the ticket's `membershipFreeMonths` covers Concierge too; a referral code's
   months never do (§6a).
7. **Already a member:** the server skips any membership the buyer already holds, looked up by the
   **checkout email** (our records, then Stripe across every customer with that email, then
   SelectMember's status), separately for each membership. A Concierge member counts as holding
   Premium. **Exception — upgrade:** a MONTHLY Concierge member on a ticket selling Concierge
   YEARLY is charged $595 (no free months), the year starting when their paid month ends, and
   their monthly plan stops then. **Exception — reactivation:** a member who cancelled (still in
   the paid period) is not charged, and their cancellation is undone when the booking confirms.
   The server has the final say; the app only previews (§14).
8. **Limits are per membership** — 2 per order, 2 per email per event, counted separately for
   Premium and Concierge (§6a "Cap").

### Example — what the buyer should see

```jsonc
// ticket
{ "name": "Full Access", "price": 120, "memberships": ["concierge"], "membershipInterval": "year" }
```

```
Full Access                              $120.00
Full Concierge Membership — first year   $595.00   then $595/year until you cancel
  Includes Jetzy Premium
Due today                                $715.00
```

```jsonc
// ticket
{ "name": "Member Night", "price": 40, "memberships": ["premium"], "membershipInterval": "year",
  "membershipFreeMonths": 1 }
```

```
Member Night                             $40.00
Jetzy Premium — 1 month free             $0.00     then $100/year until you cancel
Due today                                $40.00
```

(Figures are test mode; take them from `/api/subscriptions/plan`.)

### Test on staging

Concierge test products `prod_UjabUJ9OXWhLPJ` (monthly) and `prod_UlPxrsQgIknFRQ` (annual).
Cover: a Concierge-only ticket (monthly and yearly), an admin ticking Concierge with Premium
already ticked (Premium must drop), a legacy ticket storing both, a `$0` ticket with Concierge, a
host editing an admin's membership ticket (memberships untouched), and buyers who already hold
Premium / Concierge / a monthly Concierge (upgrade) / a cancelled Concierge (reactivation).

---

## 7. Selling: what the checkout expects — REVISION 1, with one addition

> **(Rev 6) WEB-ONLY — reference.** The app does **not** call these endpoints: ticket buying
> happens on the web, which the app opens at `events.jetzy.com/<slug>?src=app` and returns from via
> `jetzy.com/jetzy_event?eventId=…&bookingRef=…&status=…` (`BOOKING_FLOW.md` §5.0). §7 and §7a
> stay here so you know what the booking you read back was built from. The checkout contract
> (all five Stripe session shapes, fulfilment) is `BOOKING_FLOW.md` §5.

Post the ticket **id** and quantity — the server rebuilds prices from the event record and
re-validates any referral code. Nothing about money is trusted from the request body.

```jsonc
POST /api/checkout            // or /api/checkout/free-events when the total is $0
{
  "tickets": [{ "id": "<ticket _id>", "quantity": 2, "eventId": "<event _id>" }],
  "user": { "firstName": "…", "lastName": "…", "email": "…", "phone": "…" },
  "referralCode": "JETZY-ME"   // optional
}
```

The booking is created by the Stripe webhook (idempotent on `bookingRef`, format `JZ-…`), which
also issues the QR, sends the confirmation and increments `eventtrackers.bookedTickets`.

A booking stores `{ ticketId, quantity }` — never a copy of the name or price.

**One new wrinkle from §6a, if you implement checkout too (not just ticket CRUD):** a `$0` ticket
that bundles a membership with `membershipFreeMonths > 0` cannot be treated as an ordinary free
registration. Since nothing is charged, a subscription created with no saved card would simply be
**cancelled by Stripe** when the free months end, instead of converting and billing — the buyer
would silently lose the membership they were promised. Our implementation routes that specific
case to a separate Stripe Checkout Session shape purely to collect a card (no charge), or in the
common single-membership case a `subscription`-mode session with `trial_end` so the page shows a
priced summary. (Rev 6: the session shapes are written down in `BOOKING_FLOW.md` §5.3 — and the
app does not build checkout, so this is reference only.)

---

## 7a. NEW (Revision 3) — the two routing replies

> **(Rev 6) WEB-ONLY — reference**, like §7. The app hands buying to the web.

A ticket that sells a membership is a `$0` registration for someone who already holds it and a
purchase for everyone else. The app picks the endpoint from its own guess (usually a lookup of the
typed email), and that guess can be stale. Each endpoint therefore tells you when you picked the
wrong one. Both replies use the usual envelope `{ message, status, code, data }`.

| Endpoint you called | Reply | Meaning | Do this |
|---|---|---|---|
| `POST /api/checkout/free-events` | HTTP **400**, `status: false`, `data: { needsCheckout: true, owed: ["concierge"] }` | This buyer still owes a membership (listed in `owed`), so it isn't free for them. | Send the **same body** to `POST /api/checkout` and follow its Stripe redirect. |
| `POST /api/checkout` | HTTP **200**, `status: true`, `data: { freeOrder: true }` (no Stripe `url`) | Stripe says the buyer already holds every membership on this ticket, and nothing else is charged. | Send the **same body** to `POST /api/checkout/free-events`. |

Rules:

- **Switch at most once.** If the second endpoint sends you back again, stop and show its
  `message` — don't loop between the two.
- **Check these flags before showing an error.** The `needsCheckout` reply is a 400 whose message
  ("This ticket includes … — please complete checkout.") asks the buyer to do something they can't
  do in the app. Don't show it on the first attempt.
- **`freeOrder` has no `url`.** Code that opens `data.url` whenever the reply succeeds will open
  nothing. Check `freeOrder` first.
- A `$0` ticket with free membership months can come back from `/api/checkout` as a card-only
  Stripe page (nothing charged, card saved for the renewal). It still has a `url` — follow it like
  any other checkout.

---

## 8. Checklist

- [ ] Read `memberships` via the fallback in §6, not the raw field
- [ ] Read `membershipInterval` via the `=== "year" ? "year" : "month"` rule
- [ ] Read `membershipFreeMonths` via the clamping resolver in §6a, not the raw field
- [ ] **(Rev 4)** Read `quantity` via the resolver in §10 — `undefined` is UNLIMITED, `0` is CLOSED
- [ ] **(Rev 4)** Send `null` to clear a `quantity` back to unlimited; omitting the key means unchanged
- [ ] **(Rev 4)** Count remaining spots from live bookings (§10), never from `eventtrackers.bookedTickets`
- [ ] **(Rev 5)** Read availability from `GET /api/events/:id/availability` (§11) — public, no auth, never cached
- [ ] **(Rev 5)** Do NOT block a request because pending ones "fill" the ticket — pending holds no seat (§12)
- [ ] **(Rev 5)** Surface the approve endpoint's refusal message verbatim; it is written for the host
- [ ] **(Rev 5)** If you build an approvals screen, support approving fewer tickets, with its three refusals (§12)
- [ ] **(Rev 5)** Read a booking's quantity from `booking.tickets` — it can change after purchase (§13)
- [ ] **(Rev 5)** Never call `refunds.create`. A reduced capture is not a refund.
- [ ] Write `memberships` **and** mirror `includesPremium`
- [ ] Never write `[]` / `"month"` / `0` / `false` as defaults on a ticket you didn't create —
      omit the key instead
- [ ] A membership-selling ticket may be `$0` — do **not** reject it (§6 rule 1 was reversed)
- [ ] Every ticket's price is either exactly `0` or `>= 0.50` (§2a) — reject `0.01`–`0.49`
- [ ] `membershipFreeMonths` is `0`–`12`, clamped on write, and `0` **overwrites** a previous
      value rather than being treated as "not sent"
- [ ] Implement `resolveFreeMonthsForKey` (best-offer-wins, never stacks, referral months are
      Premium-only) exactly, so your disclosure and your charge can't disagree
- [ ] Show the correct recurring amount and interval before purchase, and the correct free-months
      offer if one applies, before the buyer commits
- [ ] Preserve `_id`, and preserve omitted fields, on every edit
- [ ] Mint a new Stripe price only when the price actually changed
- [ ] **(Rev 3)** Sell tickets whose `memberships` includes `"concierge"` — no "not available yet"
      block; ignore unknown keys rather than blocking the ticket (§6b)
- [ ] **(Rev 3)** Quote membership prices from `/api/subscriptions/plan?membership=…`, one recurring
      line per membership, Concierge always monthly (§6b)
- [ ] ~~**(Rev 3)** Handle `needsCheckout` / `freeOrder`~~ — web-only since buying moved to the
      web (§7a)
- [ ] **(Rev 6)** Membership toggles shown to admins only, and the API ignores membership keys
      from a non-admin (§6 rule 0)
- [ ] **(Rev 6)** Ticking Concierge drops/greys Premium; store `["concierge"]`, never both (§6 rule 6)
- [ ] **(Rev 6)** Billing chosen per membership row; one `membershipInterval` stored; reset to
      `"month"` when nothing annual-capable is left (§6 rule 3)
- [ ] **(Rev 6)** No hardcoded prices — Premium is $10/$100 now, Concierge $59.50/$595 on test;
      read `/api/subscriptions/plan` (§6, §6b)
- [ ] **(Rev 6)** Detect Concierge by either product (monthly or annual) (§6)
- [ ] **(Rev 6)** Every ticket write `$unset`s `draftRevision`; delete is refused while a non-dead
      booking holds the ticket; keep `isPaid` in step (§3, §4a)
- [ ] **(Rev 6)** Ticket `desc` is HTML — sanitise and render; plain text still possible (§1)
- [ ] **(Rev 6)** Buyer display per §14: "Sold out" at 0, "Only 1 left" at 1 only, stepper caps,
      one recurring line per membership, "Includes Jetzy Premium" under Concierge

---

## 9. Unrelated change, same collection family — REVISION 1

Referral codes became **unique per event** on 19 Aug 2026 — the global `code_1` unique index was
dropped and replaced with `{ eventId, code }` unique, so one campaign string can run on several
events at once. Any query that resolves a referral code by string alone now matches an arbitrary
event's row. Scope every lookup by `eventId`, including anything that increments `usageCount`.

`ReferralCodes.freeMembershipMonths` (0–12, `default: 0`) is the field that feeds the `referral`
side of §6a's combine rule. It is on the `referral-codes` collection, not on the ticket.

---

## 10. NEW (Revision 4) — Per-ticket capacity, and how "how many are left" is worked out

**What changed.** Capacity used to be one number for the whole event (`events.capacity`, mirrored
onto `eventtrackers`). A host could not say "50 VIP, 200 General". Now every ticket carries its
own limit, and the event-wide number is legacy.

### Field

```jsonc
"quantity": 50     // how many of THIS ticket exist, in total
```

| Stored | Meaning |
|---|---|
| **absent / `undefined`** | **UNLIMITED** |
| `0` | closed — the ticket exists but cannot be booked |
| `n > 0` | `n` exist in total, across every booking |

**`undefined` is unlimited, and `0` is NOT the same thing.** Every ticket written before this
field existed has no value, and reading those as "0 left" would take every live event offline at
once. Never write `0` as a default, and never write the key at all on a ticket the host didn't
put a number on.

Note this is the opposite convention from `events.capacity`, where `0` means unlimited. They are
different fields with different histories; don't copy one rule onto the other.

### Resolver — use exactly this logic

```js
function ticketQuantityLimit(ticket) {
  const raw = ticket?.quantity
  if (raw === undefined || raw === null || raw === "") return null   // null = unlimited
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value) || value < 0) return null              // garbage reads as unlimited
  return value
}

function remainingForTicket(limit, sold) {
  return limit === null ? null : Math.max(0, limit - sold)           // null = unlimited
}
```

A non-integer or negative value reads as **unlimited**, not as a limit. Refusing a sale because
of a number nobody typed is the worse failure.

### The wire format has THREE states — this is the important part

| You send | Server does |
|---|---|
| key absent | **unchanged** (preserve-on-omit, §4) |
| `null` (or `""`) | **clear** — the ticket goes back to unlimited |
| a number | set it, including `0` |

`membershipFreeMonths` gets away with two states because `0` *is* its "none". Here `0` (closed)
and unlimited are genuinely different, so an explicit clear signal is unavoidable. **A form field
the host has emptied must send `null`, not omit the key** — otherwise a limit can be set and
never removed.

### Counting what is left — from the BOOKINGS, not the counter

```js
// remaining for a ticket = quantity - (live bookings holding that ticket)
db.bookings.aggregate([
  { $match: {
      eventId: ObjectId("…"),
      isDeleted: { $ne: true },                                       // NOT `false` — see below
      status:    { $nin: ["cancelled", "rejected", "failed", "pending"] },
  }},
  { $unwind: "$tickets" },
  { $group: { _id: "$tickets.ticketId", sold: { $sum: "$tickets.quantity" } } },
])
```

Four rules, each of which was a real bug:

1. **`isDeleted: { $ne: true }`, never `isDeleted: false`.** Rows written directly to this shared
   collection can carry no `isDeleted` field at all, and an equality match silently drops every
   one of them. Under-counting oversells the event.
2. **Classify dead statuses by EXCLUSION, never allow-list the live ones.** `status` is not a
   closed set — `checked_in` is live in production. An unrecognised status must count as a live
   seat.
3. **`pending` does NOT hold a spot.** An approval request consumes nothing until the host
   approves; the approval endpoint is where the limit bites. This matches what the tracker always
   did (it only incremented on approval).
4. **A booking with no ticket rows counts as 1 seat** against the event-wide total, and against no
   individual ticket.

### The event-wide ceiling still applies

`events.capacity` is **not** removed. The web portal no longer offers an input for it, but a
stored non-zero value is still honoured as an overall ceiling **on top of** the per-ticket
limits, so no existing event silently became unlimited. An order is refused if EITHER the
ticket's own remaining or the event's remaining is short:

```
ticketRemaining = quantity === undefined ? null : max(0, quantity - soldForThatTicket)
eventRemaining  = capacity > 0           ? max(0, capacity - totalSeatsSold) : null
maxSellable     = min(of the non-null ones)       // null when both are null
```

### What a checkout implementation must do

- **Check before taking money**, not after. There are no refunds, so refusing a sale at
  fulfilment would mean money taken with no ticket.
- Show the buyer what is left — a "Sold out" state and a "only N left" line — and cap any
  quantity stepper at `maxSellable`. A ticket with `quantity: 0` must not be selectable at all.
- **Do not reject a save because the limit is below what is already sold.** The venue shrank and
  the host is correcting the record; it closes the ticket, it does not cancel anyone. `remaining`
  clamps at 0.

### Examples

```jsonc
// 50 of this ticket, then sold out
{ "name": "VIP", "price": 120, "stripeProductId": "price_…", "quantity": 50 }

// unlimited — the key is absent, NOT set to 0
{ "name": "General", "price": 40, "stripeProductId": "price_…" }

// exists but closed; still visible, cannot be booked
{ "name": "Early Bird", "price": 25, "stripeProductId": "price_…", "quantity": 0 }
```

---

## 11. NEW (Revision 5) — Reading availability: `GET /api/events/:eventId/availability`

§10 tells you how to COUNT what's left. This is the endpoint that does it for you, so the app
doesn't have to run that aggregation itself.

**Public and unauthenticated**, by design — it returns counts only, no personal data. Send no
auth header. `Cache-Control: no-store`; do not cache the response, a stale availability number
sells a seat that doesn't exist.

```
GET /api/events/68f1.../availability
```

```jsonc
{
  "eventLimit": 150,        // legacy event-wide ceiling; null = no ceiling
  "eventSold": 138,
  "eventRemaining": 12,     // null = unlimited
  "tickets": [
    { "ticketId": "6a83…", "name": "VIP",     "limit": 50,   "sold": 50, "remaining": 0 },
    { "ticketId": "6a84…", "name": "General", "limit": null, "sold": 88, "remaining": null }
  ]
}
```

**This is NOT the usual `{ message, status, code, data }` envelope** — it returns the object
directly. It is the one endpoint in this document that does.

### How to use it

```js
// what a buyer may select for one ticket — both limits apply, smaller wins
function maxSelectable(availability, ticketId) {
  const row = availability.tickets.find(t => t.ticketId === ticketId)
  const limits = [row?.remaining, availability.eventRemaining].filter(n => n !== null && n !== undefined)
  return limits.length ? Math.min(...limits) : null      // null = unlimited
}
```

- `remaining === 0` → show **Sold out** and make the ticket unselectable.
- `remaining !== null` → cap the quantity stepper at it, and say why the stepper stopped.
- `remaining === null` → unlimited, no cap, no badge.
- **Re-fetch after a checkout attempt** and when the buyer returns to the page. Ours refetches on
  window focus and when the checkout sheet closes.

The numbers exclude PENDING approval requests (§12), so `remaining` is "seats a buyer can claim
right now", not "seats nobody has asked about".

---

## 12. NEW (Revision 5) — Approvals: what consumes a seat, and approving part of a request

> **SUPERSEDED (2026-10-15) by `BOOKING_FLOW.md` §7.** That document is the booking contract now —
> approvals, approving fewer, editing requests and bookings, cancellation, check-in. Two rules below
> are **out of date**: a request whose ticket sells a membership **can** now be partly approved
> (the membership is charged in full, only the ticket part is scaled), and a partial approval is
> written to the booking only **after** the capture succeeds. The seat rule ("a pending request
> holds no seat") still stands.

### A PENDING request does NOT hold a seat

This is the rule that surprises people, so it is stated first.

`requireApproval` (§5) creates a booking with `status: "pending"`. **That booking consumes no
capacity.** The seat is consumed when the host approves and the booking becomes `confirmed`.

Consequences you must design for:

- A ticket with 3 seats can legitimately collect **four requests for 2 each**. Do not refuse the
  second request at checkout because the pending ones "fill" the ticket — they don't, and
  over-collecting is often the point of an approval event.
- The limit bites at **approval time**. Approving is where a request can be refused for capacity.
- §10's counting query already excludes `pending` from the dead-status list for exactly this
  reason. Don't change that.

### Approve — `POST /api/bookings/approve`

Session required. Caller must be an **admin or the event's owner**.

```jsonc
{ "bookingRef": "JZ-…" }
```

Normal envelope `{ message, status, code, data }`. On success:

```jsonc
"data": {
  "bookingRef": "JZ-…",
  "status": "confirmed",
  "payment": { "status": "captured", "amount": 80, "capturedAt": "…" },
  "amountCharged": 80,
  "requestedTickets": 2,
  "approvedTickets": 2,
  "partial": false
}
```

Approval also **captures the card hold** for a paid request. It can be refused — most commonly
`"Cannot approve: only 1 spot is left for \"VIP\"."` Surface that message; it is written for the
host to read.

### Approving FEWER tickets than were asked for — NEW

When a request no longer fits, the host does not have to reject the whole thing. Send a
**reduced** ticket list:

```jsonc
{
  "bookingRef": "JZ-…",
  "tickets": [ { "ticketId": "6a83…", "quantity": 1 } ]     // they asked for 2
}
```

```jsonc
"data": { …, "requestedTickets": 2, "approvedTickets": 1, "partial": true }
```

Rules the server enforces — mirror them so you never show a button that will be refused:

1. **It may only SHRINK.** Same ticket id set as the booking, every quantity `<=` what was
   booked, total `>= 1`, total `<` the original. This endpoint seats fewer people; it never
   sells more.
2. **Refused when the booking covers more than one ticket type.** A booking stores no per-ticket
   price (§7), so the partial capture scales the held amount proportionally — which is only
   correct when every ticket in the order costs the same.
3. ~~**Refused when the ticket sells a membership** (§6).~~ **No longer true (2026-10-14)** — a
   membership is sold once per order, so it is allowed; see `BOOKING_FLOW.md` §7.2–7.3.
4. Omit `tickets` entirely for an ordinary approval. Sending the full quantity is equivalent, but
   omitting is clearer.

### What a partial approval does to the money

- The card is captured for the **reduced** amount: `held × approved / requested`.
- **This is not a refund.** Capturing under the authorized amount makes Stripe release the
  difference at no cost. Never call `refunds.create` — this platform issues no refunds.
- `booking.subTotal`, `discountAmount` and `total` are scaled by the same ratio, so the stored
  record and the receipt agree.
- `booking.tickets` is rewritten to the reduced quantity, and the edit is recorded (§13).

### What the guest is told

The confirmation email states plainly that they asked for 2, there was room for 1, and they were
**not** charged for the other. If you build your own confirmation, say the same — a guest who
reads an ordinary confirmation will believe they hold the full number.

### Reject — `POST /api/bookings/reject`

```jsonc
{ "bookingRef": "JZ-…" }
```

Same auth. Releases the card hold (never a refund — nothing was captured) and emails the guest.

---

## 13. NEW (Revision 5) — A host can change a booking's quantity after the fact

> **SUPERSEDED (2026-10-15) by `BOOKING_FLOW.md` §8.** Since this was written: the same endpoint
> also edits the **name**, **refuses a pending booking** (requests are edited through
> `update-request`, which stores a lower quantity as `adjustedTickets` on a held or membership
> request), refuses an **increase** on a booking that sold a membership, and keeps the `CheckIn`
> record in step.

`POST /api/bookings/update-tickets`. Session required, **admin or event owner**.

```jsonc
{
  "bookingRef": "JZ-…",
  "tickets": [ { "ticketId": "6a83…", "quantity": 1 } ]
}
```

**FREE bookings only.** A booking that was paid for — held, captured, or with a non-zero total and
no payment record — is refused. There are no refunds on this platform, so reducing a paid booking
would take a seat back and keep the money, and increasing one would hand over a ticket nobody
paid for. That decision is still open; treat the refusal as permanent for now.

Other rules:

- The submitted ticket ids must be an **exact permutation** of what the booking holds. No adding
  a ticket type.
- Total must be `>= 1`. To remove the booking entirely, cancel it (`POST /api/bookings/cancel`).
- **Increasing** re-checks availability (excluding this booking's own seats, so it isn't blocked
  by itself). Decreasing always succeeds.
- Refused if the new total drops below the number of guests already checked in on that booking.
- Refused if the ticket is now priced or now sells a membership, even when the booking itself was
  free — the host may have changed the ticket since.
- **Money fields are NOT recomputed.** No money moved. On an order a referral code discounted to
  $0, rewriting the subtotal would change what that campaign is reported to have achieved.

### New booking fields (audit)

Written by both this endpoint and a partial approval (§12). All three have **no defaults** —
absent means the booking was never edited, which is not the same as edited zero times.

```jsonc
"ticketsEditedAt":  ISODate("…"),
"ticketsEditedBy":  "host",            // "host" | "admin"
"ticketsEditHistory": [
  {
    "at": ISODate("…"),
    "by": "host",
    "byUserId": ObjectId("…"),
    "from": [ { "ticketId": ObjectId("…"), "quantity": 2 } ],
    "to":   [ { "ticketId": ObjectId("…"), "quantity": 1 } ]
  }
]
```

If you display a booking's quantity anywhere, read it from `booking.tickets` — it is no longer
guaranteed to be what was originally purchased. (A pending request edited down by the host stores
the lower number in `adjustedTickets` instead — read it through `plannedTickets`,
`BOOKING_FLOW.md` §8.)

---

## 14. NEW (Rev 6) — What a buyer sees on a ticket in the app

The app shows tickets before handing the buyer to the web to pay. What it shows must agree with
what the web will charge. Web reference: `src/components/EventTicketsComponent.tsx`.

### Selection

- **One ticket type per order** (single-select). The quantity stepper only renders when
  `event.isPaid` is true (§3).
- Stepper cap = the smaller of: `maxSelectable(availability, ticketId)` (§11) and, on a ticket that
  sells a membership, `PREMIUM_TICKET_MAX_PER_ORDER = 2`.
- When the stepper stops, say why: availability → `Only N tickets left for "<name>".` /
  `"<name>" is sold out.`; membership cap → the order-cap message (2 per order). The per-person
  limit (2 per email per event per membership, cancelled orders included) can only be judged
  against the email typed at checkout — the web enforces it there.

### Badges on the ticket card

| Remaining | Badge |
|---|---|
| `0` | **Sold out** — ticket not selectable |
| `1` | **Only 1 left** |
| `≥ 2` or unlimited | nothing — by decision (CEO 2026-09-24): "Only 4 left" reads as a quiet event |

Refetch availability when the app regains focus and when the buyer comes back from the web.

### Membership disclosure (card-network requirement — not optional)

Shown beside the order total **once a ticket is selected** (the per-ticket notice on the browse
list was removed by decision; don't add it back). One line **per membership that will be charged**,
priced from `/api/subscriptions/plan?membership=<key>` at the ticket's **resolved** interval (§6):

```
+ Jetzy Premium — $10/month, confirmed at checkout
+ Jetzy Premium — first 1 month free, then $100/year, confirmed at checkout
+ Full Concierge Membership (includes Jetzy Premium) — $595/year, confirmed at checkout
+ Full Concierge Membership — switch from monthly to $595/year, starting when your paid month ends; confirmed at checkout   ← logged-in monthly member, yearly ticket
```

- A legacy ticket storing both: one Concierge line only (Premium is included).
- Free months lead the line; never on an upgrade line (upgraders get no free months).
- On an approval ticket, say the card is **held, not charged**, until the host approves.

**Personalising the preview** (optional — the web decides at checkout either way):
`POST /api/premium/check-email` `{ email, eventId }` (unauthenticated, rate-limited, envelope):

```jsonc
"data": {
  "held": ["concierge", "premium"],          // entitlements — Concierge counts as Premium
  "includedWith": { "premium": "concierge" },// held only through another membership
  "upgrades": ["concierge"],                 // KEYS ONLY — a monthly member a yearly ticket here would upgrade
  "reactivations": [ { "key": "concierge", "interval": "month" } ],   // cancelled, still paid — booking keeps it
  "allowances": { "premium": { "limit": 2, "used": 0, "remaining": 2 }, "concierge": { … } },
  "sellsPremium": true
}
```

Use it with the signed-in user's email to: drop the line for a membership in `held` (unless it is
in `upgrades` **and** the selected ticket is yearly — then show the switch line); say "Jetzy
Premium — included with your Full Concierge Membership" for `includedWith`; for `reactivations`
say "Your … was set to end. Booking this ticket keeps it — it will renew at $X until you cancel."
An event that sells no membership returns `{ held: [], sellsPremium: false }`.

---
