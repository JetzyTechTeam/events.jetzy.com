import { createHash, timingSafeEqual } from "crypto"
import type { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { WaitingList } from "@/models/waitingList"
import { PageView, UserSession, EventInteraction } from "@/models/analytics"

/**
 * Service-to-service summary for the apis-service "Daily Users Overview" CEO email — it fetches
 * this over HTTP and merges it with the app-side numbers. Same auth shape as
 * src/pages/api/webhooks/select-member.ts: a constant-time-compared shared secret header, not
 * admin session auth, since the caller is another backend, not a browser.
 */

type WindowKey = "24h" | "7days" | "30days" | "60days"
const WINDOW_KEYS: WindowKey[] = ["24h", "7days", "30days", "60days"]

interface Window {
  key: WindowKey
  from: Date
  to: Date
}

const secretMatches = (provided: string, expected: string): boolean => {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}
function subDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 24 * 60 * 60 * 1000)
}

// Matches apis-service's dailyUsersOverviewReportGenerator.ts buildPeriods() exactly (24h is a
// rolling window, 7/30/60 days are calendar-day-aligned) — same shape, computed independently
// here in UTC so the two "Last 24h" columns actually line up when merged into one email.
function buildWindows(now: Date): Window[] {
  return [
    { key: "24h", from: subDays(now, 1), to: now },
    { key: "7days", from: utcStartOfDay(subDays(now, 6)), to: utcEndOfDay(now) },
    { key: "30days", from: utcStartOfDay(subDays(now, 29)), to: utcEndOfDay(now) },
    { key: "60days", from: utcStartOfDay(subDays(now, 59)), to: utcEndOfDay(now) },
  ]
}

const emptyByWindow = <T,>(value: T): Record<WindowKey, T> =>
  WINDOW_KEYS.reduce((acc, k) => ({ ...acc, [k]: value }), {} as Record<WindowKey, T>)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
  }

  const expected = process.env.CEO_REPORT_API_SECRET
  if (!expected) {
    console.error("[analytics/ceo-report-summary] CEO_REPORT_API_SECRET is not configured")
    return sendResponse(res, null, "Endpoint not configured", false, ResCode.SERVICE_UNAVAILABLE)
  }

  const headerValue = req.headers["x-webhook-secret"]
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!provided || !secretMatches(provided, expected)) {
    console.warn("[analytics/ceo-report-summary] Rejected a request with a bad or missing secret")
    return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
  }

  try {
    await ensureDbConnected()

    const now = new Date()
    const windows = buildWindows(now)

    const [
      activeByWindow,
      newFromEventUsers,
      newFromUsers,
      eventsCreatedByWindow,
      eventsPublishedByWindow,
      bookingsByWindow,
      checkInsByWindow,
      pageViewsByWindow,
      interactionsByWindow,
      discussionPostsByWindow,
      waitingListByWindow,
      visitorsByWindow,
      guestConversionByWindow,
    ] = await Promise.all([
      activeUsersByWindow(windows),
      countByWindow(EventUsers, "createdAt", windows),
      countByWindow(Users, "createdAt", windows),
      countByWindow(Events, "createdAt", windows),
      countByWindow(Events, "createdAt", windows, { status: "published" }),
      bookingsByWindowFacet(windows),
      sumByWindow(CheckIn, "createdAt", "checkedInCount", windows),
      countByWindow(PageView, "timestamp", windows, { page: { $regex: "^/events/" } }),
      interactionsByWindowFacet(windows),
      countByWindow(DiscussionPosts as any, "createdAt", windows),
      countByWindow(WaitingList as any, "createdAt", windows),
      visitorsByWindowFacet(windows),
      guestConversionByWindows(windows),
    ])

    const summary: Record<WindowKey, Record<string, number>> = {} as any
    for (const key of WINDOW_KEYS) {
      const active = activeByWindow[key]
      const newUsers = newFromEventUsers[key] + newFromUsers[key]
      // Derived, not independently queried — mirrors apis-service's own
      // `returningUsers = Math.max(0, activeUsers - newUsers)` so the
      // Active = New + Returning identity holds by construction, not by coincidence.
      const returning = Math.max(0, active - newUsers)

      summary[key] = {
        "Active Users": active,
        "New Users": newUsers,
        "Returning Users": returning,
        "Events Created": eventsCreatedByWindow[key],
        "Events Published": eventsPublishedByWindow[key],
        "Tickets Booked": bookingsByWindow[key].tickets,
        "Bookings Created": bookingsByWindow[key].created,
        "Bookings Completed": bookingsByWindow[key].completed,
        "Revenue": bookingsByWindow[key].revenue,
        "Check-ins": checkInsByWindow[key],
        "Event Page Views": pageViewsByWindow[key],
        "Ticket Selections": interactionsByWindow[key].ticketSelect,
        "Booking Starts": interactionsByWindow[key].bookingStart,
        "Discussion Posts Created": discussionPostsByWindow[key],
        "Waiting List Joins": waitingListByWindow[key],
        "Total Visits": visitorsByWindow[key].total,
        "Guest Visitors": visitorsByWindow[key].guests,
        "Guest to Signup Conversion (%)": guestConversionByWindow[key],
      }
    }

    return sendResponse(res, summary, "CEO report summary retrieved successfully", true, ResCode.OK)
  } catch (error: any) {
    console.error("[analytics/ceo-report-summary] Error:", error)
    return sendResponse(res, null, error?.message || "Failed to build CEO report summary", false, ResCode.INTERNAL_SERVER_ERROR)
  }
}

