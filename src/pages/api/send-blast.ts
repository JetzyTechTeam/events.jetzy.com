import { EventInvitation } from "@/models/events/event-invitations";
import { Bookings } from "@/models/events/bookings";
import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import mongoose from "mongoose";
import { BookingStatus } from "@/models/events/types";

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string);

export default async function sendBlast(req: NextApiRequest, res: NextApiResponse) {
  const { status, subject, message, eventLink, event, targetType } = req.body;

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

    const html = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px;">
        <h2 style="color: #2B6CB0; margin-bottom: 16px;">${subject}</h2>
        <p style="font-size: 16px; color: #333; margin-bottom: 24px;">
          ${message}
        </p>
        <div style="margin-bottom: 24px;">
          <strong>Event:</strong> ${event.name}<br/>
          <strong>Date:</strong> ${event.startsOn ? new Date(event.startsOn).toLocaleString() : ""}<br/>
          <strong>Location:</strong> ${event.location}
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${eventLink}" style="display: inline-block; padding: 12px 24px; background: #2B6CB0; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 12px;">
            View Event Details
          </a>
        </div>
        <div style="background: #f8f9fa; border-left: 4px solid #dc3545; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #6c757d;">
            <strong>Need to cancel your booking?</strong><br/>
            If you can no longer attend this event and want to cancel your booking, click the button below to free up your ticket slots for other attendees.
          </p>
          <div style="text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_URL}/cancel-booking?bookingRef={{bookingRef}}" style="display: inline-block; padding: 10px 20px; background: #dc3545; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
              Cancel My Booking
            </a>
          </div>
        </div>
        <p style="font-size: 12px; color: #888; margin-top: 32px;">
          If you have any questions, please contact us.<br/>
          &copy; ${new Date().getFullYear()} Jetzy Events
        </p>
      </div>
    </div>
  `;

    findPeople.forEach(async (person) => {
      // Create personalized HTML with booking reference if available
      let personalizedHtml = html;
      if (targetType === 'bookings' && person.bookingRef) {
        personalizedHtml = html.replace('{{bookingRef}}', person.bookingRef);
      } else {
        // Remove the cancel section for non-booking targets
        personalizedHtml = html.replace(/<div style="background: #f8f9fa; border-left: 4px solid #dc3545; padding: 16px; margin: 24px 0; border-radius: 4px;">[\s\S]*?<\/div>/g, '');
      }

      await sendgrid.sendMultiple({
        to: person.email || person.customerEmail,
        from: process.env.SENDGRID_EMAIL_SENDER as string,
        subject: subject,
        html: personalizedHtml,
      })
    })

    return res.status(200).json({ message: "Blast sent successfully" });
    
  } catch (error) {
    return res.status(500).json({ error: "Failed to send blast" });
  }
}