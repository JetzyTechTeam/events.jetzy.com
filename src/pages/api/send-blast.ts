import { EventInvitation } from "@/models/events/event-invitations";
import { Bookings } from "@/models/events/bookings";
import { ensureDbConnected } from "@/configs/database";
import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import mongoose from "mongoose";
import { BookingStatus } from "@/models/events/types";

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string);

export default async function sendBlast(req: NextApiRequest, res: NextApiResponse) {
  await ensureDbConnected()
  const { status, subject, message, eventLink, event, targetType, emailType } = req.body;

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
          You are registered for <strong>${event.name}${event.name === 'Chinese Mid-Autumn Rooftop Celebration' ? ' on October 23rd between 6:00 PM and 9:00 PM New York time' : ''}</strong> with email
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
          You are registered for <strong>${event.name}${event.name === 'Chinese Mid-Autumn Rooftop Celebration' ? ' on October 23rd between 6:00 PM and 9:00 PM New York time' : ''}</strong> with email
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
  `;

    findPeople.forEach(async (person) => {
      // Create personalized HTML with booking reference if available
      let personalizedHtml = html;

      // Replace user email placeholder
      const userEmail = (person as any).email || (person as any).customerEmail;
      personalizedHtml = personalizedHtml.replace('{{userEmail}}', userEmail);

      if (targetType === 'bookings' && 'bookingRef' in person && person.bookingRef) {
        personalizedHtml = personalizedHtml.replace('{{bookingRef}}', person.bookingRef);
      } else {
        // Remove the cancel section for non-booking targets
        personalizedHtml = personalizedHtml.replace(/<div style="background: #f8f9fa; border-left: 4px solid #dc3545; padding: 16px; margin: 24px 0; border-radius: 4px;">[\s\S]*?<\/div>/g, '');
      }

      await sendgrid.sendMultiple({
        to: (person as any).email || (person as any).customerEmail,
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