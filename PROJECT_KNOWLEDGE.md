# Project Knowledge — events-jetzy-com

> Comprehensive codebase snapshot. Read this instead of re-reading source files.
> **Keep updated** after any feature, API, model, or significant refactor.

---

## Stack

- Next.js 14 (pages router), TypeScript 5
- MongoDB 6 + Mongoose 8
- Redux Toolkit 2 + React Query (tanstack v5)
- NextAuth.js 4 (JWT strategy)
- Stripe 15
- Firebase + Firebase-Admin
- SendGrid (email)
- File storage: EdgeStore, Vercel Blob, Cloudinary, AWS S3
- UI: Chakra UI 2, Tailwind CSS, Ant Design
- Forms: Formik + Yup/Zod
- QR: qrcode, jsqr, Tesseract.js (OCR)
- Date: dayjs, moment-timezone, Luxon

---

## Directory Layout

```
src/
  actions/       server actions (create-user, get-public-user, send-email, send-update-email, event-participants, create-admin-actions/)
  assets/        static assets
  components/    React components — see Components section
  configs/       database.ts, firebase.ts, firebase-admin.ts, routes.ts, api/
  contexts/      AnalyticsContext.tsx
  hooks/         useAnalytics.ts, useShare.ts, useSignup.ts
  lib/           see Lib section
  middleware.ts  CORS only (matches /api/* routes; dev: allow-all, prod: no-op)
  models/        see Models section
  pages/         Next.js pages router — see Pages section
  redux/         stores.ts + reducers/
  scripts/       utility scripts
  services/      API service layer — see Services section
  styles/        globals.scss, mixins.scss
  types/         const.ts, form.ts, authOpts.ts, discussion.ts, http.ts, layout.ts, redux.ts, response.ts
  utils/
```

---

## Models

### `src/models/events/index.ts` — IEvent
Fields: slug (unique), name, privacy (public/private/group), status (draft/published), startsOn, endsOn, timezone, location, venueName, coordinates (long/lat/placeId), locationDisclosedAfterBooking, desc, images[], videos[], capacity, requireApproval, showParticipants, tickets[] (IEventTicket), questions[] (ICustomQuestion), datePoll (IDatePoll), host (name/email/phone), ownerId, feedbackFormUrl, thankYouEmailSentAt, benefits, isDeleted

### `src/models/events/types.ts` — type definitions
IEvent, IEventTicket, ICustomQuestion, IDatePoll, IDatePollOption, IBookings, IEventTracker, IReferralCode

### `src/models/events/bookings.ts` — IBookings
Fields: bookingRef (unique), eventId, bookerUserId?, tickets[], status (pending/approved/confirmed/cancelled/rejected/failed/refunded), customerName, customerEmail, customerPhone, subTotal, tax, total, referralCode, discountAmount, customAnswers[], payment{}, **cancelledAt?**, **cancelledBy?** (`guest|host|admin`, no defaults)

- `status` also carries values this repo never writes — **`checked_in` is live in production** (written by the mobile app / admin portal against the shared collection). Never treat `BookingStatus` as an exhaustive allowlist; classify by exclusion (`!isPending && !isCancelled`) instead.
- `status: "refunded"` has **never been written** — see "No refunds" below.
- `customerEmail` has **no `lowercase: true`** — always match it case-insensitively via `src/lib/booking-identity.ts`.

### `src/models/events/referral-codes.ts` — IReferralCode
Fields: eventId, code (unique, uppercase), discountPercentage (0-100), commissionPercentage (0-100), isActive, usageCount, maxUses, createdBy, isDeleted

### `src/models/events/blast.ts` — IBlast
Blast email history (Luma-style Blasts tab). Fields: eventId, subject, message, targetType (all/bookings/invitations), status, emailType (custom/availability), recipientCount, succeededCount, failedCount, sentBy, sentAt, isDeleted. Created automatically by `/api/send-blast` after a successful send.

### `src/models/events/albums.ts` — IEventAlbum
Fields: eventId, title, description, media[] (`{url, type:'image'|'video'}`), createdBy, isDeleted. Collection `event-albums`. Multiple named albums per event.

### `src/models/events/album-access.ts` — IAlbumAccess
Fields: eventId, albumId, userId (optional), viewerEmail, viewerName, action (`'login'|'signup'`), **verified** (optional), **identifiedAt** (optional — when they signed in / signed up / passed the code, which is NOT `createdAt`; that is when they opened the album). Collection `event-album-access`. **Unique index `{albumId,viewerEmail}`** — one row per (album,person); doubles as the notify-email dedupe guard AND the album-analytics source. Email is the key because a session `_id` can come from `event-users` while the guest gate maps to `users`. Old `{albumId,userId}` index must be dropped — see `scripts/migrate-album-access-index.ts`.

### `src/models/events/album-interest.ts` — IAlbumInterest
Fields: eventId, email, name, userId (optional), interests[], customInterests[], customInterest (legacy single), optOut, **verified** (optional). Collection `event-album-interests`. **Unique index `{eventId,email}`** — one row per person per event, upserted on re-entry. Written by `guest-access` and `my-interests`; read by `GET …/albums/interests` for the Albums analytics tab.

### `src/models/events/album-verification.ts` — IAlbumVerification
Fields: eventId, email, code (6 digits), expiresAt, attempts, lastSentAt. Collection `event-album-verifications`. Pending email-verification codes for the album gate; a used code is deleted, so it works exactly once. Index `{eventId,email}` is **non-unique on purpose** and is built by `scripts/create-album-verification-index.ts` (`autoIndex: false`) — both call sites read the newest row by `createdAt`, so a duplicate is harmless while a failed unique build would lock people out.

### `src/models/events/album-tags.ts` — IAlbumTag
Fields: eventId, albumId, mediaUrl, personEmail, personName, taggedByEmail, taggedByName, notifiedAt. Collection `event-album-tags`. Index `{albumId,mediaUrl,personEmail}` is a **plain lookup index, not unique** — tagging is unrestricted, so the same person can be tagged repeatedly on one photo and is emailed each time. (Was unique in an earlier build; `scripts/migrate-album-tags-index.ts` drops it.)

### `src/models/events/discussion-posts.ts` — IDiscussionPost
Fields: eventId, userId, title, content, images[], attachments[], isPinned, isLocked, tags[], reactions (like/helpful arrays), viewCount, viewedBy[], commentCount, lastActivityAt, isReported

### `src/models/checkIn.ts` — ICheckIn
Fields: bookingId, eventId, bookingRef, customerEmail, customerName, totalTickets, checkedInCount, checkInHistory[], firstCheckInAt, lastCheckInAt, isFullyCheckedIn

### `src/models/eventGuest.ts` — IEventGuest
Fields: eventId, bookingId, checkInId, bookingEmail, guestName, guestEmail, guestPhone, checkedInAt, checkedInBy

### `src/models/userModal.ts` — User
Fields: firstName, lastName, email (unique), password, role (user/admin), image, authProvider, firebaseUid, isBlocked, emailBounced, passwordResetToken, passwordResetTokenExpiresAt, acceptedTerms, acceptedTermsAt

### `src/models/waitingList.ts` — IWaitingList
Fields: eventId, firstName, lastName, email, phone, tickets[] (ticketId/quantity/name/price), status (waiting/notified/converted)

### `src/models/interestV2.ts` — InterestI
Fields: name, type (public/private), description, image, createdBy, status (active/pending/deleted), dataType (group/activity), location (description/lat/lng), startDate, endDate, price, capacity, interests[], eventId

### `src/models/analytics/` (9 models)
user-session.ts (IUserSession): sessionId, userId, anonId, startTime, endTime, duration, pageCount, isLoggedIn, deviceType, browserType, referrer, entryPage, exitPage, userAgent, ipAddress
page-view.ts, user-action.ts, event-interaction.ts, user-journey.ts (also has anonId), index.ts
web-click.ts (IWebClick) → collection `analytics_web_clicks` — generic click tracking with x/y, element semantics, rage/dead-click flags, optional eventId
web-scroll.ts (IWebScroll) → collection `analytics_web_scroll` — scroll depth per (sessionId, page) with milestones [25,50,75,100]
web-form.ts (IWebForm) → collection `analytics_web_forms` — form focus/submit, never stores field values
Full schema reference + cross-portal query recipes in `ANALYTICS_SCHEMA.md`.

### Other models
events/discussion-comments.ts, events/comments.ts, events/event-invitations.ts, events/event-tracker.ts, events/event-traffic.ts, eventTicketsModel.ts, eventUsersModal.ts, messages.ts, transactionModel.ts

---

## Auth & Authorization

### Auth Flow (`src/pages/api/auth/[...nextauth].ts`)
- JWT strategy, CredentialsProvider
- Accepts: email+password, magicToken, Firebase ID token
- Tries EventUsers collection first, then Users collection
- Blocks: `emailBounced: true` → ERROR: "EMAIL_BOUNCED"; `isBlocked: true` → ERROR: "ACCOUNT_BLOCKED"
- JIT sync with external API at `NEXT_PUBLIC_EXTERNAL_API_BASE_URL/api/v1/accounts/authorize` (8s timeout)
- Session user shape:
  ```ts
  {
    _id: string, id: string, name: string, fullName: string,
    email: string, role: string, accessToken?: string,
    isBlocked: boolean, emailBounced: boolean,
    requiresVerification: boolean, image?: string
  }
  ```

### Auth Guards (`src/lib/authSession.ts`)
- `authorizedOnly(context)` → `{ props: { session } }` or `{ redirect }` — use `if ('redirect' in authResult) return authResult`
- `adminOnly(context)` → redirects non-admins to ROUTES.home
- `unauthorizedOnly(context)` → redirects authed users (admin→dashboard, user→home)
- `isAuthorized(context)` → boolean

### Ownership Check Pattern (copy-paste for new APIs)
```ts
const userRole = (session.user as any)?.role
const isAdmin = userRole === "admin" || userRole === "super admin"
const userId = (session.user as any)?._id?.toString()
if (!isAdmin && event.ownerId?.toString() !== userId) {
  return sendResponse(res, null, "Forbidden.", false, ResCode.FORBIDDEN)
}
```

### Roles (`src/types/const.ts`)
- `Roles.USER` = `"user"`, `Roles.ADMIN` = `"admin"`
- Super admin string = `"super admin"` (not in enum, hardcoded)

---

## API Route Map

### Events
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/events/create` | authenticated (sets ownerId) |
| GET | `/api/events` | public, no auth, no draft |
| GET | `/api/events/list` | list |
| GET | `/api/events/[eventId]` | get event details |
| PUT | `/api/events/[eventId]/update` | admin OR owner |
| DELETE | `/api/events/[eventId]/delete` | admin OR owner |
| POST | `/api/events/[eventId]/clone` | admin OR owner — duplicates event as draft, new slug + fresh stripe prices, resets poll votes, no bookings |
| GET | `/api/events/[eventId]/event-bookings` | event bookings |
| GET | `/api/events/[eventId]/participants` | participants |
| GET | `/api/events/[eventId]/totals` | totals |
| GET/POST | `/api/events/[eventId]/referral-codes` | admin OR owner |
| PUT/DELETE | `/api/events/[eventId]/referral-codes/[codeId]` | admin OR owner |
| GET | `/api/events/[eventId]/referral-codes/[codeId]/stats` | admin OR owner |
| POST | `/api/events/[eventId]/referral-codes/validate` | public |
| GET/POST | `/api/events/[eventId]/poll` | date poll |
| POST | `/api/events/[eventId]/poll/vote` | vote on poll |
| PUT | `/api/events/[eventId]/tickets/[ticketId]/update` | ticket mgmt |
| DELETE | `/api/events/[eventId]/tickets/[ticketId]/delete` | ticket mgmt |
| POST | `/api/events/admin/update-questions` | admin OR owner |
| POST | `/api/events/admin/update-feedback-link` | admin OR owner |
| POST | `/api/events/admin/send-thank-you` | admin OR owner |
| GET | `/api/events/guests` | get guests |
| GET | `/api/events/[eventId]/albums` | any identified viewer (session OR name+email guest cookie) |
| POST | `/api/events/[eventId]/albums` | admin OR owner (create) |
| PUT/DELETE | `/api/events/[eventId]/albums/[albumId]` | admin OR owner |
| POST | `/api/events/[eventId]/albums/send-code` | public — emails a 6-digit code to the typed address; creates nothing |
| POST | `/api/events/[eventId]/albums/guest-access` | public — `{name,email,code}`, matches or auto-creates account, sets `album_guest` cookie |
| GET | `/api/events/[eventId]/albums/participants` | admin OR owner — attendee suggestions for tagging (empty for others by design) |
| POST | `/api/events/[eventId]/albums/[albumId]/access` | any viewer — records access + notify email (once per person/album) |
| GET/POST | `/api/events/[eventId]/albums/[albumId]/tags` | any viewer — list / create tag (emails the tagged person) |
| DELETE | `/api/events/[eventId]/albums/[albumId]/tags/[tagId]` | tagger, tagged person, or admin/owner |
| POST | `/api/events/[eventId]/albums/[albumId]/publish` | admin OR owner — emails all attendees; `{resend:true}` required to re-send |
| GET | `/api/events/[eventId]/albums/access-log` | admin OR owner — per-viewer access log (name/email/action/date) for the Albums analytics tab + CSV export |

### Check-in
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/check-in/validate` | admin OR owner |
| POST | `/api/check-in/record` | admin OR owner |
| GET | `/api/check-in/guests` | admin OR owner |
| GET | `/api/check-in/stats` | admin OR owner |
| GET | `/api/check-in/booking-status` | — |

### Analytics
| Method | Route | Access |
|--------|-------|--------|
| GET | `/api/analytics/events` | admin OR owner (own event only for users) |
| GET | `/api/analytics/overview\|journey\|pages\|devices\|referrers\|visitors\|bookings\|utm\|top-events\|top-users` | admin only |
| POST | `/api/analytics/track\|track-action\|track-event-interaction\|track-page\|track-session-start\|track-session-end\|track-click\|track-scroll\|track-form` | public tracking (anonymous OK) |
| GET | `/api/analytics/journey/sessions\|guests` | admin only |
| GET | `/api/analytics/journey/session/[sessionId]\|funnel\|heat\|dwell` | admin OR event owner (when eventId scope applies) |
| GET | `/api/analytics/qr-signups/list` | admin only — paginated QR-signup rows; `dateFrom/dateTo/search/source/provider/hasRefCode/page/limit`, `format=csv` streams the full filtered set. Projection is an explicit allowlist (never password/tokens). |
| GET | `/api/analytics/qr-signups/funnel` | admin only — `/jetzyqrsignup` funnel (page view → form focus → submit → account created) + totals + top locations, all date-filtered |

**Perf pattern:** `overview.ts`, `visitors.ts`, `top-users.ts`, `top-events.ts` run all independent DB queries in one `Promise.all` (not sequentially). Earlier sequential version stalled the dashboard for 30+ seconds on Atlas. Also: prefer `countDocuments` over `.distinct()` for unique counts; for distinct counts use `aggregate([{$group:{_id:"$field"}},{$count:"count"}])` (avoids loading all IDs into Node memory). Connection pool `maxPoolSize: 10` + `bufferCommands: false` (see `src/configs/database.ts`).

### Auth
`/api/auth/[...nextauth]`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/send-login-otp`, `/api/auth/verify-login-otp`, `/api/auth/verify/send-code`, `/api/auth/verify/confirm-code`, `/api/auth/report-abuse`
`/api/create` — QR-signup account creation (EventUsers). Accepts optional `refCode`; stores it on the doc AND (when present) best-effort forwards signup to main backend `POST {EXTERNAL}/api/v1/accounts/create` with webchat/mobile payload shape so the referrer gets credited (8s timeout, 409 tolerated, failure never blocks local signup).

### Messaging
| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/send-blast` | admin OR owner | (persists a Blast history record on success) |
| GET | `/api/events/[eventId]/blasts` | admin OR owner |
| PATCH/DELETE | `/api/events/[eventId]/blasts/[blastId]` | admin OR owner | (PATCH edits stored record; DELETE soft-deletes) |
| POST | `/api/send-invites` | — |
| POST | `/api/send-email` | — |
| POST | `/api/send-thank-you` | — |
| POST | `/api/send-update-event-email` | — |

### Checkout
`/api/checkout/index`, `/api/checkout/confirm`, `/api/checkout/free-events`

| Method | Route | Access |
|---|---|---|
| POST | `/api/premium/check-email` | public — preview only, see "Jetzy Premium member discount" |

### Waiting List
`/api/waiting-list/[eventId]`, `/api/waiting-list/add`, `/api/waiting-list/approve`, `/api/waiting-list/remove`

### Bookings
`/api/bookings/mine` — **GET, session required.** The guest's own bookings for `/my-bookings`. Matches on `bookerUserId` OR case-insensitive `customerEmail` via `buildBookerMatchClauses`. Loads up to 500, joins events, then filters/sorts/paginates **in JS** so `getEventStatus` stays the single source of truth for upcoming-vs-past. Query: `filter` (`all|upcoming|past|pending|confirmed|cancelled`), `page`, `limit`, `search`. Projects out `payment.paymentIntentId` / `payment.checkoutSessionId`. Returns `{ items, pagination, counts }` with per-row `moneyState`, `moneyAmount`, `canCancel`, `cancelBlockedReason`, `eventStatus`, `ticketCount`.

`/api/bookings/preview` — **GET, unauthenticated, keyed by `bookingRef`.** Backs the emailed cancel link (`/cancel-booking`). Returns only event name/slug/date, ticket count, money state and cancel eligibility. **Never** returns customer email, phone, custom answers or Stripe ids — the ref is a bearer token and a leaked one must not harvest PII.

`/api/bookings/cancel` — POST `{ bookingRef }`. Session ⇒ admin, event owner, or the booker; no session ⇒ `bookingRef` as bearer token (email link). **Guests and bearer-token callers are held to the event-start cutoff** (`canGuestCancel`); admins/owners are not. Releases an uncaptured hold, **never refunds**, sets `cancelledAt`/`cancelledBy`, deletes the `CheckIn` row, decrements `EventTracker` only when the booking was CONFIRMED, then emails guest (`sendBookingCancellation`) + host and `ADMIN_NOTIFICATION_EMAIL` (`sendHostCancellationNotice`). Both emails are best-effort. Returns `{ booking, moneyState, releasedAmount, cancelledBy }`.

`/api/bookings/my-for-event` — GET `?eventId`. The caller's live booking for one event, plus `moneyState`/`moneyAmount`/`canCancel`. Excludes CANCELLED/REJECTED/FAILED.

`/api/bookings/delete`
`/api/bookings/approve`, `/api/bookings/reject` — Require-Approval flow (admin OR event owner; keyed by `{ bookingRef }`). Approve → PENDING→CONFIRMED, consumes capacity, QR + `sendTicketConfirmation` to attendee, `sendAdminApprovalNotice(kind:"approved")` to contact@. Reject → PENDING→REJECTED, no email.

### No refunds — by decision, not by omission
**Do not add `stripe.refunds.create` anywhere.** Cancelling a booking whose payment was already captured releases the seat and keeps the money; the guest is warned before confirming.

Why: there is no Stripe Connect in this codebase (no `application_fee_amount`, `transfer_data`, `on_behalf_of`, `stripeAccount`), so every charge lands in Jetzy's own balance, and Stripe does not return its processing fee on a refund — *"Stripe's processing fees from the original transaction aren't returned."* A refund is therefore a straight ~2.9% + $0.30 loss with nothing recovered. Nothing is added to the buyer's total to cover it either: `tax` is always 0 and `calculateVAT` (`lib/utilities.ts`) is dead code with zero callers.

Cancelling an **uncaptured** authorization hold is *not* a refund — it costs $0, the guest was never charged, and it must always happen. Stripe explicitly recommends this over refunding.

