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
import { blastAttachmentRefusal, type BlastAttachment } from "@/lib/blast-attachments";
import { fetchBlastAttachments } from "@/lib/blast-attachments-server";
import { blastFallbackName, buildBlastHtml, personalizeBlastHtml } from "@/lib/blast-template";
import {
  BLAST_TEST_MAX_PER_WINDOW,
  BLAST_TEST_RATE_LIMIT_MESSAGE,
  BLAST_TEST_WINDOW_MS,
  normalizeTestAddress,
} from "@/lib/blast-test-send";
import { isRateLimited } from "@/lib/rate-limit";

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

  const { status, subject, message, eventLink, event, targetType, emailType, attachments, testTo, greetByName } = req.body;

  // Trimmed at the ENDS only. A pasted subject routinely carries a trailing newline, which lands
  // both in the <h1> and in the SendGrid `subject` header; a message often carries leading blank
  // lines from a paste. Inner whitespace is left exactly as typed - hosts separate paragraphs with
  // blank lines, and collapsing those would silently rewrite their copy.
  const blastSubject = typeof subject === "string" ? subject.trim() : "";
  const blastMessage = typeof message === "string" ? message.trim() : "";

  if (!event?._id) {
    return res.status(400).json({ error: "Event ID is required." });
  }

  // The client already refused these in the picker; this is the authoritative check. A supplied
  // list is a request, not a fact -- the same rule `free-events.ts` applies to prices.
  const attachmentList: BlastAttachment[] = Array.isArray(attachments) ? attachments : [];
  const attachmentRefusal = blastAttachmentRefusal(attachmentList);
  if (attachmentRefusal) {
    return res.status(400).json({ error: attachmentRefusal });
  }

  // A test send is ONE email, to an address the host types, and writes no `Blasts` record.
  //
  // It used to be locked to the session's own address. That was too tight: the person operating
  // the console is often not the person who has to approve the email, and forwarding it by hand
  // changes the headers and the rendering, which defeats the point of a test. What stands in for
  // that check is below - a session, the admin-or-owner check further down (a stranger cannot
  // reach this route at all, which is the difference between this and the unauthenticated
  // `premium/send-code`), and a per-account ceiling so it cannot be driven as a mailing tool.
  const isTestSend = typeof testTo === "string" && testTo.trim().length > 0;
  let testAddress = "";
  if (isTestSend) {
    const normalized = normalizeTestAddress(testTo);
    // Narrowed on `email` rather than on `error`: the success arm is the one that carries the
    // address, so this is the check that makes it a string for the send below.
    if (!normalized.email) {
      return res.status(400).json({ error: normalized.error });
    }
    testAddress = normalized.email;

    // Keyed on the ACCOUNT, not the IP: hosts in one office behind a single address would
    // otherwise eat each other's allowance.
    if (isRateLimited(`blast-test:${userId}`, BLAST_TEST_MAX_PER_WINDOW, BLAST_TEST_WINDOW_MS)) {
      return res.status(429).json({ error: BLAST_TEST_RATE_LIMIT_MESSAGE });
    }
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

    // A test send has one recipient of its own and does not care who is on the guest list -
    // the whole point is to rehearse the email BEFORE anyone has booked, which is exactly when
    // this query legitimately returns nothing.
    if (!isTestSend && (!findPeople || findPeople.length === 0)) {
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

    // The attachments are fetched ONCE here, before the recipient loop, and the same array is
    // handed to every send - one CDN round trip per image, not one per guest.
    const fetched = await fetchBlastAttachments(attachmentList);
    if (fetched.skipped.length > 0) {
      // Never fatal: refusing to send a written blast because one picture 404'd is a worse
      // outcome for the host than an email that goes out with two images instead of three.
      console.warn("Blast attachments skipped:", fetched.skipped);
    }

    // Built by `src/lib/blast-template.ts`, which the preview modal also calls - so what the
    // host is shown before sending and what the guest receives cannot drift apart.
    const html = buildBlastHtml({
      subject: blastSubject,
      message: blastMessage,
      eventName: event.name,
      eventLink: recipientEventLink,
      footerContact,
      emailType,
      baseUrl: process.env.NEXT_PUBLIC_URL || "",
      images: fetched.images,
      // Link-mode files: a url in the body, nothing carried per recipient.
      links: fetched.links,
      // Absent reads as TRUE - every blast sent before the toggle existed opened with "Hi <name>,".
      greetByName: greetByName !== false,
    });
    const sendGridAttachments = fetched.attachments;

    // A test send stops here: ONE email, to the address the host typed, and NO `Blasts` record.
    // The history is a log of what guests received; a rehearsal nobody else saw does not belong
    // in it, and writing one would inflate every count on the Blasts tab.
    if (isTestSend) {
      await sendgrid.send({
        to: testAddress,
        from: mailFrom(undefined, senderName),
        ...(replyTo ? { replyTo } : {}),
        subject: blastSubject,
        html: personalizeBlastHtml(html, {
          userName: ((session.user as any)?.name || "").trim() || blastFallbackName(testAddress),
          userEmail: testAddress,
          // No bookingRef: a host testing an `availability` blast holds no booking of their own,
          // so the Cancel Booking block is stripped exactly as it is for an invitation recipient.
        }),
        ...(sendGridAttachments.length > 0 ? { attachments: sendGridAttachments } : {}),
      })

      return res.status(200).json({
        message: `Test blast sent to ${testAddress}.`,
        sentTo: testAddress,
        test: true,
        skippedAttachments: fetched.skipped,
      });
    }

    const results = await Promise.allSettled(findPeople.map(async (person) => {
      let personalizedHtml = html;

      const userEmail = (person as any).email || (person as any).customerEmail;
      const userName = ((person as any).customerName || (person as any).name || "").trim() || userEmail?.split("@")[0] || "there";
      // Token substitution lives in `blast-template.ts`, beside the markup those tokens are
      // written into, so the preview and the real send personalize identically.
      personalizedHtml = personalizeBlastHtml(personalizedHtml, {
        userName,
        userEmail,
        bookingRef: targetType === 'bookings' && 'bookingRef' in person ? (person as any).bookingRef : undefined,
      });

      await sendgrid.send({
        to: userEmail,
        // Through `mailFrom` rather than a bare address string — a bare string makes mail
        // clients render the sender as "contact" (the mailbox name), which is the exact bug
        // `mailFrom` exists to prevent. The ADDRESS is unchanged, so sender verification and
        // domain reputation are untouched; only the display name moves.
        from: mailFrom(undefined, senderName),
        ...(replyTo ? { replyTo } : {}),
        subject: blastSubject,
        html: personalizedHtml,
        // The same base64 payload rides on every message - SendGrid has no notion of a shared
        // attachment, which is why the ceilings in `blast-attachments.ts` are per-blast.
        ...(sendGridAttachments.length > 0 ? { attachments: sendGridAttachments } : {}),
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
          subject: blastSubject,
          message: blastMessage,
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
          // Written only when there were some. The field has no default, so a blast sent with
          // no images stays indistinguishable from one sent before attachments existed - which
          // is the honest reading of both.
          ...(attachmentList.length > 0 ? { attachments: attachmentList } : {}),
          greetByName: greetByName !== false,
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

    // Name the number. "Blast sent successfully" left the host with no idea whether it reached
    // nine guests or one.
    return res
      .status(200)
      .json({ message: `Sent to ${succeeded} ${succeeded === 1 ? "person" : "people"}.`, sent: succeeded });

  } catch (error: any) {
    console.error("Send blast error:", error?.response?.body || error)
    const detail = error?.response?.body?.errors?.[0]?.message
    return res.status(500).json({ error: detail || "Failed to send blast" });
  }
}