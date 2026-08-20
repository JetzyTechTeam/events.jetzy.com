# Event Albums — Backend / Mobile Parity Spec

Photo & video **albums** on events. The web portal (events-jetzy-com) implementation is live and is the reference; this document is the full contract so the mobile app can implement the same feature against the **same MongoDB and the same collections**. Nothing here is web-specific unless marked.

Everything a mobile client needs is in this doc: data model, viewer identity, every endpoint with request/response shapes, the four user flows end-to-end, emails, analytics, migrations, and an implementation checklist.

---

## 1. Feature summary

| Capability | Who can do it |
|---|---|
| Create / edit / delete an album | event **admin** or **owner** |
| Publish an album (emails all attendees) | event **admin** or **owner** |
| View an album | **any identified viewer** — a logged-in user, *or* anyone who supplies name + email |
| Share an album link | any viewer |
| Tag people in a photo | any viewer |
| Remove a tag | the tagger, the tagged person, or admin/owner |
| Attendee suggestions for tagging | admin/owner only (privacy) |
| Album analytics + access log | admin/owner only |

Two design decisions drive most of the complexity — read these first:

1. **Viewing is deliberately not gated behind login.** People arrive from a shared link or an email and drop off if asked to sign up. Instead they type a **name + email** once, and we match or silently create their Jetzy account behind the scenes (the same thing ticket checkout does).
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
| `createdAt` / `updatedAt` | Date | timestamps |

Indexes: `{ eventId: 1 }`, `{ isDeleted: 1 }`, `{ eventId: 1, createdAt: -1 }`.

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

All responses use the standard envelope from the `sendResponse` helper:

```jsonc
{ "status": true, "message": "Albums retrieved successfully", "data": /* payload */ }
```

| Method | Path | Access | Body | `data` |
|---|---|---|---|---|
| GET | `/albums` | any viewer | — | `Album[]`, newest first, `isDeleted: false` |
| POST | `/albums` | admin OR owner | `{ title, description?, media[] }` | created `Album` |
| PUT | `/albums/:albumId` | admin OR owner | `{ title, description?, media[] }` (full replace) | updated `Album` |
| DELETE | `/albums/:albumId` | admin OR owner | — | `null` (sets `isDeleted: true`) |
| POST | `/albums/send-code` | public | `{ email }` | `{ email }` — emails a 6-digit code, creates nothing |
| POST | `/albums/guest-access` | public | `{ name, email, code }` | `{ email, name, isNewAccount, magicToken? }` |
| POST | `/albums/:albumId/access` | any viewer | `{ isNewAccount? }` | `{ firstAccess, action }` |
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

### 4.0 `POST /albums/send-code`

Step one of the gate. Body `{ email: valid email }`.

1. Validate the event exists and isn't deleted.
2. Per-IP rate limit (10/min, `src/lib/rate-limit.ts`) → 429.
3. `issueAlbumCode` (`src/lib/album-verification.ts`) upserts one row per (event, email) with a **`crypto.randomInt` 6-digit code**, a **10-minute** expiry and `attempts: 0`. Inside the **60s** resend cooldown it returns null → 429, no second email.
4. `sendAlbumVerificationCode` — **awaited**, unlike most sends here: if the mail fails the visitor would otherwise wait for a code that never arrives.

Creates no account, no cookie and no interest row. Issuing a new code invalidates the previous one.

### 4.1 `POST /albums/guest-access`

The gate. Body `{ name: string (1–120), email: valid email, code: 6 digits }`.

