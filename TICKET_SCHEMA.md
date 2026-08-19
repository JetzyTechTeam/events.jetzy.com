# Ticket create & update — schema contract

For the mobile app / backend, which writes to the same `events` collection this portal does.

Ticket creation already exists on your side. **What changed since is the membership block on a
ticket** — a ticket can now sell Jetzy Premium along with itself, monthly *or annually*. Sections
marked **NEW** are the parts to add; everything else is here so the two implementations can be
diffed.

- Database: `NEXT_EVENTS_DB_URL`
- Collection: `events` — tickets are an **embedded array**, `events.tickets[]`, not a collection
- Source of truth: `src/models/events/index.ts` (`eventTicketsSchema`)

---

## 1. Ticket sub-document

```jsonc
{
  "_id": ObjectId("6a83365808b397827ee83350"),   // stable; bookings point at this
  "name": "General Admission",
  "desc": "Entry + welcome drink",
  "price": 65,                                    // Number, major units (dollars)
  "stripeProductId": "price_1U16VV…",             // a Stripe PRICE id (see §2)

  "requireApproval": true,                        // OPTIONAL, tri-state — see §5
  "memberships": ["premium"],                     // NEW — see §6
  "membershipInterval": "year",                   // NEW — see §6
  "includesPremium": true,                        // deprecated mirror — see §6

  "createdAt": ISODate("…"),
  "updatedAt": ISODate("…")
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | **Must survive edits.** Bookings store this id, not the name. |
| `name` | String | yes | Buyer-facing. The web form field is called `title` and is mapped to `name` on write. |
| `price` | Number | yes | Major units. Written as `price.toFixed(2)`, cast to Number by Mongoose. |
| `desc` | String | no | Free text; read from the event record for receipts, never from a checkout payload. |
| `stripeProductId` | String | yes | **A Stripe price id**, despite the name. |
| `requireApproval` | Boolean | no | `undefined` = inherit `event.requireApproval`. |
| `memberships` | String[] | no | **NEW.** `["premium"]`, `["concierge"]`, or both. `undefined` = fall back to `includesPremium`. |
| `membershipInterval` | String | no | **NEW.** `"month"` or `"year"`. `undefined` = month. |
| `includesPremium` | Boolean | no | Deprecated. Still written for older readers; never the source of truth. |

---

## 2. `stripeProductId` holds a PRICE id

The field was misnamed early and is now load-bearing in production data. It stores
`price_…`, not `prod_…`.

To get the product from it:

```js
const price = await stripe.prices.retrieve(ticket.stripeProductId)
const productId = typeof price.product === "string" ? price.product : price.product.id
```

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
  // omit requireApproval and membershipInterval unless explicitly chosen
}
```

`Math.round` matters: `19.99 * 100` is `1998.9999999999998` in floating point and Stripe rejects a
non-integer `unit_amount`.

**Also create the capacity row** for a new event, or capacity checks pass silently and the event
oversells:

```jsonc
// collection: eventtrackers
{ "eventId": ObjectId("…"), "bookedTickets": 0, "eventCapacity": 150 }   // 0 = unlimited
```

---

## 4. Updating a ticket

Two behaviours to copy exactly.

**Keep `_id`.** Match incoming tickets to stored ones and re-emit the id. Replacing
`events.tickets` wholesale mints new ids and detaches every existing booking.

**Preserve on omit.** If the payload doesn't mention `requireApproval`, `memberships` or
`membershipInterval`, keep the stored value:

```js
const resolved = incoming.membershipInterval !== undefined
  ? incoming.membershipInterval
  : existing?.membershipInterval          // may itself be undefined — that's fine
```

Without this, an older client or a stale form silently moves an annual ticket back to monthly,
which changes what the next buyer's card is charged.

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

## 5. `requireApproval` is tri-state

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

## 6. NEW — memberships sold with a ticket

A ticket can sell **Jetzy Premium** and/or **Full Concierge** alongside itself. A buyer who
doesn't already hold the membership pays the ticket price **plus the first period** of each, in one
payment; the subscription is created afterwards, server-side.

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

### Prices (live)

| | Product | Price |
|---|---|---|
| Premium monthly | `prod_UzMR33CL777c3R` | `price_1U16VVB7XccR5GE08PIyF8i7` — $20/month |
| Premium annual | `prod_UzMR33CL777c3R` | `price_1U3KGWB7XccR5GE0h8qqEOtm` — $200/year |
| Concierge | `prod_UlQTOgXS73TAEV` | monthly only |

Both Premium prices are on the **same product** — membership is detected by product id, so a
separate product would be invisible to every eligibility check. Never create a new Premium price.

Concierge has **no annual price**. An annual ticket that also sells Concierge falls back to
Concierge's monthly price; Premium still goes annual.

### Rules

1. **A ticket selling a membership must have `price > 0`.** The membership's first period is
   charged on the same payment and Stripe rejects a zero-amount authorization. Both checkout
   endpoints refuse the order.
2. **Write both fields.** `memberships` is what everything reads; `includesPremium` is mirrored so
   older readers still see a bundled Premium ticket. Set it to
   `memberships.includes("premium")`.
3. **Only Premium is sold annually.** `membershipInterval` is per *ticket*, not per membership.
4. **Disclosure follows the ticket's interval.** Any screen showing the ticket must state the real
   recurring amount and interval before purchase — "$200/year", not "$20/month", on an annual
   ticket. This is a card-network requirement, not a preference.
5. **Approval and memberships can coexist.** A bundled ticket may require approval; it is held as a
   manual-capture authorization and the subscription is created when the host approves.

### Examples

```jsonc
// plain paid ticket
{ "name": "General", "price": 40, "stripeProductId": "price_…", "memberships": [] }

// ticket + Premium, monthly ($40 + $20 today, then $20/month)
{ "name": "Member Entry", "price": 40, "stripeProductId": "price_…",
  "memberships": ["premium"], "includesPremium": true }

// ticket + Premium, ANNUAL ($40 + $200 today, then $200/year)
{ "name": "Founding Member", "price": 40, "stripeProductId": "price_…",
  "memberships": ["premium"], "membershipInterval": "year", "includesPremium": true }

// ticket + both memberships, Premium annual, Concierge monthly (its only interval)
{ "name": "Full Access", "price": 120, "stripeProductId": "price_…",
  "memberships": ["premium", "concierge"], "membershipInterval": "year",
  "includesPremium": true }

// approval-gated bundled ticket — allowed
{ "name": "Vetted Entry", "price": 75, "stripeProductId": "price_…",
  "requireApproval": true, "memberships": ["premium"], "includesPremium": true }
```

---

## 7. Selling: what the checkout expects

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

---

## 8. Checklist for this change

- [ ] Read `memberships` via the fallback in §6, not the raw field
- [ ] Read `membershipInterval` via the `=== "year" ? "year" : "month"` rule
- [ ] Write `memberships` **and** mirror `includesPremium`
- [ ] Never write `[]` / `"month"` / `false` as defaults on a ticket you didn't create
- [ ] Reject saving a membership-selling ticket with `price <= 0`
- [ ] Show the correct recurring amount and interval before purchase
- [ ] Preserve `_id`, and preserve omitted fields, on every edit
- [ ] Mint a new Stripe price only when the price actually changed

---

## 9. Unrelated change, same collection family

Referral codes became **unique per event** on 19 Aug 2026 — the global `code_1` unique index was
dropped and replaced with `{ eventId, code }` unique, so one campaign string can run on several
events at once. Any query that resolves a referral code by string alone now matches an arbitrary
event's row. Scope every lookup by `eventId`, including anything that increments `usageCount`.
