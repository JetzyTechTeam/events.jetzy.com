# Event Albums — Backend / Mobile Parity Spec

Photo & video **albums** on events. The web portal (events-jetzy-com) implementation is live and is the reference; this document is the full contract so the mobile app can implement the same feature against the **same MongoDB and the same collections**. Nothing here is web-specific unless marked.

Everything a mobile client needs is in this doc: data model, viewer identity, every endpoint with request/response shapes, the four user flows end-to-end, emails, analytics, migrations, and an implementation checklist.

---

## 1. Feature summary

| Capability | Who can do it |
|---|---|
| Create / edit / delete an album | event **admin** or **owner** |
| Publish an album (emails all attendees) | event **admin** or **owner** |
| View an album | **any identified viewer** — a logged-in user, *or* anyone who supplies name + email **and confirms a 6-digit code sent to that address** |
| Say what they want to attend next | any identified viewer (asked once per event) |
| Share an album link | any viewer |
| Tag people in a photo | any viewer |
| Remove a tag | the tagger, the tagged person, or admin/owner |
| Attendee suggestions for tagging | admin/owner only (privacy) |
| Album analytics + access log | admin/owner only |

Two design decisions drive most of the complexity — read these first:

1. **Viewing is deliberately not gated behind login.** People arrive from a shared link or an
   email and drop off if asked to sign up. Instead they type a **name + email** once and
   confirm a 6-digit code, and we match or silently create their Jetzy account behind the
   scenes (the same thing ticket checkout does). The code was added because the gate
   previously took the address on trust, so the captured interests were only as good as the
   visitor's honesty — and people were typing someone else's address.
2. **Albums are visible as soon as they're created.** "Publish" is *only* the announcement email to attendees — it is not a visibility switch.

---

## 2. Collections

### 2.1 `event-albums` (model `EventAlbums`)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `title` | String | required, trimmed, ≤120 chars |
| `description` | String | optional, ≤2000, defaults `""` |
| `media` | Array | `[{ url: String, type: "image" \| "video" }]` — subdoc with `_id: false`. **Order is authoritative** (see below) |
| `createdBy` | ObjectId → Users | optional |
| `isDeleted` | Boolean | soft delete, default `false`, indexed |
| `publishedAt` | Date | optional — first time it was published |
| `publishNotifiedAt` | Date | optional — last time the announcement went out |
| `notifiedCount` | Number | default `0` — how many attendees were emailed on the last publish |
| `showEvents` | Boolean | optional, **NO default** — whether the album page shows the promoted-events rail. See the warning below |
| `createdAt` / `updatedAt` | Date | timestamps |

Indexes: `{ eventId: 1 }`, `{ isDeleted: 1 }`, `{ eventId: 1, createdAt: -1 }`.

> **`showEvents` has no default, and `undefined` means SHOW.** Every album created before the
> toggle existed carries no value and shows the rail today; adding `default: false` would hide
> it on all of them at the next save. Read it as `album.showEvents === false`, and on update
> treat an **omitted** field as unchanged (`if (showEvents !== undefined) …`) so an older
> client cannot switch an album off by not knowing about the field.

> **`media` ordering matters.** The album **cover is the first item of `type: "image"`** in the array (falling back to `media[0]` if there are no images). The web editor lets the host drag-and-drop to reorder, which is how they pick the cover. Mobile must **preserve array order** on both read and write, and should offer the same reorder affordance.

### 2.2 `event-album-access` (model `AlbumAccess`)

One row per **(album, viewer email)**. This row is simultaneously the once-per-person notification guard *and* the analytics source.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `albumId` | ObjectId → EventAlbums | indexed |
| `userId` | ObjectId → Users | **optional** — a NextAuth session `_id` may point at `event-users` while the guest gate maps to `users`, so it is not a reliable key |
| `viewerEmail` | String | lowercased, trimmed, **required** — the stable identity across both paths, and the dedupe key |
| `viewerName` | String | optional |
| `action` | String | enum `"login"` \| `"signup"` |
| `createdAt` / `updatedAt` | Date | timestamps |

**Unique compound index: `{ albumId: 1, viewerEmail: 1 }`.** Inserting a repeat throws Mongo duplicate-key error **11000**; the first insert wins → send the notice email, duplicates are swallowed silently.

> **Migration required on existing databases.** The older `{ albumId, userId }` unique index must be dropped — `userId` is now optional and multiple `null`s would collide, blocking all guest access rows. Run `scripts/migrate-album-access-index.ts` once: it backfills `viewerEmail` from linked accounts and drops the stale index.

### 2.3 `event-album-tags` (model `AlbumTags`)