Consequences to preserve:
- `BookingStatus.REFUNDED` stays in the enum for the mobile app but is never written. The "Refunded" option was removed from `bookingFilter.tsx` because it only ever returned an empty list.
- `sendBookingCancellation` must never claim a refund. It renders one of three money blocks off `moneyState`.
- A cancelled booking with `payment.status: "captured"` is correct and intentional — the money really is still ours.

### Private events are UNLISTED, not invite-only

A `privacy: "private"` event is excluded from the public listing — [api/events/index.ts](src/pages/api/events/index.ts) filters `privacy: { $ne: 'private' }` for non-admins — but **anyone holding the link can view and book it**. There is no access code.

**The `?code=` / `privateAccessCode` invite gate was removed.** It was enforced in three places (the `[slug].tsx` page, `checkout/index.ts`, `free-events.ts`) and **exempted owners and admins**. That exemption made every link bug invisible in testing: the host's own link worked, and only the guests they sent it to were blocked. It produced a steady stream of dead links across the share modal, QR codes, blast emails, discussion and chat notifications, and the invite-accept redirect — each needing the code threaded through separately.

**Consequence for future work: there is exactly one event link, `eventUrl(baseUrl, slug)`.** No share-vs-owner variants, nothing to append. Don't reintroduce a code-aware helper.

- **`privateAccessCode` is deprecated** on the schema and `IEvent` — no longer generated (`create.ts`, `update.ts`) and no longer read. The field is retained so existing documents and the mobile app reading the same collection are undisturbed; it can be dropped in a later cleanup. Old `?code=` links keep working, since the query param is simply ignored.
- **Private Premium events still force `requireApproval = true`** at creation. With the code gone, host approval of each booking is the only remaining gate on them.
- The manage page's yellow "Invite Link" banner is replaced by a plain note explaining that the event is unlisted and the share link grants access.
- `sendEventInvitation` and `sendBlastEmail` in `send-grid.ts` have **no callers** — dead code.

### Pending admin approval — outward-facing actions gated

Public events are created `adminApprovalStatus: "pending"` and are invisible to everyone but the owner/admins until approved. Outward-facing actions are now blocked while pending, because an invite or blast would send guests to the "Event Not Yet Approved" page.

**Use [src/lib/event-approval.ts](src/lib/event-approval.ts)** — `isPendingAdminApproval(event)` and `PENDING_APPROVAL_MESSAGE`. Seven sites previously re-derived this inline with two different spellings (`privacy === "public"` vs `privacy !== "private"`); all now call the helper.

> Naming collision: `ApprovalRequests`, the Approvals tab and `ticket-approval.ts` are all about a **host approving guest bookings** — unrelated to admin approval of the event itself.

- **UI**: the Quick Actions card in [manage.tsx](src/pages/console/events/[eventId]/manage.tsx) is replaced by an explanatory note while pending. The `?invite=true` deep link no longer auto-opens the invite modal. The post-creation modal in [create.tsx](src/pages/console/events/create.tsx) shows "submitted for review" instead of **Invite Friends** for public events (private events are auto-approved and keep it).
- **Server guards** (UI hiding is not enforcement): [send-invites.ts](src/pages/api/send-invites.ts), [send-blast.ts](src/pages/api/send-blast.ts), [invite-jetzy-user.ts](src/pages/api/events/[eventId]/invite-jetzy-user.ts). The latter two now load the event **for all callers, not just non-admins**, since the gate depends on event state rather than role.
- **`send-invites.ts` was previously unauthenticated** and never loaded the event — an open relay that let anyone send arbitrary email through our SendGrid. It now requires a session plus admin-or-owner.
- Not gated: editing the event, tickets, questions, referral codes.

### Ticket email — discount breakdown

The confirmation email showed per-ticket prices but **no discount and no total**. Everything was behind one gate — `referralCode && discountAmount > 0` — so a Premium-member-only discount rendered nothing, and the three callers that pass no discount data could never show a total at all.

- **[src/lib/ticket-pricing.ts](src/lib/ticket-pricing.ts)** is the single source: `buildTicketPricing` / `pricingFromBooking` return `{ subtotal, lines[], total }`.
- Discounts **stack multiplicatively**, matching the single Stripe coupon built in [checkout/index.ts](src/pages/api/checkout/index.ts): Premium applies first, referral on the remainder. The two line amounts sum exactly to `subtotal − total`. A supplied `total` always wins over the computed figure so the email can't disagree with Stripe; rounding drift is absorbed into the last line.
- **The summary now renders unconditionally.** With no `pricing`, it falls back to the legacy params, then to a plain subtotal/total from `tickets` — so every confirmation gains a Total, including free RSVPs and waiting-list approvals.
- **Booking schema gained `referralDiscountPercentage` and `premiumMemberDiscountPercentage`** (optional, no default). Only `discountAmount` and a boolean were stored before, so `approve.ts` — which emails later from the booking — couldn't split the two. Legacy bookings leave them undefined and fall back to one combined line.
- `approve.ts` builds its summary from the **booking**, not from the ticket rows: those are rebuilt from current event prices (bookings store no per-ticket price snapshot), whereas `subTotal` and the rates are what was recorded at purchase. Total is the captured amount.
- **Out of scope:** five hardcoded per-event templates (`send-grid.ts` ~1052, 1131, 1210, 1291, 1372) return early and are unchanged.

### Ticket display order is the ARRAY order

A host drags tickets into order on the create/manage forms and the public event page matches.

There is **no ordering field and no migration**, because there never needed to be:
`event.tickets` is a Mongoose sub-document array, Mongo preserves its order,
`api/events/[eventId]/update.ts` writes `tickets: resolvedTickets` in exactly the order the
payload arrived, and nothing anywhere sorts tickets — the public `EventTicketsComponent` and
`console/events/[eventId]/tickets.tsx` both render the array as-is. The only thing that was
missing was a control.

`src/components/events/SortableTicketList.tsx` (@dnd-kit) supplies the mechanism —
`SortableTicketList` wraps `DndContext`/`SortableContext`, `SortableTicketItem` supplies the
grip. Each form keeps its own card markup as children, because manage renders sales badges that
create has no data for; sharing the card would mean one component branching on which page it is
on. Reordering calls Formik `FieldArray`'s own `move`, so it is ordinary form state and autosave
carries it like any other edit.

**Reordering cannot affect bookings.** `update.ts` matches incoming tickets by `id` and carries
`_id` through, and `booking.tickets[].ticketId` references that `_id` — moving a ticket within
the array changes nothing a booking depends on.

Sensor config is the part that matters: `PointerSensor` needs `distance: 8` or a click on the
card's Edit/Delete menu is swallowed as a drag, and `TouchSensor` needs
`delay: 250` or dragging fights page scroll on a phone and neither works.

**Caveat:** the mobile app writes the same `events.tickets` array. If it rewrites the array in
its own order, the host's ordering is lost. Belongs in the mobile handover notes alongside the
preserve-`_id` and omit-don't-default rules.

### Memberships are SOLD PER TICKET (replaced the member discount)

The member discount was retired. A membership is no longer taken *off* a ticket — it is **sold
with one**. `eventTicketsSchema.memberships` (array of `MembershipKey`) lists what a ticket
sells: Jetzy Premium, Full Concierge, or both.

- buyer **already holds** a membership → not charged for that one;
- buyer **doesn't** → charged the ticket **+** the first period of each, then the
  subscriptions are created by us with a trial covering that period.

`includesPremium` (Boolean) is **deprecated** and read only as the fallback when `memberships`
is absent, so tickets saved before Full Concierge keep working with no migration. Resolve with
**`ticketMemberships()`** from `premium-bundle.ts` — never read either field directly. Writers
keep `includesPremium` in step with the array purely for the mobile app.

`event.premium` and `event.premiumMemberDiscountPercentage` are **deprecated** — kept on the
schema so the mobile app sharing the collection is undisturbed (same treatment as
`privateAccessCode`), but nothing reads them. Gone with them: the "only members may host"
gate, the Premium Event badge, and the private-premium force-approval rule.

**Helpers.** `src/lib/memberships.ts` is the product registry (see the Full Concierge section
below). `src/lib/premium-bundle.ts` is pure/isomorphic (React-safe) — `ticketMemberships`,
`eventHasAnyPremiumTicket`, `selectionMemberships`, `resolveBundlePlan`.
`src/lib/premium-eligibility.ts` is **server only** (loads the user models) —
`heldMemberships` / `hasMembership`. Membership still resolves from the **checkout email, not
the session**; under this model that decides whether money is charged, not merely how much
comes off, so getting it wrong either double-bills a subscriber or gives away a membership.

**Approval and bundling are compatible.** A bundled ticket is sold as a `mode: "payment"`
session either way, so `capture_method: "manual"` applies normally and the subscriptions are
created at approval. (The old "mutually exclusive" rule existed only because the immediate
flow used subscription mode, which has no manual capture.) A bundled ticket must still cost
> $0 — enforced in both event forms, in `create.ts` zod `superRefine`, and in `update.ts`
against the *resolved* memberships (incoming value else stored) so a stale form can't sneak a
free bundled ticket through.

**The typed email owns the membership — not the session.** `subscriberId` in
`checkout/index.ts` is `userDoc?._id || buyerId`. It shipped as `buyerId || userDoc?._id`,
which split the flow in half: eligibility was checked against the typed address while the
subscription was created for whoever happened to be logged in. Buying a bundled ticket for
someone else therefore gave *them* the ticket and *you* the membership — and because their
account was never activated, `isPremiumEmail` kept returning false, so every repeat purchase
stacked another subscription onto the logged-in user's single Stripe customer. Symptom: three
live subscriptions in one person's billing portal for tickets bought under other addresses.

`bookerUserId` deliberately stays the **session** user: the booking does belong to whoever
paid, and `booking-identity.ts` matches on `bookerUserId` OR `customerEmail`, so both parties
still see the ticket. Only the membership follows the email.

`hasActiveMembershipSubscription(customerId, key)` in `premium.ts` is the second half of that
guard — it asks **Stripe**, per product, for a live subscription before creating one, because
`heldMemberships` reads the `active` flags, which only exist once the webhook lands and so
cannot catch two purchases in quick succession. It returns false on error rather than throwing:
a duplicate subscription is recoverable, a refused checkout is not.

**Session details that bite:**
- `customer`, never `customer_email` — Stripe rejects both together, and the subscriptions must
  attach to a real Customer. `resolveStripeCustomerForUser` (`src/lib/premium.ts`) persists
  `user.stripeCustomerId` (root level; `premiumSubscription.stripeCustomerId` is still read as
  a fallback for pre-existing members). Without it every renewal/cancel webhook, which resolves
  the user by that id, is unattributable.
- `setup_future_usage: "off_session"` on EVERY bundled order. Stripe no longer creates the
  subscriptions, so without a saved card each membership would bill once and die at its first
  renewal.
- The referral coupon is scoped with `applies_to.products`, or a session-level discount takes
  the host's percentage off Jetzy's subscription revenue too. `ticket.stripeProductId` holds a
  **price** id (`create.ts` calls `stripe.prices.create`), so the product id must be read back
  off the price.
- **`metadata.ticketTotal` / `ticketSubtotal` are authoritative, not `session.amount_total`** —
  on a bundled session `amount_total` is the whole first invoice. Read by
  `checkout-fulfillment.ts` and `success.tsx`.
- `client_reference_id` is single-valued and the ticket flow claims it, so bundled sessions
  carry `metadata.membershipUserId` for the subscription side, plus `metadata.memberships`
  (JSON `[{ key, amount, currency, priceId, interval }]`).

**The webhook dispatches on metadata, not `mode`.** `webhooks/stripe.ts` used to read
`if (mode === "subscription") … else if (mode === "payment")` — mutually exclusive, so a
bundled session activated Premium and **never created the booking**: no `Bookings` row, no
`updateEventTracker()`, no QR, no ticket email, no referral increment, while the buyer was
charged in full. Now `if (session.subscription)` activates and `if (metadata.bookingRef)`
fulfils; both run. `fulfillCheckoutSessionById` also expands `invoice.payment_intent` (a
subscription session has no `session.payment_intent`, and writing `paymentIntentId: undefined`
orphans every capture/cancel path) and accepts a settled subscription session, since
`payment_status` is `no_payment_required` for a trial or a 100%-off coupon.

**Membership lifecycle emails.** Because membership can be acquired as a side effect of
buying a ticket, the recipient may not think of themselves as a subscriber — so every charge,
failure and ending is announced. `send-grid.ts` gained `sendMembershipRenewed`,
`sendMembershipPaymentFailed` and `sendMembershipCancelled`, all fired from the webhook:

- `invoice.paid` emails **only** when `billing_reason === "subscription_cycle"`. The first
  invoice is the bundled ticket purchase, which the ticket confirmation already covers —
  emailing there too would send two receipts for one transaction.
- `invoice.payment_failed` is the important one: without it a card expires, Stripe stops
  retrying, and the member loses access having never been told.
- Cancellation is detected inside `customer.subscription.updated` as a **transition** — the
  stored `cancelAtPeriodEnd` flipping false → true. With the portal set to "cancel at end of
  billing period", `customer.subscription.deleted` doesn't arrive until the period ends, up to
  a month later, so it can't be the trigger for "you cancelled". `deleted` sends the separate
  "has ended" variant.
- Every send is best-effort and swallows its own errors. A failed email must never fail a
  webhook, because Stripe would retry the whole delivery and duplicate the side effects.

**Cancellation and disclosure — required, not optional.** There was previously *no* way to
cancel a subscription anywhere: `cancel_at_period_end` was only ever read back. Selling
membership as a side effect of a ticket made that untenable, so `POST /api/subscriptions/portal`
(Stripe Billing Portal) plus "Manage membership" in the navbar now exist. **The portal must be
configured once per Stripe environment** or the call fails. The recurring amount and interval
are shown *before* purchase — `usePremiumPlan` supplies the figure, `TicketPricing.recurring` /
`dueToday` carry it. **Where** they appear was narrowed by decision: the per-ticket notice on the
browse view ("+ Jetzy Premium $20/month, renews until cancelled", under the ticket price in
[EventTicketsComponent.tsx](src/components/EventTicketsComponent.tsx)) was removed. What remains
is the line beside the order total, which appears only once the guest has actively selected the
ticket, plus the checkout modal and the receipt. Those are the point of sale and are **not** to
be trimmed further — the browse view was cosmetic, the purchase flow is the obligation. It is
deliberately NOT part of `lines`, which are all deductions, nor of `total`, which means "what
the ticket cost".

The disclosure wording has three moving parts and none of them may be hardcoded: the product
blurb comes from `MEMBERSHIPS[key].checkoutBlurb` (per product — a shared sentence would promise
Jetzy events to someone buying a concierge service), the amount from `plan.label`, and the
interval adverb from `renewalAdverb` in the checkout modal. **The approval and instant variants
must keep saying different things** — "charged only if your registration is approved" on a ticket
that charges immediately is a false statement about a charge at the point of sale. `plan.label`
drops the cents on whole dollars ("$20/month") but keeps them otherwise, so $59.50 is never
rounded away from what the card is actually billed.

`buildTicketPricing`'s `premiumPercentage` survives as **historical only**, so
`pricingFromBooking` can still itemise bookings made while the discount existed. Never pass it
for a new order.

### Stripe product and price ids

Recorded 2026-08-11. **Membership is resolved by PRODUCT id, never by price** — `findActiveSubscriptionForProduct` matches `item.price.product`, and `subscriptionMembershipKey` walks the same field. Every plan of a membership therefore has to be a **price on the same product**; a separate product is invisible to eligibility, to the webhook's product routing, and to the pre-create dedupe, and the member gets billed a second time on their next bundled ticket.

| | Test | Live |
|---|---|---|
| Premium product | `prod_Uxn2R9FQd5F3sp` | `prod_UzMR33CL777c3R` |
| Premium $20/mo — product default | `price_1U16eYB7XccR5GE0AdABnPwO` | `price_1U16VVB7XccR5GE08PIyF8i7` |
| Premium $200/yr | `price_1U3KA0B7XccR5GE0ZRwK6yKH` | `price_1U3KGWB7XccR5GE0h8qqEOtm` |
| Concierge product | `prod_UjabUJ9OXWhLPJ` | `prod_UlQTOgXS73TAEV` |
| Concierge $59.50/mo | `price_1Tk7QPB7XccR5GE0ZxMClLxs` | — |

- Test and live product ids share no resemblance. Never derive one from the other.
- **`default_price` must stay on the monthly price.** [api/subscriptions/plan.ts](src/pages/api/subscriptions/plan.ts) returns only `default_price`, and that figure is the recurring disclosure on every bundled ticket. Repointing it to annual would quote $200/yr on a $60 ticket.
- Adding the annual **price** needed no code change here: product-scoped detection picked it up, and `startMembershipSubscription` already derives the trial as `dayjs().add(1, interval)`, so an annual subscription gets a one-year trial rather than a month. Offering annual in our own UI does need work — the plan endpoint must list prices instead of reading `default_price`.
- The `productId` fallback in [memberships.ts](src/lib/memberships.ts) is a **test** id despite the comment claiming production. Inert only because production sets the env var.
- Premium carries a legacy `$10/mo` price predating the $20 one — 16 subscriptions in test, **zero in live**. Nothing selects it; detection is by product so those members still read as Premium.

**Known gap — SelectMember's Concierge Annual is a separate product** (`prod_Ujacr6ekzXDpo1`), and its price is misconfigured to bill $595 *monthly*. We never reference it, so it can't be sold through ticketing — but annual Concierge subscribers cannot be found by product lookup. The only signal is their `/status` API, and `heldMemberships` currently accepts any `status: "active"` **without checking `plan`**, which would also read a $4.95 hotels-only member as holding Full Concierge and hand it to them free. Blocked on their response contract; do not enable Concierge on ticket types until resolved.

### Linking a Stripe Customer to an account — id first, email as the fallback

`findUserByStripeCustomerId` ([src/lib/premium.ts](src/lib/premium.ts)) resolves by `stripeCustomerId` across both collections and both the root and nested paths, and **falls back to matching the Stripe Customer's email** when no document carries that id.

The fallback is not an edge case — it is the normal path for any subscription created outside this app. selectmember.jetzy.com sells Jetzy Premium against the same Stripe account, and the Customer it creates has never paid us, so nothing here knows the id. Without the fallback the webhook fires, finds nobody, and the member is charged while their membership never activates.

**It persists the link, and that is the point.** `customer.subscription.updated` writes only the membership sub-document — `active`, `status`, `currentPeriodEnd`, `cancelAtPeriodEnd` — and **not** the customer id. Nothing else would ever record it, so the lookup would hit Stripe on every future event and `getUserStripeCustomerId` would still return nothing, leaving the member unable to open the billing portal.

- **Both collections.** 42 accounts in staging exist only in `EventUsers`; a `Users`-only resolver never links them. `EventUsers` carries the same billing fields as `Users` (root `stripeCustomerId`, `premiumSubscription`, `conciergeSubscription`).
- **Case-insensitive.** Neither collection declares `lowercase: true` on `email` — the same trap as `Bookings.customerEmail`.
- **A different stored id is never overwritten.** Two Stripe Customers for one person means the stored id belongs to their other subscription; replacing it would orphan that one's future events. Logged instead, so the duplicate can be merged in Stripe.
- **Never throws.** It runs inside webhook handlers, where an exception becomes a failed delivery that Stripe retries.
- Email matching is weaker than an id: whoever creates the Customer must use the address the person signed up with, or the subscription attaches to the wrong account rather than to none. Both outcomes log loudly.

### Plan switching is the Stripe Billing Portal's job — there is deliberately no code for it

