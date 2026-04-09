/**
 * Returns a Map of { email → name } for every user associated with an event.
 * Sources:
 *   1. Bookings with status CONFIRMED
 *   2. EventInvitation records with status "accepted"
 *
 * Pass `excludeEmail` to omit the acting user (author / commenter) from the result.
 */

import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { EventInvitation } from "@/models/events/event-invitations"

export async function getEventParticipants(
  eventId: string,
  excludeEmail?: string
): Promise<Map<string, string>> {
  const normalized = excludeEmail?.toLowerCase()
  const participants = new Map<string, string>()

  // 1. Confirmed ticket purchasers
  const bookings = await Bookings.find({
    eventId,
    isDeleted: false,
    status: BookingStatus.CONFIRMED,
  }).select("customerEmail customerName")

  for (const b of bookings) {
    const email = b.customerEmail?.toLowerCase()
    if (email && email !== normalized) {
      participants.set(email, b.customerName || "Guest")
    }
  }

  // 2. Accepted invited guests
  const invitations = await EventInvitation.find({
    eventId,
    status: "accepted",
  }).select("email name")

  for (const inv of invitations) {
    const email = inv.email?.toLowerCase()
    if (email && email !== normalized) {
      // Don't overwrite a booking entry (it has the real name)
      if (!participants.has(email)) {
        participants.set(email, inv.name || "Guest")
      }
    }
  }

  return participants
}
