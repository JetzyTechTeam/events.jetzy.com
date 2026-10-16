import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import { z } from "zod";
import { EventInvitation } from "@/models/events/event-invitations";
import { Events } from "@/models/events";
import { ensureDbConnected } from "@/configs/database";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]";
import { isPendingAdminApproval, PENDING_APPROVAL_MESSAGE } from "@/lib/event-approval";
import { mailFrom } from "@/lib/send-grid";
import {
  GUEST_IMPORT_MAX,
  firstNameOf,
  guestEmailKey,
  isGuestEmail,
  normalizeGuestEmail,
  normalizeGuestName,
  type ImportedGuest,
} from "@/lib/guest-import";

sendgrid.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim());

/** Concurrent SendGrid calls at a time. An imported list can be hundreds of guests. */
const SEND_CHUNK = 50;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const bodySchema = z.object({
  // `invitees` carries a name per guest (typed, or imported from a spreadsheet). `emails` is the
  // older address-only shape, still accepted so a stale tab keeps working.
  invitees: z.array(z.object({ email: z.string(), name: z.string().optional() })).optional(),
  emails: z.array(z.string()).optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  eventLink: z.string().min(1),
  eventId: z.string().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await ensureDbConnected();

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Event ID, link and at least one guest are required" });
    }
    const { subject, message, eventLink, eventId } = parsed.data;

    // Normalise, validate and de-duplicate here too — the list may come straight from a host's
    // spreadsheet, and the dialog's checks are a preview, not a guarantee.
    const raw: ImportedGuest[] = parsed.data.invitees
      ? parsed.data.invitees.map((g) => ({ email: normalizeGuestEmail(g.email), name: normalizeGuestName(g.name) }))
      : (parsed.data.emails || []).map((email) => ({ email: normalizeGuestEmail(email), name: "" }));

    const seen = new Set<string>();
    const invitees: ImportedGuest[] = [];
    const invalid: string[] = [];
    for (const g of raw) {
      if (!isGuestEmail(g.email)) {
        if (g.email) invalid.push(g.email);
        continue;
      }
      const key = guestEmailKey(g.email);
      if (seen.has(key)) continue;
      seen.add(key);
      invitees.push(g);
    }

    if (invitees.length === 0) {
      return res.status(400).json({
        message: invalid.length ? `No valid email addresses (e.g. "${invalid[0]}")` : "No emails provided",
      });
    }
    if (invitees.length > GUEST_IMPORT_MAX) {
      return res.status(400).json({
        message: `You can invite up to ${GUEST_IMPORT_MAX} guests at a time — this list has ${invitees.length}. Split it and send in parts.`,
      });
    }

    // This route was previously unauthenticated and never loaded the event, which made it
    // an open relay: anyone could send arbitrary email with a custom subject and body
    // through our SendGrid account. Require a session and event ownership.
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const event = await Events.findById(eventId).select("_id ownerId privacy adminApprovalStatus");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const role = (session?.user as any)?.role;
    const isAdmin = role === "admin" || role === "super admin";
    if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
      return res.status(403).json({ message: "You can only invite guests to your own events" });
    }

    // Guests can't open a pending event yet — an invite would land them on the
    // "not yet approved" page.
    if (isPendingAdminApproval(event as any)) {
      return res.status(403).json({ message: PENDING_APPROVAL_MESSAGE });
    }

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ message: "Email service not configured." });
    }

    const title = subject?.trim() || "You're Invited!";
    const safeTitle = escapeHtml(title);
    // Host-typed text: escaped (it was interpolated raw), with their line breaks kept.
    const safeMessage = message?.trim() ? escapeHtml(message.trim()).replace(/\r?\n/g, "<br/>") : "";

    const sendOne = (guest: ImportedGuest) => {
      const personalizedEventLink = `${eventLink}?email=${encodeURIComponent(guest.email)}`;
      const safeLink = escapeHtml(personalizedEventLink);
      const firstName = firstNameOf(guest.name);
      return sendgrid.send({
        to: guest.email,
        // A bare address string displays as "contact" in the inbox — always `mailFrom()`.
        from: mailFrom(),
        subject: title,
        html: `
          <div style="font-family:Arial,sans-serif;background:#f9f9f9;padding:40px 0;">
            <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.07);padding:32px;">
              <h2 style="color:#2d3748;text-align:center;">${safeTitle}</h2>
              ${firstName ? `<p style="font-size:16px;color:#2d3748;text-align:center;margin-bottom:4px;">Hi ${escapeHtml(firstName)},</p>` : ""}
              <p style="font-size:16px;color:#4a5568;text-align:center;">
                You have been invited to join a special event.
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;"/>
              ${safeMessage ? `<p style="font-size:15px;color:#4a5568;font-style:italic;text-align:center;">"${safeMessage}"</p>` : ""}
              <div style="text-align:center;margin:28px 0;">
                <a href="${safeLink}" target="_blank"
                   style="display:inline-block;background:#F79432;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:18px;font-weight:bold;">
                  View Event &amp; RSVP
                </a>
              </div>
              <p style="font-size:13px;color:#a0aec0;text-align:center;">
                If the button does not work, copy this link:<br/>
                <a href="${safeLink}" target="_blank" style="color:#3182ce;">${safeLink}</a>
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;">
              <p style="font-size:12px;color:#a0aec0;text-align:center;">Sent via Jetzy Events</p>
            </div>
          </div>`,
      });
    };

    // Chunked + allSettled: one bad address must not fail the request after mail has already
    // gone to everyone else, and a 500-guest import must not open 500 connections at once.
    const sent: ImportedGuest[] = [];
    const failed: { email: string; reason: string }[] = [];
    for (let i = 0; i < invitees.length; i += SEND_CHUNK) {
      const chunk = invitees.slice(i, i + SEND_CHUNK);
      const results = await Promise.allSettled(chunk.map(sendOne));
      results.forEach((r, j) => {
        if (r.status === "fulfilled") {
          sent.push(chunk[j]);
          return;
        }
        const err: any = r.reason;
        const reason = err?.response?.body?.errors?.[0]?.message || err?.message || "Could not be sent";
        console.error("send-invites: send failed", chunk[j].email, reason);
        failed.push({ email: chunk[j].email, reason });
      });
    }

    // Record only the invitations that actually went out, so the Guests tab never lists someone
    // as "Invited" who never got the email.
    if (sent.length) {
      await EventInvitation.create(sent.map((g) => ({ email: g.email, name: g.name, eventId })));
    }

    if (sent.length === 0) {
      return res.status(502).json({ message: "None of the invitations could be sent", sent: 0, failed });
    }

    return res.status(200).json({
      message: `Invitations sent to ${sent.length} ${sent.length === 1 ? "person" : "people"}`,
      sent: sent.length,
      failed,
      skippedInvalid: invalid,
    });
  } catch (error: any) {
    console.error("send-invites error:", error?.response?.body || error?.message || error);
    return res.status(500).json({ message: error?.message || "Something went wrong" });
  }
}