Premium sells monthly ($20) and annual ($200). **Neither this app nor selectmember.jetzy.com implements switching between them.** Both sell the two plans to *new* subscribers and send existing members to the portal (`/manage-membership` → `POST /api/subscriptions/portal`). Two systems writing their own proration logic against one shared Stripe account would produce different answers to the same request, and the errors land in money that this system cannot refund.

Portal configuration, per environment (test config `bpc_1LsNj0B7XccR5GE0wle5UYCH`):

- `subscription_update.enabled: true`, `default_allowed_updates: ["price"]` — price only, never quantity
- `proration_behavior: "always_invoice"` — an upgrade bills the difference **today**. `create_prorations` would merely record it and wait for the next invoice, which on an annual plan is a year away.
- `schedule_at_period_end.conditions: [decreasing_item_amount, shortening_interval]` — both downgrade shapes wait for period end. Annual→monthly trips both.
- Switchable prices are scoped to `$20/mo` + `$200/yr` only. The legacy `$10/mo` price is deliberately excluded, or any member could downgrade themselves onto it.
- `subscription_cancel.mode: "at_period_end"`

**Verified end-to-end in test (2026-08-12), both directions, with no code changes here:**

- **Upgrade** monthly→annual: the subscription **id was unchanged** — the portal updates in place, so there is exactly one subscription and no double billing. $200 less the unused month = $182.63 invoiced immediately, anniversary moved a year out. `customer.subscription.updated` fired, `subscriptionMembershipKey` resolved it off the product id, and `premiumSubscription` updated itself.
- **Downgrade** annual→monthly: Stripe attached a subscription schedule (phase 0 annual → phase 1 monthly at period end). Nothing charged or credited. Critically **`cancel_at_period_end` stayed `false`** on both sides — the webhook detects cancellation as a transition of that flag, so a scheduled downgrade could have wrongly emailed "membership cancelled". It doesn't.

**Two known gaps for when the Monthly/Annual UI is built here:**

1. The webhook records status, `active`, `cancelAtPeriodEnd`, period end and ids — **not the interval or price id**. Mongo alone cannot say whether a member is monthly or annual; that needs storing at write time or fetching from Stripe.
2. Nothing records a *pending* scheduled downgrade, so between the request and the period end our record shows the old plan with no hint a change is queued.

Also note Stripe Adaptive Pricing converts for non-USD customers — the test member was charged PKR against a USD price. Our disclosure quotes the USD figure, which is what the price is denominated in; Stripe adds its own "charges can vary based on exchange rates" line.

### Second membership: Full Concierge (selectmember.jetzy.com)

A ticket can sell **Jetzy Premium**, **Full Concierge Membership** ($59.50/mo), or **both**.
Money is taken in *our* Stripe; SelectMember is told about it so the member sees it on their
site.

**`src/lib/memberships.ts` is the registry.** `MembershipKey = "premium" | "concierge"`, each
with `label`, `productId` (env-backed: `NEXT_STRIPE_PREMIUM_PRODUCT_ID` /
`NEXT_STRIPE_CONCIERGE_PRODUCT_ID`), `userField` (`premiumSubscription` /
`conciergeSubscription`) and, for Concierge, `selectMemberPlan: "select_monthly"`. Nothing
else may hardcode a product. `membershipKeyForProductId` returns **null** for anything
unrecognised, and callers must treat that as "leave it alone".

**The bug this exists to prevent.** `webhooks/stripe.ts` never checked *which* product a
subscription was for — `if (session.subscription)` wrote `premiumSubscription`, and
`customer.subscription.updated` / `.deleted` keyed purely on customer id. One Stripe Customer
holds every subscription a user has, so adding a second product meant a Concierge purchase
would overwrite the buyer's Premium record and **cancelling Concierge would revoke their
Premium**. Every subscription branch now resolves `subscriptionMembershipKey(subscription)`
first — `metadata.membershipKey` (stamped on everything we create), else the line-item product.

**Both flows unify on "we create the subscriptions".** A Checkout Session creates at most ONE
subscription, so a ticket selling two memberships can't use `mode: "subscription"` at all, and
one subscription carrying both products would mean cancelling either cancels both. So the
immediate flow moved to the shape the approval flow already used: `mode: "payment"` with each
membership's first period as an inline one-time line item, then one subscription per product
created afterwards with `trial_end` one interval out.

- immediate → `checkout-fulfillment.ts`, right after the charge;
- approval → `api/bookings/approve.ts`, right after the capture;
- both via **`src/lib/membership-subscriptions.ts` → `startMembershipSubscription`**, which
  owns the trial arithmetic, the Stripe-side duplicate guard, the user-record write and the
  SelectMember mirror.

**Trade-off, accepted:** the immediate flow loses Stripe's atomic charge-and-subscribe. A
failure between the two leaves someone charged with no membership — recorded per product as
`status: "failed"` on the booking, visible and retryable, money never rolled back. Also, the
first period is a one-time charge rather than an invoice, so Stripe's subscription reporting
and MRR start from month two for **every** membership.

**Booking storage.** `payment.memberships: [{ key, status: pending|active|failed, amount,
priceId, interval, subscriptionId, lastError }]`. The flat `premium*` fields are deprecated but
still read — live PENDING approval bookings predate the array. Always go through
**`src/lib/booking-memberships.ts` → `bookingMemberships(payment)`**, which normalises both.

**Partial capture on approval** subtracts only the memberships the buyer has acquired since
the hold, so holding one of two still pays for the other.

**SelectMember sync** — `src/lib/select-member.ts`, best-effort, swallows its own failures
(the card is already charged; their outage must not fail a booking). Driven from the **webhook**
as well as at creation, so a cancel made in the Stripe billing portal — which never passes back
through our checkout code — still reaches them.

- outbound: `PATCH {base}/api/v1/subscription/select`, `GET .../select/status?email=`.
  `NEXT_PUBLIC_SELECT_MEMBER_URL`, optional `SELECT_MEMBER_API_KEY` sent as `x-api-key`.
- **`heldMemberships(email, scope)` consults their GET for Concierge.** Concierge has been sold
  on their site since before this integration, and those subscribers have no
  `conciergeSubscription` record here — on our own data they look like non-members, so a
  bundled ticket would charge them $59.50 for a plan they already pay for and leave them with
  two live subscriptions. `scope` is what the ticket/event actually sells, so an event with no
  Concierge ticket never reaches out (this runs behind the unauthenticated
  `/api/premium/check-email` on a debounced keystroke). A failed lookup falls back to our own
  record — never worse than not asking.
- inbound: **`POST /api/webhooks/select-member`** `{ email, status: "cancelled" }` →
  `cancel_at_period_end` on the **concierge** subscription only. **Requires
  `SELECT_MEMBER_WEBHOOK_SECRET`** in an `x-webhook-secret` header, compared in constant time,
  and refuses with 503 if the env var is missing. Theirs is deliberately open; ours can stop
  someone's billing, so it isn't. Only `cancelled` is accepted — accepting `active` would let
  their side hand out a membership nobody was billed for.

**Concierge is withheld from the ticket form** until the SelectMember integration has been
watched working end to end. `HOST_SELECTABLE_MEMBERSHIP_KEYS` in `memberships.ts`;
`NEXT_PUBLIC_ENABLE_CONCIERGE_TICKETS=true` releases it (a `NEXT_PUBLIC_` var, so it is baked
in at build time and needs a redeploy). This is a **visibility gate, not a kill switch** — a
ticket that already sells Concierge keeps selling it, checkout still charges for it, and every
subscription already created keeps renewing. `TicketMembershipToggles` still renders a
withheld key when a ticket already has it, so the host can see and remove it rather than
carrying invisible state; `toggle()` rebuilds from the full `MEMBERSHIP_KEYS` so editing an
existing ticket can't silently strip it.

**Other knock-ons:**
- `user.stripeCustomerId` moved to the **root** (a billing identity, not a membership).
  `getUserStripeCustomerId` reads root then either sub-doc, so no backfill.
- `/api/subscriptions/portal` and `/manage-membership` gate on **`hasBillingAccount`**, not on
  Premium. Gating on Premium told a Concierge-only member they had "nothing to manage" while
  their card was being charged monthly.
- `TicketPricing.recurring` is now an **array**. Showing one line while billing two is a price
  disclosure failure — the receipt, `/success` and the checkout modal all loop.
- react-query keys are parameterised: `["membership-plan", key]`, `["membership-status", key]`.
  A bare key would have served Concierge's price from Premium's cache.
- Per-event ticket allowance (2) is counted **per product** — two Premium tickets must not
  exhaust the Concierge allowance.
- Membership lifecycle emails take a `label` from the registry. A member of both can't tell
  which one ended from an unlabelled message.

### Annual Jetzy Premium ($200/yr) — direct and bundled

Premium is sold at two intervals. Detection never changed: `subscriptionMembershipKey` and
`findActiveSubscriptionForProduct` resolve by **product id**, so an annual subscriber is
recognised everywhere with no code aware of the interval. Only price *selection* changed.

**Reuse the existing prices — never create new ones.** SelectMember's live portal
configuration pins these exact ids in `subscription_update.products`; a second annual price
would leave their switch flow offering the wrong one. The product default stays **monthly**,
because every bundled disclosure that doesn't specify an interval reads it.

| | product | monthly (default) | annual |
|---|---|---|---|
| live | `prod_UzMR33CL777c3R` | `price_1U16VVB7XccR5GE08PIyF8i7` | `price_1U3KGWB7XccR5GE0h8qqEOtm` |
| test | `prod_Uxn2R9FQd5F3sp` | `price_1U16eYB7XccR5GE0AdABnPwO` | `price_1U3KA0B7XccR5GE0ZRwK6yKH` |

**Direct (`/subscribe`).** `/api/subscriptions/plan` returns `prices[]` alongside the
unchanged top-level `unitAmount`/`interval`/`name`. **One price per interval, product default
wins** — Premium still has a legacy active $10/month price, and without the dedupe the
selector showed two "Monthly" options. `PlanComparison` renders the selector only when
`prices.length > 1`. `/api/subscriptions/checkout` takes `interval: "month" | "year"` and
resolves the id server-side; it **never accepts a price id from the client**, which would let
anyone subscribe at any price on the account, and it errors rather than substituting.

**Bundled tickets.** `eventTicketsSchema.membershipInterval` — no default, no enum. `undefined`
means monthly, so every pre-existing ticket is unchanged and there is no backfill. One interval
per *ticket*, not per membership: only Premium has an annual price, so a per-membership map
would be structure with nothing to say. Read it with `ticketMembershipInterval` /
`ticketMembershipIntervalById` / `selectionMembershipInterval` — never the raw field.

- `api/checkout` resolves the bundled price with
  `findMembershipPriceForInterval(key, interval) || getMembershipPrice(key)`, reading the
  interval from the **event record**, never the request body — a crafted body could otherwise
  buy an annual membership at the monthly rate. The fallback is what lets a ticket set to
  annual still sell Full Concierge, which has no annual price.
- The line's stored `interval` comes from the **resolved price**, not the request, so
  `booking.payment.memberships[]`, `approve.ts` and the receipt describe what was actually
  charged.
- **Preserve-on-omit on update**, the same rule as `requireApproval` and `memberships`. A stale
  autosave must not move an annual ticket back to monthly.
- Nothing downstream needed changing: `startMembershipSubscription` computes `trial_end` as
  `dayjs().add(1, interval)`, and `renewalAdverb` already rendered "yearly".

**Disclosures follow the ticket, not the product default.** `planPriceForInterval` (in
`usePremiumPlan.ts`) picks the price for the ticket's interval and falls back to the default
*exactly as the server does*, so the two can't disagree. It feeds both previews
(`EventTicketsComponent`, `EventCheckoutModel`); `bundleApprovalNotice(keys, interval)` and the
host-side copy in `TicketMembershipToggles` take the interval too. A modal quoting $20/month
against a $200 charge is a disclosure failure, not a cosmetic one.

`membershipInterval` must survive every hop or the UI lies while the charge is right: the two
ticket mappers in `manage.tsx`, the ticket list and the redux payload in
`EventTicketsComponent`.

**The one thing to be deliberate about:** a bundled **approval** ticket holds the first period
on the card. On annual that is a **$200 authorization** — up to **$400** at
`PREMIUM_TICKET_MAX_PER_ORDER = 2` — on a hold that expires in ~7 days, on top of the ticket.
Legitimate, but large on a $60 ticket, so the host is warned where they choose it and the buyer
is told the annual figure before purchase.

### The plan card, and switching monthly → annual

**Two configurations, not one.** `STRIPE_PORTAL_CONFIG_ID` has switching OFF (see below).
`STRIPE_PORTAL_SWITCH_CONFIG_ID` has it ON but **scoped to Premium's product and its two
prices**, and `/api/subscriptions/portal` opens it with `flow_data.subscription_update.subscription`
pinned to the member's own subscription. Both locks are kept deliberately: one Stripe Customer
holds every membership, so an unscoped update button reappears on the Full Concierge row and
bypasses SelectMember's rules.

- Create it with `npx tsx scripts/create-portal-config.ts --switch`, once per environment.
  Prices are read from Stripe at run time (one per interval, product default wins) so the
  legacy $10/month price can never become a switch target.
- **The pinned API version (2024-04-10) does not echo `subscription_update.products` in the
  response.** It IS applied — Stripe 400s on an unknown product and on a price belonging to a
  different product. Don't "fix" an apparently missing scope by widening it.
- **`flow: "switch"` verifies the subscription is Premium** (`subscriptionMembershipKey`) before
  pinning the flow, even though the id comes from our own record.
- **Env var unset → the ordinary portal opens.** An update flow against a switching-disabled
  configuration is a hard Stripe error, so a missed deploy must degrade, not break.
- **Only monthly members are offered the switch** (`canSwitch`, decided server-side). Moving off
  annual mid-term leaves an unused credit on the customer and nothing here refunds cash.

**`GET /api/subscriptions/current-plan`** answers "which plan", live from Stripe. The interval is
deliberately **not stored** — a copy goes stale the moment someone switches in the portal. It is
its own route rather than a field on `/api/subscriptions/me`, because `/me` is polled by the
navbar on every page through `usePremiumStatus` and a Stripe round-trip does not belong behind a
page view. Best-effort: a Stripe failure returns the stored renewal date with no interval, and
the card then shows status + "Manage in Stripe" without offering a switch.

**`PlanComparison` renders both surfaces** — `/subscribe` and `PremiumPaywallModal` — in both
states. The modal previously passed no `prices` at all, so annual was unreachable from the door
most people use; it now shares `useMembershipPlan("premium")` with the page, which means one
cache entry and one formatter.

**The struck-through "$400" is marketing copy, not a price.** `COMPARE_AT_MULTIPLIER = 2` in
`PlanComparison.tsx`; nothing in Stripe backs it and no member was ever billed at that rate. It
matches selectmember.jetzy.com by decision (CEO, 2026-08-18) and is kept in one named constant
so it can be changed or removed in a single edit.

### Billing portal is scoped — no plan switching (`STRIPE_PORTAL_CONFIG_ID`)

`/api/subscriptions/portal` used to create sessions with no `configuration`, falling through to
the Stripe **account default**, which has `subscription_update` enabled. That offered an Update
button on the **Full Concierge** row as well as Premium — letting a member change a Select plan
through our surface, bypassing SelectMember's upgrade-only rules, proration preview and upgrade
email, and (because apis-service's webhooks are disabled) never reaching Mongo.

Our own configuration per environment: `subscription_update.enabled: false`,
`subscription_cancel.mode: "at_period_end"`, created by
`npx tsx scripts/create-portal-config.ts` so both environments are reproducible rather than
hand-clicked. `STRIPE_PORTAL_CONFIG_ID` is passed when set and **falls back to current
behaviour when absent**, so a missing var degrades rather than breaks.

**Do not touch the Stripe account default** — SelectMember depends on it existing. Cancel stays
enabled on both products: cancellation is the member's right, and a Concierge cancellation from
our portal already mirrors back via `mirrorToSelectMember`.

*If a switch flow is wanted later*, the pattern is a second configuration scoped to Premium's
two prices, opened with `flow_data` pinned to the member's Premium subscription — `flow_data` is
what makes Concierge unreachable by construction.

### Jetzy Premium member discount — resolved by EMAIL, not session (SUPERSEDED)

> Retained for context on pre-existing bookings. The discount described below no longer runs —
> see the section above. Booking fields `premiumMemberDiscountApplied` /
> `premiumMemberDiscountPercentage` remain readable so old receipts still itemise.

A premium event (`event.premium`) is open to everyone; a subscription just unlocks
`event.premiumMemberDiscountPercentage`. Eligibility used to be read off the NextAuth session
(`if (buyerId)` in `checkout/index.ts`, no `else`), which broke three ways at once: a guest who
pays for Premium got nothing silently, a logged-in member who typed a different email got a
discount on a booking belonging to that other address, and the modal preview could quote a
total Stripe never charged.

**The email typed into the checkout form is now the sole authority**, logged in or not. It is
the address the booking, ticket, QR code and auto-created Jetzy account all attach to, so it is
the only identity that cannot disagree with itself.

- **[src/lib/premium-eligibility.ts](src/lib/premium-eligibility.ts)** — `isPremiumEmail`,
  `resolveMemberDiscountPercentage`. **Server only**: it loads the user models.
- **[src/lib/premium-discount.ts](src/lib/premium-discount.ts)** — `eventMemberDiscountPercentage`,
  pure and isomorphic. React components import **this** one. Keeping them apart is what stops
  mongoose reaching the client bundle.
- **The email lookup MUST be a case-insensitive regex.** Neither `Users.email` nor
  `EventUsers.email` declares `lowercase: true` — same trap as `Bookings.customerEmail`. An
  exact match silently misses every subscriber who signed up with a capital letter.
- Both user collections are searched (`Users`, then `EventUsers`), mirroring `findUserRecord`
  in [premium.ts](src/lib/premium.ts).
- **A failed lookup fails the checkout** (500), it does not fall through to full price. The
  buyer was quoted a discounted total; charging them in full is worse than a retry. Same rule
  as the coupon-creation branch.
- Session is still read for `metadata.bookerUserId`, and drives only two UI things: prefilling
  the email, and the amber "this isn't the email on your Premium account" nudge.

**`POST /api/premium/check-email`** `{ email, eventId }` → `{ isPremiumMember, discountPercentage }`.
Unauthenticated by necessity — a guest subscriber has no session. **Preview only**; both
checkout endpoints resolve again server-side.

> **Accepted trade-off:** this lets an unauthenticated caller learn whether an address has a
> Premium subscription, and claim a member rate using someone else's. Deliberate product
> decision. Mitigations: it answers `false` without touching the user collections unless the
> event actually offers a member rate, returns no PII, and is rate-limited per IP. The ticket
> still goes to the typed address, so a discount claimed on a stranger's email buys a ticket
> you never receive.

**Client states** in [EventCheckoutModel.tsx](src/components/EventCheckoutModel.tsx), debounced
500 ms on the email field exactly like the referral field: unchecked → gray "members save X%";
member → green "X% off applied"; not a member *but* session is premium → amber mismatch +
"Use `<session email>`" button; not a member → gold Subscribe promo.

[EventTicketsComponent.tsx](src/components/EventTicketsComponent.tsx) shows a **session-based
preview** — it has no email field. Its running total now applies the member rate (it used to
show discounted per-ticket prices above an undiscounted total) and is labelled "confirmed at
checkout" so the modal correcting it reads as expected.

### `free-events.ts` is a real checkout path, not a shortcut

Two things changed together here:

- **Free-vs-Stripe is decided on the DISCOUNTED total** (`pricing.total === 0`), not the ticket
  prices. An order discounted to exactly $0 has nothing for Stripe to do — and an approval
  order asking Stripe to authorize $0 with `capture_method: "manual"` is rejected outright,
  which surfaced as an opaque failure at the very end of checkout. `isBelowStripeMinimum`
  deliberately treats $0 as free, so it never caught this.
- **The endpoint no longer trusts the request body.** It issues a booking with no payment step,
  so a client-supplied price was a client-supplied authorization: a crafted POST booked a paid
  ticket for free. `resolveOrder` rebuilds names, prices and the subtotal from the event
  record, aborts on a ticket id that isn't on the event (an unknown ticket must not quietly
  contribute $0), re-validates the referral code, resolves the member rate by email, and
  **rejects anything where `pricing.total !== 0`**.