// Distinct PEOPLE with a session in the window — registered accounts AND anonymous guests,
// grouped by userId when signed in, anonId otherwise. Deliberately not session-scoped: someone
// with two sessions in the window (e.g. visited, left, came back) is one Active User, not two —
// that's what distinguishes this from Total Visitors (a session/visit count) below. Unlike the
// app side, most web traffic never creates an account at all, so excluding guests here would
// make "Active Users" measure almost nothing real for this platform.
async function activeUsersByWindow(windows: Window[]): Promise<Record<WindowKey, number>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[w.key] = [
      { $match: { startTime: { $gte: w.from, $lte: w.to } } },
      { $group: { _id: { $ifNull: ["$userId", "$anonId"] } } },
      { $count: "n" },
    ]
  }
  const [result] = await UserSession.aggregate([
    { $match: { $or: [{ userId: { $ne: null } }, { anonId: { $ne: null } }] } },
    { $facet: facet },
  ])
  const out: Record<WindowKey, number> = emptyByWindow(0)
  for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.n || 0
  return out
}

async function countByWindow(
  model: any,
  dateField: string,
  windows: Window[],
  extraMatch: Record<string, any> = {}
): Promise<Record<WindowKey, number>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[w.key] = [{ $match: { ...extraMatch, [dateField]: { $gte: w.from, $lte: w.to } } }, { $count: "n" }]
  }
  const [result] = await model.aggregate([{ $facet: facet }])
  const out: Record<WindowKey, number> = emptyByWindow(0)
  for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.n || 0
  return out
}

async function sumByWindow(
  model: any,
  dateField: string,
  sumField: string,
  windows: Window[]
): Promise<Record<WindowKey, number>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[w.key] = [
      { $match: { [dateField]: { $gte: w.from, $lte: w.to } } },
      { $group: { _id: null, total: { $sum: `$${sumField}` } } },
    ]
  }
  const [result] = await model.aggregate([{ $facet: facet }])
  const out: Record<WindowKey, number> = emptyByWindow(0)
  for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.total || 0
  return out
}

interface BookingWindowStats {
  created: number
  completed: number
  tickets: number
  revenue: number
}

async function bookingsByWindowFacet(windows: Window[]): Promise<Record<WindowKey, BookingWindowStats>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[`${w.key}_created`] = [{ $match: { createdAt: { $gte: w.from, $lte: w.to } } }, { $count: "n" }]
    facet[`${w.key}_confirmed`] = [
      { $match: { status: BookingStatus.CONFIRMED, createdAt: { $gte: w.from, $lte: w.to } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$total" },
          tickets: { $sum: { $reduce: { input: "$tickets", initialValue: 0, in: { $add: ["$$value", "$$this.quantity"] } } } },
        },
      },
    ]
  }
  const [result] = await BookingsModel.aggregate([{ $match: { isDeleted: false } }, { $facet: facet }])

  const out: Record<WindowKey, BookingWindowStats> = {} as any
  for (const key of WINDOW_KEYS) {
    const confirmed = result?.[`${key}_confirmed`]?.[0]
    out[key] = {
      created: result?.[`${key}_created`]?.[0]?.n || 0,
      completed: confirmed?.count || 0,
      tickets: confirmed?.tickets || 0,
      revenue: confirmed?.revenue || 0,
    }
  }
  return out
}

