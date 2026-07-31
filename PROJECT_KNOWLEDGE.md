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
Fields: bookingRef (unique), eventId, tickets[], status (pending/approved/confirmed/cancelled/failed/refunded), customerName, customerEmail, customerPhone, subTotal, tax, total, referralCode, discountAmount, customAnswers[]

### `src/models/events/referral-codes.ts` — IReferralCode
Fields: eventId, code (unique, uppercase), discountPercentage (0-100), commissionPercentage (0-100), isActive, usageCount, maxUses, createdBy, isDeleted

### `src/models/events/blast.ts` — IBlast
Blast email history (Luma-style Blasts tab). Fields: eventId, subject, message, targetType (all/bookings/invitations), status, emailType (custom/availability), recipientCount, succeededCount, failedCount, sentBy, sentAt, isDeleted. Created automatically by `/api/send-blast` after a successful send.

### `src/models/events/albums.ts` — IEventAlbum
Fields: eventId, title, description, media[] (`{url, type:'image'|'video'}`), createdBy, isDeleted. Collection `event-albums`. Multiple named albums per event.

### `src/models/events/album-access.ts` — IAlbumAccess
Fields: eventId, albumId, userId (optional), viewerEmail, viewerName, action (`'login'|'signup'`). Collection `event-album-access`. **Unique index `{albumId,viewerEmail}`** — one row per (album,person); doubles as the notify-email dedupe guard AND the album-analytics source. Email is the key because a session `_id` can come from `event-users` while the guest gate maps to `users`. Old `{albumId,userId}` index must be dropped — see `scripts/migrate-album-access-index.ts`.

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
| POST | `/api/events/[eventId]/albums/guest-access` | public — `{name,email}`, matches or auto-creates account, sets `album_guest` cookie |
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

### Waiting List
`/api/waiting-list/[eventId]`, `/api/waiting-list/add`, `/api/waiting-list/approve`, `/api/waiting-list/remove`

### Bookings
`/api/bookings/cancel`, `/api/bookings/delete`
`/api/bookings/approve`, `/api/bookings/reject` — Require-Approval flow (admin OR event owner; keyed by `{ bookingRef }`). Approve → PENDING→CONFIRMED, consumes capacity, QR + `sendTicketConfirmation` to attendee, `sendAdminApprovalNotice(kind:"approved")` to contact@. Reject → PENDING→REJECTED, no email.

### Require Approval (free/RSVP events only)
- Toggle in event form is **disabled when any ticket price > 0** (free events only). Enforced client-side (create.tsx/manage.tsx switch) AND server-side (`create.ts`/`update.ts` force `requireApproval=false` if a paid ticket exists).
- On free checkout ([checkout/free-events.ts](src/pages/api/checkout/free-events.ts)) when `event.requireApproval`: booking created `status=PENDING` (capacity NOT consumed, no QR/confirmation); `sendApprovalPending` → attendee, `sendAdminApprovalNotice(kind:"request")` → contact@ (`SENDGRID_EMAIL_SENDER`, links to `…/manage?tab=approvals`). Returns `{ pendingApproval:true }`; `EventCheckoutModel.tsx` shows a "Request Submitted" panel AND an amber "Approval Required" banner in the details step when `liveEventData.requireApproval`.
- `BookingStatus` gained `REJECTED`. `isCancelledBooking` (in [src/lib/booking-status.ts](src/lib/booking-status.ts)) now treats CANCELLED+REJECTED as inactive; new `isPendingBooking` helper. Pending/rejected excluded from check-in ([validate.ts](src/pages/api/check-in/validate.ts), [record.ts](src/pages/api/check-in/record.ts)); stats.ts already CONFIRMED-only.
- Emails ([send-grid.ts](src/lib/send-grid.ts)): `sendApprovalPending` (attendee, pending), `sendAdminApprovalNotice(kind)` (contact@, request/approved), `sendApprovalConfirmed` (attendee, celebratory "you've got a spot 🎉" with date/time + **location** + QR — used on approve instead of `sendTicketConfirmation`), `sendApprovalRejected` (attendee, polite decline — sent on reject).
- **Approvals UI** is a shared component `src/components/console/ApprovalRequests.tsx` (lists PENDING via `/api/get-bookings`, Approve button + Reject with a Chakra `AlertDialog`). Used in BOTH the Manage page **Approvals** tab and the public event-detail admin section ([HostedEvents.tsx](src/components/HostedEvents.tsx), `activeTab==="approvals"`), each rendered only when `event.requireApproval`.
- Manage `getServerSideProps` passes `isAuthorized` (admin OR event owner); the Approvals tab shows a "sign in as admin/host" message when false. `?tab=approvals` query deep-links to the Approvals tab (tabIndex 6). Guests & Bookings tables show Pending Approval (yellow) / Rejected (red) badges.
- Location safety: pending email never contains location; only the approval-confirmed email reveals it (always, regardless of `locationDisclosedAfterBooking`). Public page never shows a hidden location on-page.

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
| Cancel booking | `src/pages/cancel-booking.tsx` | |
| Terms | `src/pages/terms.tsx` | |