It now records `referralCode`, `discountAmount`, `referralDiscountPercentage`,
`premiumMemberDiscountPercentage` and `premiumMemberDiscountApplied` — matching what
`checkout-fulfillment.ts` writes — and increments referral usage on the **confirmed** branch
only. Approval-pending bookings must not burn a use; that latch belongs to `bookings/approve.ts`.

**[src/lib/referral-validation.ts](src/lib/referral-validation.ts)** (`validateReferralCodeForEvent`)
is now the single server-side referral check, shared by both checkout endpoints. The public
`referral-codes/validate` route is only a modal preview and proves nothing — a code can be
deactivated or exhausted between the green tick and submit.

### Stripe's $0.50 minimum charge

Stripe refuses any charge under **50¢ USD**, manual-capture approval holds included. A ticket priced at $0.20 looked fine everywhere until a buyer reached checkout, where session creation threw and they saw a generic 500.

- `STRIPE_MIN_CHARGE_USD`, `isBelowStripeMinimum`, `BELOW_MIN_PRICE_MESSAGE` live in [src/lib/ticket-pricing.ts](src/lib/ticket-pricing.ts) — pure, so forms and APIs validate identically. **$0 is free and always allowed**; only $0.01–$0.49 is rejected.
- Enforced in both ticket modals ([create.tsx](src/pages/console/events/create.tsx), [manage.tsx](src/pages/console/events/[eventId]/manage.tsx)) and in the `price` zod field of [create.ts](src/pages/api/events/create.ts) and [update.ts](src/pages/api/events/[eventId]/update.ts). The server check is the real guard — the mobile app posts the same schema. Re-saving an event with a legacy sub-minimum ticket is blocked until it is repriced.
- [checkout/index.ts](src/pages/api/checkout/index.ts) guards the **order total** separately, because form validation cannot see events already saved at a bad price, nor a discount dragging a valid total under the floor ($2.00 × 90% referral = $0.20). It prices from the event record, not the request body.
- The route's 500 handler now sets a **top-level `message`** alongside the nested `error`. `ServerErrors` in [_toaster.tsx](src/lib/_toaster.tsx) reads only `err.message`, so previously every failure here surfaced as "Something went wrong. Please try again."
- `unit_amount` uses `Math.round(price * 100)` in all three price-creating routes. Unrounded, `19.99 * 100` is `1998.9999999999998` and Stripe rejects a non-integer.

### Custom event slugs

Hosts choose their own event URL, stored on `slug` (`String, required, unique, index`). Renaming retires the old value into `previousSlugs` rather than discarding it — see **Retired slugs** below.

**All slug logic lives in [src/lib/event-slug.ts](src/lib/event-slug.ts)** — `validateEventSlug`, `slugifyFromName`, `buildUniqueSlug`, `slugTakenFilter`, `nextSlugHistory`, `findEventByPreviousSlug`, `escapeForRegex`, `withQuery`, and the URL builders `eventPath` / `eventUrl` / `eventAlbumPath` / `eventAlbumUrl`. Isomorphic apart from the three that take the Mongoose model as an argument, so the forms and the API validate identically.

**Permissive by design.** Spaces, accents, `&`, `.`, `_`, emoji are all allowed. Only characters that cannot survive a URL path are rejected, each with a message naming the character: `/` (Next matches one path segment), `?` and `#` (terminate the path), `%` (breaks percent-decoding), `\`, and control characters. Also rejected: `RESERVED_SLUGS` (route names that would shadow `/[slug]` — `login`, `console`, `api`, `profile`, …) and **any 24-hex string**, which would be ambiguous with the ObjectId fallback at [[slug].tsx:259](src/pages/[slug].tsx#L259).

**Blank slug derives from the event name** — `slugifyFromName` strips HTML, folds accents (`Fête` → `fete`), drops apostrophes, and hyphenates; falls back to `generateRandomId(10)` when nothing usable remains (e.g. an emoji-only name).

**Uniqueness is CASE-INSENSITIVE.** The page lookup falls back to a case-insensitive regex, so `MyEvent` and `myevent` would resolve to each other and must not coexist. `buildUniqueSlug` appends `-2`, `-3`… and deliberately **does not filter `isDeleted`** — the unique index has no partial filter, so a soft-deleted event still holds its slug; filtering would report "available" then throw E11000.

**A retired slug counts as taken.** `slugTakenFilter(value)` is the single source of that rule — `{ $or: [{ slug: rx }, { previousSlugs: rx }] }` — shared by `buildUniqueSlug` and `/api/events/slug-available`. Letting a new event claim a retired slug would silently kill the redirect pointing at it.

- **create.ts** — `slug` optional in zod; supplied → validate + uniquify, blank → derive from name. The `generateRandomId(10)` last resort now goes through `buildUniqueSlug` too, because it can no longer see what's taken from the id alone.
- **update.ts** — `slug` optional; **omit means unchanged** (a stale client or autosave can never blank it); uniquify with `excludeEventId` so a no-op save doesn't bump the slug to `-2`. On a real change it also writes `previousSlugs`.
- Both catch `E11000` → friendly message instead of leaking Mongo's text through the 500 handler.
- **`/api/events/slug-available`** (GET, session required) backs the form's debounced availability check, with a distinct message when the clash is with a retired slug.
- `clone.ts` still uses `generateRandomId(10)` — a clone shouldn't guess a URL — but now via `buildUniqueSlug`.

**UI** — shared [EventSlugField.tsx](src/components/events/EventSlugField.tsx) on both create and manage, rendering an `events.jetzy.com/` prefix, live validation and availability.

### Retired slugs (old links keep working)

Renaming an event used to **hard-404 every link already in circulation**: RSVP buttons in emails already sent, printed QR codes, links pasted into chats. It happened in production — marketing mailed `/f3Bs01E5nk`, the host later changed the URL to `/ExclusiveJetzyPicnic`, and the mailed link died. Only the raw `/{objectId}` deep link survived a rename.

- **Schema:** `previousSlugs: [String]` on [src/models/events/index.ts](src/models/events/index.ts), with `eventsSchema.index({ previousSlugs: 1 })`. Additive and optional, so the mobile app sharing this collection is unaffected. Deliberately **not** unique-indexed — uniqueness has to hold across `slug` *and* `previousSlugs` together, which a multikey unique index can't express; that rule lives in `slugTakenFilter` instead.
- **Recording:** `nextSlugHistory(currentSlug, newSlug, history)` returns the new array, or `null` when the slug isn't really changing so `update.ts` can leave the field out of the `$set` (preserve-on-omit is unchanged). **Reverting to a former slug removes it from the history** — otherwise the event would list its own live slug as an alias. Capped at `MAX_SLUG_HISTORY` (20), oldest dropped.
- **Serving:** `findEventByPreviousSlug` runs in [[slug].tsx](src/pages/[slug].tsx) as stage 3.5 — **only after every current-slug lookup has missed**, because a live slug must always outrank another event's alias (legacy rows predate the uniqueness rule). Same stage in [[slug]/album/[albumId].tsx](src/pages/[slug]/album/[albumId].tsx). Both sit before the ObjectId fallback, which is safe since `validateEventSlug` rejects 24-hex strings.
- **307, not 308.** Browsers cache a permanent redirect indefinitely; a later rename — or a revert — would be unfixable for anyone who had followed the old link once.
- **Query strings survive the hop** via `withQuery(path, context.query, [dynamic params])`. Old links carry `?invite=true` deep links and `?ref=` referral codes; dropping them would quietly change what the visitor lands on.
- **Backfill for links that broke before this shipped:** `npx tsx scripts/backfill-event-slug-alias.ts --slug <current> --alias <old> [--dry-run]`. It **refuses** rather than guesses — aborts if the alias is another event's live slug (that link works today and must not be hijacked), if another event already retired it, or if it isn't a valid slug. Also runs `createIndex` explicitly, since the connection sets `autoIndex: false`; never `syncIndexes()`, which would drop indexes created by the mobile app or admin portal.

**Every slug URL is now encoded.** ~20 sites previously interpolated the slug raw, safe only because slugs were `[A-Za-z0-9]{10}`. Always use `eventPath`/`eventUrl` — never `` `${base}/${slug}` ``. Note `send-grid.ts` imports them **aliased** (`buildEventUrl`) because several functions declare a local `eventUrl`.

**Non-obvious:** [analytics/events.ts](src/pages/api/analytics/events.ts) matches `eventPath(event.slug)` against `PageView.page`. The browser records the *encoded* path, so a raw comparison would silently report zero views for any slug containing a space.

### Require Approval (free AND paid tickets)

**Scope: per-ticket, not per-event.** `eventTicketsSchema.requireApproval` is a `Boolean` with **no default** — `undefined` means "inherit `event.requireApproval`". That tri-state is what makes the change backward compatible with zero migration; adding `default:false` would pin every legacy ticket to OFF on its next save. The event-level flag is retained and relabelled in the UI as "Default for tickets that don't set their own".

Resolve it **only** through [src/lib/ticket-approval.ts](src/lib/ticket-approval.ts) — `ticketApprovalFlag`, `ticketRequiresApproval`, `eventHasAnyApprovalTicket`, `eventRequiresApprovalForAllTickets`, `selectionRequiresApproval`. Never read `event.requireApproval` raw.

The old "force `requireApproval=false` when every ticket is paid" rule in `create.ts`/`update.ts` is **removed**. `update.ts` instead does **preserve-on-omit** on the per-ticket flag (incoming → existing → unset) so a stale-client autosave can't wipe overrides.

**Paid approval = authorize, don't charge.** Ticket selection is single-select (one ticket type per checkout, [EventTicketsComponent.tsx](src/components/EventTicketsComponent.tsx)), so the selected ticket alone decides the mode — mixed carts are impossible.
- [checkout/index.ts](src/pages/api/checkout/index.ts): when the selection needs approval, the Checkout Session gets `payment_intent_data.capture_method:"manual"` + `submit_type:"book"` + `custom_text.submit`, and metadata gains `bookingRef` + `requiresApproval`. `payment_intent_data.metadata` duplicates those because `payment_intent.*` webhooks carry PI metadata, not session metadata. `success_url` gains `&approval=1`.
- Approve → `paymentIntents.capture()`. Reject/cancel → `paymentIntents.cancel()`. **Authorizations expire in ~7 days** and are then unchargeable — this is a known, accepted limitation, surfaced in the UI, with no re-charge fallback.

**Booking money state lives in `booking.payment`** (new sub-doc on [bookings.ts](src/models/events/bookings.ts)): `checkoutSessionId`, `paymentIntentId`, `captureMethod`, `status` (`authorized|capturing|captured|canceled|expired|failed`), `amount`, `authorizedAt`, `authExpiresAt`, `capturedAt`, `canceledAt`, `lastError`. Absent on free bookings and everything predating this feature — always use `payment?.`.

**`BookingStatus` is unchanged and still means "awaiting approval".** Money state is orthogonal and lives in `payment.status`; a free pending booking is `{PENDING, payment:undefined}`, a paid one `{PENDING, payment.status:"authorized"}`. Expired holds use the previously-unused `FAILED`. [booking-status.ts](src/lib/booking-status.ts) gained `FAILED` to `isCancelledBooking` plus `isAuthorizedHold` / `isCapturedBooking` / `isCaptureFailed` / `isHoldExpired` / `holdTimeRemaining`.

**Fulfilment moved to [src/lib/checkout-fulfillment.ts](src/lib/checkout-fulfillment.ts)** (`fulfillCheckoutSessionById`), called from **both** [checkout/confirm.ts](src/pages/api/checkout/confirm.ts) and the Stripe webhook, idempotent via the unique `bookingRef` + `E11000` catch. Reason: with manual capture, a buyer who never returns to `/success` would otherwise leave a live card hold with no booking row anywhere — invisible, unapprovable, silently released a week later. Side benefit: fixes the pre-existing duplicate-booking / duplicate-referral-increment bug on `/success` reload. Approval orders skip `updateEventTracker()` and defer the referral `usageCount` increment to approve time.

**Webhook** ([webhooks/stripe.ts](src/pages/api/webhooks/stripe.ts)) now also handles `checkout.session.completed` with `mode:"payment"`, plus **`payment_intent.canceled`** (`cancellation_reason:"automatic"` ⇒ `FAILED`/`expired` + guest and host emails — the authoritative expiry signal) and `payment_intent.payment_failed`. **Subscribe `payment_intent.canceled` in the Stripe Dashboard per environment.**

**approve.ts order: capacity check → atomic latch → capture → confirm.** Capacity first so a refusal never follows a capture (no refund tooling exists). Capture before confirm because the failure modes aren't symmetric: confirm-then-fail leaves a confirmed booking with an emailed QR and no money; capture-then-fail leaves `PENDING`/`capturing`, which a retry self-heals via `payment_intent_unexpected_state` → `succeeded`. Capture failure leaves the booking **PENDING** with `payment.status:"failed"` so it stays visible and retryable. `reject.ts` refuses outright if the PI already succeeded rather than stranding a charge. `cancel.ts` releases outstanding holds and now only decrements the tracker for bookings that actually consumed capacity.

**Emails** ([send-grid.ts](src/lib/send-grid.ts)) — all payment blocks are conditional, so free flows render byte-identically:

| Trigger | Guest | Host |
|---|---|---|
| Request submitted | `sendApprovalPending` + hold amount/deadline | `sendAdminApprovalNotice{kind:"request", amountOnHold, holdExpiresAt}` |
| Approve → charged | `sendTicketConfirmation{approvalContext, amountCharged}` | `{kind:"approved", amountCharged}` |
| Approve → charge fails | none (nothing settled) | none (synchronous; the red toast is the notification) |
| Reject | `sendApprovalRejected{reason:"declined", payment}` | none |
| Hold expires | `sendApprovalRejected{reason:"expired", payment}` | **`{kind:"expired"}`** — the only fully async path |

**Approvals UI** `src/components/console/ApprovalRequests.tsx` — one query, partitioned client-side into **Pending** (Payment + Expires columns, sorted soonest-expiring first, 48h warning strip, Approve disabled on expired holds, "Retry charge" + inline error on capture failure) and **Processed** (`Charged $X` / `Declined — released` / `Hold expired — never charged`). Without the Processed view a booking vanishes on approval and nothing tells the host whether the card was charged. Gating everywhere is `eventHasAnyApprovalTicket`, not `event.requireApproval`.

**`/success`** renders a pending-approval variant (amber, "Request Submitted", hold explanation, Total → "Amount on hold"). Its `payment_status !== "paid"` guard now exempts approval orders — every one of them hits it otherwise.

**Revenue split:** `manage.tsx` ticket rollups separate `revenue` (captured) from `onHold` (authorized) — authorized money is not collected money.

**Public event page admin panel** ([HostedEvents.tsx](src/components/HostedEvents.tsx), `Bookings & Waiting List`): the Approvals tab button carries a pending count badge plus a red `!` when any hold expires within 48h. `EventBookings` rows use `BookingStatusPill` — `pending · $X on hold` (amber) / `charged` (green) / `charge failed` / `hold expired` — instead of painting every non-cancelled status green, and the expanded row shows a payment panel with the hold deadline, capture timestamp, or `lastError`. The amount turns amber while only authorized.

**Public ticket list** shows a per-ticket pill (`Approval required · card authorized, charged on approval` for paid) and the event-level banner distinguishes "every ticket" from "some tickets". The CTA reads **Request to Book** when the current selection needs approval. `[slug].tsx` serialises via `event.toJSON()`, so per-ticket flags reach the page unmodified.

**Both booking-list endpoints were unauthenticated and are now admin-or-owner with Stripe ids projected out**: [get-bookings.ts](src/pages/api/get-bookings.ts) and [events/[eventId]/event-bookings.ts](src/pages/api/events/[eventId]/event-bookings.ts).

- Manage `getServerSideProps` passes `isAuthorized` (admin OR event owner); the Approvals tab shows a "sign in as admin/host" message when false. `?tab=approvals` deep-links to the Approvals tab (tabIndex 6). Guests & Bookings tables show Pending Approval (yellow) / Rejected (red) badges.
- Location safety: pending email never contains location; only the approval-confirmed email reveals it (always, regardless of `locationDisclosedAfterBooking`). Public page never shows a hidden location on-page.
- **Gotcha:** [bookings.ts](src/models/events/bookings.ts) caches the compiled model (`dbconn.models["Bookings"] || …`). After a schema edit a hot-reloaded dev server keeps the old model and **silently drops every `payment` field with no error** — restart the dev server.

### Discussions/Comments
`/api/events/discussions/create|get|list|update|delete|react|report|who-reacted|who-viewed`
`/api/events/discussions/comments/create|get|delete|reply|react|report|who-reacted`
`/api/events/comments/create|get|edit|delete|reply`

### Embedded Chat (JetzyChat iframe)
`/api/events/[eventId]/chat-info` — returns interestId for auto-join.
`/api/events/[eventId]/chat-tag-notify` (POST, no auth) — emails a tagged participant. Mailer `sendChatTagNotification` in `src/lib/send-grid.ts`.
`/api/events/[eventId]/chat-message-notify` (POST, no auth) — emails a participant on each new web-embed message. Body `{ senderName, recipientEmail, recipientName?, messagePreview }`. Mailer `sendChatMessageNotification` (mirror of tag-notify). No throttling: chat app fires one POST per recipient per message.
- Discussion dropdown in `src/components/HostedEvents.tsx` (`isChatExpanded`): when logged in the iframe (`JetzyChatIntegration`) is **always mounted**, hidden via `display:none` when collapsed, so it can load and report state. Iframe posts `jetzychat-state {eventId,hasMessages,...}`; child fires `onHasMessages` → parent auto-expands (expand-only). Origin checked by existing whitelist in `JetzyChatIntegration.tsx`.

### Admin / Misc
`/api/admin/compliance/unblock`, `/api/users/search`, `/api/delete-image`, `/api/get-bookings`, `/api/get-event-participants`, `/api/guests-list`, `/api/edgestore/[...edgestore]`, `/api/sendgrid-webhook`, `/api/welcome-email`

---

## Console Pages

| Page | File | Access |
|------|------|--------|
| Events list | `src/pages/console/events/index.tsx` | admin=all, user=own (ownerId filter) |
| Create event | `src/pages/console/events/create.tsx` | authenticated. Figma card design (mirrors Manage Overview): Basic Information / Interests(bare) / Event Benefits / Event Options / Date Poll / Status+Submit cards + Event Media sidebar. Shares styling tokens with manage (`#15181C`/`#343536`/10px cards, Roboto, full-width tz+chevron, date/time w/ icons). Logic unchanged (`CreateEventThunk`, success modal). |
| Edit event | `src/pages/console/events/[eventId]/update.tsx` | **Redirect shim → `/manage`** (editing merged into Manage Overview). Old route/bookmarks still resolve. |
| Manage event | `src/pages/console/events/[eventId]/manage.tsx` | admin OR owner. Figma redesign: **Overview tab is now the inline editable event form** (Formik, ported verbatim from old update.tsx — `initialValues`, `onSubmit`/`UpdateEventThunk` + send-update-event-email, image/video/ticket/poll handlers, Places autocomplete). 2-col responsive: main col (Basic Information, Post-Event Thank You, Interests, Event Benefits as chips over comma-string, Event Options, Date Poll, Status) + sidebar (Event Media `MediaUploadSection`, Quick Actions, Event Stats from `/api/analytics/events`). Header: breadcrumb + name, "Update Event" → `formikRef.submitForm()`, "Delete Event" → confirm dialog → `DeleteEventThunk`. Tabs (all 6, scrollable on mobile): Overview, Guests, Referral Codes, Custom Questions, Responses, Blasts |
| Check-in | `src/pages/console/events/[eventId]/check-in.tsx` | admin OR owner |
| Event analytics | `src/pages/console/events/[eventId]/analytics.tsx` | admin only — Overview tab (existing metrics) + Journey tab (funnel/heatmap/dwell/top targets) |
| Ticket mgmt | `src/pages/console/events/[eventId]/tickets.tsx` | — |
| Bookings list | `src/pages/console/bookings/index.tsx` | admin=all, user=own events |
| Booking detail | `src/pages/console/bookings/[eventId].tsx` | admin OR owner (strips ownerId from props) |
| Platform analytics | `src/pages/console/analytics.tsx` | admin only — dark themed (orange `#F79432` accent, `#1a1a1a` cards). Links to Journey page. |
| Journey analytics | `src/pages/console/analytics/journey.tsx` | admin only — dark themed. Sessions / Guests vs Auth / Heatmap / Funnels tabs |
| QR signup analytics | `src/pages/console/analytics/qr-signups.tsx` | admin only — dark themed. Metric cards + `/jetzyqrsignup` funnel + signups table (what each user entered: location, coords, placeId, invite code, provider) with date/search/provider/invite-code filters, pagination and CSV export. Linked from Platform + Journey analytics headers. |