One row per tag. Photos are identified **by URL**, not by index (indexes shift when media is reordered).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` / `albumId` | ObjectId | both indexed |
| `mediaUrl` | String | required — which photo/video in the album |
| `personEmail` | String | required, lowercased, trimmed — the tagged person |
| `personName` | String | **optional** — tagging by email alone is valid and supported |
| `taggedByEmail` | String | optional, lowercased — who tagged them |
| `taggedByName` | String | optional |
| `notifiedAt` | Date | when the tag email was sent |
| `createdAt` / `updatedAt` | Date | timestamps |

**Index `{ albumId, mediaUrl, personEmail }` — deliberately NOT unique.** Tagging is unrestricted: the same person **can** be tagged more than once on the same photo, and **every tag sends another email**. There is no dedupe, by design.

> **Migration required on existing databases.** An earlier build made this index unique as a dedupe guard. Run `scripts/migrate-album-tags-index.ts` once to drop `albumId_1_mediaUrl_1_personEmail_1` and re-create it non-unique — otherwise re-tagging fails with a duplicate-key error.

### 2.4 `event-album-verifications` (model `AlbumVerification`)

A pending email-verification code for the access gate. Short-lived; upserted per (event, email).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `email` | String | lowercased, trimmed, required |
| `code` | String | 6 digits, `crypto.randomInt`. Stored **plain**, matching the existing `manualVerificationCode` precedent |
| `expiresAt` | Date | required — `CODE_TTL_MS` = **10 minutes** |
| `attempts` | Number | default `0`; `MAX_ATTEMPTS` = **5** wrong guesses, then locked |
| `lastSentAt` | Date | required — drives the `RESEND_COOLDOWN_MS` = **60s** resend cooldown |
| `createdAt` / `updatedAt` | Date | timestamps |

Index `{ eventId: 1, email: 1 }` — **deliberately NOT unique.** Both call sites read the
newest row by `createdAt` desc, so a duplicate is harmless, whereas a failed unique build
would throw 11000 on every upsert and lock everyone out of albums.

> **Do not reuse `EventUsers.manualVerificationCode` for this.** That field belongs to the
> compliance-unblock flow (`api/auth/verify/confirm-code.ts`); an album code that also
> unblocks an account would be a privilege leak. That is why this is its own collection.

> **Index build required on each database.** The connection sets `autoIndex: false`, so run
> `scripts/create-album-verification-index.ts` once per database. Never `syncIndexes()` on
> these shared collections — it drops indexes created by the mobile app / admin portal.

Constants live in `src/lib/album-verification.ts` (`issueAlbumCode`, `consumeAlbumCode`,
`consumeFailureMessage`). A correct code is **deleted** on use (single use); issuing a new
code invalidates the previous one.

### 2.5 `event-album-interests` (model `AlbumInterest`)

What a viewer said they want to attend next, captured in the access dialog. One row per
(event, email), upserted — re-entry updates rather than duplicating.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `email` | String | lowercased, trimmed, required — the key |
| `name` | String | optional |
| `userId` | ObjectId → Users | optional — may be absent if account creation failed |
| `interests` | [String] | default `[]` — curated labels picked from the chip grid |
| `customInterests` | [String] | default `[]` — free-text write-ins, each counts as one of the three |
| `customInterest` | String | **legacy** single free-text field, pre multi-custom. Read-only for old rows; cleared (`$unset`) on any fresh write |
| `optOut` | Boolean | default `false` — "I don't want to attend any other event". Counts as answered |
| `verified` | Boolean | optional, **no default** — see below |
| `createdAt` / `updatedAt` | Date | timestamps |

**Unique index `{ eventId: 1, email: 1 }`.**

> **`verified` absent ≠ false.** It is unset on every row written before the code gate
> existed. Reports must say **"unverified"**, never "failed verification". The same rule
> applies to `AlbumAccess.verified`.

---

### 2.6 `event-album-photo-requests` (model `AlbumPhotoRequest`)

One row per (person, photo) asking for the unwatermarked original.

```
eventId, albumId, mediaUrl, mediaType?, batchId?, userId?,
requesterEmail (lowercase), requesterName?, verified?,
status: "pending" | "handled", handledAt?, handledBy?, timestamps
```

`batchId` groups the rows written by one multi-photo submission. Absent on single-photo requests and on everything written before multi-select existed, so it is a display hint and never a key.

Index `{ eventId: 1, createdAt: -1 }`, built by `scripts/create-album-photo-request-index.ts` (`autoIndex` is off). **Deliberately not unique** on (albumId, email, mediaUrl): asking again after being ignored is legitimate, and a unique index that failed to build would throw 11000 at a visitor. The duplicate guard is the advisory pending-row lookup in the API.

Per-photo by decision: a host reading "someone wants some photos" has nothing to act on, whereas a named image is a request they can fill.

---

### 2.7 `event-album-views` (model `AlbumView`)

The album-page landing funnel, recorded before anyone is identified.

```
eventId, albumId, anonId, sessionId?, views,
landedAt?, gateShownAt?, codeSentAt?, identifiedAt?, viewerEmail?, timestamps
```

One row per person per album, keyed on the analytics `anonId`. Stage timestamps are written with `$min` so the earliest wins — a return visit must not rewrite when they first got through — and `views` is incremented, so `visitors` counts people while `views` counts visits.

Indexes `{albumId, anonId}` and `{eventId, createdAt:-1}`, built by `scripts/create-album-view-index.ts`. **Not unique**: an upsert can duplicate under a race, but every exact count groups by `anonId`, whereas a unique index that failed to build would throw 11000 during a page visit.

---

## 3. Viewer identity

This is the part that differs most from the rest of the platform, so implement it before the endpoints.

Every album endpoint that a non-host can hit resolves the caller through **`resolveAlbumViewer(req, res)`** (`src/lib/album-auth.ts`), which returns:

```ts
interface AlbumViewer {
  email:   string   // lowercased — the identity used everywhere
  name:    string   // falls back to the email if no name is known
  userId?: string   // may be absent; never rely on it as the key
  isGuest: boolean  // true = identified by the name+email gate, not a real session
}
```

Resolution order:

1. **NextAuth session.** If `getServerSession` returns a user with an email → that's the viewer, `isGuest: false`. A logged-in person is never prompted for anything.
2. **Signed guest cookie.** Otherwise read the `album_guest` cookie and verify it with `verifyMagicToken` (HMAC-signed, from `src/lib/magicLink.ts`). Valid → viewer with `isGuest: true`.
3. Neither → `null` → the endpoint returns **401** with `"Enter your name and email to view this album."`

**The `album_guest` cookie:** `Path=/`, `Max-Age=7776000` (90 days), `HttpOnly`, `SameSite=Lax`, plus `Secure` in production. Payload is a `generateMagicToken({ email, firstName, lastName, _id })`.

> **Mobile equivalent:** there are no cookies to rely on. Call `POST /albums/guest-access`, then **persist the returned identity in secure storage** and send it on subsequent album calls. Coordinate with the backend dev on the transport — either accept the same signed token in an `Authorization`/custom header, or have mobile always send a real session. The 90-day lifetime should be matched so the app doesn't re-prompt someone who already identified themselves.

### 3.1 The auto-login security rule — do not weaken this

`POST /albums/guest-access` returns a `magicToken` **only when the account was just created by that very call**.

- **Email is new** → account created → return `magicToken` → the client signs in for real (web: `signIn("credentials", { magicToken, redirect: false })`). The person now has a genuine session.
- **Email already belongs to someone** → **no token**, ever. They still get album access via the guest cookie, but no session.

The reason: anyone holding a share link could otherwise type a known email address and be handed that person's account — bookings, profile, everything. The album gate does not verify email ownership, so it must never mint a session for an existing account.

The credentials provider supports this via a magic-token branch: `isPasswordCorrect = isMagicLogin || bcrypt.compare(...)`.

---

## 4. Endpoints

Base path: `/api/events/:eventId/albums`

Roles referenced below:
- **admin** — `session.user.role` is `"admin"` or `"super admin"`
- **owner** — `event.ownerId === session.user._id`
- **any viewer** — `resolveAlbumViewer` returned non-null (session **or** guest cookie)
- **public** — no identity at all is required

> **Listing albums is PUBLIC.** `GET /albums` performs no viewer check: anyone on the event
> page sees the photos with no prompt. The name+email gate exists to record who arrived from
> a *share link*, not to restrict viewing. Do not gate the list on mobile — doing so would
> make albums look broken for ordinary visitors.

All responses use the standard envelope from the `sendResponse` helper:

```jsonc
{ "status": true, "message": "Albums retrieved successfully", "data": /* payload */ }
```

| Method | Path | Access | Body | `data` |
|---|---|---|---|---|
| GET | `/albums` | **public** | — | `Album[]`, newest first, `isDeleted: false` |
| POST | `/albums` | admin OR owner | `{ title, description?, media[], showEvents? }` | created `Album` |
| PUT | `/albums/:albumId` | admin OR owner | `{ title, description?, media[], showEvents? }` (full replace, except `showEvents` — omitted = unchanged) | updated `Album` |
| DELETE | `/albums/:albumId` | admin OR owner | — | `null` (sets `isDeleted: true`) |
| GET | `/albums/viewer` | **public** | — | `{ identified, email?, name?, isGuest?, hasInterests }` |
| POST | `/albums/send-code` | public | `{ email }` | `{ email }` — emails a 6-digit code, creates nothing |
| POST | `/albums/guest-access` | public | `{ name, email, code, interests?, customInterests?, optOut? }` | `{ email, name, isNewAccount, magicToken? }` |
| POST | `/albums/my-interests` | any viewer | `{ interests?, customInterests?, optOut? }` | `{ saved: true }` |
| GET | `/albums/interests?dateFrom&dateTo` | admin OR owner | — | `{ items, total, top }` |
| POST | `/albums/:albumId/access` | any viewer | `{ isNewAccount? }` | `{ firstAccess, action }` |
| GET | `/albums/:albumId/download?url=` | **public** | — | the file itself, `Content-Disposition: attachment` |
| GET | `/albums/participants` | admin OR owner | — | `[{ email, name }]` |
| GET | `/albums/:albumId/tags` | any viewer | — | `AlbumTag[]` for the whole album, oldest first |
| POST | `/albums/:albumId/tags` | any viewer | `{ mediaUrl, personEmail, personName? }` | `{ tag, isNew: true }` |
| DELETE | `/albums/:albumId/tags/:tagId` | tagger, tagged person, or admin/owner | — | `null` |
| POST | `/albums/:albumId/publish` | admin OR owner | `{ resend?: boolean }` | `{ notifiedCount, recipientCount, publishedAt, publishNotifiedAt }` |
| GET | `/albums/access-log?dateFrom&dateTo` | admin OR owner | — | `{ items: AccessRow[], total }` |

Validation shared by POST and PUT `/albums` (zod):

```ts
{
  title:        string (1–120),
  description?: string (≤2000),
  media:        Array<{ url: valid URL, type: "image" | "video" }>, // min 1 item
  showEvents?:  boolean   // show the promoted-events rail on this album's page
}