interface InteractionWindowStats {
  ticketSelect: number
  bookingStart: number
}

async function interactionsByWindowFacet(windows: Window[]): Promise<Record<WindowKey, InteractionWindowStats>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[w.key] = [
      { $match: { timestamp: { $gte: w.from, $lte: w.to }, interactionType: { $in: ["ticket_select", "booking_start"] } } },
      { $group: { _id: "$interactionType", n: { $sum: 1 } } },
    ]
  }
  const [result] = await EventInteraction.aggregate([{ $facet: facet }])

  const out: Record<WindowKey, InteractionWindowStats> = {} as any
  for (const key of WINDOW_KEYS) {
    const rows: { _id: string; n: number }[] = result?.[key] || []
    out[key] = {
      ticketSelect: rows.find((r) => r._id === "ticket_select")?.n || 0,
      bookingStart: rows.find((r) => r._id === "booking_start")?.n || 0,
    }
  }
  return out
}

interface VisitorWindowStats {
  total: number
  guests: number
}

// Raw session/visit volume — NOT deduplicated by person (that's what the redefined Active
// Users above now covers). Someone who visits 3 times in the window is 1 Active User but 3
// Total Visits; the gap between the two numbers is itself a signal (high visits-per-person can
// mean either strong engagement or a confusing flow forcing repeat attempts). sessionId is
// unique per session, so a plain count == distinct-session count (same shortcut overview.ts
// already relies on).
async function visitorsByWindowFacet(windows: Window[]): Promise<Record<WindowKey, VisitorWindowStats>> {
  const facet: Record<string, any[]> = {}
  for (const w of windows) {
    facet[`${w.key}_total`] = [{ $match: { startTime: { $gte: w.from, $lte: w.to } } }, { $count: "n" }]
    facet[`${w.key}_guests`] = [
      { $match: { startTime: { $gte: w.from, $lte: w.to }, isLoggedIn: false, anonId: { $ne: null } } },
      { $group: { _id: "$anonId" } },
      { $count: "n" },
    ]
  }
  const [result] = await UserSession.aggregate([{ $facet: facet }])

  const out: Record<WindowKey, VisitorWindowStats> = {} as any
  for (const key of WINDOW_KEYS) {
    out[key] = {
      total: result?.[`${key}_total`]?.[0]?.n || 0,
      guests: result?.[`${key}_guests`]?.[0]?.n || 0,
    }
  }
  return out
}

// % of a window's guest anonIds that have EVER had a logged-in session (before or after this
// window — signing up two days after a first visit still counts as that visit having
// converted). Requires a query pair per window rather than a single facet, since "converted"
// depends on each window's own guest list — but the 4 windows are independent of each other,
// so they run concurrently rather than one-after-another (a sequential version of this timed
// out the 8s budget apis-service allows for the whole summary fetch).
async function guestConversionByWindows(windows: Window[]): Promise<Record<WindowKey, number>> {
  const out: Record<WindowKey, number> = emptyByWindow(0)

  await Promise.all(
    windows.map(async (w) => {
      const guestAnonIds = await UserSession.distinct("anonId", {
        startTime: { $gte: w.from, $lte: w.to },
        isLoggedIn: false,
        anonId: { $ne: null },
      })
      if (guestAnonIds.length === 0) {
        out[w.key] = 0
        return
      }
      const convertedAnonIds = await UserSession.distinct("anonId", {
        anonId: { $in: guestAnonIds },
        isLoggedIn: true,
      })
      out[w.key] = Math.round((convertedAnonIds.length / guestAnonIds.length) * 1000) / 10
    })
  )

  return out
}