1. Validate the event exists and isn't deleted.
2. **Verify the code first** — `consumeAlbumCode` before any write, so an unverified attempt leaves nothing behind. Wrong code → `$inc attempts` → 400; **5 attempts** or a lapsed expiry kills it; a correct code is **deleted** (single use).
3. Normalise: `email` lowercased/trimmed; `name` split into `firstName` (first word) + `lastName` (the rest).
4. **Look up `users` by email to compute `isNewAccount`** — this must happen *before* the upsert, or every account looks pre-existing.
5. Call `createOrUpdateUser({ firstName, lastName, email, phone: "", role: "user" })` (`src/lib/user-utils.ts`) — the exact helper ticket checkout uses. Matches by email or creates. **A failure here is logged but never blocks album viewing.**
6. Set the `album_guest` cookie, carrying `verifiedAt` so the later analytics write knows they were verified.
7. Upsert the interests row with `verified: true`.
8. Return `{ email, name, isNewAccount, magicToken? }` — `magicToken` present **only if `isNewAccount === true`** (see §3.1).

`isNewAccount` is also what the client forwards to `/access` to record `signup` vs `login`.

### 4.2 `POST /albums/:albumId/access`

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

### 4.3 `GET /albums/participants`

Attendee suggestions powering the `@`-mention picker when tagging. Backed by `getEventParticipants(eventId)` (`src/lib/event-participants.ts`) = **confirmed bookings + accepted invitations**, returned as `[{ email, name }]`.

**Admin/owner only, on purpose.** Anyone with a share link can view and tag, but the attendee email list must not leak to them. Non-hosts get **`200` with an empty array** — not a 403 — so the client just falls back to manual name + email entry without showing an error.

### 4.4 `POST /albums/:albumId/tags`

1. `resolveAlbumViewer` → 401 if null.
2. Validate `{ mediaUrl: url, personEmail: email, personName?: ≤120 }`.
3. **Verify `mediaUrl` actually belongs to this album** (`album.media.some(m => m.url === mediaUrl)`) → else 400 `"That photo is not part of this album."` Prevents tagging arbitrary URLs.
4. Create the tag with `taggedByEmail` / `taggedByName` from the viewer and `notifiedAt: now`. **No duplicate check** — re-tagging is allowed.
5. Fire `sendAlbumTagNotification` (fire-and-forget).
6. Return `{ tag, isNew: true }` with **201**.

One person per call. Batching several people is a **client-side** concern — see the tagging flow in §5.3.

### 4.5 `DELETE /albums/:albumId/tags/:tagId`

Permitted if **any** of: the caller's email equals `tag.taggedByEmail`; equals `tag.personEmail`; the caller is admin; or the caller is the event owner. Otherwise **403** with `"You can only remove tags you added, or tags of yourself."` — surface that message verbatim, it explains itself.

### 4.6 `POST /albums/:albumId/publish`

Requires a real session (admin or owner — the guest cookie is not enough).

1. **Guard:** if `album.publishNotifiedAt` is already set and the body doesn't carry `resend: true` → **400** with `{ alreadyNotified: true, publishNotifiedAt, notifiedCount }` and the message `"This album was already published. Re-send to notify attendees again."` This exists so a stray second tap can't re-blast every attendee. The client should show a confirm dialog and then retry with `resend: true`.
2. Recipients = `getEventParticipants(eventId)` (confirmed bookings + accepted invitations).
3. Cover = first `type: "image"` in `media`, else `media[0]`.
4. Email everyone in parallel, counting successes; per-recipient failures are logged, not fatal.
5. Stamp `publishedAt` (only if unset — it records the *first* publish), `publishNotifiedAt = now`, `notifiedCount = sent`.
6. Return `{ notifiedCount, recipientCount, publishedAt, publishNotifiedAt }`.

### 4.7 `GET /albums/access-log`

Query: `eventId` (required), `dateFrom`, `dateTo` (optional, snapped to start/end of day over `createdAt`). Newest first, capped at **5000** rows.

`AccessRow`: `{ _id, albumId, albumTitle, name, email, action, verified, identifiedAt, date }`

`date` is `createdAt` — when they opened **this album**. `identifiedAt` is when they signed in / signed up / passed the code, which can be days earlier and is `null` for sessions and pre-gate rows.

