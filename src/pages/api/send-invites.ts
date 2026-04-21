import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import { EventInvitation } from "@/models/events/event-invitations";
import { ensureDbConnected } from "@/configs/database";

sendgrid.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim());

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await ensureDbConnected();

    const { emails, subject, message, eventLink, eventId } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "No emails provided" });
    }

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ message: "Email service not configured." });
    }

    await Promise.all(
      emails.map((email: string) => {
        const personalizedEventLink = `${eventLink}?email=${encodeURIComponent(email)}`;
        return sendgrid.send({
          to: email,
          from: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
          subject: subject || "You're Invited!",
          html: `
          <div style="font-family:Arial,sans-serif;background:#f9f9f9;padding:40px 0;">
            <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.07);padding:32px;">
              <h2 style="color:#2d3748;text-align:center;">${subject || "You're Invited!"}</h2>
              <p style="font-size:16px;color:#4a5568;text-align:center;">
                You have been invited to join a special event.
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;"/>
              ${message ? `<p style="font-size:15px;color:#4a5568;font-style:italic;text-align:center;">"${message}"</p>` : ""}
              <div style="text-align:center;margin:28px 0;">
                <a href="${personalizedEventLink}" target="_blank"
                   style="display:inline-block;background:#F79432;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:18px;font-weight:bold;">
                  View Event &amp; RSVP
                </a>
              </div>
              <p style="font-size:13px;color:#a0aec0;text-align:center;">
                If the button does not work, copy this link:<br/>
                <a href="${personalizedEventLink}" target="_blank" style="color:#3182ce;">${personalizedEventLink}</a>
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;">
              <p style="font-size:12px;color:#a0aec0;text-align:center;">Sent via Jetzy Events</p>
            </div>
          </div>`,
        });
      })
    );

    await EventInvitation.create(
      emails.map((email: string) => ({ email, eventId }))
    );

    return res.status(200).json({ message: "Invitations sent successfully" });
  } catch (error: any) {
    console.error("send-invites error:", error?.response?.body || error?.message || error);
    return res.status(500).json({ message: error?.message || "Something went wrong" });
  }
}
