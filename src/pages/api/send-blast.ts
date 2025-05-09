import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import mongoose from "mongoose";

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string);

export default async function sendBlast(req: NextApiRequest, res: NextApiResponse) {
  const { status, subject, message, eventLink, event } = req.body;

  try {

    const findPeople = await EventInvitation.find({
      eventId: new mongoose.Types.ObjectId(event._id),
      status: status,
    })

    if (!findPeople) {
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
        <a href="${eventLink}" style="display: inline-block; padding: 12px 24px; background: #2B6CB0; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold;">
          View Event Details
        </a>
        <p style="font-size: 12px; color: #888; margin-top: 32px;">
          If you have any questions, please contact us.<br/>
          &copy; ${new Date().getFullYear()} Jetzy Events
        </p>
      </div>
    </div>
  `;

    findPeople.forEach(async (person) => {
      await sendgrid.sendMultiple({
        to: person.email,
        from: process.env.SENDGRID_EMAIL_SENDER as string,
        subject: subject,
        html,
      })
    })

    return res.status(200).json({ message: "Blast sent successfully" });
    
  } catch (error) {
    return res.status(500).json({ error: "Failed to send blast" });
  }
}