`showEvents` has **no default**. Undefined means show — every album created before the
toggle existed carries no value and its page shows the rail today. On PUT, omitting it leaves
the stored value unchanged, so an older client can't switch an album back on.
```

### 4.1 `GET /albums/viewer`

The identity probe. **Returns 200 with `{ identified: false }` rather than 401** — being
anonymous is a normal state now that albums are public.

```jsonc
{ "identified": true, "email": "...", "name": "...", "isGuest": false, "hasInterests": true }
```

`hasInterests` answers "have we already asked this person on this event?" — true when their
`AlbumInterest` row has any interest, any custom interest, **or** `optOut === true`. Opting
out counts as answered; don't keep asking someone who said no thanks.

The client calls this first and **waits for it to settle** before deciding whether to open
the name+email dialog. Opening optimistically makes it flash for people who already hold a
valid cookie or session.

### 4.2 `POST /albums/send-code`

Step one of the gate. Body `{ email: valid email }`.

1. Validate the event exists and isn't deleted.
2. Per-IP rate limit (10/min, `src/lib/rate-limit.ts`) → 429.
3. `issueAlbumCode` (`src/lib/album-verification.ts`) upserts one row per (event, email) with a **`crypto.randomInt` 6-digit code**, a **10-minute** expiry and `attempts: 0`. Inside the **60s** resend cooldown it returns null → 429, no second email.
4. `sendAlbumVerificationCode` — **awaited**, unlike most sends here: if the mail fails the visitor would otherwise wait for a code that never arrives.

Creates no account, no cookie and no interest row. Issuing a new code invalidates the previous one.

### 4.3 `POST /albums/guest-access`

The gate. Body `{ name: string (1–120), email: valid email, code: 6 digits }`.

1. Validate the event exists and isn't deleted.
2. **Verify the code first** — `consumeAlbumCode` before any write, so an unverified attempt leaves nothing behind. Wrong code → `$inc attempts` → 400; **5 attempts** or a lapsed expiry kills it; a correct code is **deleted** (single use).
3. Normalise: `email` lowercased/trimmed; `name` split into `firstName` (first word) + `lastName` (the rest).
4. **Look up `users` by email to compute `isNewAccount`** — this must happen *before* the upsert, or every account looks pre-existing.
5. Call `createOrUpdateUser({ firstName, lastName, email, phone: "", role: "user" })` (`src/lib/user-utils.ts`) — the exact helper ticket checkout uses. Matches by email or creates. **A failure here is logged but never blocks album viewing.**
6. Set the `album_guest` cookie, carrying `verifiedAt` so the later analytics write knows they were verified.
7. Upsert the interests row with `verified: true` — the body may carry `interests[]`,
   `customInterests[]` and `optOut`, so the gate captures them in the same round trip. Written
   only if at least one of the three is present.
8. Return `{ email, name, isNewAccount, magicToken? }` — `magicToken` present **only if `isNewAccount === true`** (see §3.1).

`isNewAccount` is also what the client forwards to `/access` to record `signup` vs `login`.

### 4.3-a The interest chips are a FIXED LIST — copy it verbatim

`ALBUM_INTERESTS` in `src/components/events/EventAlbums.tsx`:

| | | | |
|---|---|---|---|
| Wine Tastings 🍷 | Hiking 🥾 | Golf ⛳ | Networking 🤝 |
| Tennis 🎾 | Beach 🏖️ | Travel ✈️ | Founders 🚀 |
| Art 🎨 | Wellness 🧘 | Live Music 🎵 | Museum 🏛️ |

**The label is what gets stored, and `GET /albums/interests` rolls up by exact string.** A
client shipping its own preset splits one concept into two rows of the report the feature
exists to produce. The emoji is display only — never store it.

Do **not** substitute the Jetzy **event-tagging** taxonomy (`/v1/interests/categories`, 35
categories / 329 sub-interests) here. Different feature, different collection; it would swamp
the dialog and pollute this report.

Rules: at least **one** (`MIN_INTERESTS = 1`), no upper limit, free-text customs count toward
the total, and `optOut` alone is a valid answer. All three empty → **400**.

### 4.4 `POST /albums/my-interests`

Saves interests for the **current** viewer on this event. Requires `resolveAlbumViewer`
(401 otherwise); upserts the same `(eventId, email)` row as the gate.

This exists because the name+email dialog only appears for **unidentified** visitors. Anyone
arriving already logged in — notably recipients of the publish email, which signs them in —
would never be asked otherwise.

- Body `{ interests?: string[≤60][≤50], customInterests?: string[≤200][≤50], optOut?: boolean }`.
- All three empty → **400** `"Select at least one interest"`. Opting out is a valid answer on its own.
- Any fresh write `$unset`s the legacy `customInterest` so it can't linger beside the array.
- Note it does **not** set `verified` — that flag belongs to the code gate.

### 4.5 `GET /albums/interests`

Admin/owner reporting on the above. Query `eventId` (required), `dateFrom`, `dateTo`
(optional, snapped to start/end of day over `createdAt`). Newest first, capped at **5000**.

```jsonc
{
  "items": [{ "_id", "name", "email", "interests": [], "customInterests": [], "optOut", "verified", "date" }],
  "total": 42,
  "top":   [{ "interest": "Live Music", "count": 12 }]        // sorted desc
}
```

`top` merges chip picks and free-text write-ins, with write-ins suffixed **`" (custom)"`** so
the two are distinguishable in one list. `customInterests` falls back to the legacy
`customInterest` string for old rows. Unknown name/email render as `"—"`.

### 4.6 `POST /albums/:albumId/access`

Records that a person opened an album, and triggers the one-time notice email to the Jetzy inbox. Call it **once per album open** — the client may guard per session, but the server is the authority.

1. `resolveAlbumViewer` → 401 if null.
2. Determine `action`:
   - If the body carries `isNewAccount: true` → `"signup"`; `isNewAccount: false` → `"login"`. (The guest gate knows this for certain, so it's preferred.)
   - If `isNewAccount` is **absent** and the viewer has a `userId`, look the account up in `EventUsers` then `Users`; if `createdAt` is within the last **10 minutes** → `"signup"`, else `"login"`.
3. `AlbumAccess.create({ eventId, albumId, userId?, viewerEmail, viewerName, action, verified, identifiedAt })`
   - `verified` / `identifiedAt` come from the resolved viewer: the cookie's `verifiedAt` for a guest, `verified: true` with **no** `identifiedAt` for a session. Both **absent** for cookies issued before the code gate — those rows are *unverified*, not failed.
   - success → `firstAccess = true` → send `sendAlbumAccessNotice`
   - error code **11000** → `firstAccess = false` → **no email** (already recorded)
   - any other error → propagate as 500
4. Email dispatch is fire-and-forget; a mail failure never fails the request.

Returns `{ firstAccess: boolean, action: "login" | "signup" }`.

### 4.7 `GET /albums/:albumId/download?url=<mediaUrl>`

Forces a download of one album file. **Public** — no viewer check, because the media is
already publicly served by the CDN and nothing new is exposed.

It exists because the media CDN sends no CORS headers, so a browser cannot `fetch`→blob it
cross-origin and the `download` attribute is ignored on a cross-origin href. This proxies
same-origin and sets `Content-Disposition: attachment`.

- **The entire safety model is that `url` must already be in `album.media`** → else **400**
  `"That file is not part of this album."` Without that check this is an open proxy for
  arbitrary hosts. Do not relax it.
- Streams rather than buffers (`responseLimit: false`) — large videos must not sit in memory.
- Filename comes from the URL's last path segment, sanitised to `[a-zA-Z0-9._-]`, defaulting
  to `video.mp4` / `photo.jpg`.

> **Mobile** can usually skip this and download the CDN URL directly — the proxy solves a
> browser-only restriction. Serve the **clean original**: the `JetzyLife` mark on the web
> tiles is a CSS overlay for display, not a watermark burned into the file.

### 4.8 `GET /albums/participants`

Attendee suggestions powering the `@`-mention picker when tagging. Backed by `getEventParticipants(eventId)` (`src/lib/event-participants.ts`) = **confirmed bookings + accepted invitations**, returned as `[{ email, name }]`.

**Admin/owner only, on purpose.** Anyone with a share link can view and tag, but the attendee email list must not leak to them. Non-hosts get **`200` with an empty array** — not a 403 — so the client just falls back to manual name + email entry without showing an error.

### 4.9 `POST /albums/:albumId/tags`

1. `resolveAlbumViewer` → 401 if null.
2. Validate `{ mediaUrl: url, personEmail: email, personName?: ≤120 }`.
3. **Verify `mediaUrl` actually belongs to this album** (`album.media.some(m => m.url === mediaUrl)`) → else 400 `"That photo is not part of this album."` Prevents tagging arbitrary URLs.
4. Create the tag with `taggedByEmail` / `taggedByName` from the viewer and `notifiedAt: now`. **No duplicate check** — re-tagging is allowed.
5. Fire `sendAlbumTagNotification` (fire-and-forget).
6. Return `{ tag, isNew: true }` with **201**.

One person per call. Batching several people is a **client-side** concern — see the tagging flow in §5.3.

### 4.10 `DELETE /albums/:albumId/tags/:tagId`

Permitted if **any** of: the caller's email equals `tag.taggedByEmail`; equals `tag.personEmail`; the caller is admin; or the caller is the event owner. Otherwise **403** with `"You can only remove tags you added, or tags of yourself."` — surface that message verbatim, it explains itself.

### 4.11 `POST /albums/:albumId/publish`

Requires a real session (admin or owner — the guest cookie is not enough).

1. **Guard:** if `album.publishNotifiedAt` is already set and the body doesn't carry `resend: true` → **400** with `{ alreadyNotified: true, publishNotifiedAt, notifiedCount }` and the message `"This album was already published. Re-send to notify attendees again."` This exists so a stray second tap can't re-blast every attendee. The client should show a confirm dialog and then retry with `resend: true`.
2. Recipients = `getEventParticipants(eventId)` (confirmed bookings + accepted invitations).
3. Cover = first `type: "image"` in `media`, else `media[0]`.
4. Email everyone in parallel, counting successes; per-recipient failures are logged, not fatal.
5. Stamp `publishedAt` (only if unset — it records the *first* publish), `publishNotifiedAt = now`, `notifiedCount = sent`.
6. Return `{ notifiedCount, recipientCount, publishedAt, publishNotifiedAt }`.

### 4.12 `GET /albums/access-log`

Query: `eventId` (required), `dateFrom`, `dateTo` (optional, snapped to start/end of day over `createdAt`). Newest first, capped at **5000** rows.

`AccessRow`: `{ _id, albumId, albumTitle, name, email, action, verified, identifiedAt, date }`

`date` is `createdAt` — when they opened **this album**. `identifiedAt` is when they signed in / signed up / passed the code, which can be days earlier and is `null` for sessions and pre-gate rows.

`viewerName` / `viewerEmail` on the row are the source of truth; the account lookup in `EventUsers`/`Users` is only a fallback for **legacy rows** written before the guest flow existed. Unknowns render as `"—"`.

### 4.12-a `POST /albums/:albumId/view` — **public**

Records where a visitor got to on an album page. Body: `{ anonId, sessionId?, stage, email? }`, where `stage` is `landed` | `gate_shown` | `code_sent` | `identified`.

No identity of any kind is required — that is the point. `AlbumAccess` is only written once somebody is through the gate, so the people who landed and gave up at the name+email dialog left no trace at all.

Rate-limited `album-view:<ip>` at 60/min, and **every failure path returns 200** — this is instrumentation on a page the visitor came to look at, so a dropped ping must never surface to them.

Fired by `useAlbumViewerGate`, which owns the dialog state. `GuestAccessModal` gained an `onCodeSent` callback for the middle step. Stages queue client-side until both the album id and the `anonId` are known.

---

> **A deleted album does NOT 404.** `[slug]/album/[albumId].tsx` re-checks by id alone when the `isDeleted: false` lookup misses, and renders a "These photos are no longer available" screen linking back to the event. The site 404 says "Event Not Found" and offers the full listing, which is the wrong thing to tell someone whose photo link came from a publish email. A wrong album id still 404s.

### 4.12-b `PATCH /albums/:albumId/order` — **admin or owner**

Reorders an album's media. Body: `{ mediaUrls: string[] }`.

Its own route rather than the existing full-replace `PUT`, which requires title, description and the whole media array — reordering through it would mean a stale tab could revert a title, and a bug in the media round-trip could delete photos.

The list must be an **exact permutation** of what is stored (same length, same set, no duplicates, checked both ways). Anything else is refused with "This album changed since you opened it" rather than partially applied. `album.media` is rebuilt from the stored sub-documents keyed by url, so `type` survives — the client only sends urls.

Driven from the album page itself (drag, plus up/down arrows for phones and keyboards), not from the edit modal.

---

### 4.13 `POST /albums/:albumId/photo-request` — **any viewer**

Records a request for the unwatermarked originals of one or more photos. Body: `{ mediaUrls: string[], code? }` (`mediaUrl` is still accepted as the single-photo form). Capped at **30** per submission.

Several photos write **one row per photo**, sharing a `batchId` — the host sends files one at a time and marks off what they have sent, so a single row covering five photos could only ever be half true. `batchId` is a display hint, never a key: absent on single-photo requests and on everything written before multi-select.

Validation is **all-or-nothing** — if any url is not part of this album the whole request is refused, rather than leaving the viewer believing they asked for photos nobody recorded.

**One confirmation email per submission, never one per photo** (up to 6 thumbnails then "and N more"). The inbox notice covers only the photos actually newly recorded, and goes to **`tech@jetzyapp.com`** (`PHOTO_REQUEST_NOTIFICATION_EMAIL` overrides) — its own recipient, not the shared `ADMIN_NOTIFICATION_EMAIL`, so redirecting these cannot move the album-access notices or the security alerts.

The address is **never taken from the body** — `resolveAlbumViewer` already knows it, and accepting one would let anyone file a request under someone else's name. So there is no email field anywhere in this flow; the dialog shows the resolved address read-only.

`code` is only needed when `viewer.verified !== true`, which today means a guest cookie minted **before** the code gate existed. Everyone who came through the current gate already proved their address minutes earlier and is not asked twice. When a code is required and absent, the response is `400` with `data: { needsVerification: true, email }` — the client reads that flag rather than deciding from its own copy of `verified`. The code itself is the ordinary album code: `POST /albums/send-code` with the resolved address, `purpose: "album"`.

`mediaUrl` must be present in **this** album's stored `media`, the same safety model as the download proxy.

Duplicate guard is a **pending-row lookup**, not an index: a second request for a photo that is still pending does not open a new row (and does not re-notify the inbox), but the confirmation email is re-sent so the visitor gets an answer either way. Asking again after a request was handled is legitimate and creates a new row.

Rate limited `album-photo-request:<ip>` at 10/60s.

### 4.14 `GET /albums/photo-requests` — **admin or owner**

Query: `eventId` (required), `dateFrom`, `dateTo`. Newest first, capped at **5000** rows, no server-side CSV — same shape as `access-log`.

Row: `{ _id, albumId, albumTitle, mediaUrl, mediaType, batchId, name, email, verified, status, handledAt, date }`

### 4.15 `PATCH /albums/photo-requests/:requestId` — **admin or owner**

Body: `{ status: "pending" | "handled" }`. Sets/clears `handledAt` + `handledBy`.

**`status` gates nothing.** Fulfilment is manual and off-platform — the host emails the file themselves. It is a note-to-self so a host working through a list knows which ones they have answered.

---

## 5. User flows

### 5.1 Share link → viewing

**Canonical album URL: `/{eventSlug}/album/{albumId}`** — its own page, built by
`eventAlbumPath` / `eventAlbumUrl` (`src/lib/event-slug.ts`). Never interpolate a slug
yourself; slugs may contain spaces and unicode.

Query params the page understands:

| Param | Meaning |
|---|---|
| `photo` | open this media URL directly (used by tag links) |
| `from=event` | the view was already counted by the event page — **do not record a second one** |

> **`/{eventSlug}?album={albumId}` is LEGACY back-compat only.** Albums used to be a gallery
> modal on the event page. Links already in circulation — publish emails, tag notifications,
> copied share links — still carry the query form, so the event page client-side redirects it
> to the canonical path, mapping `tagPhoto` → `photo` and adding `from=event`. New clients
> must emit the path form. Do not build new links on the query form.

**Covers and album metadata are public; opening an album is gated.** `GET /albums` returns
full album documents including `media` to anyone, so the gate is enforced by the *client*
on the album page, not by the list endpoint. Do not assume the API hides photos from an
unidentified caller — if that matters to you, say so and it has to change server-side.

The gate (`useAlbumViewerGate`) runs on the album page:

1. Probe `GET /albums/viewer` and **wait for it to settle**. Opening a dialog optimistically
   makes it flash for people who already hold a valid cookie or session.
2. Not identified → **name + email dialog**. No redirect to `/login`, no signup screen.
   Submitting runs the two-step gate: `send-code`, then `guest-access` with the 6-digit code.
   If `magicToken` came back (new account only) the client also signs in for real.
3. Identified but `hasInterests` is false → the **interests-only dialog**. This is how
   publish-email arrivals — signed in by the magic link, so they never see the name+email
   dialog — still get asked. It posts to `my-interests`.
4. Only once both are satisfied is the media revealed, and `POST /albums/:albumId/access`
   fires once (skipped when `from=event`).
5. A viewer who dismisses a dialog must have a way to re-open it, or they are stuck on a page
   with no media and no route forward.

**Mobile:** a deep link carrying the event slug (or id) + `albumId`, matching the path form.
If the user isn't signed in, collect name + email in a sheet and run the code gate — do
**not** push them to signup. On first view, POST the access endpoint.

### 5.2 Creating an album (host)

1. Host uploads media. **Web note:** the shared uploader whitelists folder names — albums upload under the folder `"posts"`. Using an unrecognised folder returns a 500 `"Invalid Folder"`.
2. Host reorders media by drag-and-drop; **item 0 (first image) becomes the cover**.
3. `POST /albums` with `{ title, description?, media[] }`.
4. The album is **immediately visible** to viewers. Publishing is separate.

> Known infrastructure limit: uploads around **100 MB** (large videos) can fail with a **502 Bad Gateway** from the Envoy gateway in front of the upload API. That's an upload-service limit, not album code — the same ceiling will hit mobile.

### 5.3 Tagging

Tagging is open to **every viewer**, not just the host. Two entry routes:

- **Registered guests (host only):** type `@` to search. Everything after the last `@` is the query, matched case-insensitively against participant name or email, capped at 8 results. Already-tagged people **stay selectable** — re-tagging is allowed. If a host types text without any `@`, hint them toward `@` or manual entry rather than silently doing nothing.
- **Anyone else:** manual entry — **email required, full name optional**. Non-hosts only ever see this route, since `/participants` returns `[]` for them.

**Stage → confirm → send.** Nothing is sent while people are being picked:

1. Selecting or entering someone **stages them locally** (client-side list, keyed by a generated id — *not* by email, since the same person may legitimately appear twice).
2. Staged entries can be removed before sending.
3. An explicit **confirm step** then POSTs one request per staged person and reports `"N tagged · M failed"`.

This is deliberate: emails go out on every successful tag, so a misclick must never send one. **Mobile should implement the same confirm step.**

Additional rules:
- Staged tags must be **scoped to the current photo** — swiping to a different photo has to clear or re-key them, or they get applied to the wrong image.
- Existing tags render as removable chips showing `personName || personEmail`.

### 5.4 Publishing

Host taps **Publish** → confirm dialog → `POST /albums/:albumId/publish` → every attendee gets "The photos from {event} are up!". If it was already published, the API refuses with a 400 and the client offers an explicit **re-send** that retries with `resend: true`.

---

## 6. Emails

All in `src/lib/send-grid.ts`. **All three skip sending when `NEXT_PUBLIC_URL` contains
`localhost`** and just log — expect no mail in local dev.

Album link: `{NEXT_PUBLIC_URL}/{eventSlug}/album/{albumId}`, built with `eventAlbumUrl`.

**The publish email is different:** its recipients are known event participants and the link
lands in their own inbox, so it signs them straight in rather than making them fill in the
gate —

```
{root}/login?magicToken={token}&_cb={encodeURIComponent(albumPath)}
```

falling back to the plain album URL when there is no token. Same one-click pattern the
discussion emails use. This is also *why* the interests-only dialog exists: these arrivals
are already identified and never see the name+email step.

**Full HTML and plain-text bodies for all four are in §10** — reproduce them verbatim so mail from the app is indistinguishable from the web's.

There is a fourth album email — `sendAlbumVerificationCode`, the 6-digit code from
`POST /albums/send-code`. Unlike the three below it is **awaited**, not fire-and-forget: if
the send fails, the visitor would otherwise sit waiting for a code that never arrives.

| Mailer | Recipient | Trigger | Contents |
|---|---|---|---|
| `sendAlbumAccessNotice` | `SENDGRID_EMAIL_SENDER` (internal inbox) | First time a given person opens a given album | Viewer name + email, action (logged in / signed up), event, album, UTC timestamp, album link |
| `sendAlbumTagNotification` | the tagged person | **Every** tag creation, including repeats | Who tagged them, event, album, and a button to the album. **The photo is deliberately NOT embedded** — the recipient must click through to see it |
| `sendAlbumPublishedNotification` | every event attendee | `POST /albums/:albumId/publish` | "📸 The photos from {event} are up!", cover image, album link |

---

## 7. Analytics

`GET /api/analytics/events?eventId=...` (admin OR event owner) includes an `albums` block, honouring the same `dateFrom`/`dateTo` filter applied over `AlbumAccess.createdAt`:

```jsonc
"albums": {
  "albumCount":    5,     // non-deleted albums on the event
  "totalAccesses": 42,    // rows in event-album-access
  "uniqueViewers": 30,    // distinct viewerEmail
  "logins":        18,    // action === "login"
  "signups":       24,    // action === "signup"
  "perAlbum": [           // top 10 albums by accesses
    { "albumId": "...", "title": "...", "accesses": 12, "uniqueViewers": 9 }
  ]
}
```

Aggregation over `event-album-access`: group by `action` for the login/signup split; **`$addToSet: "$viewerEmail"`** for unique viewers (*not* `userId` — guests may have no linked account); group by `albumId` with a `$lookup` into `event-albums` for `perAlbum`.

The web portal renders this as a dedicated **Albums** analytics tab — summary cards, a Top Albums table, and the per-viewer access log from `GET /albums/access-log` — with an **Export CSV** button covering all three. Mobile can reuse both the `albums` aggregate and the `access-log` endpoint.

---

## 8. Errors

| Status | When |
|---|---|
| 400 | Invalid ObjectId, zod validation failure, `mediaUrl` not in the album, already-published without `resend` |
| 401 | No identified viewer — `"Enter your name and email to view this album."` → the client should open the name+email gate |
| 403 | Not admin/owner for a host-only action; not permitted to delete a given tag |
| 404 | Event or album missing / soft-deleted |
| 405 | Wrong HTTP method |
| 500 | Anything unhandled |

Note the two intentional non-errors: `GET /participants` returns **200 + `[]`** rather than 403 for non-hosts, and a duplicate `POST /access` returns **200** with `firstAccess: false`.

---

## 9. Implementation checklist (mobile)

- [ ] Run all three index scripts against the target database (`migrate-album-access-index.ts`, `migrate-album-tags-index.ts`, `create-album-verification-index.ts`) — **before** any guest access or re-tagging is attempted. Never `syncIndexes()`.
- [ ] Probe `GET /albums/viewer` before showing any gate, and wait for it to settle.
- [ ] Do **not** gate `GET /albums` — listing is public.
- [ ] Two-step gate: `send-code` then `guest-access` with the 6-digit code. Handle the 429s (60s resend cooldown, 10/min per IP) and the locked-after-5-attempts case.
- [ ] Collect interests in the gate, and via `my-interests` for viewers who arrive already signed in; skip the ask when `hasInterests` is true. **Use the exact 12 chip labels of §4.3-a** — they are the report's group-by keys.
- [ ] Agree how a non-browser client carries guest identity. `resolveAlbumViewer` currently reads a NextAuth session **or the `album_guest` cookie, and nothing else** — there is no header path today. Either replay the cookie from `guest-access`'s `Set-Cookie`, or have the web add header support first.
- [ ] Respect `showEvents` as *undefined means show*, and leave it untouched when updating an album.
- [ ] Agree the transport for guest identity (signed token in a header vs. real session) and match the 90-day lifetime.
- [ ] Album list + gallery, preserving `media` order; cover = first image.
- [ ] Name + email sheet on the album deep link, wired to `guest-access`; auto sign-in **only** when `magicToken` comes back.
- [ ] Fire `POST /access` once per album open, forwarding `isNewAccount` when known.
- [ ] Tagging with the stage → confirm → send flow; `@`-search for hosts, manual entry (email required, **name optional**) for everyone; staged tags scoped per photo.
- [ ] Tag removal with the permission rules of §4.10.
- [ ] Host-side create/edit/delete with drag-to-reorder, uploading to the `posts` folder.
- [ ] Publish with the confirm dialog and the `resend: true` retry path.
- [ ] Handle 401 by re-opening the identity gate rather than showing an error.

---

## 10. Email templates, verbatim

Reproduce these exactly so mail sent from the app and from the web is indistinguishable. All
four live in `src/lib/send-grid.ts`.

### Shared rules

- **From is always `{ email: SENDGRID_EMAIL_SENDER, name: "Jetzy" }`** via one `mailFrom()`
  helper. A bare address string makes clients display the mailbox name ("contact") instead of
  "Jetzy". The only exception is the access notice, which goes to an internal inbox.
- Every body is wrapped by `wrapHtml()`:
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>…</body></html>`
- **Event names are rich text.** Strip tags, then decode entities (`decodeHTMLEntities`),
  before interpolating — otherwise the subject line renders literal `<p>` tags.