---

## Public Pages

| Page | File | Notes |
|------|------|-------|
| Home / event listing | `src/pages/index.tsx` | users land here after login |
| Event detail | `src/pages/[slug].tsx` | public. Owns all OG/Twitter share meta (no `Layout` wrapper). See Social Share Meta below. |
| Login | `src/pages/login.tsx` | |
| Signup | `src/pages/signup.tsx` | |
| QR signup | `src/pages/jetzyqrsignup.tsx` | Invite code is FIRST field (optional, live-verified vs main backend). No name field — `firstName` derived from email local-part. Success screen says log in + "Forgot Password" (no temp password shown). |
| Success | `src/pages/success.tsx` | |
| **My Bookings** | `src/pages/my-bookings/index.tsx` | **login required** (`authorizedOnly`). The guest's own tickets. Not to be confused with `/console/bookings`, which is the host-side list of who booked events *you* run. |
| Cancel booking | `src/pages/cancel-booking.tsx` | unauthenticated, `?bookingRef=` from the confirmation email. Loads `/api/bookings/preview` to show what's being cancelled + the non-refundable warning. |
| Terms | `src/pages/terms.tsx` | |

### Social Share Meta (event links)

- All OG/Twitter tags for a shared event link live in the `<Head>` of `src/pages/[slug].tsx`. `Layout.tsx` / `EnhancedLayout.tsx` hold generic site-level tags and are **not** used by this page.
- `event.desc` is **Quill rich-text HTML**. Never put it in a `<meta>` raw — Apple/iMessage renders `og:description` literally and the card shows `<p><br></p>…`. Always run it through `toMetaDescription()` (`src/utils/text.ts`), which inserts spaces at block boundaries, strips tags, decodes entities, collapses whitespace and truncates to 200 chars on a word boundary.
- `og:image` is always emitted: `images[0]` normalized to absolute, falling back to `${NEXT_PUBLIC_URL}/imgs/logo.png` when the event has no images. `og:url` uses `slug || _id`. `og:type` is `website` (`event` is not a valid OG type).
- Previews are cached per-URL by iMessage/Facebook — re-scrape via the Facebook Sharing Debugger or test with a `?v=2` suffix before assuming a fix did not land.

### Event banner media

[src/lib/event-media.ts](src/lib/event-media.ts) is the single answer to "what does this event's banner show". `eventMedia(event)` returns `{url, type}[]` — images first, then videos. `normalizeEventMediaFields(source)` returns the cleaned arrays for normalising a payload before it becomes page props. **Never rebuild either inline**, or the slide count and the "No image available" placeholder will disagree.

The banner renders from three sources and only one of them is schema-checked: the Mongo document, the **external v2 API** (`?external=true&token=` in [src/pages/[slug].tsx](src/pages/[slug].tsx), which used to hand `externalData.data` to the page raw), and the mobile app's own writes to the shared collection. A bare string, a `null` entry or `""` all reached the banner and rendered as `<img src="">` or made a populated event look empty. `normalizeExternalEvent` in `[slug].tsx` now guarantees `images`/`videos` exist as string arrays, filling from the app's alternate keys (`image`, `photos`, `imageUrls`, `media`) before giving up.

**"No image available" and "Image couldn't load" are different faults and must stay worded differently.** The first means the event data carried no media; the second is a per-item `onError` in [HostedEvents.tsx](src/components/HostedEvents.tsx) meaning the url was there but the fetch failed. They used to be indistinguishable, so a screenshot could not tell stripped props from a dead S3 object — which cost a full production investigation (CEO report, 2026-08-12: event `Picnic` showed the placeholder on iOS Chrome while the DB, the server props and both S3 objects were all verified fine).

`[slug].tsx` logs the media count on every successful render, so the next such report resolves from server logs without needing the visitor's entry URL.

`clonedEvent` uses `structuredClone` with a `JSON.parse(JSON.stringify(...))` fallback. `structuredClone` is iOS 15.4+; without the fallback an older device threw into the `catch`, got `null`, and rendered **"Event Not Found"** for a perfectly valid event. The props are already JSON-derived, so the cheap clone is exact.

### Ticket revenue — never `quantity × list price`

[src/lib/booking-revenue.ts](src/lib/booking-revenue.ts) is the single answer to "what was this booking worth". Use `apportionRevenue` for per-ticket-type totals and `describeDiscount` for why a total is lower than its subtotal.

