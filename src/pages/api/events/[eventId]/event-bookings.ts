import { Bookings } from "@/models/events/bookings";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  try {
    // Ensure database connection is ready
    const { dbconn } = await import("@/configs/database")
    if (dbconn.readyState !== 1) {
      console.log("[event-bookings] Database not connected, attempting to connect...")
      try {
        await Promise.race([
          dbconn.asPromise(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection timeout")), 30000)
          )
        ])
      } catch (connError: any) {
        console.error("[event-bookings] Database connection failed:", connError.message)
        return res.status(500).json({ message: "Database connection failed" })
      }
    }

    const bookings = await Bookings.find({ eventId: eventId })
      .select('_id bookingRef eventId tickets status customerName customerEmail customerPhone subTotal tax total createdAt qrCodeToken stripeSessionId')
      .lean();

    console.log(`[event-bookings] Found ${bookings.length} bookings for event ${eventId}`)

    // For pending bookings with stripeSessionId, retrieve the payment URL from Stripe
    const bookingsWithPaymentUrl = await Promise.all(
      bookings.map(async (booking: any) => {
        if (booking.status === 'pending' && booking.stripeSessionId) {
          console.log(`[event-bookings] Retrieving payment URL for pending booking ${booking._id} with session ${booking.stripeSessionId}`)
          try {
            const { default: Stripe } = await import('stripe')
            const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
            const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId)
            
            console.log(`[event-bookings] Session details for booking ${booking._id}:`, {
              id: session.id,
              payment_status: session.payment_status,
              status: session.status,
              expires_at: session.expires_at,
              expires_at_date: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
              hasUrl: !!session.url,
              url: session.url
            })
            
            // Check if session has expired
            if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
              console.log(`[event-bookings] Session expired for booking ${booking._id}`)
              return {
                ...booking,
                paymentUrl: null,
              }
            }
            
            // Check if session is already completed
            if (session.payment_status === 'paid' || session.status === 'complete') {
              console.log(`[event-bookings] Session already completed for booking ${booking._id}`)
              return {
                ...booking,
                paymentUrl: null,
              }
            }
            
            console.log(`[event-bookings] Retrieved payment URL for booking ${booking._id}: ${session.url}`)
            return {
              ...booking,
              paymentUrl: session.url || null,
            }
          } catch (error: any) {
            console.error(`[event-bookings] Error retrieving Stripe session for booking ${booking._id}:`, {
              message: error.message,
              code: error.code,
              type: error.type
            })
            return {
              ...booking,
              paymentUrl: null,
            }
          }
        } else if (booking.status === 'pending') {
          console.log(`[event-bookings] Pending booking ${booking._id} has no stripeSessionId - bookingRef: ${booking.bookingRef}`)
          // Still return the booking with stripeSessionId if it exists (even if null)
          return {
            ...booking,
            stripeSessionId: booking.stripeSessionId || undefined,
            paymentUrl: null,
          }
        }
        return {
          ...booking,
          stripeSessionId: booking.stripeSessionId || undefined,
        }
      })
    )

    console.log(`[event-bookings] Returning ${bookingsWithPaymentUrl.length} bookings`)

    return res.status(200).json(bookingsWithPaymentUrl);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ message: "Error fetching bookings" });
  }
}
