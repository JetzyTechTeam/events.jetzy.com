# Ticket create & update — schema contract

For the mobile app / backend, which writes to the same `events` collection this portal does.

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

## 1. Ticket sub-document

```jsonc
{
  "_id": ObjectId("6a83365808b397827ee83350"),   // stable; bookings point at this
  "name": "General Admission",
  "desc": "Entry + welcome drink",
  "price": 65,                                    // Number, major units (dollars)
  "stripeProductId": "price_1U16VV…",             // a Stripe PRICE id (see §2)

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
| `price` | Number | yes | Major units, `usd`. See §2a for the valid range. |
| `desc` | String | no | Free text; read from the event record for receipts, never from a checkout payload. |
| `stripeProductId` | String | yes | **A Stripe price id**, despite the name. |
| `requireApproval` | Boolean | no | `undefined` = inherit `event.requireApproval`. |
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

**Preserve on omit.** If the payload doesn't mention `requireApproval`, `memberships`,
`membershipInterval` or `membershipFreeMonths`, keep the stored value:

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

### Prices (live)

| | Product | Price |
|---|---|---|
| Premium monthly | `prod_UzMR33CL777c3R` | `price_1U16VVB7XccR5GE08PIyF8i7` — $20/month |
| Premium annual | `prod_UzMR33CL777c3R` | `price_1U3KGWB7XccR5GE0h8qqEOtm` — $200/year |
| Concierge | `prod_UlQTOgXS73TAEV` | monthly only |

(Test-mode equivalents: Premium product `prod_Uxn2R9FQd5F3sp`, monthly
`price_1U16eYB7XccR5GE0AdABnPwO`, annual `price_1U3KA0B7XccR5GE0ZRwK6yKH`; Concierge product
`prod_UjabUJ9OXWhLPJ`.)

Both Premium prices are on the **same product** — membership is detected by product id, so a
separate product would be invisible to every eligibility check. Never create a new Premium price.

Concierge has **no annual price**. An annual ticket that also sells Concierge falls back to
Concierge's monthly price; Premium still goes annual.

### Rules

1. **~~A ticket selling a membership must have `price > 0`.~~ THIS RULE IS REVERSED (2026-09-03).**
   A membership-selling ticket may now be **`$0`**. The membership is the thing being sold and
   carries its own charge, so a free ticket simply means a non-member pays for the membership
   alone and an existing member registers instantly with nothing to collect. Only §2a's ordinary
   $0.50 floor still applies. If your checkout implementation also has to handle this — see the
   note at the end of §7.
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
// buyer pays $50 today; Premium is $0 for month 1, then $20/month
{ "name": "Launch Party", "price": 50, "stripeProductId": "price_…",
  "memberships": ["premium"], "membershipFreeMonths": 1, "includesPremium": true }

// FREE ticket + Premium + 2 free months
// buyer pays $0 today for everything, but a card is still collected so month 3 can bill $20
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

## 7. Selling: what the checkout expects — REVISION 1, with one addition

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
priced summary. This is genuinely a distinct feature from the schema in this document — **if your
checkout backend needs to handle this case, ask us for the checkout contract separately** rather
than guessing the session shapes from this doc; getting it wrong either fails to save the card
(member loses their gift silently) or double-creates a subscription against the same customer.

---

## 8. Checklist

- [ ] Read `memberships` via the fallback in §6, not the raw field
- [ ] Read `membershipInterval` via the `=== "year" ? "year" : "month"` rule
- [ ] Read `membershipFreeMonths` via the clamping resolver in §6a, not the raw field
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

---

## 9. Unrelated change, same collection family — REVISION 1

Referral codes became **unique per event** on 19 Aug 2026 — the global `code_1` unique index was
dropped and replaced with `{ eventId, code }` unique, so one campaign string can run on several
events at once. Any query that resolves a referral code by string alone now matches an arbitrary
event's row. Scope every lookup by `eventId`, including anything that increments `usageCount`.

`ReferralCodes.freeMembershipMonths` (0–12, `default: 0`) is the field that feeds the `referral`
side of §6a's combine rule. It is on the `referral-codes` collection, not on the ticket.
