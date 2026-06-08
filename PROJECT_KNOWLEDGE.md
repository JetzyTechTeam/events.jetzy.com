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

**Perf pattern:** `overview.ts`, `visitors.ts`, `top-users.ts`, `top-events.ts` run all independent DB queries in one `Promise.all` (not sequentially). Earlier sequential version stalled the dashboard for 30+ seconds on Atlas. Also: prefer `countDocuments` over `.distinct()` for unique counts; for distinct counts use `aggregate([{$group:{_id:"$field"}},{$count:"count"}])` (avoids loading all IDs into Node memory). Connection pool `maxPoolSize: 10` + `bufferCommands: false` (see `src/configs/database.ts`).

### Auth
`/api/auth/[...nextauth]`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/send-login-otp`, `/api/auth/verify-login-otp`, `/api/auth/verify/send-code`, `/api/auth/verify/confirm-code`, `/api/auth/report-abuse`

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
`/api/bookings/cancel`

### Discussions/Comments
`/api/events/discussions/create|get|list|update|delete|react|report|who-reacted|who-viewed`
`/api/events/discussions/comments/create|get|delete|reply|react|report|who-reacted`
`/api/events/comments/create|get|edit|delete|reply`

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

---

## Public Pages

| Page | File | Notes |
|------|------|-------|
| Home / event listing | `src/pages/index.tsx` | users land here after login |
| Event detail | `src/pages/[slug].tsx` | public |
| Login | `src/pages/login.tsx` | |
| Signup | `src/pages/signup.tsx` | |
| QR signup | `src/pages/jetzyqrsignup.tsx` | |
| Success | `src/pages/success.tsx` | |
| Cancel booking | `src/pages/cancel-booking.tsx` | |
| Terms | `src/pages/terms.tsx` | |

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

## Feature: Draft Events
`status` field on IEvent: `draft` | `published`
Draft events filtered from public `/api/events` listing
Validation/redirection flow: draft→published handled on My Events page
Commit: 86af2a6, f2f23e8

## Feature: Location Disclosure
`locationDisclosedAfterBooking` boolean on IEvent
Location hidden until booking confirmed when true
Commit: 606a968

## Feature: Referral Codes
Full CRUD: `/api/events/[eventId]/referral-codes`
Admin OR owner access
Tracks discountPercentage, commissionPercentage, usageCount, maxUses
Stats endpoint available

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
