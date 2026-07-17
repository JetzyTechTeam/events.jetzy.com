# Event Albums — Backend/Mobile Parity Spec

Photo/video **albums** on events. Web portal (events-jetzy-com) implementation is live; this doc is the contract for the mobile backend dev to build the same feature so web + app stay in sync. Same MongoDB, same collections.

---

## Collections

### `event-albums`  (model `EventAlbums`)
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `title` | String | required, trimmed, ≤120 chars |
| `description` | String | optional, ≤2000 |
| `media` | Array | `[{ url: String, type: "image" \| "video" }]` (subdoc, no `_id`) |
| `createdBy` | ObjectId → Users | who created it |
| `isDeleted` | Boolean | soft delete, default false |
| `createdAt` / `updatedAt` | Date | timestamps |

Index: `{ eventId: 1, createdAt: -1 }`.

### `event-album-access`  (model `AlbumAccess`)
One row per (album, user). This row is BOTH the once-per-user-per-album email guard AND the analytics source.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `eventId` | ObjectId → Events | indexed |
| `albumId` | ObjectId → EventAlbums | indexed |
| `userId` | ObjectId → Users | |
| `action` | String | `"login"` or `"signup"` — how the viewer authenticated |
| `createdAt` / `updatedAt` | Date | timestamps |

**Unique compound index: `{ albumId: 1, userId: 1 }`** — insert throws duplicate-key (Mongo error 11000) on repeats; first insert wins → send email, duplicates are ignored.

---

## Endpoints (web portal — mirror these)

Base: `/api/events/:eventId/albums`

Auth roles:
- **admin** = `role` is `"admin"` or `"super admin"`
- **owner** = `event.ownerId === session.user._id`
- **any logged-in user** = valid session

| Method | Path | Access | Body | Response `data` |
|---|---|---|---|---|
| GET | `/albums` | any logged-in user | — | `Album[]` (newest first, `isDeleted:false`) |
| POST | `/albums` | admin OR owner | `{ title, description?, media[] }` | created `Album` |
| PUT | `/albums/:albumId` | admin OR owner | `{ title, description?, media[] }` (full replace) | updated `Album` |
| DELETE | `/albums/:albumId` | admin OR owner | — | `null` (soft delete) |
| POST | `/albums/:albumId/access` | any logged-in user | — | `{ firstAccess: boolean, action: "login"\|"signup" }` |
| GET | `/albums/access-log?dateFrom&dateTo` | admin OR owner | — | `{ items: AccessRow[], total }` — per-viewer log for analytics/export |

`AccessRow`: `{ _id, albumId, albumTitle, name, email, action, date }` (name/email resolved from EventUsers or Users; sorted newest first; capped 5000; respects date range).

`media[]` validation: each `{ url (valid URL), type ("image"\|"video") }`, at least 1 item.

Standard response envelope (existing `sendResponse` helper): `{ status: boolean, message: string, data: any }`.

### `POST /albums/:albumId/access` — semantics
1. Require session; resolve `userId`.
2. Derive `action`: load the user (EventUsers then Users); if `createdAt` within last **10 minutes** → `"signup"`, else `"login"`.
3. `AlbumAccess.create({ eventId, albumId, userId, action })`:
   - success → `firstAccess = true` → send notify email.
   - duplicate-key (11000) → `firstAccess = false` → **no** email (already recorded).
4. Email failure never blocks the response.

---

## Notify email
`sendAlbumAccessNotice` → **to `SENDGRID_EMAIL_SENDER`** (contact@ inbox), from same. Sent only when `firstAccess === true`. Contains: viewer name + email, action (logged in / signed up), event name, album title, timestamp (UTC), and link `/{slug}?album={albumId}`. Localhost is skipped.

---

## Share link + login/signup flow
- Album share URL: **`/{eventSlug}?album={albumId}`**.
- Recipient opens it. If **not logged in** → redirect to `/login?_cb=<original album url>`. The signup page inherits `_cb`, so login OR signup both return to the album URL.
- After auth returns to `/{slug}?album={albumId}`: the client auto-opens that album's gallery AND calls `POST /albums/:albumId/access` once (client also guards with a per-session key; server dedupes authoritatively via the unique index).
- **View gate:** albums are only visible to logged-in users (GET requires a session).

Mobile equivalent: a deep link carrying `eventId`/`slug` + `albumId`; force auth before showing album media; on first view after auth POST the access endpoint.

---

## Album analytics
`GET /api/analytics/events?eventId=...` (admin OR event owner) now returns an `albums` block (respects the `dateFrom`/`dateTo` filter over `AlbumAccess.createdAt`):

```jsonc
"albums": {
  "albumCount":    5,      // non-deleted albums on the event
  "totalAccesses": 42,     // rows in event-album-access
  "uniqueViewers": 30,     // distinct userId
  "logins":        18,     // action === "login"
  "signups":       24,     // action === "signup"
  "perAlbum": [            // top 10 albums by accesses
    { "albumId": "...", "title": "...", "accesses": 12, "uniqueViewers": 9 }
  ]
}
```

Aggregation: group `event-album-access` by `action` for login/signup counts, `$addToSet userId` for unique viewers, and group by `albumId` (+ `$lookup` album title) for `perAlbum`.

The web portal shows this in a dedicated **"Albums" analytics tab** (summary cards + Top Albums table + per-viewer Access Log) with an **Export CSV** button (summary + per-album breakdown + full access log). The per-viewer rows come from `GET /albums/access-log`. Mobile can reuse both the `albums` aggregate block and the `access-log` endpoint for its own analytics/export.

---

## Files (web reference)
- Models: `src/models/events/albums.ts`, `src/models/events/album-access.ts`
- APIs: `src/pages/api/events/[eventId]/albums/{index.ts,[albumId].ts,[albumId]/access.ts,access-log.ts}`
- Email: `sendAlbumAccessNotice` in `src/lib/send-grid.ts`
- Analytics: `src/pages/api/analytics/events.ts` (`albums` block) + `src/pages/console/events/[eventId]/analytics.tsx` (Album Access cards)
- UI: `src/components/events/EventAlbums.tsx`, mounted in `src/components/HostedEvents.tsx` above `#discussion-section`
