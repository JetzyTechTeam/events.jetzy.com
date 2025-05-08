import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const { emails, subject, message, eventLink } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "No emails provided" });
    }
    
    const msg = {
      to: emails,
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: subject || "You're Invited!",
      html: `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px 0;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
          <h2 style="color: #2d3748; text-align: center;">${subject}</h2>
          <p style="font-size: 16px; color: #4a5568; text-align: center;">
            We are excited to invite you to join our special event.
          </p>
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <p>${message}</p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${eventLink}" target="_blank" style="display: inline-block; background: #3182ce; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 18px; font-weight: bold;">
              View Event & RSVP
            </a>
          </div>
          <p style="font-size: 14px; color: #a0aec0; text-align: center;">
            If the button above does not work, copy and paste this link into your browser:<br/>
            <a href="${eventLink}" target="_blank" style="color: #3182ce;">${eventLink}</a>
          </p>
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #a0aec0; text-align: center;">
            This invitation was sent via Jetzy Events.
          </p>
        </div>
      </div>
    `,
    };

    await sendgrid.sendMultiple(msg);

    return res.status(200).json({ message: "Invitations sent successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
}