### Social Share Meta (event links)

- All OG/Twitter tags for a shared event link live in the `<Head>` of `src/pages/[slug].tsx`. `Layout.tsx` / `EnhancedLayout.tsx` hold generic site-level tags and are **not** used by this page.
- `event.desc` is **Quill rich-text HTML**. Never put it in a `<meta>` raw — Apple/iMessage renders `og:description` literally and the card shows `<p><br></p>…`. Always run it through `toMetaDescription()` (`src/utils/text.ts`), which inserts spaces at block boundaries, strips tags, decodes entities, collapses whitespace and truncates to 200 chars on a word boundary.
- `og:image` is always emitted: `images[0]` normalized to absolute, falling back to `${NEXT_PUBLIC_URL}/imgs/logo.png` when the event has no images. `og:url` uses `slug || _id`. `og:type` is `website` (`event` is not a valid OG type).
- Previews are cached per-URL by iMessage/Facebook — re-scrape via the Facebook Sharing Debugger or test with a `?v=2` suffix before assuming a fix did not land.

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
- **View gate (no login required):** a logged-in user is never prompted; everyone else fills an inline **name + email** form ([album-auth.ts](src/lib/album-auth.ts) + `guest-access` API). Existing email → matched to that account; unknown email → account auto-created silently via `createOrUpdateUser` (same helper as ticket checkout). Identity is kept in a signed HttpOnly `album_guest` cookie (90 days). Deliberately low friction — the old `/login` redirect was losing people.
- **Tagging:** any viewer can tag people in a photo; the tagged person gets an email. Hosts get an **`@`-mention** search over registered attendees (suggestions are host-only so the attendee email list doesn't leak to link recipients); everyone else types name + email. People are **staged locally and only sent after an explicit confirm dialog** — nothing is emailed on a misclick — and several can be tagged in one pass. **No duplicate restriction:** the same person can be tagged again on the same photo (and is re-emailed); nobody is hidden from the `@` dropdown. `PhotoTagging` is keyed by photo URL so staged tags reset when you swipe.
- **Auto-login:** entering name + email signs the visitor in for real **only when the account is brand new** (`guest-access` returns a `magicToken` → `signIn("credentials", …)`). Emails that already belong to someone get album access via the cookie but **no session**, so a share link can't be used to take over a known account.
- **Publish:** albums are visible immediately; the Publish button emails all attendees (`getEventParticipants`) that the photos are up. Re-sending requires explicit confirmation (`resend:true`).
- **Share deep-link:** `/{slug}?album={albumId}`. Logged-out recipient is bounced to login; after auth returns, that album auto-opens AND `POST …/access` fires once (sessionStorage guard `album_access_<id>` + server unique-index dedupe).
- **Notify email:** `sendAlbumAccessNotice` ([send-grid.ts](src/lib/send-grid.ts)) → `SENDGRID_EMAIL_SENDER` inbox, first time each user opens each shared album. login-vs-signup derived from account age (<10 min = signup).
- **Analytics:** `/api/analytics/events` returns an `albums` block (albumCount, totalAccesses, uniqueViewers, logins, signups, perAlbum[]). Surfaced in [analytics.tsx](src/pages/console/events/[eventId]/analytics.tsx) as a dedicated **"Albums" tab** (4th tab): summary cards + Top Albums table + per-viewer **Access Log** (name/email/login-vs-signup/date from `GET …/albums/access-log`) + **Export CSV** (summary + per-album + full access log). Admin-only page.
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