- Styles are inline only: no `<style>` block, no external CSS. Brand orange is `#F79432`.
- The album link is always `eventAlbumUrl(base, slug, albumId)` →
  `{base}/{slug}/album/{albumId}`. Never interpolate a slug by hand; slugs may contain spaces
  and unicode.
- All four skip sending when `NEXT_PUBLIC_URL` contains `localhost`, and just log.
- Three are **fire-and-forget** — a mail failure must never fail the request. The verification
  code is the exception: it is **awaited**, because a failed send leaves the visitor waiting
  for a code that never arrives.

### 1. Verification code — `sendAlbumVerificationCode`

To the address being verified. **Awaited.**

**Subject:** `Your album access code: {CODE}`

`{FOR_EVENT}` is `` for &quot;{EVENT_NAME}&quot; `` when an event name is known, otherwise an
empty string. In the text part it is ` for "{EVENT_NAME}"` with real quotes.

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 25px;">
    <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
    <h1 style="color: #333; font-size: 24px; margin: 0;">View the photos</h1>
  </div>
  <p style="color: #666; font-size: 16px; line-height: 1.5;">
    Enter this code to confirm your email and open the photo album{FOR_EVENT}:
  </p>
  <div style="background-color: #f9f9f9; padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0; border: 1px dashed #F79432;">
    <span style="font-family: monospace; font-size: 42px; font-weight: 800; color: #F79432; letter-spacing: 12px;">{CODE}</span>
  </div>
  <p style="color: #999; font-size: 14px; line-height: 1.4;">
    This code expires in 10 minutes. If you didn't ask to view an album, you can ignore this email — nothing has been created for you.
  </p>
  <p style="font-size: 12px; color: #ccc; text-align: center; border-top: 1px solid #eee; margin-top: 30px; padding-top: 15px;">
    &copy; {YEAR} Jetzy Events, Inc.
  </p>
