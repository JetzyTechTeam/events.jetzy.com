import { EventInvitation } from "@/models/events/event-invitations";
import { Bookings } from "@/models/events/bookings";
import { Events } from "@/models/events";
import { ensureDbConnected } from "@/configs/database";
import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import mongoose from "mongoose";
import { BookingStatus } from "@/models/events/types";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]";

sendgrid.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim());

export default async function sendBlast(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await ensureDbConnected()

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }

  const userRole = (session.user as any)?.role;
  const userId = (session.user as any)?._id?.toString();
  const isAdmin = userRole === "admin" || userRole === "super admin";

  const { status, subject, message, eventLink, event, targetType, emailType } = req.body;

  if (!event?._id) {
    return res.status(400).json({ error: "Event ID is required." });
  }

  if (!isAdmin) {
    const eventDoc = await Events.findOne({ _id: new mongoose.Types.ObjectId(event._id), isDeleted: false }, { ownerId: 1 }).lean();
    if (!eventDoc || (eventDoc as any).ownerId?.toString() !== userId) {
      return res.status(403).json({ error: "Access denied. You can only send blasts for your own events." });
    }
  }

  try {
    let findPeople;

    // Check if we're targeting bookings or invitations
    if (targetType === 'bookings') {
      // Find people with bookings for this event
      findPeople = await Bookings.find({
        eventId: new mongoose.Types.ObjectId(event._id),
        status: status === 'all' ? { $ne: BookingStatus.CANCELLED } : status,
      }).select('customerEmail customerName bookingRef')
    } else {
      // Default to invitations (existing behavior)
      findPeople = await EventInvitation.find({
        eventId: new mongoose.Types.ObjectId(event._id),
        status: status,
      })
    }

    if (!findPeople || findPeople.length === 0) {
      return res.status(404).json({ error: "No people found" });
    }

    // Create different email templates based on emailType
    const html = emailType === 'availability' ? `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px;">
        <h2 style="color: #2B6CB0; margin-bottom: 16px;">${subject}</h2>
        <p style="font-size: 16px; color: #333; margin-bottom: 16px;">
          You are registered for <strong>${event.name}</strong> with email
        </p>
        <p style="font-size: 18px; color: #333; margin-bottom: 16px; font-weight: bold;">
          {{userEmail}}
        </p>
        <p style="font-size: 16px; color: #333; margin-bottom: 16px;">
          This event is now full.<br/>
          If you can not attend, kindly cancel to make room for people on waitlist.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${process.env.NEXT_PUBLIC_URL}/cancel-booking?bookingRef={{bookingRef}}" style="display: inline-block; padding: 20px 40px; background: #dc3545; color: #fff; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 20px;">
            Cancel My Booking
          </a>
        </div>
        <p style="font-size: 16px; color: #333; margin-bottom: 24px;">
          ${message}
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${eventLink}" style="display: inline-block; padding: 12px 24px; background: #2B6CB0; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Event Details
          </a>
        </div>
        <p style="font-size: 12px; color: #888; margin-top: 32px;">
          If you have any questions, please contact us at contact@jetzyapp.com.<br/>
          &copy; ${new Date().getFullYear()} Jetzy Events
        </p>
      </div>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px;">
        <h2 style="color: #2B6CB0; margin-bottom: 16px;">${subject}</h2>
        <p style="font-size: 16px; color: #333; margin-bottom: 16px;">
          Hi {{userEmail}},
        </p>
        <p style="font-size: 16px; color: #333; margin-bottom: 24px;">
          ${message}
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${eventLink}" style="display: inline-block; padding: 12px 24px; background: #2B6CB0; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Event Details
          </a>
        </div>
        <p style="font-size: 12px; color: #888; margin-top: 32px;">
          If you have any questions, please contact us at contact@jetzyapp.com.<br/>
          &copy; ${new Date().getFullYear()} Jetzy Events
        </p>
      </div>
    </div>
  `;

    await Promise.all(findPeople.map(async (person) => {
      let personalizedHtml = html;

      const userEmail = (person as any).email || (person as any).customerEmail;
      personalizedHtml = personalizedHtml.replace('{{userEmail}}', userEmail);

      if (targetType === 'bookings' && 'bookingRef' in person && person.bookingRef) {
        personalizedHtml = personalizedHtml.replace('{{bookingRef}}', person.bookingRef);
      } else {
        // Strip the cancel booking button block for non-booking targets
        personalizedHtml = personalizedHtml.replace(
          /<div style="text-align: center; margin-bottom: 24px;">\s*<a href="[^"]*cancel-booking[^"]*"[\s\S]*?<\/a>\s*<\/div>/g,
          ''
        );
      }

      await sendgrid.send({
        to: userEmail,
        from: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
        subject: subject,
        html: personalizedHtml,
      })
    }))

    return res.status(200).json({ message: "Blast sent successfully" });

  } catch (error) {
    return res.status(500).json({ error: "Failed to send blast" });
  }
}