**`booking.total` is the authority, not the ticket's price.** The manage Overview cards and the Guests tab each computed revenue as `quantity × the ticket's CURRENT list price`. Measured against the live Jetzy Picnic that was wrong in both directions at once: three $95 tickets comped to $0 by a 100%-off referral code reported **"$285.00 collected"**, while a booking whose ticket type had since been deleted resolved to a $0 price and dropped its real **$20** from the totals entirely. Reading the price as it is *now* also means raising a ticket's price retroactively inflates what past buyers appear to have paid.

**Not `payment.amount` either** — on a bundled order that covers the first period of any membership sold with the ticket, so it would book subscription revenue against the ticket. See the `booking.total ≠ payment.amount` rule above.

**A $0 total has two causes and they must not look alike.** A genuinely free ticket is "Free"; a paid ticket comped to nothing by a code is "Free · CODE" — the host approving it needs to know a code did that. `describeDiscount().comped` is true only when a discount is what made it free (`subTotal > 0 && total === 0`), never for a ticket that was free to begin with.

**A priced booking with no `payment` sub-doc is "Not recorded", never "Free".** ~238 legacy rows predate payment tracking; their money state is genuinely unknown. `PaymentBadge` used to render `—` for all three of these cases, which reads as missing data — and did: a host looked at a comped request and assumed the amount had failed to load.

### Host-authored descriptions — always render through `EventDescription`

[src/components/events/EventDescription.tsx](src/components/events/EventDescription.tsx) is the single renderer for both `event.desc` and `ticket.desc`. It sanitizes (DOMPurify) **before** linkifying, and handles both stored shapes: Quill HTML from the rich-text editor, and the plain text with `\n` that everything written before it still holds.

**Never render either field as bare text.** A Chakra `<Text>{ticket.description}</Text>` collapses the host's line breaks into one run-on paragraph and leaves URLs unclickable — which is exactly how the manage and create ticket lists drifted out of agreement with the public one, so the host's preview showed something different from what a guest saw. Call sites: [EventTicketsComponent.tsx](src/components/EventTicketsComponent.tsx) (public ticket list), [HostedEvents.tsx](src/components/HostedEvents.tsx) (event description), and the ticket lists in [manage.tsx](src/pages/console/events/[eventId]/manage.tsx) / [create.tsx](src/pages/console/events/create.tsx). Pass `className` to size it in context; in the console include `roboto.className` so it matches the surrounding type.

---

## Navigation

### ConsoleNavbar (`src/components/layout/ConsoleNavbar.tsx`)
- role=user: All Events (`/`), My Events (`/console/events`), Create Event, Bookings, Share Profile
- role=admin: All Events, My Events, Create Event, Bookings, Analytics, Jetzy User Signup, Share Profile
- Active state: `pathname === item.href` (URL match, NOT page prop)

### Public Navbar (in `src/components/misc/EventsListing.tsx`)
- Unauthenticated: Login + Sign Up
- Authenticated user: My Events | + Create Event | Bookings | avatar menu
- Authenticated admin: Dashboard link | avatar menu

---

## Key Enums (`src/types/const.ts`)
- `Roles`: USER = "user", ADMIN = "admin"
- `EventPrivacy`: PUBLIC, PRIVATE, GROUP
- `TransactionStatus`: PENDING, SUCCESS, FAILED, RESERVED
- `Pages`: Dashboard, Events, Bookings, Manage, CreateEvent, Analytics

---

## Lib Files (`src/lib/`)
- `authSession.ts` — auth guards
- `booking-identity.ts` — **the** answer to "is this booking mine?". `buildBookerMatchClauses(session)` (Mongo `$or`), `sessionOwnsBooking(session, booking)`, `sessionUserId`, `sessionIsAdmin`. Matches `bookerUserId` OR a **case-insensitive anchored regex** on `customerEmail`. Before this, three call sites used three different comparison semantics and `my-for-event.ts` silently missed every booking stored with a capital letter in the email (4 such rows in prod).
- `booking-cancellation.ts` — cancellation rules + money state. `bookingMoneyState` (`free|hold|captured|released|unknown`), `bookingMoneyAmount`, `hasEventStarted`, `canGuestCancel`, `NON_REFUNDABLE_MESSAGE`. **`unknown`** = non-zero `total` but no `payment` sub-doc: 238 production bookings are in this state (pre-`payment` legacy rows, plus `waiting-list/approve.ts` which still creates priced bookings with no payment). It must never render as "Free booking" (it may have been paid) nor as "charged" (it may not have been) — every surface phrases it conditionally. `hasEventStarted` compares the exact `startsOn` instant — deliberately **not** `getEventStatus`, which keeps the whole start day alive (right for badges, wrong for a cutoff). No `startsOn` (TBD/date poll) ⇒ not started ⇒ still cancellable.
- `booking-status.ts` — `isCancelledBooking`, `isPendingBooking`, `isAuthorizedHold`, `isCapturedBooking`, `isCaptureFailed`, `isHoldExpired`, `holdTimeRemaining`
- `connect-db.ts` / `db.ts` — DB connection
- `helpers.ts` / `utilities.ts` / `utils.ts` — general helpers
- `email-service.ts` — SendGrid templates (event update emails etc.)
- `send-grid.ts` — SendGrid integration (102KB, full template library)
- `event-helpers.ts` — resolveEventLocation, hardcoded venue fallbacks
- `event-participants.ts` — participant management
- `user-utils.ts` — user utilities
- `qr-generator.ts` — QR code generation
- `edgestore.ts` — EdgeStore file management
- `magicLink.ts` — magic link auth
- `currency.ts` — currency utilities
- `responseCodes.ts` — HTTP response code utilities
- `react-query-provider.tsx` — React Query provider
- `_toaster.tsx` — toast notifications
- `activity-sync.ts` — activity sync
- `validator/authValidtor.ts`, `validator/event.ts` — validation rules

---

## Components (`src/components/`)
- `analytics/` — BookingTrendsChart, DateRangeSelector, MetricsCard, VisitorChart
- `auth/` — SessionSync
- `bookings/` — BookingEventsTable, BookingEventsDetailsTable
- `console/` — ReferralCodesManager
- `events/` — AddTickets, CreateDiscussionModal, DiscussionBoard, DiscussionPostView, EventsTableComponent, EventTicketTable, JetzyChatIntegration, QRCodeModal, ReactionsListModal, TicketCard
- `form/` — CheckoutForm, DatePicker, TimePicker
- `layout/` — ConsoleLayout, ConsoleNavbar, EnhancedLayout, Layout
  - `ConsoleLayout` takes optional `stickyHeader` (type in `src/types/layout.ts`): pins the title + action-button header to `top-0` (`z-30`) and publishes its measured height as the CSS var `--console-header-h` (ResizeObserver) so page content can stick beneath it. Used by `console/events/[eventId]/manage.tsx` so **Update Event / Clone / Delete** stay reachable while scrolling the long edit form; that page also pins its `TabList` at `top: var(--console-header-h)` and swaps the button label to "Save Changes" + dot when Formik is `dirty` (via local `FormDirtyWatcher`).
  - Header height must stay **constant** — an earlier collapse-on-scroll version jittered (height change → reflow → threshold re-crossed → oscillation).
  - `html, body` use `overflow-x: clip` (not `hidden`) in `src/styles/globals.scss`; `hidden` makes body a scroll container and disables `position: sticky` everywhere.
- `misc/` — EventsListing, LoginModal, ForgotPasswordModal, RichTextEditor, SafeHTML, Pagination, ProgressBar, Spinner, CardGroup, DragAndDropUploader, ListGroup, TicketQuantityInput
- Top-level: CheckInPortal.tsx, CheckInStats.tsx, ErrorBoundary.tsx, EventCheckoutModel.tsx, EventDetails.tsx, EventTicketsComponent.tsx, HostedEvents.tsx, image-upload-box.tsx, media-upload-section.tsx, video-upload-box.tsx, timezone-select.tsx

---

## State Management
- Redux slices: `appSlice`, `authSlice`, `eventsSlice`, `ticketsSlice`, `checkoutSlice` (in `src/redux/reducers/`)
- Store: `src/redux/stores.ts` — Next Redux Wrapper integration
- React Query (tanstack v5) for server state
- NextAuth session for auth state

---

## Services (`src/services/`)
- `auth/` — authapis.ts, authendpoints.ts
- `checkout/` — index.ts
- `events/` — eventsapis.ts, eventsendpoints.ts, discussionApis.ts, discussionEndpoints.ts
- `interests/` — interestsapis.ts, interestsendpoints.ts
- `tickets/` — ticketsapis.ts, ticketsendpoints.ts
- `users/` — userapis.ts, userendpoints.ts, getUser.ts
- `upload.service.ts`

---

## Feature: Event Albums
Photo/video albums on the public event page, rendered **above** the Discussion section ([HostedEvents.tsx](src/components/HostedEvents.tsx) — `<EventAlbums>` above `#discussion-section`).
- **Models:** `event-albums` (IEventAlbum) + `event-album-access` (IAlbumAccess).
- **Component:** [src/components/events/EventAlbums.tsx](src/components/events/EventAlbums.tsx) — dark theme card. Album grid → gallery modal (react-slick, images + `<video controls>`). Create/Edit modal: multi-file photo+video upload via `uploadFile` ([upload.service.ts](src/services/upload.service.ts), folder `posts`), **per-file `AbortController`** so uploads are cancelable; Cancel aborts all in-flight + discards. **Drag-to-reorder** staged media via framer-motion `Reorder` — media is an ordered array and the cover = first image (Cover badge marks it). **Share** (copy `/{slug}?album={id}` + QR + Copy Link) is available to **every logged-in viewer**; Edit/Delete are admin/owner only.
- **Email verification (required since 2026-08-21):** the guest gate is two steps — the form, then a **6-digit code** mailed to the address typed (`POST …/albums/send-code` → `src/lib/album-verification.ts`). **Nothing is written until the code checks out**: no account, no cookie, no interest row, so a mistyped or borrowed address leaves no trace. 10-minute TTL, 5 attempts, 60s resend cooldown, per-IP limit via `src/lib/rate-limit.ts`. A correct code is deleted, so it is single-use. Codes live in their own collection — **never reuse `EventUsers.manualVerificationCode`**, which belongs to the compliance-unblock flow, or an album code would also unblock an account.
- **`verified` / `identifiedAt`:** verification happens at the gate but the analytics row is written later by `…/[albumId]/access`, which never sees it — so `verifiedAt` rides on the signed `album_guest` cookie (`MagicLinkData.verifiedAt`) and `resolveAlbumViewer` returns it. Cookies issued **before** this gate carry neither field: those rows read as **unverified**, which is not the same as failed, and reports must say so. A NextAuth session is `verified: true` with **no** `identifiedAt` — there is no such moment recorded, so the UI shows a dash rather than inventing one.
- **View gate (no login required):** a logged-in user is never prompted; everyone else fills an inline **name + email** form ([album-auth.ts](src/lib/album-auth.ts) + `guest-access` API). Existing email → matched to that account; unknown email → account auto-created silently via `createOrUpdateUser` (same helper as ticket checkout). Identity is kept in a signed HttpOnly `album_guest` cookie (90 days). Deliberately low friction — the old `/login` redirect was losing people.
- **Tagging:** any viewer can tag people in a photo; the tagged person gets an email. Hosts get an **`@`-mention** search over registered attendees (suggestions are host-only so the attendee email list doesn't leak to link recipients); everyone else types name + email. People are **staged locally and only sent after an explicit confirm dialog** — nothing is emailed on a misclick — and several can be tagged in one pass. **No duplicate restriction:** the same person can be tagged again on the same photo (and is re-emailed); nobody is hidden from the `@` dropdown. `PhotoTagging` is keyed by photo URL so staged tags reset when you swipe.
- **Auto-login:** entering name + email signs the visitor in for real **only when the account is brand new** (`guest-access` returns a `magicToken` → `signIn("credentials", …)`). Emails that already belong to someone get album access via the cookie but **no session**, so a share link can't be used to take over a known account.
- **Publish:** albums are visible immediately; the Publish button emails all attendees (`getEventParticipants`) that the photos are up. Re-sending requires explicit confirmation (`resend:true`).
- **Share deep-link:** `/{slug}?album={albumId}`. Logged-out recipient is bounced to login; after auth returns, that album auto-opens AND `POST …/access` fires once (sessionStorage guard `album_access_<id>` + server unique-index dedupe).
- **Notify email:** `sendAlbumAccessNotice` ([send-grid.ts](src/lib/send-grid.ts)) → `SENDGRID_EMAIL_SENDER` inbox, first time each user opens each shared album. login-vs-signup comes from the `isNewAccount` flag the gate posts; account age (<10 min = signup) is only the fallback for an already-logged-in session.
- **Analytics:** `/api/analytics/events` returns an `albums` block (albumCount, totalAccesses, uniqueViewers, **verifiedViewers**, logins, signups, perAlbum[]). The Access Log carries `Verified` and `Signed in/up` (`identifiedAt`) columns beside the existing `Viewed` date, and the Viewer Interests table carries `Verified`; both are in the CSV export. Surfaced in [analytics.tsx](src/pages/console/events/[eventId]/analytics.tsx) as a dedicated **"Albums" tab** (4th tab): summary cards + Top Albums table + per-viewer **Access Log** (name/email/login-vs-signup/date from `GET …/albums/access-log`) + **Export CSV** (summary + per-album + full access log). Admin-only page.
- **Cross-team contract:** `MEDIA_CONTRACT.md` (repo root) documents `images`/`videos`/`mediaOrder`, the ordering algorithm and the create/update write rules for the mobile app team. Keep it current with any change here.
- **Host-ordered banner media:** `mediaOrder: [String]` on the event (urls across `images` + `videos`), no default — absent = legacy images-then-videos. [event-media.ts](src/lib/event-media.ts) `eventMedia()` applies it via the shared `applyMediaOrder`, which the host's media grid uses too. Unnamed urls append (the mobile app writes `images`/`videos` without knowing about the field); dead entries are skipped. Edited in [media-upload-section.tsx](src/components/media-upload-section.tsx) — one combined draggable grid (native HTML5 DnD, same approach as the album form), a **FIRST** badge on position 0, shared by create and manage. Both forms hold `mediaOrder` state beside `uploadedImages`/`uploadedVideos`, include it in `mediaVersion` (a drag changes neither array, so autosave wouldn't otherwise fire) and pass it through `buildEventPayload`.
- **Banner videos autoplay** ([HostedEvents.tsx](src/components/HostedEvents.tsx)): `autoPlay muted loop playsInline preload="metadata"` plus `controls`. Muted is mandatory — browsers refuse unmuted autoplay. `afterChange` replays `.slick-current` because the existing `beforeChange` pauses every video on the page.
- **Cards use `eventMedia(event)[0]`**, so a video lead shows its first frame (`#t=0.1`) with a play badge, on the listing/dashboard card, My Events, My Bookings and the album rail. None autoplay. Any endpoint projecting event fields needs `videos` + `mediaOrder` (`api/bookings/mine` did).
- **One event card, two surfaces:** [EventListingCard.tsx](src/components/events/EventListingCard.tsx) renders the card on the public listing AND the console dashboard ([CardGroup.tsx](src/components/misc/CardGroup.tsx) is now just the grid). The dashboard used to be a separate Tailwind card with its own image treatment, stats and Edit button, so an admin saw two different cards for the same event. Fixed `h="500px"`, 2-line title clamp, letterboxed banner, admin-only ticket counts on ONE line, and a footer where RSVP and Manage Event share the row as equals when both are shown — a 1fr/auto/1fr grid put RSVP off-centre and pushed the pair past the card's bottom edge. The totals query is `enabled: isAdmin`, so anonymous visitors no longer fire one request per card.
- **Ended events lead with the photos:** once `getEventStatus(event) === "past"`, the event page collapses **Description** and (for host/admin, the only ones who still see it) **Tickets** behind chevron toggles, closed by default, and the album CARDS get bigger (`EventAlbums largeCards` — 2 columns instead of 4). The section keeps its normal `max-w-4xl`: widening the container instead just left small cards adrift in a wide box. A live event renders exactly as before — no toggles, no width change. Guests never saw tickets on an ended event; that rule is unchanged.
- **Promoted events on the album page:** [PromotedEvents.tsx](src/components/events/album/PromotedEvents.tsx) — `usePromotedEvents(excludeEventId)` (one `useQuery` on `/api/events?page=1`, filtered to **live + future** via `getEventStatus`, this album's own event dropped), `PromotedEventCard`, `PromotedEventsRail`. Cards are stacked (banner on top, then name/when/where and an RSVP pill), with a bigger `size="lg"` variant on mobile — a small row between two full-bleed photos reads as a footnote. Desktop: **every** live/upcoming event, uncapped (decision 2026-08-21), in the sticky **left** column under an "UPCOMING EVENTS" heading — the album title/description/count moved to the **right**, above the photos. The column renders only when there is something to promote, so the photos take the full width otherwise. It has `maxH`/`overflowY` with a thin custom scrollbar (the native one is a wide light bar on a dark page). The only ceiling is `/api/events`'s hardcoded page size of 20. Mobile: one card interleaved **at row boundaries** whenever the running tile count crosses a multiple of 2 — never inside a row, because a 2-up row is a flex `row` from `sm` up. The slots are precomputed over the whole row list (`promoSlotByRow` / `promoSlotCount`) so any events a short album had no room for are appended **below** the grid once every row is rendered — a 5-photo album has only two slots, and without that the rest would never be seen on mobile. Each side is hidden at the other's breakpoint so the same events never show twice. `/api/events` has no `limit` param (LIMIT 20, hardcoded) so the slice is client-side, and `search` is never passed — that path makes an outbound call to the Jetzy interests API.
- **"Jetzy Life" mark:** `JetzyLifeMark` in [[albumId].tsx](src/pages/[slug]/album/[albumId].tsx) — a translucent pill on every tile and on the lightbox stage. On the **tile**, not the `<img>`, so videos carry it; `pointerEvents="none"` so it can't eat a tile click. **Not baked into the file** — the lightbox Download button still serves the original, and a CSS overlay is branding, not anti-theft.
- Full mobile-parity spec: `ALBUM_API.md` (repo root).

## Feature: Custom Questions
Types: `text`, `options`, `multiple_choice`, `social_profile`, `company`, `checkbox`, `terms`, `mobile`, `website`
Social profile: auto-title, opt-out supported
API: `POST /api/events/admin/update-questions` (admin OR owner)
Guest detail modal shows answers
Pagination + serialization fixes applied

## Feature: Date Poll
Schema: `datePoll.isActive`, `datePoll.question`, `datePoll.options[]` (id, date, time, label, votes)
API: `GET/POST /api/events/[eventId]/poll`, `POST /api/events/[eventId]/poll/vote`
Safari date parse issue fixed (commit 5b977a7)

### Mutual exclusion with fixed dates (Date Poll ⟷ Start/End)
An event has EITHER a fixed start/end date OR an active date poll, never both.
- **Server (authoritative):** if `datePoll.isActive && options.length > 0`, `create.ts`/`update.ts` drop `startsOn`/`endsOn` (update `$unset`s them); `clone.ts` skips copying dates when the source poll is active. Heals legacy both-set records on next save.
- **Client (create.tsx + manage.tsx):** enabling the poll switch clears start/end fields; setting a start/end date calls `clearDatePoll()`. A section is greyed only when the OTHER side has data AND this side is empty — so a legacy conflict (both set) unlocks BOTH sections, shows an orange conflict banner, and `onSubmit` blocks with a toast until the user removes one. Date Poll section renders directly beneath Start/End inside Basic Information.

### Start/End time now optional
`create.ts`/`update.ts` build the date from `startDate` alone (`startTime || '00:00'`) — previously required both, so a date without a time was silently dropped. `DatePicker.tsx` no longer sets `minDate`, so past/today dates are selectable (today's/ended events stay editable).

### Date-only vs midnight — `hasStartTime` / `hasEndTime` flags
Because `startsOn`/`endsOn` is a single `Date`, it can't tell a date-only event apart from a real 12:00 AM event. Two optional booleans on the event model ([models/events/index.ts](src/models/events/index.ts), [types.ts](src/models/events/types.ts)) record intent:
- **Write:** `create.ts`/`update.ts` set `hasStartTime = !!(start && startTime)` (empty time string = date-only). `clone.ts` copies the flags with the dates.
- **Read (show unless explicitly false):** every time-display site guards on `event.hasStartTime !== false` (and `hasEndTime`). Legacy events (flag `undefined`) still show their time, so real 12 AM events are preserved — no backfill needed. Only events the new flow marks `false` hide the time.
- **Sites:** `manage.tsx` (editor init + update-email change detection), `HostedEvents.tsx`, `EventsListing.tsx`, `success.tsx`, `send-grid.ts` (both booking-confirmation builders). `email-service.ts` uses a `${startTime ? ...}` string guard fed the flag-derived time from manage. (An earlier `00:00`-heuristic helper `hasEventTime` was removed in favor of these flags.)

## Feature: Draft Events
`status` field on IEvent: `draft` | `published`
Draft events filtered from public `/api/events` listing
Validation/redirection flow: draft→published handled on My Events page
Commit: 86af2a6, f2f23e8

## Feature: Autosave to Draft (event create/edit forms)
Debounced (~2s) autosave with a "Saving… / Saved / Unsaved" pill next to the Save button.
- **Create page** (`console/events/create.tsx`): first meaningful change (name required) creates ONE draft record (`status:draft`), then keeps updating it. `autosaveIdRef` + `creatingRef` + `createPromiseRef` prevent duplicates; `onSubmit` promotes/saves that same record (draft→published) instead of a second create.
- **Manage page** (`console/events/[eventId]/manage.tsx`): a **draft** event autosaves in place (stays draft); a **published** event autosaves into a server-side **shadow draft** `event.draftRevision` — live fields untouched until Save. On load, if `draftRevision` exists the form seeds from it and shows a banner with **Discard draft** (reverts to live).
- Autosave bypasses the redux thunks (which toast) and calls service APIs directly: `CreateEventApis`/`UpdateEventApis`/`SaveDraftRevisionApis`/`DiscardDraftRevisionApis`. Always stores `status:'draft'`; never runs the published Zod schema.
- Schema: `draftRevision: { payload, savedAt }` (Mixed, optional) on `src/models/events/index.ts` + `IEvent`. `update.ts` `$unset`s it on every real save. New route `src/pages/api/events/[eventId]/draft-revision.ts` (POST save / DELETE discard, admin-or-owner).
- Shared UI/logic: `src/components/events/AutosaveManager.tsx` — `<AutosaveManager>` (inside Formik, debounces via `useFormikContext`), `<AutosaveStatusPill>`, `buildEventPayload(values, images, videos, overrides)`. Media (`uploadedImages`/`uploadedVideos`) merged in via `mediaVersion` signature since it lives outside Formik.

## Feature: My Bookings (guest-facing) + cancellation

Guest-side counterpart to `/console/bookings`. Before this, a guest had no way to see a booking after the confirmation email, and self-cancel only worked on free events.

**Page** `src/pages/my-bookings/index.tsx` — `authorizedOnly` SSR guard, public `Navbar`, dark card grid. Filter + page live in the URL (same convention as My Events). Chips: All / Upcoming / Past / Pending / Confirmed / Cancelled, each with a live count. Data via react-query + axios against `/api/bookings/mine`.

**Components** (`src/components/bookings/`)
- `BookingCard.tsx` — reproduces the public `EventCard` visual shell (`#1e1e1e` / `#434343`, 200px cover, `scale(1.03)` hover, fixed `h="24"` date+location block). Deliberately a *separate* component: `EventCard` is module-local inside `EventsListing.tsx`, fetches per-event totals and carries the admin Edit pill — reusing it would drag booking concerns into the public listing. Badge shows booking status + event time status; cancelled cards render at `opacity 0.55` with the title struck through. Unknown statuses fall back to the **confirmed** badge, never "pending approval".
- `BookingDetailModal.tsx` — house modal recipe (`#1E1E1E`, `#9C9C9C` labels). Event link via `eventPath` (never interpolate a slug), price breakdown via `pricingFromBooking`, hold expiry via `HoldExpiry`, custom answers, Cancel button.
- `CancelBookingDialog.tsx` — shared `AlertDialog` used by My Bookings, the event page and the host table. **Its whole purpose is the money warning**; copy switches on `moneyState` (`hold` → "you were not charged"; `captured` → red "non-refundable, will NOT be returned"). `asManager` flips the wording for host/admin.
- `PaymentBadge.tsx` — `PaymentBadge` + `HoldExpiry`, extracted from `ApprovalRequests.tsx` so the approvals panel, host table and guest modal can never disagree about whether a card was charged.

**Cancellation rules** — all in `src/lib/booking-cancellation.ts`, never re-derived inline.
- Cutoff is **event start**. Guests may cancel free, held and captured bookings until `startsOn`; after that the button is hidden and the API returns 403. TBD/date-poll events stay cancellable.
- Hosts and admins have **no cutoff** — they need to clean up after an event too.
- **No refunds** in any path (see "No refunds — by decision" above).
- Capacity is released only when the booking was CONFIRMED (a PENDING approval never incremented the tracker). The `CheckIn` row is deleted.

**Host side**
- `BookingEventsDetailsTable.tsx` gained a Payment column (`PaymentBadge`) and a **Cancel** action. Cancel is gated on the new `canManage` prop (admin **or** owner); Delete stays `isAdmin`-only. `/console/bookings/[eventId]` now projects the `payment` sub-doc (minus Stripe ids) and serializes its dates.
- `sendHostCancellationNotice` emails the event owner + `ADMIN_NOTIFICATION_EMAIL` on every cancellation; non-fatal by design.

**User linkage** — paid bookings previously had **no `bookerUserId`** (35 such rows in prod); it was only ever written by `free-events.ts`. Fixed forward: `checkout/index.ts` puts `bookerUserId` in the Stripe metadata and `checkout-fulfillment.ts` persists it. Older bookings still resolve by email, which is why the email match must stay case-insensitive.

## Feature: Event Sorting & Status Badges
Canonical order everywhere: **live → future → tbd → past**. Single source of truth in `src/utils/eventSort.ts`:
- `getEventStatus(e, now?)`: `effectiveEnd = endsOn ?? startsOn`; no dates→`tbd`; `effectiveEnd < now`→`past`; `startsOn > now`→`future`; else `live` (also end-only "by mistake" events stay live until `endsOn`).
- `sortEvents(events, now?)`: bucket rank, then within-bucket — live=effectiveEnd ASC, future=startsOn ASC, tbd=createdAt DESC, past=endsOn DESC.
- `getStatusRank`, `STATUS_LABEL`, `STATUS_RANK` exports.
Consumers: `api/events/index.ts` (public list), `console/events/index.tsx` getServerSideProps (My Events — writes `timeStatus` per event, `isEnded = timeStatus==="past"`; filter chips map upcoming→live|future, ended→past, tbd→tbd), `EventsListing.tsx` client re-sort (bucket rank first, then distance within bucket when location granted).
Per-card status badge (LIVE green / UPCOMING orange / TBD gray / ENDED gray) on both public `EventCard` and My Events `ListingCard`. NOTE: event lifecycle `status` (draft/published) is separate from `timeStatus` — do not conflate.

## Feature: Location Disclosure
`locationDisclosedAfterBooking` boolean on IEvent
Location hidden until booking confirmed when true
Commit: 606a968

## Feature: Referral Codes
Full CRUD: `/api/events/[eventId]/referral-codes`
Admin OR owner access
Tracks discountPercentage, commissionPercentage, usageCount, maxUses
Stats endpoint available

## Feature: Invite Code on QR Signup (user-level referral, NOT event referral codes)
- UI: `jetzyqrsignup.tsx` — optional invite-code input, first field. Non-empty code live-verified via `VerifyReferralCodeApi` (`src/services/auth/authapis.ts`) → `GET external:/v1/referral/verify/{code}` (200 = valid; main Jetzy backend, same host as SSO). Invalid → inline error, blocks submit. Empty → skipped.
- `refCode` flows: page → `handleEmailSignup` spread → `/api/create` → stored on EventUsers (`refCode` field in `eventUsersModal.ts`) + forwarded to main backend `/v1/accounts/create` (see Auth API section). `SignUpFormData.refCode?` in `src/types/form.ts`.
- SSO (Google/Apple) signup does NOT carry invite code (goes through firebase-auth provider).

## Feature: QR Signup Attribution + Analytics
- `EventUsers` gained `signupSource` (e.g. `"jetzyqrsignup"` / `"signup"`) and `signupSessionId` (analytics sessionId at signup) — both optional + indexed, in `src/models/eventUsersModal.ts`.
- Email path: `jetzyqrsignup.tsx` reads `sessionId` from `useAnalytics()` and spreads both fields into `handleEmailSignup` → `SignUpFormData` → `/api/create` → `EventUsers.create`.
- SSO path: `handleGoogleLogin`/`handleAppleLogin` in `useSignup.ts` take `{ signupSource, signupSessionId }` and forward them as `signIn("firebase-auth", …)` credentials; the provider in `[...nextauth].ts` stamps them on `EventUsers.create`. SSO rows have no location and no invite code.
- `/api/auth/start-signup` stamps `signupSource: "signup"`.
- Legacy rows (pre-field) are classified at **query time only**, never written back: `location`/`placeId` are collected exclusively on `/jetzyqrsignup`, so their presence infers a QR signup (`isInferred: true` → "QR (inferred)" badge). Shared matcher + date/CSV helpers live in `src/lib/qrSignups.ts` (`qrSourceMatch`, `buildDateFilter`, `escapeCsv`, `escapeRegex`).
- Funnel caveat surfaced in the UI: form focus/submit stages only exist for post-journey-tracking sessions, and `submit` fires for the email `<form>` only — the Google/Apple buttons sit outside it, so social signups jump straight to "Account created".
- Welcome email (`sendWelcomeEmail` in `send-grid.ts`): CEO-approved invite-only copy; single font (`'Times New Roman', Times, Arial, serif` inlined on EVERY element — Outlook doesn't inherit); "Jetzy Select Concierge" → https://selectmember.jetzy.com/; no greeting line; no temp password (users use Forgot Password); signoff "Live the Jetzy Life! / Jetzy.com / Live like a Traveler | Travel like a Local"; order: body → closing → signoff → app-badge CTA → plain-divider safety text (yellow box removed). Store badges: `public/email/*-badge-v2.png` — trimmed artwork, identical 404×120 canvases, displayed 135×40 (old `-336x120.png` kept for already-sent emails; Gmail proxy caches by URL, so changing badge art requires NEW filenames).

## Feature: Check-in Portal
QR code + manual check-in
`CheckInPortal.tsx` (28KB) — main component
Tracks: totalTickets, checkedInCount, checkInHistory[], guests
Admin OR owner access on all check-in APIs

---

## Feature: Return to the mobile app after checkout

The Flutter app sends buyers here to pay. It opens the **system browser**
(`LaunchMode.externalApplication` in `event_native_details_screen.dart`), not an in-app webview,
so once the browser is up the app has left the foreground: there is no webview to dismiss on
success and no way for the app to observe the outcome. The only route back is a link the OS
routes to the app.

**Deep link:** `https://jetzy.com/jetzy_event?eventId=<id>&bookingRef=<ref>&status=<status>`
— registered on jetzy.com as a universal link / app link, and verified opening the app from a
WhatsApp tap. Held in `NEXT_PUBLIC_APP_RETURN_URL`; mobile owns the value, web sets the variable
(Vercel, per environment). `NEXT_PUBLIC_` is baked at build time, so **changing it needs a
redeploy**. Unset = every buyer keeps the old "Back to Event" / "Try Again" behaviour, so the
feature is inert until it is configured.

- **Use `src/lib/app-return.ts`** — `queryMarksAppOrigin`, `rememberAppOrigin`, `cameFromApp`,
  `buildAppReturnUrl`, `useAppOriginTracking`. Never re-derive inline.
- **Arrival markers:** `src=app`, `external=true` (already appended by `/login` when it forwards
  a magic-token arrival, so logged-in app buyers work with no mobile release), `app=1` (our own,
  coming back off Stripe). Tracked in `_app.tsx` because the marker is on the visit's FIRST url
  and is long gone by the time a checkout modal mounts.
- **The flag rides the Stripe redirect URL, not just sessionStorage.** `api/checkout` stamps
  `&app=1` onto `success_url` and `?app=1&eventId=` onto `cancel_url` when the client sends
  `fromApp`. `/cancel` never sees a Stripe session, so it cannot recover the event id any other
  way.
- **`ReturnToAppButton` is an anchor the visitor TAPS, never an auto-redirect.** iOS will not
  open a universal link from a JS-initiated navigation without a user gesture — it follows the
  https URL instead, and `jetzy.com/jetzy_event` answers **404 with a marketing page**. An
  auto-redirect would put a 404 in front of someone who just paid.
- **`buildAppReturnUrl` returns null without an event id** — a deep link lacking one drops the
  buyer on the app's generic feed with no sign of what they bought. Rendering the web fallback
  is better.
- The free path never leaves the origin, so it keeps `bookingRef` in component state and
  **skips its 2.5s `window.location.reload()`** for app buyers — the reload would destroy the
  return link before it could be tapped.
- Ids on `/success` come from **Stripe session metadata** (`eventId`, `bookingRef`), the only
  copy that survives the redirect intact.
- **Known gap (mobile side):** the logged-out branch opens a bare `/{eventId}` with no marker,
  indistinguishable from a Google result. Mobile should append `?src=app` to both branches.
- The app is not known to read `bookingRef` / `status` yet — they are additive, ignored until
  mobile ships support.

---

## Key Patterns

### getServerSideProps auth
```ts
const authResult = await authorizedOnly(context)
if ('redirect' in authResult) return authResult
```

### Serialize ObjectId in props
```ts
const { ownerId: _o, ...rest } = doc  // strip before spreading
```

### API ownership check
```ts
const userRole = (session.user as any)?.role
const isAdmin = userRole === "admin" || userRole === "super admin"
const userId = (session.user as any)?._id?.toString()
if (!isAdmin && event.ownerId?.toString() !== userId) {
  return sendResponse(res, null, "Forbidden.", false, ResCode.FORBIDDEN)
}
```

### Events filter (console list)
```ts
const ownerFilter = isAdmin ? {} : { ownerId: userId }
const events = await Events.find({ isDeleted: false, ...ownerFilter })
```

---

## Environment
- `NEXT_PUBLIC_EXTERNAL_API_BASE_URL` — external Jetzy API for JIT user sync
- `NEXT_PUBLIC_APP_RETURN_URL` — deep link back into the Jetzy mobile app after checkout
  (`https://jetzy.com/jetzy_event`). Unset = feature off. See "Return to the mobile app".
- Firebase client + admin config in `src/configs/firebase.ts` + `firebase-admin.ts`
- Stripe keys in env
- SendGrid API key in env
- MongoDB connection string in env

---

## Commit History (recent, as of 2026-05-04)
- `86af2a6` — draft/published event validation + redirection flow to my events
- `f2f23e8` — draft feature for event
- `5b977a7` — safari date poll issue fix
- `f23c2b0` — share feed/discussion link, QR code, jetzyqrsignup in console navbar
- `f520137` — vote bug for mobile event, strip id bug
- `606a968` — optional dates, locationDisclosedAfterBooking, datePoll, CORS fix

---

## Location disclosure, one sender name, signup invite code (2026-08-18)

**A booked guest sees the address.** `locationDisclosedAfterBooking` used to show
"Location will be disclosed after registration" to everyone permanently — including a guest who
had booked and was signed in with the same email, and including the host who typed it in.
`HostedEvents` now gates on the booking it *already* fetches for the Cancel button
(`/api/bookings/my-for-event`): a live booking or `canManage`. That endpoint already excludes
cancelled / rejected / expired bookings, so the only extra exclusion is **pending** — awaiting
approval is not being approved. Use `isPendingBooking` from `src/lib/booking-status.ts`.

The address also comes back on that response as `eventLocation` (withheld while pending), which
is what lets it appear straight after a booking made on the page rather than on the next load.

> **Still leaked, deliberately.** The real address is serialised into the page props for every
> visitor and only hidden in the UI. Closing that means masking in `[slug].tsx`
> `getServerSideProps`, which changes what other consumers receive — explicitly deferred, not
> forgotten. Don't tell a host it is hidden.

**One sender: `mailFrom()`.** `from:` was a bare address string in ~20 sends, so mail clients
displayed the mailbox name — every Jetzy email arrived from **contact**. `mailFrom()` in
`send-grid.ts` supplies name and address together, with a single `SENDER_NAME = "Jetzy"`, and is
now the only way `from` is set. The address is unchanged, so SendGrid sender verification and
domain reputation are untouched. The two **admin-inbox** alerts keep "Jetzy Security" /
"Jetzy Compliance" on purpose: those are triage labels in a shared internal mailbox.

**The ticket confirmation links back to the event** — `buildEventUrl(baseUrl, slug)`, never
interpolation.

**`/signup` accepts an optional invite code**, mirroring `/jetzyqrsignup`: `VerifyReferralCodeApi`
runs only when the field is non-empty (a blank code must never block a signup), `start-signup.ts`
stores `refCode` on the `EventUsers` record, and **`complete-signup.ts`** forwards it to
`/v1/accounts/create`. That call waits for the password step because the backend requires a
password and a verification-link signup has none until the link is followed. Best-effort with an
8s abort, 409 treated as success, failures logged and swallowed — a referral outage must never
stop someone finishing their own signup.

---

## Free months of Jetzy Premium from a code (2026-08-18)

Two different codes can now hand out free membership months. They share the mechanism — a Stripe
**trial**, never a coupon — and nothing else.

| | Where it is typed | Where the offer lives | Applies to |
|---|---|---|---|
| Invite code | `/subscribe`, `PremiumPaywallModal` | `TRIAL_CODES` in `src/lib/invite-trial.ts` (hardcoded) | A direct Premium subscription |
| Referral code | Event checkout | `referralCodes.freeMembershipMonths` (per code, host-set) | A **ticket that already sells Premium** |

**A trial, not a 100%-off coupon.** `trial_end` bills nothing until the date it names and then
charges the normal price — which is exactly "2 months free, then $20/month". A 100% coupon would
raise a $0 invoice every cycle forever, and would need product scoping to avoid discounting Full
Concierge as well.

**`trialing` already counts as an active membership everywhere** — `findActiveSubscriptionForProduct`,
`hasActiveMembershipSubscription`, the webhook, and `startMembershipSubscription`'s own activation
write all treat it as active. So a trial member gets member benefits, is skipped from being charged
the membership on their next bundled ticket, and reads as a member on selectmember.jetzy.com.

### The referral-code half

- **One number, `freeMembershipMonths` (0–12), not a tickbox plus a count.** Two fields can
  disagree — ticked with zero months, three months with the box unticked — and then the record no
  longer says what the buyer gets. Absent (every pre-existing code) means none. Host sets it when
  creating the code; the table shows it.
- **Premium only, by decision.** Full Concierge is sold on selectmember.jetzy.com's terms; we don't
  give their product away. Enforced server-side in both checkout endpoints, and the checkout modal
  only previews the offer when the selection is actually buying Premium (`chargedKeys`) — a code
  carrying months is worth nothing on a ticket that sells no membership, or to a buyer who already
  has one, and saying "2 months free" there describes a gift nobody receives.
- **`amount` is money that moved; `renewalAmount` is what it renews at.** A gifted line is charged
  $0 today, so `amount: 0` — which keeps `payment.amount`, `bookingMembershipTotal` and the
  `booking.total` reconciliation in `approve.ts` correct — while `renewalAmount` carries the price
  the receipt must state. Every receipt path (success page, ticket email, approval email) prints
  the renewal price plus "free for N months", never `$0.00/month`.
- **`recurringTotal` skips trial lines**, so `dueToday` matches what Stripe actually charges. The
  line still renders: it is a recurring charge the buyer has agreed to, and hiding it is the
  disclosure failure this whole path exists to avoid.
- **A trial line is never a Stripe line item.** `api/checkout` filters it out of `line_items` — a
  $0 line item is rejected outright — but the order stays `chargesMembership`, so it still gets a
  `customer` and `setup_future_usage: "off_session"`. Without the saved card the membership would
  have nothing to bill when the trial ends.
- **The offer is STORED on the booking, never re-resolved.** `trialMonths`, `priceId`, `interval`
  and `renewalAmount` ride on `booking.payment.memberships[]`, because `bookings/approve.ts` never
  sees the Stripe session and a code edited (or a plan price changed) while a request sits pending
  must not move the buyer onto terms they were never quoted.
- **Free path (`checkout/free-events`)**: a bundled ticket that would otherwise be rejected as
  "still owing a membership" is now allowed through when the code settles it. There is no card on
  this path, so the subscription is created without a payment method and
  `startMembershipSubscription` sets `trial_settings.end_behavior.missing_payment_method: "cancel"`
  — otherwise Stripe raises an invoice nobody can pay and the subscription sits `past_due` forever.
  A gift that expires is the honest shape of it.
- **`approve.ts` starts memberships OUTSIDE the capture branch.** It used to sit inside
  `if (needsCapture)`, which was fine while a hold was the only way a booking could owe a
  membership. A free ticket + a gifting code has no PaymentIntent at all, so those approvals would
  confirm the booking and silently drop the gift. With no hold there is also no Customer from
  Stripe, so one is resolved via `resolveStripeCustomerForUser`.
- **A gift counts as a use of the code.** Both the free path and `approve.ts` increment
  `usageCount` when membership months were granted, even against a $0 ticket where nothing was
  discounted — otherwise `maxUses` would never limit the gifts.

### Files

`src/lib/invite-trial.ts` (invite codes), `src/models/events/referral-codes.ts`
(`freeMembershipMonths`), `src/lib/referral-validation.ts`, `src/lib/membership-subscriptions.ts`
(`trialMonths`, cardless `end_behavior`), `src/lib/ticket-pricing.ts` (`RecurringCharge.trialMonths`),
`src/lib/checkout-fulfillment.ts`, `src/pages/api/checkout/index.ts`,
`src/pages/api/checkout/free-events.ts`, `src/pages/api/bookings/approve.ts`,
`src/pages/api/events/[eventId]/referral-codes/{index,[codeId],validate}.ts`,
`src/components/console/ReferralCodesManager.tsx`, `src/components/EventCheckoutModel.tsx`,
`src/pages/success.tsx`, `src/lib/send-grid.ts`.

---

## Membership follows the PERSON, not the document (2026-08-18)

**The bug:** buy Premium while signed in and the badge plus "Manage membership" appear; log out,
log back in, and they are gone. Nothing was cancelled — the membership was being read off the
wrong document.

One person can hold **two** account documents in the same database:

- `users` — created by every checkout (`createOrUpdateUser`) and by the mobile app;
- `eventusers` — created by this portal's own signup and social login.

`[...nextauth].ts` binds a session to whichever collection it finds them in first (the order
depends on the `isJetzyMember` flag on the login request, with a fallback to the other), while a
purchase attaches the membership to the account behind the **checkout email** — `subscriberId` in
`api/checkout`, which is deliberately the typed address and not the session. When those two
resolve to different documents, `/api/subscriptions/me` — which looked the user up by session id
alone — reported no membership for someone who is being billed monthly.

**Fix: `findMembershipRecord(userId, email)` in `src/lib/premium.ts`**, used by every membership
read (`subscriptions/me`, `current-plan`, `portal`, `checkout`, `invite-code`) in place of
`findUserRecord`. It resolves by identity:

1. an **active membership** on the signed-in document settles it, with no second lookup;
2. otherwise the same email, case-insensitively, in both collections (one projected `findOne`
   each — email is unique per collection);
3. a live membership is preferred over a bare billing record. A Stripe customer id alone is
   enough to open the portal (cancelled, `past_due`) but it is **not** a membership and must
   never shadow the document that holds one.

It also links the Stripe customer id onto the signed-in document when that document has none —
which is what stops the next `resolveStripeCustomerForUser` opening a **second** Stripe customer
for someone who already has one. A *different* stored id is never overwritten: it belongs to
their other subscription (same rule as `linkStripeCustomerByEmail`).

> `session.user.isPremiumSubscriber`, stamped at login in `[...nextauth].ts`, still reads only the
> login document. Nothing in the UI consumes it (the navbar and paywall use `usePremiumStatus` →
> `/api/subscriptions/me`), so it was left alone rather than given a query at every sign-in.

**The real cure is one account per person.** This resolves the symptom for reads; it does not
merge the duplicates.

## Invite-code trial now covers ANNUAL (2026-08-18)

`TRIAL_CODES["jetzy-me"]` was `intervals: ["month"]`. It is now `["month", "year"]` — a product
decision, since the earlier restriction was about disclosure, not mechanics: the same two free
months precede a **$200** charge on annual instead of $20.

So the acceptance message no longer says a bare "2 months free applied." Both doors (`/subscribe`
and `PremiumPaywallModal`) now render `trialDisclosure` from `src/lib/invite-trial.ts` against the
price of the interval **currently selected** — "2 months free, then $200/year from Oct 18, 2026.
Cancel any time." — and it is re-checked whenever the buyer flips the interval, because the answer
changes with it. `chargesFrom` comes from `/api/subscriptions/invite-code`, which already returned
it.

Nothing else changed: `subscriptions/checkout` was already passing the price's real interval to
`resolveTrialCode`, so an annual purchase with the code now resolves instead of being refused.

## The portal config env var IS the switching lock (2026-08-18)

An annual member on a trial was shown **"Update subscription"** in the billing portal. Nothing in
the code had changed — `STRIPE_PORTAL_CONFIG_ID` was simply never set in that environment, and
`billingPortal.sessions.create` without a `configuration` uses the **account default**, which has
`subscription_update` enabled. Every guard in `portal.ts` about scoping the switch to Premium is
downstream of that one variable being present.

- `portal.ts` now logs an error when it is missing, rather than degrading invisibly.
- The switch flow is **monthly → annual only**, checked server-side. `canSwitch` in
  `current-plan.ts` kept the button off an annual member's card, but a hand-made
  `flow: "switch"` request still built a year→month flow and Stripe would carry it out. Mid-term
  downgrades leave an unused credit that nothing here refunds.

Test-mode configurations: default `bpc_1U5WCiB7XccR5GE08VxzpoXf`, switch
`bpc_1U5j0eB7XccR5GE06Iv5s7as`. Live mode needs its own pair —
`npx tsx scripts/create-portal-config.ts [--switch]`, then set the variable and redeploy (a
server env var only reaches a build made after it was added).

## Membership emails: welcome and plan change (2026-08-18)

Two gaps in the lifecycle: buying Jetzy Premium from **"Buy Jetzy Premium"** sent nothing at all
(the first invoice is deliberately skipped in `invoice.paid`, which only emails on
`subscription_cycle`), and a **monthly → annual switch** sent nothing either — that happens inside
Stripe's portal, so the member had only their card statement to tell them what they now pay.

`sendMembershipStarted` and `sendMembershipPlanChanged` in `send-grid.ts`, both fired from
`webhooks/stripe.ts`, both best-effort.

**Welcome — `checkout.session.completed`, gated on `metadata.purpose === "premium_subscription"`.**
That marker is stamped by `/api/subscriptions/checkout`. Any other subscription Checkout Session
on this Stripe account belongs to selectmember.jetzy.com, which sends its own confirmation. A
membership sold WITH A TICKET never reaches this branch — `mode: "payment"`, subscription created
afterwards by `startMembershipSubscription`, recurring terms already on the ticket receipt.

Trial-aware: with an invite code the copy reads "free until 18 October 2026, then $200/year",
because nothing has been charged yet and the date the first payment lands is the whole point.

**Plan change — `customer.subscription.updated`, detected from `previous_attributes.items`.** The
interval is deliberately not stored (a stored copy goes stale the moment someone switches in the
portal), so there is nothing local to compare against. Stripe includes `items` in
`previous_attributes` only when the items actually changed, so a trial converting or a card being
replaced doesn't fire it. The previous price is retrieved so the message can name both rates —
stating only the new one reads like a price rise nobody announced.

## Deleting a referral code now frees its string (2026-08-18)

Delete a code, create it again, and the form said **"Referral code already exists"** with an empty
table behind it. `code` carries a plain `unique: true` index with no partial filter while delete is
a soft delete (`isDeleted: true`), so the removed row still owned the string and the insert hit a
duplicate-key error that was being reported as a duplicate code.

`POST /api/events/[eventId]/referral-codes` now revives the soft-deleted row instead of inserting
beside it — reassigning `eventId` (the string is unique across events, so the host asking for it
now is the one who gets it) and restarting `usageCount` at 0, since this is a new offer with its
own `maxUses`. Past redemptions are unaffected: the stats endpoint counts them from bookings,
which store the code string.

A partial index would be the other fix and is deliberately not taken — the mobile app and admin
portal share this collection, and `syncIndexes` on it is already forbidden elsewhere in this
codebase for the same reason.

**Editing.** `ReferralCodesManager` now opens the same modal prefilled, saving through the
existing PATCH: discount, free Premium months, max uses, active. The **code text itself is
read-only** — bookings record the string rather than the id, so renaming one would orphan every
redemption already attributed to it.

## Referral and membership reporting (2026-08-18)

Two questions that had no answer: *how many people came in on which referral code*, and *who
bought Jetzy Premium — and which of them used an invite code*.

### `/console/analytics/growth` (admin)

One page, two tabs, linked from the analytics header. Both tabs export CSV across the whole
filtered set rather than the page being displayed, matching the QR signup export.

### Referral codes — read from bookings

`GET /api/analytics/referrals`. Every booking stores the code string it was bought with, which is
why the report reads bookings rather than `usageCount` on the code: that counter restarts when a
host deletes and recreates a code, and it says nothing about who, when, or for how much.

- Grouped by **code + eventId**. A code string is globally unique but can be reassigned to another
  event when it is revived, and folding those together credits one event with another's sales.
- Buyers are counted as **unique lowercased emails**, not bookings — one person booking twice is
  one person.
- Cancelled / rejected / failed / expired are excluded by default (`includeCancelled=true` keeps
  them). Classified by exclusion, since `status` is not a closed set.
- `code=ABC` returns the individual bookings behind one code — the list to hand over when someone
  asks who a campaign actually brought in.
- Admin sees every event; an owner's queries are constrained to their own `ownerId` events before
  anything else runs.

### Membership sales — a new collection

`membership_purchases` (`src/models/events/membership-purchases.ts`), one row per sale, written at
the moment the subscription is created and never updated. Current state stays on the user
document; this is the sale as it happened.

`source` is the field the whole report turns on:

| | |
|---|---|
| `subscribe` | bought deliberately at `/subscribe` or the paywall |
| `ticket` | came with an event ticket, first period paid |
| `gift` | came with a ticket, first months given away by a referral code |
| `external` | a subscription on this Stripe account this app didn't sell (selectmember.jetzy.com) |

Writes **upsert on `stripeSubscriptionId`**, so a redelivered webhook updates one row instead of
inflating the count, and use `$setOnInsert` for the codes and source — the first write is the one
that saw the checkout, and a later replay carrying less context must not blank it.

**The invite code is finally recorded.** It was previously applied to Stripe's `trial_end` and
then forgotten, so "how did that campaign do" was unanswerable. `subscriptions/checkout.ts` now
stamps the resolved code into the Checkout Session metadata and the webhook reads it back.

`GET /api/analytics/memberships` is **admin only** — a list of paying customers with their email
addresses. Filters: membership, source, has/hasn't an invite code, free-text, date range.

**No backfill.** Sales predating the collection are absent, and the empty state says why: Stripe
holds no record of our events or codes, so anything reconstructed would be invented.

## Referral report, per event (2026-08-19)

The referral report is now a shared component, `src/components/analytics/ReferralPerformance.tsx`,
rendered in two places:

- `/console/analytics/growth` — every event (admin);
- the event manage page, **Referral Codes** tab, behind the **Analytics** action on each row —
  that one code, for the host who owns the event.

The per-event report is deliberately NOT rendered under the codes table. That tab exists to manage
codes; a permanent report below them pushed the create/edit/delete work off the screen. The `code`
prop filters the same summary the platform page reads rather than re-deriving totals from the
bookings, so the two views can't disagree about one code.

One component on purpose. A host looking at their event and an admin looking at everything are
asking the same question, and two implementations would eventually disagree about it. Scope comes
from the `eventId` prop; `/api/analytics/referrals` independently constrains a non-admin to their
own `ownerId` events, so the embed cannot be widened by passing someone else's id.

**"All buyers"** (`detail=bookings`, no `code`) lists everyone across every code in scope with a
Code column — a host wants that before they want any single code's list. The per-code **Buyers**
button is unchanged. Both export CSV over the full filtered set.

## The invite-code field moved up the Premium card (2026-08-19)

It was below the benefit list, in the same grey as the rest of the form, so buyers holding a code
scrolled past it and paid full price. It now sits directly under the price — above the benefits —
in a yellow-tinted box (`rgba(245,197,24,0.10)` on a `0.45` border), the same accent every other
membership disclosure on the site uses.

Both surfaces that render `PlanComparison` — `/subscribe` and `PremiumPaywallModal` — pick this up,
which is the point of them sharing the card.

## Free Premium from an invite code at signup (2026-08-19)

`jetzy-me` typed into the invite field on `/signup` or `/jetzyqrsignup` now grants **2 months of
Jetzy Premium**, with **no card collected** — a CEO decision, built on the same trial mechanism as
the referral-code gift on tickets.

`grantSignupTrial` (`src/lib/signup-trial.ts`) creates the subscription with no payment method, so
`trial_settings.end_behavior.missing_payment_method: "cancel"` ends it when the months run out.
A gift that expires, not a subscription that quietly starts billing someone who never entered a
card. That is also why nothing here discloses a recurring charge: there isn't one until they
choose to add a card.

**Where it is granted, and why there:**

| Route | Granted at | Why |
|---|---|---|
| `/signup` | `api/auth/complete-signup` | The link has been followed and a password set — the address is proven |
| `/jetzyqrsignup` | `api/create.ts` | The generated password only ever reaches them by email |

**One per address, ever.** Checked against `membership_purchases` for that email AND against
Stripe's own history for the customer (`hasEverHadMembership`) — our collection only covers sales
made since it existed. No global cap, by decision; the code can be withdrawn from `TRIAL_CODES`.

**A trial code is not a referral code.** Both forms previously verified every code against
`VerifyReferralCodeApi` and *blocked the signup* when it failed, which would have rejected
`jetzy-me` outright — it credits no referrer and the backend has never heard of it. The forms now
skip that check for trial codes, and the servers skip the `/v1/accounts/create` referral call.

**Keep the pure/server split.** `isSignupTrialCode` and `signupTrialOffer` live in
`invite-trial.ts`; `signup-trial.ts` reaches SendGrid, Stripe and Mongo through dynamic imports,
and webpack follows those into the client bundle — importing it from a page fails the build with
`Can't resolve 'fs'`.

**The offer is stated three times, always as waiting rather than granted:** a green line under the
code field, the `/post-signup` panel (carried as `?trial=N` so a refresh doesn't drop it), and the
verification email (its subject and a gold box). The membership doesn't exist until the link is
followed, so anything else would be untrue for as long as the email sits unopened.

The welcome email that follows uses `sendMembershipStarted({ endsWithoutCard: true })` — "free
until 19 October, then it ends unless you add a card", never "renews until you cancel".

Reported as `source: "signup"` in `membership_purchases`, shown on `/console/analytics/growth` as
**Invite code at signup**, separated from ticket gifts in the "Given free months" card.

## Who signed up with an invite code (2026-08-19)

`GET /api/analytics/signup-trials`, plus a **Signup invite codes** tab on
`/console/analytics/growth`. Admin only — it lists people by email.

It reads `EventUsers.refCode`, the signup side, and joins the membership onto it. Reading
`membership_purchases` alone would have been wrong: that collection records the moment a
membership is *created*, which for a signup code is after the verification link is followed.
Someone who typed the code and never opened their email has no row there at all — and they are
precisely who a campaign report has to surface. The join is by **email**, because a person can
hold an account document in either collection.

Four numbers, all computed across the whole filtered set rather than the visible page:

| | |
|---|---|
| Typed a code | signups carrying a `TRIAL_CODES` code |
| Verified their email | followed the link (or came via QR, which creates a usable account outright) |
| Membership granted | free months actually created |
| Not redeemed | typed it, never finished — the list worth chasing |

Only codes present in `TRIAL_CODES` are matched. The same `refCode` field also holds ordinary
backend referral codes, which credit a referrer and grant nothing.

`emailVerified` is written only by the link flow, so `/jetzyqrsignup` rows are treated as verified
rather than reported as dead leads — that route emails the generated password, so an address the
person doesn't control gets them nothing anyway.

## "Referral code already exists" against an empty table (2026-08-19)

Two distinct causes, one useless message, and the second only showed up on production data.

1. **Codes are unique across events.** `code` carries a plain `unique: true` index, so a live
   `JETZY-ME` on another event blocks creation here — and that code is invisible from this
   event's table, which is why the screen looked empty. The message now names the event holding
   it, or says "on this event" when it really is a local duplicate.
2. **Rows with no `isDeleted` field at all.** The mobile app and the admin portal write to this
   shared collection without it, so `findOne({ code, isDeleted: false })` missed them, the revive
   query (`isDeleted: true`) missed them too, and the insert fell through to a duplicate-key
   error reported as a duplicate code.

The create route now does ONE lookup by code alone and decides from the row: anything not
explicitly `isDeleted: true` is live (rejected, with the owning event named), a deleted row is
revived, nothing found means create.

> Making codes unique per event instead would mean dropping `code_1` and building a compound
> unique index on a collection the mobile app and admin portal share. Not taken — deliberately.

## Referral codes are unique per EVENT (2026-08-19)

`code` carried a plain `unique: true`, so one event holding `JETZY-ME` blocked every other event
from using the string — invisibly, since a host only sees their own event's codes. A code has
never meant anything without the event it discounts (`validateReferralCodeForEvent` has always
resolved the pair), so uniqueness moved to the pair and one campaign string can now run across
many events, each with its own terms, counter and limit.

**`scripts/migrate-referral-code-index.ts` — run once per database.** Reports any duplicate
`(eventId, code)` and refuses rather than half-migrating, creates `{ eventId: 1, code: 1 }` unique,
*then* drops `code_1`. That order is deliberate: the collection is never left without a uniqueness
guarantee. `--dry-run` first. Already run on `test-v2`; **live still needs it**, and until it runs
there creation keeps failing with a duplicate-key error.

**Every lookup by code string alone became a bug the moment duplicates were possible.** Fixed:
`incrementReferralUsage(code, eventId)` in `checkout-fulfillment.ts` and the counter in
`approve.ts` — an unscoped lookup burns another host's `maxUses` and misreports their campaign.
The one-off scripts in `src/scripts/` still match by code alone; scope them before reuse.

> **Unverified:** whether the mobile app or the admin portal resolves a referral code without an
> `eventId`. Both write to this collection. If either does, it will now pick an arbitrary event's
> row — worth confirming with those teams.

The env loader shared by the older `src/scripts/*` files is broken on Windows: it splits on `
`
and its `^([^=]+)=(.*)$` never matches a CRLF line, so every variable reads as unset. New scripts
use `dotenv`.

## A plan switch must not end a trial (2026-08-19)

Stripe's billing portal defaults `subscription_update.trial_update_behavior` to **`end_trial`**.
Harmless while nothing was ever on trial; not harmless now. An invite code grants two free months,
and "Switch to annual" sits on the same plan card — so a member two weeks into a gift who moved to
annual would have the trial ended and be invoiced $200 immediately, having been told in writing
they were free until a named date.

`scripts/create-portal-config.ts --switch` now sets `trial_update_behavior: "continue_trial"`, and
prints it back: unlike `products`, the API echoes this field, so it is verifiable rather than
assumed. Done in both environments — test `bpc_1U5j0e…` and live `bpc_1U5sbo…`, each confirmed by
retrieving the configuration afterwards and reading `trial_update_behavior`.

The default (non-switch) configuration disables `subscription_update` entirely, so the setting
doesn't apply there. But the failure chain is worth stating plainly: if `STRIPE_PORTAL_CONFIG_ID`
or `STRIPE_PORTAL_SWITCH_CONFIG_ID` is missing in an environment, Stripe falls back to the
**account default**, which has plan switching enabled *and* `end_trial`. Two unset variables is all
it takes to bill a trial member.

Raised by selectmember.jetzy.com, who found the same default on their own Premium configuration.
They also confirmed their side treats `trialing` as a member throughout — every lookup filters
`["active","trialing","past_due","unpaid"]`, the pre-checkout dedupe uses that same lookup so a
trial member can't have a second subscription created, and their confirmation copy now reads
"free trial until <date>" rather than implying a charge.

**One divergence their reply surfaced, now closed:** their lookup filtered four states, ours three
— we were missing `unpaid`. That is where Stripe parks a subscription once dunning retries are
exhausted. The member has lost their benefits either way (the `active` flag is written from
`active|trialing` alone), but the subscription still exists, and
`findActiveSubscriptionForProduct` is what stops a second one being created on the same customer.
A lapsed member buying a bundled ticket would have been subscribed twice over. `unpaid` is now in
`ACTIVE_SUBSCRIPTION_STATUSES`.

## Two apps, one Stripe account, four portal configurations (2026-08-19)

selectmemberjetzy ran their own reconcile against the live account and reported the trial issue
closed. It is closed **for their configurations**, not ours:

| id | owner | plan switching | trial on switch |
|---|---|---|---|
| `bpc_1U5sc4…` | ours — `STRIPE_PORTAL_CONFIG_ID` | off | n/a |
| `bpc_1U5sbo…` | ours — `STRIPE_PORTAL_SWITCH_CONFIG_ID` | on (Premium-scoped) | `continue_trial` ✓ |
| `bpc_1U43Bh…` | theirs (`jetzy_role=select`) | off | `end_trial` (never applies) |
| `bpc_1U43Gb…` | theirs (`jetzy_role=premium`) | on | `continue_trial` |
| `bpc_1Lu1FD…` | account default, shared | on | `end_trial` |

Both apps sell Jetzy Premium through one Stripe account, so both maintain portal configurations
against the same product. Theirs are the ones their script reconciles; ours are the ones
`api/subscriptions/portal.ts` opens by id. A fix applied to one pair says nothing about the other,
and their note that "live is now continue_trial" is true only of `bpc_1U43Gb…`.

Their run also used **our** live secret key (`sk_live_…waeX` belongs to events.jetzy.com; theirs
ends `…10nb`). They changed only configurations they own and left the account default untouched,
so nothing of ours was altered — but a full-access live key that can charge and refund has now
been used by another team's tooling, and rotating it is ours to schedule, not theirs.

Their reconcile also confirms the legacy live **$10/month** Premium price (`price_1TzNi9…`) is
still active and is correctly left out of the switch scope, since Stripe offers one price per
interval. It should be archived.


## Preview as a guest (2026-08-24)

**The problem.** A host built an event in a form and never saw the result. Worse, opening
their own event link did not show it either: `HostedEvents` unlocks a dozen blocks behind
`canManage` (Quick Actions, the bookings / waiting-list / approvals tabs, the guest list,
the post-event album controls, Manage Event), and `canSeeLocation` hands the host the real
address even on an event set to disclose it only after booking. So the one person who has
to check the page before mailing it to a few hundred guests was the only person who could
not see what those guests would get. Luma and Partiful both make this the centrepiece of
their create flow; this is the same idea.

- **Use `src/lib/event-preview.ts`** — `PREVIEW_PARAM`, `isPreviewQuery`, `previewPath`,
  `previewUrl`, `exitPreviewPath`. Never re-derive the parameter name inline.
- **The preview renders the REAL page, never a mock-up.** `?preview=1` on the ordinary event
  url; all it does is suppress the viewer's own privileges. A separate preview renderer
  would drift from the live page, which is the exact failure the shared `EventListingCard`
  was extracted to stop.
- **Suppression happens ONCE, at the source.** In `HostedEvents.tsx` the two role flags
  (`hasAdminRole`, `ownsEvent`) are ANDed with `!previewAsGuest` before `isAdmin` / `isOwner`
  / `canManage` are derived, so every downstream block follows automatically. Don't add
  `&& !preview` at individual call sites — the next `canManage` block added will forget it.
- **`canManageForReal` stays unsuppressed** and gates only `PreviewBanner`. For a visitor
  with no privileges the parameter changes nothing, so announcing a "preview" of the page
  they are already seeing normally would be a false claim.
- **Preview does NOT count as a view.** `[slug].tsx` skips both `trackEventInteraction(…,
  "view")` and the legacy `/api/analytics/track` call when the flag is set — a host checking
  their own page must not inflate the number they are checking. It also means `?ref=` is not
  stashed to sessionStorage during a preview. The route-level pageview in `AnalyticsContext`
  is untouched: previews open in a NEW TAB, and an initial load records the `/[slug]`
  pattern rather than this event's path.
- **A pending-approval event can be previewed by its owner.** `[slug].tsx` already exempts
  owner/admin from the "not yet approved" bounce, and an event awaiting review is exactly
  the one still worth checking. The Preview button appears on both branches of the
  post-creation modal for that reason.
- **Manage's Preview opens the LAST SAVED version.** Autosave on a published event writes a
  shadow draft (`event.draftRevision`) and leaves the live record alone, so unsaved edits are
  deliberately not in the preview. The tooltip says so when the form is dirty rather than the
  button quietly showing stale content.
- **Checkout still works inside a preview** — a host can put a real booking through. Left
  functional on purpose: blocking RSVP would make the preview lie about the single most
  important button on the page.

### Listing card preview

- **`src/components/events/ListingCardPreview.tsx`** — "In the events list", in the sidebar
  of BOTH the create and manage forms, under Event Media. Lives inside `<Formik>` and reads
  `useFormikContext`, same pattern as `AutosaveManager`, so the parent doesn't re-render per
  keystroke.
- It renders the real `EventListingCard` with the new **`previewAsGuest`** prop (no Manage
  button, no ticket counts, no PRIVATE badge, not clickable, no `/totals` fetch). Banners
  have no enforced upload aspect ratio and cards letterbox on black with `objectFit:
  contain`, so a portrait poster looks nothing in a listing like it does in the upload box.
- **`startsOn` is computed exactly as `api/events/create.ts` computes it** — time optional
  and defaulting to midnight, an active date poll replacing fixed dates altogether. A preview
  that dated the event differently from the saved record would be worse than no preview.

Files: `src/lib/event-preview.ts`, `src/components/events/PreviewBanner.tsx`,
`src/components/events/ListingCardPreview.tsx`, `src/components/HostedEvents.tsx`,
`src/components/events/EventListingCard.tsx`, `src/pages/[slug].tsx`,
`src/pages/console/events/create.tsx`, `src/pages/console/events/[eventId]/manage.tsx`.

## Hosts can create interests (2026-08-25)

`InterestsSelector` was read-only: a host whose event didn't fit any existing interest had no
way to tag it. It can now create both a main category and a sub-interest inline, via the two
Jetzy backend endpoints the mobile app already uses.

**This taxonomy is SHARED WITH THE MOBILE APP.** Anything created here appears in the app's
interest list for every user. There is no delete or rename from this UI.

- **Use `src/lib/jetzy-interests.ts`** — `interestsApiBase`, `normalizeInterestName`,
  `findDuplicateCategory`, `findDuplicateSub`, `fetchInterestCategories`, `createInterest`.
  Never call the backend or re-derive the base inline.
- **`api/interests/index.ts` no longer hardcodes `prod-api.jetzy.com`.** It resolved the read
  to prod while `NEXT_PUBLIC_EXTERNAL_API_BASE_URL` (which issues the very `accessToken` the
  call authenticates with, see `api/auth/[...nextauth].ts`) points at test. The two
  environments hold **different taxonomies** — prod leads with `travel`, test with
  `agentic ai` — so writing to one while reading the other would mean a created interest
  never appears: a silent failure that reads as a broken button.
  - Consequence: on staging/local the picker now shows test's taxonomy. Events tagged with
    prod sub-ids are **not** damaged — `InterestsSelector` only adds and removes on click and
    never prunes ids it cannot render, so `values.interests` survives a save untouched.
- **A 2xx from the create endpoints DOES NOT MEAN CREATED.** Both answer `201 "created
  successfully"` unconditionally and put already-existing names in `data.skipped[]`.
  `createInterest` returns `alreadyExisted` for exactly this; treating `res.ok` as an insert
  would report a creation that never happened. Verified live against test.
- **A created sub carries `_id`; the read endpoint returns the same thing as `id`.** So the
  UI **re-reads the taxonomy after a create and matches by normalised NAME** rather than
  threading an id through from the create response.
- **Names are normalised to lowercase** (`normalizeInterestName`) — the stored taxonomy is
  lowercase and the UI capitalises with CSS, so "Mobiles" would sit next to "mobiles" as a
  visually identical second entry.
- **Duplicates are rejected 409 with the existing name in the message**, so the host picks the
  one that is there instead of inventing a near-twin. Sub duplicates are scoped to the parent
  — "apple" under both "mobiles" and "food" is legitimate.
- **Both routes share ONE rate-limit bucket** (`interest-create:<ip>`, 10 per 10 min, via the
  existing `src/lib/rate-limit.ts`). Same taxonomy, same person; a per-route allowance would
  just double the total.
- **Permission: any authenticated host or admin**, by decision. The backend accepts a
  `role: "user"` token (verified), and a host who can't add the interest their event is about
  cannot tag it at all.
- **The create UI lives in the shared `InterestsSelector`**, so `create.tsx` and `manage.tsx`
  both get it with no change to either. It renders inside `<Formik>`: every control is
  `type="button"` and the inline input swallows Enter, or confirming an interest name would
  submit the whole event form.
- After creating a main category the UI expands it and opens the sub input — an event is
  tagged with sub-interests, never a bare category, so a new category alone is unusable.

Files: `src/lib/jetzy-interests.ts`, `src/pages/api/interests/{index,categories,sub-categories}.ts`,
`src/components/events/InterestsSelector.tsx`.

## `/premium`: the page we can email (2026-08-25)

`/subscribe` belongs to the mobile app. It bounces an unauthenticated visitor to `/login` on mount,
auto-logs in from a magic token, and sends every exit path to `jetzy.com/jetzy_event`. Emailing that
link to someone who has never signed in shows them a login form instead of an offer, which is
exactly what the CEO didn't want — so `/premium` is a second door, and `/subscribe` was not touched.

**Public.** `getServerSideProps` returns `{ props: {} }` with no guard and no redirect. The plan card
renders for a signed-out visitor because `/api/subscriptions/plan` takes no session, and
`PlanComparison` is entirely prop-driven.

**The offer line has two sources, and the difference matters.**

| | Source | Why |
|---|---|---|
| Logged out | `resolveTrialCode` + `trialDisclosure` in the browser | Pure, isomorphic, same table the server enforces — so the visitor sees what a code is worth without being asked who they are |
| Logged in | `POST /api/subscriptions/invite-code` | Only the server can apply the first-timer rule |

The logged-out line is a preview of the OFFER, not a promise about the account. That distinction is
the whole design problem: we show "2 months free" before we can possibly know whether this person
has had Premium before.

**Carrying intent through login.** "Go Premium" while signed out pushes
`/login?_cb=/premium?code=…&interval=…&go=1`. `_cb` already survives login, the signup form, and the
email-verification round trip, so a brand-new account still lands back with the code intact. On
return, `go=1` re-checks the code and opens Checkout without a second click.

**A refused code stops everything.** If the account isn't eligible, we do not fall through to a
full-price session: the reason is shown on the field, `go` is stripped from the URL so a refresh
can't retry it, and buying without the code requires pressing a separate button. Being one silent
click from paying $20/month for something you were shown as free is the failure this guards.

**Two mechanical traps.** `returnTo` must stay a bare path, because `checkout.ts` builds
`${baseUrl}${returnTo}?premium_session_id=…` and a query string there produces a second `?`; the
code therefore crosses the Stripe round trip in `sessionStorage`. And everything read from the URL
is attacker-craftable — `code` goes through `normalizeTrialCode`, `interval` is accepted only as
exactly `month` or `year`, and `_cb` is always built by us, never read from a param.

**No new endpoint, no signed token.** A campaign code is not a secret, and a token would add a
signing surface without changing what is enforced: eligibility is decided at `invite-code` and again
at `checkout`, server-side, both times.

`"premium"` is now in `RESERVED_SLUGS` — a real page at a top-level path beats `/[slug].tsx`, so an
event holding that slug would be permanently unreachable with nothing on the host's screen to
explain it. `subscribe`, `manage-membership` and `my-bookings` had the same gap and were added too.