</div>
```

```
Your album access code: {CODE}

Enter this code to confirm your email and open the photo album{FOR_EVENT}. It expires in 10 minutes.
```

> This copy commits you to the behaviour in §2.4: 10-minute TTL, 5 attempts, 60s resend, and
> **nothing written before the code checks out**. If your backend differs, the email is lying.

### 2. Access notice — `sendAlbumAccessNotice`

**To the internal inbox**, not the viewer: `ADMIN_NOTIFICATION_EMAIL`, falling back to
`SENDGRID_EMAIL_SENDER`. Sent the *first* time a given person opens a given album — the
`{albumId, viewerEmail}` unique index is what makes it once-per-person (§2.2).

`{ACTION}` is `signed up` or `logged in`. `{WHEN}` is
`toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })` plus
`" UTC"`.

**Subject:** `[Album] {VIEWER_NAME} {ACTION} — {EVENT_NAME}`

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid #F79432; border-radius: 12px;">
  <h2 style="color: #F79432; margin-top: 0;">New Album Viewer</h2>
  <p style="color: #333; font-size: 16px;">
    A user <strong>{ACTION}</strong> from a shared album link and can now view it:
  </p>
  <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Name:</strong> {VIEWER_NAME}</p>
    <p style="margin: 5px 0;"><strong>Email:</strong> {VIEWER_EMAIL}</p>
    <p style="margin: 5px 0;"><strong>Action:</strong> {ACTION}</p>
    <p style="margin: 5px 0;"><strong>Event:</strong> {EVENT_NAME}</p>
    <p style="margin: 5px 0;"><strong>Album:</strong> {ALBUM_TITLE}</p>
    <p style="margin: 5px 0;"><strong>When:</strong> {WHEN}</p>
  </div>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{ALBUM_URL}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
      Open Album
    </a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
    Automated notification from Jetzy Events.
  </p>
</div>
```

