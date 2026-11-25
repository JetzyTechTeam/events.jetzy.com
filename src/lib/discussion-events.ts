/**
 * The discussion-chat steps, as `EventInteraction.interactionType` values. Pure and client-safe —
 * the event page writes them, `api/analytics/event-windows.ts` counts them.
 *
 * Hosts share `<event url>?view=discussion` ("Share Chat", or the chat QR, which adds `via=qr`) to
 * bring people straight into the chat. Until 2026-11-26 none of it was recorded.
 * Never written under `?preview=1` — a host checking the page must not count.
 */
export const DISCUSSION_LINK_VISIT = "discussion_link_visit" // page opened with ?view=discussion — metadata.via "qr" | "link"
export const CHAT_OPEN = "chat_open" // chat panel opened on purpose, once per page visit — metadata.trigger "click" | "link" (the auto-expand on messages is NOT counted)
export const CHAT_LINK_SHARED = "chat_link_shared" // host copied the chat link (Share Chat)
export const CHAT_QR_OPENED = "chat_qr_opened" // host opened the chat QR

export const DISCUSSION_EVENT_TYPES = [DISCUSSION_LINK_VISIT, CHAT_OPEN, CHAT_LINK_SHARED, CHAT_QR_OPENED] as const

/** Query param the chat QR adds, so a scan can be told apart from a shared link. */
export const DISCUSSION_QR_PARAM = { via: "qr" } as const
