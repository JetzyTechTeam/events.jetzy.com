import { Bookings } from '@/models/events/bookings'
import { Events } from '@/models/events'
import { ensureDbConnected } from '@/configs/database'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth/[...nextauth]'

/**
 * Bookings for an event, for the host-facing surfaces (Approvals, Guests list).
 *
 * This used to be unauthenticated. Booking documents now carry Stripe identifiers on
 * `payment`, so it is restricted to the event's owner (or an admin), and the Stripe ids
 * are projected out — no client-side surface needs them.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  await ensureDbConnected()

  const { eventId } = req.body

  if (!eventId) {
    return res.status(400).json({ message: 'Event ID is required' })
  }

  const session = await getServerSession(req, res, authOptions)
  const userId = (session?.user as any)?._id?.toString()
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  try {
    const role = (session?.user as any)?.role
    const isAdmin = role === 'admin' || role === 'super admin'

    const event = await Events.findById(eventId).select('_id ownerId')
    if (!event) {
      return res.status(404).json({ message: 'Event not found' })
    }
    if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to view bookings for this event' })
    }

    const bookings = await Bookings.find({ eventId: eventId })
      .select('-payment.paymentIntentId -payment.checkoutSessionId')

    return res.status(200).json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return res.status(500).json({ message: 'Error fetching bookings' })
  }
}