```
New album viewer
Name: {VIEWER_NAME}
Email: {VIEWER_EMAIL}
Action: {ACTION}
Event: {EVENT_NAME}
Album: {ALBUM_TITLE}
When: {WHEN}
Open: {ALBUM_URL}
```

### 3. Tag notification — `sendAlbumTagNotification`

To the **tagged person**, on **every** tag including repeats — tagging is deliberately not
deduped (§2.3).

**Subject:** `{TAGGER_NAME} tagged you in a photo from {EVENT_NAME}`

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333; text-align: center;">You were tagged in a photo 📸</h1>
  <p style="color: #555; font-size: 16px; line-height: 1.6;">
    Hi {RECIPIENT_NAME}, <strong>{TAGGER_NAME}</strong> tagged you in a photo from
    <strong>{EVENT_NAME}</strong> (album: {ALBUM_TITLE}).
  </p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{ALBUM_URL}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
      View the Photo
    </a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
    You're receiving this because someone tagged you in a Jetzy event album.
  </p>
</div>
```

```
{TAGGER_NAME} tagged you in a photo from "{EVENT_NAME}" (album: {ALBUM_TITLE}).

View it: {ALBUM_URL}
```

> **The photo is deliberately NOT embedded.** `mediaUrl` is accepted by the function and
> deliberately unused in the body — the recipient must click through. Don't "improve" this by
> inlining the image: it would put a photo of someone into an inbox that never passed the
> album gate, and into every mail provider that caches remote images.

### 4. Publish notification — `sendAlbumPublishedNotification`

To **every event attendee** (`getEventParticipants` = confirmed bookings + accepted
invitations) when the host publishes.

**Subject:** `📸 The photos from {EVENT_NAME} are up!`

The cover block is omitted entirely when there is no cover. Cover = first `type: "image"` in
`media`, else `media[0]`.

**The link is a magic-link sign-in, not a plain album URL:**

```
{root}/login?magicToken={TOKEN}&_cb={encodeURIComponent(albumPath)}
```

falling back to `{root}{albumPath}` when there is no token. Recipients are known participants
and the link lands in their own inbox, so they are signed straight in rather than sent through
the gate. **This is why the interests-only dialog exists** (§4.4) — these arrivals are already
identified and never see the name+email step.

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333; text-align: center;">The photos are here! 🎉</h1>
  <p style="color: #555; font-size: 16px; line-height: 1.6;">
    Hi {RECIPIENT_NAME}, the album <strong>{ALBUM_TITLE}</strong> from
    <strong>{EVENT_NAME}</strong> has just been published. Take a look and find yourself!
  </p>
  <!-- only when a cover exists -->
  <div style="text-align: center; margin: 25px 0;">
    <img src="{COVER_URL}" alt="{ALBUM_TITLE}" style="max-width: 100%; border-radius: 12px;" />
  </div>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{ALBUM_URL}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
      View the Album
    </a>
  </div>
  <p style="margin-top: 30px; text-align: center; color: #666;">Thanks for being part of it!</p>
</div>
```

