# Event media contract — images, videos and display order

Shared contract between **events.jetzy.com** (this web portal) and the **mobile app + its backend**. Both write to the same `events` collection, so anything either side gets wrong is visible to the other's users.

Last updated: 2026-08-21.

---

## 1. Storage — three fields, one collection

| Field | Type | Required | Meaning |
|---|---|---|---|
| `images` | `[String]` | no | Image URLs |
| `videos` | `[String]` | no (default `[]`) | Video URLs |
| `mediaOrder` | `[String]` | **no — and no default** | Display order across **both** lists, as URLs |

All three live on the event document. URLs are absolute (`https://…`); the portal uploads to S3 via its own uploader and stores the returned URL.

### Why `mediaOrder` exists

`images` and `videos` are separate arrays, so **they cannot express "video, image, image"** between them. Before this field, the banner always rendered every image and *then* every video — a host could never make a video the first thing people see.

`mediaOrder` records the true order. The two source arrays are unchanged, so a client that knows nothing about it keeps working.

### The one rule that matters

> **`mediaOrder` is a hint about ORDER, never the source of truth about WHICH media exist.**

`images` and `videos` remain authoritative for content. Consequences, both deliberate:

- A URL present in `images`/`videos` but **missing** from `mediaOrder` is still displayed — appended after the ordered ones, in the legacy images-then-videos order. **This is what lets the mobile backend add a photo without touching `mediaOrder`.**
- A URL in `mediaOrder` that is **no longer** in `images`/`videos` is skipped, never rendered as a blank tile.

`undefined` / `[]` means "no explicit order" → legacy images-then-videos. Every event created before this feature is in that state and must keep rendering exactly as it did.

---

## 2. Ordering algorithm

Implemented once in [`src/lib/event-media.ts`](src/lib/event-media.ts) as `eventMedia(event)` / `applyMediaOrder(list, order)`. Mobile should implement the same three steps:

```
1. build the legacy list:  images (in order) as type=image,
                           then videos (in order) as type=video
2. if mediaOrder is empty  -> return the legacy list
3. otherwise:
     a. for each url in mediaOrder, in order:
          emit the matching entry; skip if unknown or already emitted
     b. append every legacy entry not yet emitted, in legacy order
```

### Verified cases

| `images` | `videos` | `mediaOrder` | Result |
|---|---|---|---|
| `[i1, i2]` | `[v1]` | *(absent)* | `i1, i2, v1` |
| `[i1, i2]` | `[v1]` | `[v1, i2, i1]` | `v1, i2, i1` |
| `[i1, i2, i3]` | `[v1]` | `[v1, i1]` | `v1, i1, i2, i3` *(i2, i3 appended)* |
| `[i1]` | `[]` | `[deleted, i1]` | `i1` *(dead entry skipped)* |
| `[i1, i2]` | `[]` | `[i2, i2, i1]` | `i2, i1` *(duplicate ignored)* |
| `[i1]` | `[v1]` | `[]` | `i1, v1` |
| `[]` | `[v1]` | `[v1]` | `v1` |

---

## 3. Writing — create and update

Both endpoints take the **same envelope**: a POST whose body is `{ "payload": "<JSON string of the event>" }`. The payload is JSON-*stringified*, not a nested object.

- **Create:** `POST /api/events/create`
- **Update:** `POST /api/events/[eventId]/update`

Both require an authenticated session; update additionally requires admin **or** the event's `ownerId`.

### Media fields in the payload

Note the shape difference — the two source arrays are arrays of **objects**, `mediaOrder` is an array of **plain URL strings**:

```jsonc
{
  "images": [
    { "id": "a1b2c3", "file": "https://…/photo-1.jpg" },
    { "id": "d4e5f6", "file": "https://…/photo-2.jpg" }
  ],
  "videos": [
    { "id": "g7h8i9", "file": "https://…/clip.mp4" }
  ],
  // urls, in the order they should display
  "mediaOrder": [
    "https://…/clip.mp4",
    "https://…/photo-2.jpg",
    "https://…/photo-1.jpg"
  ]
}
```

`id` is a client-side key only — it is **discarded** on the way in (`images.map(i => i.file)`) and is never stored. Any unique string works; it does not have to survive a round trip.

### Field-by-field write behaviour

| Field | Create | Update |
|---|---|---|
| `images` | required (may be `[]`) | **required** (may be `[]`) |
| `videos` | optional | optional — **omitted collapses it to `[]`** |
| `mediaOrder` | optional | optional — **omitted leaves the stored value untouched** |

Three traps in that table:

1. **`images: []` stores a placeholder,** not an empty array — the server substitutes `DEFAULT_EVENT_IMAGE` ([`src/types/const.ts`](src/types/const.ts)) so no event renders with a blank banner.
2. **Omitting `videos` on update wipes them.** It is not preserve-on-omit. Always send the full list.
3. **`mediaOrder` IS preserve-on-omit.** A client that doesn't support ordering should simply omit it — that leaves whatever the host arranged on web intact. Sending `[]` explicitly means "clear the order", which is different and usually not what you want.

### If the mobile app implements reordering

Send the **complete** `mediaOrder` — every URL in `images` plus every URL in `videos`, in display order. Partial lists work (the rest append) but the result will surprise a host who expected exact control.

When a host deletes a media item, removing it from `images`/`videos` is enough; the stale `mediaOrder` entry is skipped harmlessly. Pruning it is tidier but optional.

---

## 4. How the host sets the order (the web UX to mirror)

Both **Create Event** and **Manage Event** render one shared component ([`src/components/media-upload-section.tsx`](src/components/media-upload-section.tsx)) under "Event Media".

**Before:** images and videos were two separate runs of thumbnails, so there was nothing a host could do to make a video lead.

**Now:** a **single grid containing images and videos together**, sequenced by `mediaOrder`, where **every tile is draggable**. Dragging tile A onto tile B moves A to B's position and shifts the rest — the swap happens live as you drag over, not on drop.

- The **first tile is badged `FIRST`** and outlined in orange. That is the only cue telling a host what leads the banner, so mirror something equivalent.
- Helper line above the grid: *"Drag to reorder — the first item is what shows on the event banner."*
- Video tiles show their first frame plus a small ▶ marker, so a host can tell them apart at a glance.
- Uploading appends to the end. Deleting removes the tile; the leftover `mediaOrder` entry is harmless (skipped on read).
- Reordering marks the form dirty and triggers the same autosave as any other edit — dragging alone changes neither `images` nor `videos`, so the order must be part of what autosave compares, or a reorder silently never saves.

Implementation notes if you build the same on web: it is native HTML5 drag-and-drop, not a library. The load-bearing details are `pointer-events: none` on the `<img>`/`<video>` inside each tile (or the media element swallows the drag), `preventDefault()` in `dragover` on every tile (or `dragenter` fires unreliably), and holding the drag source index in a ref rather than state.

On mobile, drag-and-drop in a list is the natural equivalent; a simple "make this the cover" action on each item would also satisfy the contract, since all that reaches the server is the reordered URL list.

---

## 5. Reading — how the media is displayed

Everything below renders `eventMedia(event)`, i.e. the ordered list. **Item 0 is "the lead"** and is what represents the event everywhere it appears as a single thumbnail.

| Surface | Renders |
|---|---|
| Event detail banner | The whole list as a carousel (a single item renders bare, no carousel) |
| Listing card, dashboard card, My Events row, My Bookings card, album rail | **Item 0 only** |

### Web behaviour worth mirroring

- **Banner videos autoplay**: `autoplay` + **`muted`** + `loop` + `playsinline`, with controls shown. Muted is not a preference — browsers refuse to start an unmuted video and render a stalled player instead. On mobile the equivalent is starting muted with an unmute affordance.
- **Cards never autoplay.** A listing holds a dozen; the web shows a still first frame (via the `#t=0.1` media-fragment trick) plus a play badge.
- **Aspect ratio is not enforced on upload**, so nothing may assume 16:9. Every surface letterboxes on black (`object-fit: contain`) rather than cropping — a host's artwork often has text near the edges. The one exception is square album cover tiles, where cropping is intended.

---

## 6. Invariants — please don't break these

1. **Never treat `mediaOrder` as the list of media.** Content comes from `images` + `videos`.
2. **Never give `mediaOrder` a default.** Absent means "legacy order"; writing `[]` or a generated order onto every event on save would rewrite history for events nobody reordered.
3. **Never merge the two arrays into one `media` field.** Both apps and the admin portal read `images`/`videos` today.
4. **Any endpoint that projects event fields must include `videos` and `mediaOrder`** if it feeds a UI that shows media. A fixed `select(...)` list silently drops them, and the symptom — "the order I saved does nothing" — points nowhere near the cause. This has already bitten us twice.
5. **Keep `DEFAULT_EVENT_IMAGE` in sync** between web and the mobile backend.

---

## 7. Related docs

- [`PROJECT_KNOWLEDGE.md`](PROJECT_KNOWLEDGE.md) — full web codebase map
- [`ALBUM_API.md`](ALBUM_API.md) — event photo albums (separate from banner media, its own collection)
- [`ANALYTICS_SCHEMA.md`](ANALYTICS_SCHEMA.md) — cross-portal analytics contract