`viewerName` / `viewerEmail` on the row are the source of truth; the account lookup in `EventUsers`/`Users` is only a fallback for **legacy rows** written before the guest flow existed. Unknowns render as `"—"`.

---

## 5. User flows

### 5.1 Share link → viewing

Album share URL: **`/{eventSlug}?album={albumId}`**

1. Recipient opens the link.
2. The page **scrolls to the albums section**.
3. If the viewer is **not identified**, a **name + email dialog** opens automatically. No redirect to `/login`, no signup screen.
4. Submitting calls `POST /albums/guest-access`. If `magicToken` came back (new account only), the client also signs in for real. Either way the person is now identified.
5. The client auto-opens that album's gallery and fires `POST /albums/:albumId/access` once.
6. Access is *also* recorded when an album is opened by normal browsing — not just via a share link.

> Timing note: the client must wait for the identity probe to settle before deciding to show the dialog. Opening it optimistically makes it flash for people who already hold a valid cookie/token.

**Mobile:** a deep link carrying the event slug (or id) + `albumId`. If the user isn't signed in, collect name + email in a sheet and call `guest-access` — do **not** push them to signup. On first view, POST the access endpoint.

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

All in `src/lib/send-grid.ts`. **All three skip sending when `NEXT_PUBLIC_URL` contains `localhost`** and just log — expect no mail in local dev. Album link in every email: `{NEXT_PUBLIC_URL}/{eventSlug}?album={albumId}`.

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

- [ ] Run both migration scripts against the target database (`migrate-album-access-index.ts`, `migrate-album-tags-index.ts`) — **before** any guest access or re-tagging is attempted.
- [ ] Agree the transport for guest identity (signed token in a header vs. real session) and match the 90-day lifetime.
- [ ] Album list + gallery, preserving `media` order; cover = first image.
- [ ] Name + email sheet on the album deep link, wired to `guest-access`; auto sign-in **only** when `magicToken` comes back.
- [ ] Fire `POST /access` once per album open, forwarding `isNewAccount` when known.
- [ ] Tagging with the stage → confirm → send flow; `@`-search for hosts, manual entry (email required, **name optional**) for everyone; staged tags scoped per photo.
- [ ] Tag removal with the permission rules of §4.5.
- [ ] Host-side create/edit/delete with drag-to-reorder, uploading to the `posts` folder.
- [ ] Publish with the confirm dialog and the `resend: true` retry path.
- [ ] Handle 401 by re-opening the identity gate rather than showing an error.

---

## 10. Web reference files

- **Models:** `src/models/events/albums.ts`, `src/models/events/album-access.ts`, `src/models/events/album-tags.ts`
- **Viewer identity:** `src/lib/album-auth.ts` (`resolveAlbumViewer`, `setAlbumGuestCookie`, `ALBUM_GUEST_COOKIE`)
- **Shared helpers reused:** `src/lib/user-utils.ts` (`createOrUpdateUser`), `src/lib/magicLink.ts` (`generateMagicToken` / `verifyMagicToken`), `src/lib/event-participants.ts` (`getEventParticipants`)
- **APIs:** `src/pages/api/events/[eventId]/albums/{index.ts, [albumId].ts, guest-access.ts, participants.ts, access-log.ts, [albumId]/access.ts, [albumId]/publish.ts, [albumId]/tags/index.ts, [albumId]/tags/[tagId].ts}`
- **Emails:** `sendAlbumAccessNotice`, `sendAlbumTagNotification`, `sendAlbumPublishedNotification` in `src/lib/send-grid.ts`
- **Migrations:** `scripts/migrate-album-access-index.ts`, `scripts/migrate-album-tags-index.ts`
- **Analytics:** `src/pages/api/analytics/events.ts` (`albums` block) + `src/pages/console/events/[eventId]/analytics.tsx` (Albums tab)
- **UI:** `src/components/events/EventAlbums.tsx`, mounted in `src/components/HostedEvents.tsx` above `#discussion-section`
