import { EventInvitation } from "@/models/events/event-invitations";
import { Bookings } from "@/models/events/bookings";
import { Blasts } from "@/models/events/blast";
import { Events } from "@/models/events";
import { ensureDbConnected } from "@/configs/database";
import { NextApiRequest, NextApiResponse } from "next";
import sendgrid from "@sendgrid/mail";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]";
import { isPendingAdminApproval, PENDING_APPROVAL_MESSAGE } from "@/lib/event-approval";
import { eventUrl } from "@/lib/event-slug";
import { resolveEventOwner } from "@/lib/event-owner";
import { mailFrom, blastSenderName } from "@/lib/send-grid";
import type { BlastRecipient } from "@/lib/blast-delivery";

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

  // Loaded for everyone (not just non-admins) because the pending-approval gate depends
  // on event state, not on the caller's role.
  const eventDoc = await Events.findOne(
    { _id: new mongoose.Types.ObjectId(event._id), isDeleted: false },
    { ownerId: 1, privacy: 1, adminApprovalStatus: 1, slug: 1 },
  ).lean();
  if (!eventDoc) {
    return res.status(404).json({ error: "Event not found." });
  }

  if (!isAdmin && (eventDoc as any).ownerId?.toString() !== userId) {
    return res.status(403).json({ error: "Access denied. You can only send blasts for your own events." });
  }

  // Recipients can't open a pending event yet, so a blast would link them to the
  // "not yet approved" page.
  if (isPendingAdminApproval(eventDoc as any)) {
    return res.status(403).json({ error: PENDING_APPROVAL_MESSAGE });
  }

  // ---- Who is this blast FROM? ----
  //
  // The host's address CANNOT go in `from`: SendGrid rejects an unverified sender outright, and
  // a host address sent through our account fails SPF/DMARC alignment. So identity rides on the
  // display name ("Anna Khan via Jetzy") and `replyTo`, which is what Eventbrite and Luma do and
  // what `sendSupportRequestNotice` already does here.
  //
  // Admin-owned event, no ownerId, or an owner we can't resolve -> plain "Jetzy" with no
  // replyTo, i.e. exactly today's behaviour. `resolveEventOwner` never throws. A blast must not
  // fail because we couldn't work out who the host is.
  const owner = await resolveEventOwner(eventDoc as any);
  const sendAsHost = !!owner && !owner.isAdmin;
  const senderName = sendAsHost ? blastSenderName(owner!.displayName) : blastSenderName();
  const replyTo = sendAsHost ? owner!.email : undefined;

  // Build the recipient link here rather than trusting the client's `eventLink`: a
  // private Premium event needs its access code appended, and the host's own browser
  // often has no code in the URL because owners bypass the invite gate.
  const recipientEventLink = (eventDoc as any).slug
    ? eventUrl(process.env.NEXT_PUBLIC_URL || "", (eventDoc as any).slug)
    : eventLink;

  try {
    let findPeople;

    const eventObjectId = new mongoose.Types.ObjectId(event._id);

    // Check if we're targeting bookings, invitations, or all of them
    if (targetType === 'all') {
      // Everyone associated with the event: every booking (any status) + every invitation.
      const bookings = await Bookings.find({ eventId: eventObjectId }).select('customerEmail customerName bookingRef status')
      const invites = await EventInvitation.find({ eventId: eventObjectId })
      findPeople = [...bookings, ...invites]
    } else if (targetType === 'bookings') {
      // Find people with bookings for this event.
      // 'all' = every status (pending, approved, confirmed, cancelled, failed, refunded).
      const bookingFilter: any = { eventId: eventObjectId };
      if (status !== 'all') bookingFilter.status = status;
      findPeople = await Bookings.find(bookingFilter).select('customerEmail customerName bookingRef status')
    } else {
      // Invitations. 'all' drops the status filter (mirror bookings).
      const inviteFilter: any = { eventId: eventObjectId };
      if (status !== 'all') inviteFilter.status = status;
      findPeople = await EventInvitation.find(inviteFilter)
    }

    if (!findPeople || findPeople.length === 0) {
      return res.status(404).json({ error: "No people found" });
    }

    // Dedupe by email (case-insensitive) so a person with multiple bookings
    // gets a single email. Keep first record per email (preserves bookingRef).
    const seen = new Set<string>();
    findPeople = (findPeople as any[]).filter((p) => {
      const email = ((p.email || p.customerEmail) || '').toLowerCase().trim();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });

    // On a host-owned event the old footer was wrong: it told the guest to contact
    // contact@jetzyapp.com about a question only the host can answer. Replying now reaches the
    // host directly (see `replyTo` above), so the footer says so and names them.
    const footerContact = sendAsHost
      ? `Questions? Just reply to this email &mdash; it goes straight to ${owner!.displayName}.<br />Sent by ${owner!.displayName} via Jetzy Events`
      : `Questions? Contact us at <a href="mailto:${(process.env.SENDGRID_EMAIL_SENDER as string)?.trim()}" style="color: #F79432; text-decoration: none;">${(process.env.SENDGRID_EMAIL_SENDER as string)?.trim()}</a>`

    // Create different email templates based on emailType — Jetzy brand theme
    // (matches welcome/invitation emails: favicon logo, orange #F79432 CTA, white 600px card).
    const html = emailType === 'availability' ? `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
        </div>
        <h1 style="color: #333; text-align: center;">${subject}</h1>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          You are registered for <strong>${event.name}</strong> with email
        </p>
        <p style="font-size: 18px; color: #333; line-height: 1.6; font-weight: bold;">
          {{userEmail}}
        </p>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          This event is now full.<br/>
          If you can not attend, kindly cancel to make room for people on waitlist.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${process.env.NEXT_PUBLIC_URL}/cancel-booking?bookingRef={{bookingRef}}" style="display: inline-block; padding: 14px 30px; background-color: #dc3545; color: #fff; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Cancel My Booking
          </a>
        </div>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          ${message}
        </p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${recipientEventLink}" style="background-color: #F79432; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            View Event Details
          </a>
        </div>
        <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          ${footerContact}
          <br />
          &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
        </p>
      </div>
    </body>
    </html>
  ` : `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
        </div>
        <h1 style="color: #333; text-align: center;">${subject}</h1>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          Hi {{userName}},
        </p>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          ${message}
        </p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${recipientEventLink}" style="background-color: #F79432; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            View Event Details
          </a>
        </div>
        <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          ${footerContact}
          <br />
          &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
        </p>
      </div>
    </body>
    </html>
  `;

    const results = await Promise.allSettled(findPeople.map(async (person) => {
      let personalizedHtml = html;

      const userEmail = (person as any).email || (person as any).customerEmail;
      const userName = ((person as any).customerName || (person as any).name || "").trim() || userEmail?.split("@")[0] || "there";
      personalizedHtml = personalizedHtml.replace('{{userName}}', userName);
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
        // Through `mailFrom` rather than a bare address string — a bare string makes mail
        // clients render the sender as "contact" (the mailbox name), which is the exact bug
        // `mailFrom` exists to prevent. The ADDRESS is unchanged, so sender verification and
        // domain reputation are untouched; only the display name moves.
        from: mailFrom(undefined, senderName),
        ...(replyTo ? { replyTo } : {}),
        subject: subject,
        html: personalizedHtml,
      })
    }))

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    // Per-recipient outcome, so the history can answer "who didn't get it, and why" instead of
    // showing a bare "5/7 delivered". `sent` here means SendGrid ACCEPTED it — a bounce can
    // still arrive minutes later over the event webhook, which updates these rows in place.
    const recipientRows: BlastRecipient[] = findPeople.map((person: any, index: number) => {
      const outcome = results[index]
      const email = (person.email || person.customerEmail || "").trim()
      const name = ((person.customerName || person.name || "") as string).trim() || undefined

      if (outcome.status === 'fulfilled') {
        return { email, name, status: 'sent' }
      }

      const err: any = (outcome as PromiseRejectedResult).reason
      // SendGrid nests the useful sentence; fall back through the shapes it actually returns.
      const reason: string =
        err?.response?.body?.errors?.[0]?.message ||
        err?.message ||
        "The email could not be sent."
      return { email, name, status: 'failed', reason }
    })

    // Persist the blast in history (Blasts tab). Never let a logging failure
    // break an already-sent blast — best effort only.
    //
    // Recorded even when NOTHING succeeded. It used to be `if (succeeded > 0)`, which threw away
    // the record precisely when the host most needed it: a blast where every address failed left
    // no trace at all, and no way to find out why. A failed send is history too.
    {
      try {
        await Blasts.create({
          eventId: eventObjectId,
          subject: subject || "",
          message: message || "",
          targetType: targetType || "invitations",
          status: status || "all",
          emailType: emailType || "custom",
          recipientCount: findPeople.length,
          succeededCount: succeeded,
          failedCount: failed,
          sentBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
          sentByAdmin: isAdmin,
          // What the guests actually saw, and who a reply reaches.
          sentFromName: senderName,
          ...(replyTo ? { sentReplyTo: replyTo } : {}),
          recipients: recipientRows,
          sentAt: new Date(),
        })
      } catch (persistErr) {
        console.error("Failed to persist blast record:", persistErr)
      }
    }

    if (succeeded === 0) {
      const firstError = (results[0] as PromiseRejectedResult).reason
      const detail = firstError?.response?.body?.errors?.[0]?.message
      console.error("Send blast all failed:", firstError?.response?.body || firstError)
      return res.status(500).json({ error: detail || "Failed to send blast. No emails were delivered." })
    }

    if (failed > 0) {
      return res.status(207).json({ message: `Blast partially sent. ${succeeded} delivered, ${failed} failed.`, sent: succeeded, failed })
    }

    return res.status(200).json({ message: "Blast sent successfully", sent: succeeded });

  } catch (error: any) {
    console.error("Send blast error:", error?.response?.body || error)
    const detail = error?.response?.body?.errors?.[0]?.message
    return res.status(500).json({ error: detail || "Failed to send blast" });
  }
}