```
The photos from "{EVENT_NAME}" are up!

Album: {ALBUM_TITLE}
View it: {ALBUM_URL}
```

> Unlike the other three, this one **throws** on failure, because `publish` counts successes
> into `notifiedCount`. Per-recipient failures are logged and skipped, not fatal to the batch.

---

## 11. Web reference files

- **Models:** `src/models/events/albums.ts`, `src/models/events/album-access.ts`, `src/models/events/album-tags.ts`, `src/models/events/album-verification.ts`, `src/models/events/album-interest.ts`
- **Viewer identity:** `src/lib/album-auth.ts` (`resolveAlbumViewer`, `setAlbumGuestCookie`, `ALBUM_GUEST_COOKIE`)
- **Shared helpers reused:** `src/lib/user-utils.ts` (`createOrUpdateUser`), `src/lib/magicLink.ts` (`generateMagicToken` / `verifyMagicToken`), `src/lib/event-participants.ts` (`getEventParticipants`)
- **APIs:** `src/pages/api/events/[eventId]/albums/{index.ts, [albumId].ts, viewer.ts, send-code.ts, guest-access.ts, my-interests.ts, interests.ts, participants.ts, access-log.ts, [albumId]/access.ts, [albumId]/download.ts, [albumId]/publish.ts, [albumId]/tags/index.ts, [albumId]/tags/[tagId].ts}`
- **Verification + rate limiting:** `src/lib/album-verification.ts`, `src/lib/rate-limit.ts`
- **Emails:** `sendAlbumAccessNotice`, `sendAlbumTagNotification`, `sendAlbumPublishedNotification`, `sendAlbumVerificationCode`, `sendAlbumPhotoRequestReceived`, `sendAlbumPhotoRequestNotice` in `src/lib/send-grid.ts`
- **Migrations / index builds:** `scripts/migrate-album-access-index.ts`, `scripts/migrate-album-tags-index.ts`, `scripts/create-album-verification-index.ts`, `scripts/create-album-photo-request-index.ts`
- **Analytics:** `src/pages/api/analytics/events.ts` (`albums` block) + `src/pages/console/events/[eventId]/analytics.tsx` (Albums tab)
- **UI:** `src/components/events/EventAlbums.tsx`, mounted in `src/components/HostedEvents.tsx` above `#discussion-section`; album page `src/pages/[slug]/album/[albumId].tsx`; viewer gate `src/components/events/album/useAlbumViewerGate.tsx`; promoted-events rail `src/components/events/album/PromotedEvents.tsx`
- **Unwatermarked-photo requests:** dialog `src/components/events/album/RequestUnwatermarkedDialog.tsx`; host table `src/components/console/AlbumPhotoRequests.tsx` (Photo Requests tab on `/console/events/[eventId]/manage`)
- **Album page funnel:** `src/models/events/album-view.ts`, `POST /albums/:albumId/view`, `scripts/create-album-view-index.ts`; surfaced on the analytics Albums tab as the Album Page Funnel strip
