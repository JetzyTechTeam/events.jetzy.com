import { IEvent } from "@/models/events/types"
// Aliased: several functions below declare a local `eventUrl`, which would shadow the import.
import { eventUrl as buildEventUrl, eventPath, eventAlbumUrl as buildEventAlbumUrl, eventAlbumPath } from "@/lib/event-slug"
import { buildTicketPricing, TicketPricing } from "@/lib/ticket-pricing"
import { mapsLinkFor, resolveEntrance, resolveGuestLocation } from "@/lib/event-location"
import { MoneyState } from "@/lib/booking-cancellation"
import { getEventZone } from "@/utils/eventTime"
import sgMail from "@sendgrid/mail"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

sgMail.setApiKey(process.env.SENDGRID_API_KEY?.trim() as string)

// Contact address shown in email footers — driven by the sender env var so a
// single change propagates everywhere. Falls back if the env var is missing.
/**
 * Who a Jetzy email is FROM.
 *
 * The address alone is not enough: passing `from: "contact@jetzyapp.com"` makes every mail
 * client show the sender as **contact**, which is what a booking confirmation was arriving as.
 * A `name` is the only thing that changes that, and it has to be the SAME name on every send —
 * a recipient sorting by sender should find one Jetzy, not three.
 *
 * The address is unchanged, so SendGrid sender verification and domain reputation are
 * untouched: only the display name moves.
 */
const SENDER_NAME = "Jetzy"

/** Where unwatermarked-photo requests are worked. Override with PHOTO_REQUEST_NOTIFICATION_EMAIL. */
const PHOTO_REQUEST_INBOX = "tech@jetzyapp.com"

const mailFrom = (email?: string) => ({
	email: (email || (process.env.SENDGRID_EMAIL_SENDER as string))?.trim(),
	name: SENDER_NAME,
})


const CONTACT_EMAIL = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim() || "contact@jetzyapp.com"

// Helper function to wrap HTML content in proper tags
const wrapHtml = (html: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${html}</body></html>`;

// Helper function to strip HTML tags for plain text version
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to strip HTML tags and decode HTML entities in event names
function decodeHTMLEntities(text: string): string {
  if (!text) return text
  // First strip HTML tags
  let cleaned = text.replace(/<[^>]*>/g, "")
  // Then decode HTML entities
  return cleaned
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim()
}

type TicketEmailData = {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  phone: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
    desc: string
  }>
  orderNumber: string
  isNewUser?: boolean
  qrCodeImageUrl?: string
  guestEmails?: string[] // Array of guest email addresses
  referralCode?: string
  discountAmount?: number
  discountPercentage?: number
  approvalContext?: boolean // true when sent as a Require-Approval acceptance (celebratory header + subject)
  amountCharged?: number // paid approvals only: the hold has just been captured, so say so
  /**
   * Itemised order total. Preferred over the legacy referralCode/discountAmount trio —
   * when absent the summary falls back to those, or to a plain subtotal/total derived
   * from `tickets`, so every confirmation shows a total either way.
   */
  pricing?: TicketPricing
}

type BookingCancellationData = {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  phone: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
    desc: string
  }>
  orderNumber: string
  totalAmount: number
  /**
   * Where the money sat when the booking was cancelled. Drives which money block the
   * email renders. Omitted (legacy callers) falls back to "free" — no money claim at all,
   * which is the only safe default now that Jetzy issues no refunds.
   */
  moneyState?: MoneyState
  /** Who pulled the trigger; changes the opening line ("you cancelled" vs "the host cancelled"). */
  cancelledBy?: "guest" | "host" | "admin"
}

type HostCancellationNoticeData = {
  event: IEvent
  eventId: string
  guestName: string
  guestEmail: string
  guestPhone?: string
  ticketCount: number
  orderNumber: string
  totalAmount: number
  moneyState: MoneyState
  cancelledBy: "guest" | "host" | "admin"
  organizerEmail?: string
}

type WaitingListEmailData = {
  firstName: string
  lastName: string
  email: string
  eventName: string
}

type WaitingListApprovalData = {
  firstName: string
  lastName: string
  email: string
  eventName: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
  }>
  paymentUrl?: string
}

type EventInvitationData = {
  email: string
  eventName: string
  eventSlug: string
  eventDate: string
  eventLocation: string
  hostName: string
}

type BlastEmailData = {
  email: string
  eventName: string
  eventSlug: string
  eventDate: string
  eventLocation: string
  hostName: string
  emailType: "invitation" | "reminder" | "update" | "announcement" | "custom"
  subject: string
  customMessage: string
}

type DiscussionNotificationData = {
  email: string
  firstName: string
  lastName: string
  authorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
}

type TagNotificationData = {
  email: string
  firstName: string
  lastName: string
  authorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
}

type CommentNotificationData = {
  email: string
  firstName: string
  lastName: string
  commenterName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
  isPostAuthor?: boolean // true → "commented on your post", false → "commented in [event]"
}

type ThankYouNotificationData = {
  email: string
  firstName: string
  lastName: string
  eventName: string
  eventSlug: string
  magicToken: string
  formLink: string
}

type ReactionNotificationData = {
  email: string
  firstName: string
  lastName: string
  reactorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
}

type ViewMilestoneNotificationData = {
  email: string
  firstName: string
  lastName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  viewCount: number
}

type WelcomeEmailData = {
  email: string
  firstName?: string
  lastName?: string
  password?: string
  /** Extra sentence in the safety notice explaining where the account was created (e.g. an album). */
  context?: string
}

export const sendWaitingListApproval = async ({ firstName, lastName, email, eventName, tickets, paymentUrl }: WaitingListApprovalData) => {
  try {
    const totalTickets = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
    const totalAmount = tickets.reduce((sum, ticket) => sum + (ticket.price * ticket.quantity), 0)

    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: `Jetzy [Good News!] Your wait is over - ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Great News! Your Wait is Over! 🎉</h1>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h2 style="color: #155724; margin-bottom: 15px;">Tickets Available!</h2>
            <p style="color: #155724; margin: 0;">
              Congratulations! Spots have become available for "${eventName}" and you&apos;ve been selected from our waiting list.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Your Reserved Tickets</h2>
            ${tickets.map(ticket => `
              <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;">
                <h3 style="color: #333; margin: 0 0 10px 0;">${ticket.name}</h3>
                <p><strong>Quantity:</strong> ${ticket.quantity}</p>
                <p><strong>Price per ticket:</strong> $${ticket.price}</p>
                <p><strong>Subtotal:</strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
              </div>
            `).join('')}
            
            <div style="background-color: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 15px;">
              <h3 style="color: #333; margin: 0 0 10px 0;">Total: ${totalTickets} tickets - $${totalAmount.toFixed(2)}</h3>
            </div>
          </div>

          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="color: #856404; margin: 0 0 10px 0;">Important: Limited Time Offer</h3>
            <p style="color: #856404; margin: 0;">
              You have <strong>24 hours</strong> to complete your purchase. After this time, your reserved tickets will be released to the next person on the waiting list.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #F79432; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Complete Your Purchase Now
            </a>
          </div>
          
          <p style="margin-top: 30px; text-align: center; color: #666;">
            Thank you for your patience! We&apos;re excited to see you at the event.
          </p>
        </div>
      `),
      text: `Great News! Your wait is over for ${eventName}.\n\nTickets have become available and you've been selected from our waiting list. You have 24 hours to complete your purchase.\n\nTotal: ${totalTickets} tickets - $${totalAmount.toFixed(2)}\n\nVisit Jetzy Events to complete your purchase.`
    })
  } catch (error) {
    console.error("Failed to send waiting list approval:", error)
    throw error
  }
}

export const sendWaitingListNotification = async ({ firstName, lastName, email, eventName }: WaitingListEmailData) => {
  try {
    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: `Jetzy [Waiting List] ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">You're on the Waiting List!</h1>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h2 style="color: #856404; margin-bottom: 15px;">Event Capacity Reached</h2>
            <p style="color: #856404; margin: 0;">
              Unfortunately, the event "${eventName}" has reached its capacity limit. 
              However, we've added you to our waiting list and will notify you immediately 
              if spots become available.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">What happens next?</h2>
            <ul style="color: #333; line-height: 1.6;">
              <li>We'll monitor for any cancellations or capacity increases</li>
              <li>If a spot opens up, you'll be the first to know</li>
              <li>You'll receive an email with a special link to complete your purchase</li>
              <li>This link will be valid for 24 hours</li>
            </ul>
          </div>

          <div style="background-color: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8;">
            <h3 style="color: #0c5460; margin: 0 0 10px 0;">Important Notes:</h3>
            <p style="color: #0c5460; margin: 0;">
              • You'll have 24 hours to complete your purchase if a spot becomes available<br/>
              • If you don't respond within 24 hours, the spot will go to the next person on the list<br/>
              • You can check your waiting list status anytime by visiting the event page
            </p>
          </div>
          
          <p style="margin-top: 30px; text-align: center; color: #666;">
            Thank you for your interest in Jetzy events! We'll be in touch soon.
          </p>
        </div>
      `),
      text: `You're on the Waiting List for ${eventName}!\n\nUnfortunately, the event has reached its capacity, but we've added you to the waiting list. We'll notify you if a spot opens up.`
    })
  } catch (error) {
    console.error("Failed to send waiting list notification:", error)
    throw error
  }
}

type ApprovalEmailData = {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  tickets?: Array<{ name?: string; quantity: number }>
  eventId?: string
  /**
   * Present only for PAID approval requests, where the card is authorized but not
   * charged. Free/RSVP approvals omit it and every block below renders exactly as
   * it did before paid approval shipped.
   */
  payment?: {
    amount: number
    expiresAt?: Date | string | null
    /**
     * Present when the held ticket also sells memberships. They do NOT start until the host
     * approves — the hold merely covers their first period. One entry per product: a ticket
     * can sell both Jetzy Premium and Full Concierge, and a guest whose card is held for two
     * has to be told about both.
     */
    memberships?: Array<{
      /** Product name on its own, e.g. "Jetzy Premium". */
      label: string
      /**
       * The name as it reads where the word "membership" follows, e.g. "Jetzy Premium
       * membership" / "Full Concierge Membership". Stored separately in the registry because
       * `${label} membership` yields "Full Concierge Membership membership".
       */
      receiptLabel: string
      amount: number
      interval: string
    }>
  }
}

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`

const formatHoldDeadline = (expiresAt?: Date | string | null) => {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

// Sent to the attendee right after they check out on a Require-Approval event.
export const sendApprovalPending = async ({ event, firstName, email, tickets = [], payment }: ApprovalEmailData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log("[LOCALHOST MODE] sendApprovalPending skipped - would send to:", email)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const eventName = decodeHTMLEntities(event.name)
  const totalTickets = tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
  const holdDeadline = formatHoldDeadline(payment?.expiresAt)
  const holdBlock = payment
    ? `
          <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
            <p style="color: #0d47a1; margin: 0 0 10px 0; font-size: 16px;"><strong>You have not been charged.</strong></p>
            <p style="color: #333; margin: 0; line-height: 1.6;">
              We've placed a temporary authorization hold of <strong>${formatMoney(payment.amount)}</strong> on your card.
              If the host approves your request${holdDeadline ? ` by <strong>${holdDeadline}</strong>` : ""}, the hold converts to a
              charge and your ticket is emailed to you. If your request is declined${holdDeadline ? ` — or the host doesn't respond by then —` : ""}
              the hold is released automatically.
            </p>
            ${(payment.memberships || [])
      .map(
        (membership) => `<p style="color: #0d47a1; margin: 12px 0 0 0; line-height: 1.6;">
              That hold includes <strong>${formatMoney(membership.amount)}</strong> for your first
              ${membership.receiptLabel}. Your membership does <strong>not</strong> start
              unless the host approves — and if it does, it renews at
              ${formatMoney(membership.amount)} per ${membership.interval} until you cancel.
            </p>`,
      )
      .join("")}
            <p style="color: #666; margin: 12px 0 0 0; font-size: 13px;">
              Depending on your bank, a released hold can take 5&ndash;10 business days to disappear from your statement.
            </p>
          </div>`
    : ""
  const heldMembershipNames = (payment?.memberships || []).map((m) => m.label).join(" and ")
  const nextSteps = payment
    ? `
              <li>The host will review your request.</li>
              <li>If approved, your card is charged ${formatMoney(payment.amount)}${heldMembershipNames ? ` and your ${heldMembershipNames} membership begins` : ""}, and you'll receive your ticket by email.</li>
              <li>If declined, the hold is released${heldMembershipNames ? " and no membership is created" : ""} — you are not charged.</li>
              <li>No further action is needed from you right now.</li>`
    : `
              <li>The host will review your request.</li>
              <li>If approved, you'll receive a confirmation email with your ticket.</li>
              <li>No further action is needed from you right now.</li>`
  try {
    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: `Jetzy [Pending Approval] ${eventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Request Received — Pending Approval</h1>
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="color: #856404; margin: 0;">
              Hi ${firstName}, thanks for registering for "${eventName}". This event requires host approval.
              Your request${totalTickets ? ` for ${totalTickets} ticket(s)` : ""} has been submitted and is <strong>pending review</strong>.
            </p>
          </div>${holdBlock}
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">What happens next?</h2>
            <ul style="color: #333; line-height: 1.6;">${nextSteps}
            </ul>
          </div>
          <p style="margin-top: 30px; text-align: center; color: #666;">Thank you for your interest in Jetzy events!</p>
        </div>
      `),
      text: payment
        ? `Request Received — Pending Approval\n\nHi ${firstName}, your registration for "${eventName}" requires host approval and is pending review.\n\nYou have NOT been charged. We've placed a temporary authorization hold of ${formatMoney(payment.amount)} on your card${holdDeadline ? `, valid until ${holdDeadline}` : ""}. If the host approves, the hold converts to a charge and your ticket is emailed. If declined or unreviewed, the hold is released automatically. A released hold can take 5-10 business days to clear your statement.`
        : `Request Received — Pending Approval\n\nHi ${firstName}, your registration for "${eventName}" requires host approval and is pending review. You'll get a confirmation email if approved.`
    })
  } catch (error) {
    console.error("Failed to send approval-pending email:", error)
    throw error
  }
}

// Sent to the admin inbox (SENDGRID_EMAIL_SENDER = contact@jetzyapp.com). kind:
//   "request"  → a new attendee is awaiting approval
//   "approved" → a request was approved & confirmed (copy for records)
//   "expired"  → a PAID request's card hold lapsed before anyone acted. This is the only
//                fully async path — nobody is looking at a screen when it happens — so the
//                host would otherwise silently lose a paying guest.
export const sendAdminApprovalNotice = async ({
  event, firstName, lastName, email, tickets = [], eventId, kind, amountOnHold, holdExpiresAt, amountCharged,
}: ApprovalEmailData & {
  kind: "request" | "approved" | "expired"
  amountOnHold?: number
  holdExpiresAt?: Date | string | null
  amountCharged?: number
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log(`[LOCALHOST MODE] sendAdminApprovalNotice (${kind}) skipped - would send to admin for:`, email)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const adminEmail = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim()
  if (!adminEmail) {
    console.error("SENDGRID_EMAIL_SENDER not set — cannot send admin approval notice")
    return
  }
  const eventName = decodeHTMLEntities(event.name)
  const totalTickets = tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
  const manageUrl = `${baseUrl || "https://events.jetzy.com"}/console/events/${eventId || (event as any)._id}/manage?tab=approvals`
  const isRequest = kind === "request"
  const isExpired = kind === "expired"
  const deadline = formatHoldDeadline(holdExpiresAt)

  const heading = isRequest ? "New Approval Request" : isExpired ? "Card Hold Expired" : "Request Approved"
  const accent = isExpired ? "#DC2626" : "#F79432"
  const intro = isRequest
    ? "A new attendee is awaiting approval for the following event:"
    : isExpired
      ? "A card authorization expired before this request was reviewed. The guest was <strong>not</strong> charged and the hold has been released. They will need to book again."
      : "The following attendee has been approved and their booking is now confirmed:"

  const moneyLine = isRequest && amountOnHold
    ? `<p style="margin: 5px 0;"><strong>On hold:</strong> ${formatMoney(amountOnHold)}${deadline ? ` &mdash; expires ${deadline}` : ""}</p>`
    : kind === "approved" && amountCharged
      ? `<p style="margin: 5px 0;"><strong>Charged:</strong> ${formatMoney(amountCharged)}</p>`
      : isExpired && amountOnHold
        ? `<p style="margin: 5px 0;"><strong>Released (never charged):</strong> ${formatMoney(amountOnHold)}</p>`
        : ""

  const urgencyBanner = isRequest && amountOnHold && deadline
    ? `<div style="background-color: #fff3cd; padding: 12px 15px; border-radius: 8px; margin: 0 0 20px 0; border-left: 4px solid #ffc107;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              The card hold expires on <strong>${deadline}</strong>. After that it is released automatically and cannot be recovered.
            </p>
          </div>`
    : ""

  try {
    await sgMail.send({
      to: adminEmail,
      from: mailFrom(adminEmail),
      subject: isRequest
        ? `[Approval Needed] ${firstName} ${lastName} — ${eventName}`
        : isExpired
          ? `[Hold Expired] ${firstName} ${lastName} — ${eventName}`
          : `[Approved] ${firstName} ${lastName} — ${eventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid ${accent}; border-radius: 12px;">
          <h2 style="color: ${accent}; margin-top: 0;">${heading}</h2>
          ${urgencyBanner}
          <p style="color: #333; font-size: 16px;">${intro}</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Event:</strong> ${eventName}</p>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            ${totalTickets ? `<p style="margin: 5px 0;"><strong>Tickets:</strong> ${totalTickets}</p>` : ""}
            ${moneyLine}
          </div>
          ${isRequest ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${manageUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Review in Approvals
            </a>
          </div>` : ""}
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
            Automated notification from Jetzy Events.
          </p>
        </div>
      `),
      text: isRequest
        ? `New approval request for "${eventName}"\nName: ${firstName} ${lastName}\nEmail: ${email}\nTickets: ${totalTickets}${amountOnHold ? `\nOn hold: ${formatMoney(amountOnHold)}${deadline ? ` (expires ${deadline})` : ""}` : ""}\nReview: ${manageUrl}`
        : isExpired
          ? `Card hold expired for "${eventName}"\nName: ${firstName} ${lastName}\nEmail: ${email}${amountOnHold ? `\nReleased (never charged): ${formatMoney(amountOnHold)}` : ""}\nThe guest was not charged and must book again.`
          : `Approved & confirmed for "${eventName}"\nName: ${firstName} ${lastName}\nEmail: ${email}\nTickets: ${totalTickets}${amountCharged ? `\nCharged: ${formatMoney(amountCharged)}` : ""}`
    })
  } catch (error) {
    console.error("Failed to send admin approval notice:", error)
    // Non-fatal — do not throw; approval flow should not fail on admin email
  }
}

// Sent to the admin inbox (SENDGRID_EMAIL_SENDER) the first time a given user opens a
// given shared album after authenticating — so the team can see who logged in / signed up
// via an album share link. Fired once per (album, user); never throws (non-fatal).
export const sendAlbumAccessNotice = async ({
  recipientName,
  recipientEmail,
  action,
  eventName,
  eventSlug,
  albumTitle,
  albumId,
}: {
  recipientName: string
  recipientEmail: string
  action: "login" | "signup"
  eventName: string
  eventSlug: string
  albumTitle: string
  albumId: string
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log(`[LOCALHOST MODE] sendAlbumAccessNotice skipped - would notify admin for:`, recipientEmail)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  // Recipient is configurable so staging test traffic can be pointed at a different inbox
  // without touching the From address (SENDGRID_EMAIL_SENDER is the verified sender used
  // by every email the platform sends). Falls back to the sender if it isn't set.
  const senderEmail = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim()
  const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL as string)?.trim() || senderEmail
  if (!adminEmail || !senderEmail) {
    console.error("SENDGRID_EMAIL_SENDER / ADMIN_NOTIFICATION_EMAIL not set — cannot send album access notice")
    return
  }
  const cleanEventName = decodeHTMLEntities(eventName)
  const actionLabel = action === "signup" ? "signed up" : "logged in"
  const albumUrl = buildEventAlbumUrl(baseUrl || "", eventSlug, albumId)
  const when = new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC"
  try {
    await sgMail.send({
      to: adminEmail,
      from: mailFrom(senderEmail),
      subject: `[Album] ${recipientName} ${actionLabel} — ${cleanEventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid #F79432; border-radius: 12px;">
          <h2 style="color: #F79432; margin-top: 0;">New Album Viewer</h2>
          <p style="color: #333; font-size: 16px;">
            A user <strong>${actionLabel}</strong> from a shared album link and can now view it:
          </p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${recipientName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${recipientEmail}</p>
            <p style="margin: 5px 0;"><strong>Action:</strong> ${actionLabel}</p>
            <p style="margin: 5px 0;"><strong>Event:</strong> ${cleanEventName}</p>
            <p style="margin: 5px 0;"><strong>Album:</strong> ${albumTitle}</p>
            <p style="margin: 5px 0;"><strong>When:</strong> ${when}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${albumUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Open Album
            </a>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
            Automated notification from Jetzy Events.
          </p>
        </div>
      `),
      text: `New album viewer\nName: ${recipientName}\nEmail: ${recipientEmail}\nAction: ${actionLabel}\nEvent: ${cleanEventName}\nAlbum: ${albumTitle}\nWhen: ${when}\nOpen: ${albumUrl}`,
    })
  } catch (error) {
    console.error("Failed to send album access notice:", error)
    // Non-fatal — do not throw; album viewing should not fail on admin email
  }
}

// Sent to a person when someone tags them in an album photo.
export const sendAlbumTagNotification = async ({
  recipientEmail,
  recipientName,
  taggerName,
  eventName,
  eventSlug,
  albumTitle,
  albumId,
  mediaUrl,
}: {
  recipientEmail: string
  recipientName: string
  taggerName: string
  eventName: string
  eventSlug: string
  albumTitle: string
  albumId: string
  mediaUrl?: string
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log("[LOCALHOST MODE] sendAlbumTagNotification skipped - would send to:", recipientEmail)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const cleanEventName = decodeHTMLEntities(eventName)
  const albumUrl = buildEventAlbumUrl(baseUrl || "", eventSlug, albumId)
  try {
    await sgMail.send({
      to: recipientEmail,
      from: mailFrom(),
      subject: `${taggerName} tagged you in a photo from ${cleanEventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">You were tagged in a photo 📸</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Hi ${recipientName}, <strong>${taggerName}</strong> tagged you in a photo from
            <strong>${cleanEventName}</strong> (album: ${albumTitle}).
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${albumUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View the Photo
            </a>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
            You're receiving this because someone tagged you in a Jetzy event album.
          </p>
        </div>
      `),
      text: `${taggerName} tagged you in a photo from "${cleanEventName}" (album: ${albumTitle}).\n\nView it: ${albumUrl}`,
    })
  } catch (error) {
    console.error("Failed to send album tag notification:", error)
    // Non-fatal — tagging should not fail on email
  }
}

// Sent to every event attendee when the host publishes an album.
export const sendAlbumPublishedNotification = async ({
  recipientEmail,
  recipientName,
  eventName,
  eventSlug,
  albumTitle,
  albumId,
  coverUrl,
  magicToken,
}: {
  recipientEmail: string
  recipientName: string
  eventName: string
  eventSlug: string
  albumTitle: string
  albumId: string
  coverUrl?: string
  magicToken?: string
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log("[LOCALHOST MODE] sendAlbumPublishedNotification skipped - would send to:", recipientEmail)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const cleanEventName = decodeHTMLEntities(eventName)
  const root = baseUrl || "https://events.jetzy.com"
  const albumPath = eventAlbumPath(eventSlug, albumId)
  // Recipients are known event participants and the link lands in their own inbox, so
  // sign them straight in rather than making them fill in the name+email gate. Same
  // one-click pattern the discussion emails use.
  const albumUrl = magicToken
    ? `${root}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(albumPath)}`
    : `${root}${albumPath}`
  try {
    await sgMail.send({
      to: recipientEmail,
      from: mailFrom(),
      subject: `📸 The photos from ${cleanEventName} are up!`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">The photos are here! 🎉</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Hi ${recipientName}, the album <strong>${albumTitle}</strong> from
            <strong>${cleanEventName}</strong> has just been published. Take a look and find yourself!
          </p>
          ${coverUrl ? `
          <div style="text-align: center; margin: 25px 0;">
            <img src="${coverUrl}" alt="${albumTitle}" style="max-width: 100%; border-radius: 12px;" />
          </div>` : ""}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${albumUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View the Album
            </a>
          </div>
          <p style="margin-top: 30px; text-align: center; color: #666;">Thanks for being part of it!</p>
        </div>
      `),
      text: `The photos from "${cleanEventName}" are up!\n\nAlbum: ${albumTitle}\nView it: ${albumUrl}`,
    })
  } catch (error) {
    console.error("Failed to send album published notification:", error)
    throw error
  }
}

// Sent to the attendee when their approval request ends without a ticket — either the
// host declined it, or (paid only) the card hold lapsed before anyone reviewed it.
export const sendApprovalRejected = async ({ event, firstName, email, payment, reason = "declined" }: ApprovalEmailData & { reason?: "declined" | "expired" }) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log(`[LOCALHOST MODE] sendApprovalRejected (${reason}) skipped - would send to:`, email)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const eventName = decodeHTMLEntities(event.name)
  const isExpired = reason === "expired"
  // Share URL, not a plain event URL: a private Premium event needs its access code or
  // the "Book Again" button lands the guest on the invite-code wall.
  const eventUrl = buildEventUrl(baseUrl || "", (event as any).slug || "")

  const bodyText = isExpired
    ? `Hi ${firstName}, your request to attend "${eventName}" wasn't reviewed in time.`
    : `Hi ${firstName}, thank you for your interest in "${eventName}". Unfortunately, your request to attend could not be approved this time. We hope to see you at a future Jetzy event.`

  const refundBlock = payment
    ? `
          <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
            <p style="color: #0d47a1; margin: 0 0 10px 0; font-size: 16px;"><strong>You have not been charged.</strong></p>
            <p style="color: #333; margin: 0; line-height: 1.6;">
              The <strong>${formatMoney(payment.amount)}</strong> authorization hold on your card has been released.
            </p>
            <p style="color: #666; margin: 12px 0 0 0; font-size: 13px;">
              Depending on your bank, it may take 5&ndash;10 business days to clear from your statement.
            </p>
          </div>`
    : ""

  const rebookBlock = isExpired
    ? `<p style="text-align: center; margin: 25px 0;">
            <a href="${eventUrl}" style="background-color: #F79432; color: #000; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Book Again</a>
          </p>`
    : ""

  try {
    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: `Jetzy [Update] ${eventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Update on Your Request</h1>
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9C9C9C;">
            <p style="color: #333; margin: 0; line-height: 1.6;">${bodyText}</p>
          </div>${refundBlock}${rebookBlock}
          <p style="margin-top: 30px; text-align: center; color: #666;">Thank you for using Jetzy.</p>
        </div>
      `),
      text: `Update on Your Request\n\n${bodyText}${payment ? `\n\nYou have NOT been charged. The ${formatMoney(payment.amount)} hold on your card has been released. It may take 5-10 business days to clear from your statement.` : ""}${isExpired ? `\n\nIf you'd still like to attend, please book again: ${eventUrl}` : ""}`
    })
  } catch (error) {
    console.error("Failed to send approval-rejected email:", error)
    throw error
  }
}

export const sendEventInvitation = async ({ email, eventName, eventSlug, eventDate, eventLocation, hostName }: EventInvitationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  const eventUrl = buildEventUrl(baseUrl, eventSlug)

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      replyTo: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
      subject: `${hostName} invited you to ${decodeHTMLEntities(eventName)}`,
      text: `You're invited to ${decodeHTMLEntities(eventName)}!\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event details: ${eventUrl}\n\n--\nThis invitation was sent by ${hostName} via Jetzy Events`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">You're Invited!</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="margin-bottom: 25px;">
              <p style="color: #6B7280; font-size: 16px; line-height: 1.6; margin: 0;">
                ${hostName} has invited you to attend:
              </p>
            </div>

            <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #8B5CF6;">
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${decodeHTMLEntities(eventName)}</h2>
              
              <div style="margin-bottom: 12px;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📅 Date & Time</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventDate}</p>
              </div>
              
              <div style="margin-bottom: 0;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📍 Location</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventLocation}</p>
              </div>
            </div>

            <div style="text-align: center; margin: 35px 0 25px 0;">
              <a href="${eventUrl}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3); transition: all 0.2s;">
                View Event Details & RSVP
              </a>
            </div>

            <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #F59E0B;">
              <p style="color: #92400E; margin: 0; font-size: 14px; line-height: 1.6;">
                <strong>👉 Don't forget to RSVP!</strong><br/>
                Click the button above to confirm your attendance and get all the event details.
              </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
              <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                This invitation was sent by ${hostName} via Jetzy Events<br/>
                <a href="${eventUrl}" style="color: #8B5CF6; text-decoration: none;">View event</a> | 
                <a href="${eventUrl}" style="color: #8B5CF6; text-decoration: none;">Unsubscribe</a>
              </p>
              <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
                Jetzy Events, Inc.<br/>
                If you don't want to receive these emails, you can unsubscribe above.
              </p>
            </div>
          </div>
        </div>
      `),
    })
    console.log(`✅ Event invitation sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send event invitation email:", error)
    throw error
  }
}

export const sendBlastEmail = async ({
  email,
  eventName,
  eventSlug,
  eventDate,
  eventLocation,
  hostName,
  emailType,
  subject,
  customMessage,
}: BlastEmailData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  const eventUrl = buildEventUrl(baseUrl, eventSlug)

  // Dynamic button text and styling based on email type
  const buttonConfig = {
    invitation: { text: "View Event & RSVP", color: "#8B5CF6", emoji: "🎉" },
    reminder: { text: "View Event Details", color: "#F59E0B", emoji: "⏰" },
    update: { text: "See What Changed", color: "#3B82F6", emoji: "📢" },
    announcement: { text: "Read More", color: "#10B981", emoji: "📣" },
    custom: { text: "View Event", color: "#8B5CF6", emoji: "✉️" },
  }

  const config = buttonConfig[emailType]

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      replyTo: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
      subject,
      text: `${decodeHTMLEntities(eventName)}\n\n${customMessage}\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event: ${eventUrl}\n\n--\nSent by ${hostName} via Jetzy Events`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%); padding: 40px 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">${config.emoji} ${subject}</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="margin-bottom: 25px;">
              <p style="color: #6B7280; font-size: 16px; line-height: 1.6; margin: 0;">
                Message from ${hostName}:
              </p>
            </div>

            <div style="background: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${config.color};">
              <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${customMessage}</p>
            </div>

            <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); padding: 25px; border-radius: 12px; margin: 25px 0;">
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${decodeHTMLEntities(eventName)}</h2>
              
              <div style="margin-bottom: 12px;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase;">📅 Date & Time</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventDate}</p>
              </div>
              
              <div style="margin-bottom: 0;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase;">📍 Location</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventLocation}</p>
              </div>
            </div>

            <div style="text-align: center; margin: 35px 0 25px 0;">
              <a href="${eventUrl}" style="background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2); transition: all 0.2s;">
                ${config.text}
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
              <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                Sent by ${hostName} via Jetzy Events<br/>
                <a href="${eventUrl}" style="color: ${config.color}; text-decoration: none;">View event</a> | 
                <a href="${eventUrl}" style="color: ${config.color}; text-decoration: none;">Unsubscribe</a>
              </p>
              <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
                Jetzy Events, Inc.
              </p>
            </div>
          </div>
        </div>
      `),
    })
    console.log(`✅ Blast email sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send blast email:", error)
    throw error
  }
}

export const sendTicketConfirmation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber, isNewUser = false, qrCodeImageUrl, guestEmails = [], referralCode, discountAmount, discountPercentage, approvalContext = false, amountCharged, pricing }: TicketEmailData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }

  // Skip email sending in localhost to avoid sending test emails
  if (baseUrl.includes('localhost')) {
    console.log("[LOCALHOST MODE] Email sending skipped - would send to:", email)
    console.log("[LOCALHOST MODE] Order Number:", orderNumber)
    console.log("[LOCALHOST MODE] Event:", event.name)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  console.log("[sendTicketConfirmation] Called with:", { email, orderNumber, eventName: event.name, isNewUser, ticketCount: tickets.length })

  // Validate SendGrid configuration
  if (!process.env.SENDGRID_API_KEY) {
    const errorMsg = "SENDGRID_API_KEY is not set in environment variables"
    console.error("[sendTicketConfirmation] ❌", errorMsg)
    throw new Error(errorMsg)
  }

  if (!process.env.SENDGRID_EMAIL_SENDER?.trim()) {
    const errorMsg = "SENDGRID_EMAIL_SENDER is not set in environment variables"
    console.error("[sendTicketConfirmation] ❌", errorMsg)
    throw new Error(errorMsg)
  }

  console.log("[sendTicketConfirmation] ✅ API Key set:", !!process.env.SENDGRID_API_KEY)
  console.log("[sendTicketConfirmation] ✅ Sender email:", process.env.SENDGRID_EMAIL_SENDER)

  try {
    // format event start and end time
    let timestamp = ""
    let eventTimezone = event.timezone ? event.timezone.split(') ')[1] : 'UTC'
    let start: dayjs.Dayjs | any = null
    let end: dayjs.Dayjs | any = null

    if (!event.startsOn && !event.endsOn && event.datePoll?.isActive) {
      timestamp = "To be decided after poll ends. We will notify you via email."
    } else {
      start = dayjs.utc(event.startsOn).tz(eventTimezone)
      end = dayjs.utc(event.endsOn).tz(eventTimezone)
      const startTimestamp = `${start.format('ddd MMM DD YYYY')}${event.hasStartTime !== false ? ` ${start.format('hh:mm A')}` : ''}`
      const endTimestamp = `${end.format('ddd MMM DD YYYY')}${event.hasEndTime !== false ? ` ${end.format('hh:mm A')}` : ''}`
      timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
    }
    // Always use the real location in emails — `locationDisclosedAfterBooking` only masks the
    // PUBLIC event page, and someone holding a ticket is entitled to the address.
    //
    // `venueName` is a FALLBACK, never a prefix. Prepending it produced a doubled address
    // whenever the two strings differed by so much as punctuation — see event-location.ts.
    const location = resolveGuestLocation(event as any)
    const locationMapsUrl = mapsLinkFor(location)
    const entrance = resolveEntrance(event as any)

    // Back to the event itself — the ticket holder's route to the discussion, the album, the
    // guest list and their own cancel button, none of which this email can carry. Built with
    // `buildEventUrl`, never by interpolation: a slug may contain spaces, accents or emoji.
    const ticketEventUrl = buildEventUrl(baseUrl, (event as any).slug || String(event._id))

    const subtotal = tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
    const finalTotal = discountAmount && discountAmount > 0 ? subtotal - discountAmount : subtotal

    // The summary always renders. Prefer the caller's itemised breakdown; otherwise build
    // one from the legacy discount params; failing that, a plain subtotal/total. Previously
    // the whole block (including the Total) was gated on a referral code being present, so
    // a Premium-only discount — or any free/approval booking — showed no total at all.
    const resolvedPricing: TicketPricing =
      pricing ??
      buildTicketPricing({
        subtotal,
        referralCode,
        referralPercentage: discountPercentage,
        combinedDiscountAmount: discountAmount,
      })

    // One entry per membership sold with the ticket — a ticket can sell both Jetzy Premium
    // and Full Concierge, and every recurring charge has to be named on the receipt.
    const recurringLines = resolvedPricing.recurring || []

    console.log("Email details:", { timestamp, location, subtotal, finalTotal, resolvedPricing, tickets })

    // Process QR code image for attachment
    const attachments: any[] = []
    let qrCodeValid = false
    let hasAttachment = false

    if (qrCodeImageUrl) {
      try {
        // Check if it's a data URI (base64)
        if (qrCodeImageUrl.startsWith('data:image')) {
          const base64Match = qrCodeImageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
          if (base64Match && base64Match[2]) {
            const base64Data = base64Match[2]
            if (base64Data.length > 0) {
              attachments.push({
                filename: 'qr-code.png',
                type: `image/${base64Match[1]}`,
                content: base64Data,
                content_id: 'qrCode', // SendGrid requires snake_case, not camelCase
                disposition: 'inline',
              })
              hasAttachment = true
              qrCodeValid = true
              console.log("[sendTicketConfirmation] QR code attachment prepared successfully")
            } else {
              console.error("[sendTicketConfirmation] Empty base64 data after extraction")
            }
          } else {
            console.error("[sendTicketConfirmation] Invalid QR code image URL format")
          }
        } else {
          // If it's a URL, we'll use it directly in the HTML
          qrCodeValid = true
        }
      } catch (attachError: any) {
        console.error("[sendTicketConfirmation] Error processing QR code:", attachError.message)
        console.error("[sendTicketConfirmation] QR code image URL:", qrCodeImageUrl ? qrCodeImageUrl.substring(0, 100) + '...' : 'null')
      }
    } else {
      console.warn("[sendTicketConfirmation] No QR code image URL provided")
    }

    // Build email payload
    // Hardcoded check for New Year's Eve event
    if (String(event._id) === "69406b0aecf5f8dab077a1dc") {
      const EVENT_NAME = "New Year's Eve Get Together";
      const VENUE = "Bar Sella, Hyatt Union Square, 134 4th Ave, New York, NY 10003.";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 7pm to 3am`;
      const NOTE = "Your ticket covers the entrance fee. You will be able to purchase food and drinks from the venue";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: mailFrom(),
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id}`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event
    if (String(event._id) === "697cf23827f6f5f0d7d8c25a") {
      const EVENT_NAME = "Valentine Event";
      const VENUE = "Nightingale, 37 Carmine St, New York, NY 10014.";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 6:30 PM Onwards`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: mailFrom(),
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine Event)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event San Francisco
    if (String(event._id) === "698643a2a2b2892a70c68c08") {
      const EVENT_NAME = "Valentine's Event San Francisco";
      const VENUE = "The Vesper, 394 E Campbell Ave, Campbell, CA 95008, United States";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/VT7pY9YAZgvS6nx17?g_st=iw";
      const TIME = `${timestamp} (${eventTimezone.replace(/_/g, ' ')})`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: mailFrom(),
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine SF)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event LA
    if (String(event._id) === "698a27d43c43238502823ddf") {
      const EVENT_NAME = "Valentine's Event LA";
      const VENUE = "11520 W Pico Blvd, Los Angeles, CA 90064, United States";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/zS23zQj6uf98CcQb6";
      const TIME = `${timestamp} (${eventTimezone.replace(/_/g, ' ')})`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: mailFrom(),
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine LA)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Founder/Investor Happy Hour
    if (String(event._id) === "69c3f18800c9a06c6042f78b") {
      const EVENT_NAME = "Founder/Investor Happy Hour";
      const VENUE = "Nightingale, 37 Carmine St, New York, NY 10014.";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/yShTrAwBCDjJVUvP7";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 6:00 PM to 8:00 PM`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: mailFrom(),
        subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Founder/Investor Happy Hour)`)
      return { success: true, message: "Email sent successfully" }
    }


    const emailPayload = {
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: approvalContext
        ? `Jetzy [You're In! 🎉] Your spot for ${decodeHTMLEntities(event.name)} is confirmed`
        : `Booking Confirmation: ${decodeHTMLEntities(event.name)}`,
      ...(attachments.length > 0 ? { attachments } : {}),
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${approvalContext ? `
          <div style="background-color: #d4edda; padding: 24px; border-radius: 8px; margin: 0 0 20px 0; border-left: 4px solid #28a745; text-align: center;">
            <h1 style="color: #155724; margin: 0 0 8px 0;">Great news — you've got a spot! 🎉</h1>
            <p style="color: #155724; margin: 0;">Hi ${firstName}, your request to attend "${decodeHTMLEntities(event.name)}" has been <strong>approved and confirmed</strong>.</p>
            ${amountCharged ? `<p style="color: #155724; margin: 12px 0 0 0;">Your card has now been charged <strong>${formatMoney(amountCharged)}</strong>.</p>` : ""}
          </div>
          ` : `<h1 style="color: #333; text-align: center;">Thank you for your purchase!</h1>`}

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Details</h2>
            <p><strong>Date and Time: </strong>${timestamp}</p>
            <p><strong>Venue: </strong><a href="${locationMapsUrl}" target="_blank" rel="noreferrer" style="color: #F79432; text-decoration: underline;">${location}</a></p>
            ${entrance ? `<p><strong>Entrance: </strong>${entrance}</p>` : ""}
            <p><strong>Organizer: </strong>${(event.ownerId as any)?.firstName ? `${(event.ownerId as any).firstName} ${(event.ownerId as any).lastName}` : (event.host?.name || "Jetzy Events")}</p>
            ${(event.ownerId as any)?.email ? `<p><strong>Email: </strong>${(event.ownerId as any).email}</p>` : (event.host?.email ? `<p><strong>Email: </strong>${event.host.email}</p>` : "")}
            ${(event.ownerId as any)?.phone ? `<p><strong>Phone: </strong>${(event.ownerId as any).phone}</p>` : (event.host?.phone ? `<p><strong>Phone: </strong>${event.host.phone}</p>` : "")}
          </div>

           <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
             <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
            ${`
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f8f8; border-radius: 8px; margin-top: 10px;">
                <tr>
                  <td style="padding: 12px 15px 6px 15px; color: #333;">Subtotal</td>
                  <td style="padding: 12px 15px 6px 15px; color: #333; text-align: right;">$${resolvedPricing.subtotal.toFixed(2)}</td>
                </tr>
                ${resolvedPricing.lines
                  .map(
                    (line) => `
                <tr>
                  <td style="padding: 6px 15px; color: #28a745;">${line.label}</td>
                  <td style="padding: 6px 15px; color: #28a745; text-align: right;">-$${line.amount.toFixed(2)}</td>
                </tr>`,
                  )
                  .join("")}
                <tr>
                  <td style="padding: 10px 15px 12px 15px; border-top: 1px solid #e5e7eb; font-weight: bold; color: #333;">${recurringLines.length > 0 ? "Ticket total" : "Total"}</td>
                  <td style="padding: 10px 15px 12px 15px; border-top: 1px solid #e5e7eb; font-weight: bold; color: #333; text-align: right;">$${resolvedPricing.total.toFixed(2)}</td>
                </tr>
                ${recurringLines
                  .map(
                    (membership) => `
                <tr>
                  <td style="padding: 6px 15px; color: #333;">${membership.label}</td>
                  <td style="padding: 6px 15px; color: #333; text-align: right;">${
                    membership.trialMonths
                      ? `Free for ${membership.trialMonths} ${membership.trialMonths === 1 ? "month" : "months"}, then $${membership.amount.toFixed(2)}/${membership.interval}`
                      : `$${membership.amount.toFixed(2)}/${membership.interval}`
                  }</td>
                </tr>`,
                  )
                  .join("")}
                ${recurringLines.length > 0
                  ? `
                <tr>
                  <td style="padding: 10px 15px 12px 15px; border-top: 1px solid #e5e7eb; font-weight: bold; color: #333;">Charged today</td>
                  <td style="padding: 10px 15px 12px 15px; border-top: 1px solid #e5e7eb; font-weight: bold; color: #333; text-align: right;">$${(resolvedPricing.dueToday ?? resolvedPricing.total).toFixed(2)}</td>
                </tr>`
                  : ""}
              </table>
            `}

            ${recurringLines
              .map(
                (membership) => `
            <div style="background-color: #fff8e1; border: 1px solid #f0d78c; border-radius: 8px; padding: 15px; margin-top: 15px;">
              <p style="margin: 0 0 6px 0; color: #7a5c00; font-weight: bold;">Your ${membership.label}</p>
              ${membership.trialMonths
                ? `<p style="margin: 0; color: #7a5c00; font-size: 14px; line-height: 1.5;">
                Your referral code included
                <strong>${membership.trialMonths} ${membership.trialMonths === 1 ? "month" : "months"} free</strong> — you have
                not been charged for it. It then renews at
                <strong>$${membership.amount.toFixed(2)} every ${membership.interval}</strong>${
                  membership.firstRenewalAt
                    ? `, starting <strong>${dayjs(membership.firstRenewalAt).format("MMMM D, YYYY")}</strong>`
                    : ""
                },
                until you cancel. Cancel any time before then and you won't be charged — use
                <strong>Manage membership</strong> in your Jetzy account menu.
              </p>`
                : `<p style="margin: 0; color: #7a5c00; font-size: 14px; line-height: 1.5;">
                This ticket included a ${membership.label}, and
                <strong>your first ${membership.interval} is already paid</strong> — it's part of the
                amount above. It then renews at
                <strong>$${membership.amount.toFixed(2)} every ${membership.interval}</strong>${
                  membership.firstRenewalAt
                    ? `, starting <strong>${dayjs(membership.firstRenewalAt).format("MMMM D, YYYY")}</strong>`
                    : ""
                },
                until you cancel. You can cancel any time from
                <strong>Manage membership</strong> in your Jetzy account menu.
              </p>
              ${membership.firstRenewalAt
                ? `<p style="margin: 10px 0 0 0; color: #7a5c00; font-size: 13px; line-height: 1.5;">
                If your billing page shows this period as a free trial, that's just how the paid first
                ${membership.interval} is recorded — you've already paid for it.
              </p>`
                : ""}`}
            </div>`,
              )
              .join("")}
          </div>

          ${qrCodeValid ? `
          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8f8f8; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h3 style="color: #333; margin: 0 0 8px 0; font-size: 16px;">Your Entry QR Code</h3>
            <p style="color: #666; font-size: 13px; margin: 0 0 15px 0;">
              Show this QR code at the entrance. Booking Reference: <strong>${orderNumber}</strong>
            </p>
            <img src="${hasAttachment ? 'cid:qrCode' : qrCodeImageUrl}" alt="Entry QR Code" style="width: 200px; height: 200px; display: block; margin: 0 auto;" />
          </div>
          ` : `
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #ffeeba;">
            <p style="color: #856404; font-weight: bold; margin: 0;">
              Please show this email at the entrance for entry
            </p>
          </div>
          `}

          <div style="text-align: center; margin: 30px 0;">
            <a href="${ticketEventUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View Event Page
            </a>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.icreon.travelconnect" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <p style="margin-top: 30px; text-align: center; color: #666;">
            Welcome to Jetzy! You now have access to exclusive membership benefits.
          </p>
          
          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `),
      text: `Thank you for your purchase for ${event.name}!\n\nOrder Number: ${orderNumber}\nDate and Time: ${timestamp}\nVenue: ${location}\nDirections: ${locationMapsUrl}${entrance ? `\nEntrance: ${entrance}` : ""}\n\nEvent page: ${ticketEventUrl}\n\nThank you for choosing Jetzy Events!`,
    }

    console.log("[sendTicketConfirmation] Sending email with payload:", {
      to: emailPayload.to,
      from: emailPayload.from,
      subject: emailPayload.subject,
      hasAttachments: attachments.length > 0,
      hasGuestEmails: guestEmails.length > 0,
    })

    await sgMail.send(emailPayload as any)
    console.log("[sendTicketConfirmation] Email sent successfully to:", email)
    return { success: true, message: "Email sent successfully" }
  } catch (error: any) {
    console.error("[sendTicketConfirmation] Failed to send email:", error.message || error)
    console.error("[sendTicketConfirmation] Error details:", JSON.stringify(error, null, 2))
    if (error.response) {
      console.error("[sendTicketConfirmation] SendGrid response:", JSON.stringify(error.response.body, null, 2))
    }
    throw error
  }
}

export const sendOrganizerSaleNotification = async ({
  event,
  firstName,
  lastName,
  email,
  tickets,
  orderNumber,
  totalAmount,
  referralCode,
  organizerEmail,
}: {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  tickets: any[]
  orderNumber: string
  totalAmount: number
  referralCode?: string
  organizerEmail: string
}) => {
  try {
    await sgMail.send({
      to: organizerEmail,
      from: mailFrom(),
      subject: `New Ticket Sale! - ${decodeHTMLEntities(event.name)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">New Ticket Sold! 🎉</h1>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h2 style="color: #155724; margin-bottom: 10px;">Cha-ching!</h2>
            <p style="color: #155724; margin: 0;">
              You just sold tickets for <strong>${decodeHTMLEntities(event.name)}</strong>.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Buyer Information</h3>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Order #:</strong> ${orderNumber}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Order Summary</h3>
            ${tickets
          .map(
            (t) => `
              <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                <p style="margin: 0;"><strong>${t.quantity}x</strong> ${t.name}</p>
                <p style="margin: 0; color: #666;">$${t.price} each</p>
              </div>
            `,
          )
          .join("")}
            <p style="font-size: 18px; font-weight: bold; margin-top: 15px;">Total Revenue: $${totalAmount.toFixed(2)}</p>
          </div>

          ${referralCode
          ? `
          <div style="background-color: #e2e3e5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #383d41;">
            <h3 style="color: #383d41; margin: 0 0 10px 0;">Referral Source</h3>
            <p style="margin: 0;">This sale came from code: <strong>${referralCode}</strong></p>
          </div>
          `
          : ""
        }
        </div>
      `),
      text: `New Ticket Sold for ${event.name}!\n\nBuyer: ${firstName} ${lastName}\nOrder #: ${orderNumber}\nTotal Revenue: $${totalAmount.toFixed(2)}`,
    })
  } catch (error) {
    console.error("Failed to send organizer notification:", error)
  }
}

/**
 * Money block for a cancellation email.
 *
 * Jetzy issues no refunds, so this must never promise one. The three states are genuinely
 * different for the guest and must read differently: a released hold means they were never
 * charged at all, a captured payment means the money is gone and staying gone, and a free
 * booking has no money to talk about.
 */
const cancellationMoneyBlock = (moneyState: MoneyState, amount: number): string => {
  if (moneyState === "hold" || moneyState === "released") {
    return `
      <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1877F2;">
        <h3 style="color: #1877F2; margin: 0 0 10px 0;">You were not charged</h3>
        <p style="color: #1C1E21; margin: 0;">
          The ${formatMoney(amount)} authorization hold on your card has been released. Depending on your
          bank, it may take 5&ndash;10 business days to disappear from your statement.
        </p>
      </div>
    `
  }

  if (moneyState === "captured") {
    return `
      <div style="background-color: #FEF2F2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626;">
        <h3 style="color: #DC2626; margin: 0 0 10px 0;">This booking is non-refundable</h3>
        <p style="color: #1C1E21; margin: 0;">
          ${formatMoney(amount)} was paid for this booking. Under our booking policy this payment is
          non-refundable and will not be returned.
        </p>
      </div>
    `
  }

  // We hold no payment record for this booking, so we can't say whether it was charged.
  // The copy stays conditional rather than guessing in either direction.
  if (moneyState === "unknown") {
    return `
      <div style="background-color: #FEF2F2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626;">
        <h3 style="color: #DC2626; margin: 0 0 10px 0;">This booking is non-refundable</h3>
        <p style="color: #1C1E21; margin: 0;">
          If a payment of ${formatMoney(amount)} was made for this booking, under our booking policy it is
          non-refundable and will not be returned.
        </p>
      </div>
    `
  }

  return ""
}

export const sendBookingCancellation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber, totalAmount, moneyState = "free", cancelledBy = "guest" }: BookingCancellationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  console.log("[sendBookingCancellation] Called with:", { email, orderNumber, eventName: event.name, ticketCount: tickets.length, moneyState, cancelledBy })

  // Every other send function skips on localhost; this one didn't, so local dev mailed real
  // guests every time a booking was cancelled.
  if (baseUrl?.includes("localhost")) {
    console.log("[LOCALHOST MODE] Booking cancellation email skipped - would send to:", email)
    return { success: true, message: "Email skipped in localhost mode" }
  }

  try {
    // Dates are optional on an event (TBD / date poll), and `timezone` is not guaranteed to
    // carry the "(UTC+00:00) Region/City" prefix — splitting on it blindly used to throw.
    const eventTimezone = getEventZone(event.timezone)
    const startTimestamp = event.startsOn
      ? (() => {
        const start = dayjs.utc(event.startsOn).tz(eventTimezone)
        return `${start.format('ddd MMM DD YYYY')}${event.hasStartTime !== false ? ` ${start.format('hh:mm A')}` : ''}`
      })()
      : ""
    const endTimestamp = event.endsOn
      ? (() => {
        const end = dayjs.utc(event.endsOn).tz(eventTimezone)
        return `${end.format('ddd MMM DD YYYY')}${event.hasEndTime !== false ? ` ${end.format('hh:mm A')}` : ''}`
      })()
      : ""
    const timestamp = startTimestamp
      ? (endTimestamp ? `From: ${startTimestamp} To: ${endTimestamp}` : startTimestamp)
      : "Date to be decided"
    const location = event.location
    const cancelledByHost = cancelledBy !== "guest"

    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: mailFrom(),
      subject: `Jetzy [Booking Cancelled] ${decodeHTMLEntities(event.name)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Cancellation Confirmation</h1>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h2 style="color: #856404; margin-bottom: 15px;">Your Booking Has Been Cancelled</h2>
            <p style="color: #856404; margin: 0;">
              ${cancelledByHost
        ? `Your booking for "${decodeHTMLEntities(event.name)}" has been cancelled by the event host.`
        : `Your booking for "${decodeHTMLEntities(event.name)}" has been cancelled as requested.`}
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Details</h2>
            <p><strong>Event Name:</strong> ${decodeHTMLEntities(event.name)}</p>
            <p><strong>Date and Time:</strong> ${timestamp}</p>
            <p><strong>Venue:</strong> ${location}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Customer Information</h2>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
            <p><strong>Order Number:</strong> ${orderNumber}</p>
          </div>

          <div style="margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Cancelled Tickets</h2>
            ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity:</strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket:</strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal:</strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${decodeHTMLEntities(stripHtml(ticket.desc))}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          ${moneyState !== "free" ? `
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0;">Booking Total: ${formatMoney(totalAmount)}</h3>
          </div>
          ` : ""}

          ${cancellationMoneyBlock(moneyState, totalAmount)}

          <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1877F2;">
            <h2 style="color: #1877F2; margin-bottom: 15px;">Important Information</h2>
            <p style="color: #1C1E21; margin-bottom: 10px;">
              Your tickets have been released and are now available for other attendees.
            </p>
            <p style="color: #1C1E21; margin-top: 10px;">
              If you have any questions about this cancellation or need assistance, please don't hesitate to contact us.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `),
      text: [
        `Booking Cancellation Confirmation for ${event.name}.`,
        "",
        cancelledByHost ? "Your booking has been cancelled by the event host." : "Your booking has been cancelled as requested.",
        moneyState === "hold" || moneyState === "released"
          ? `You were not charged — the ${formatMoney(totalAmount)} hold on your card has been released.`
          : moneyState === "captured"
            ? `${formatMoney(totalAmount)} was paid for this booking. Under our booking policy this payment is non-refundable and will not be returned.`
            : moneyState === "unknown"
              ? `If a payment of ${formatMoney(totalAmount)} was made for this booking, under our booking policy it is non-refundable and will not be returned.`
              : "",
        "",
        "Thank you for choosing Jetzy Events!",
      ].filter(Boolean).join("\n"),
    })

    console.log("[sendBookingCancellation] Email sent successfully to:", email)
    return { success: true, message: "Cancellation email sent successfully" }
  } catch (error: any) {
    console.error("[sendBookingCancellation] Failed to send email:", error.message || error)
    console.error("[sendBookingCancellation] Error details:", JSON.stringify(error, null, 2))
    if (error.response) {
      console.error("[sendBookingCancellation] SendGrid response:", JSON.stringify(error.response.body, null, 2))
    }
    throw error
  }
}

/**
 * Tells the host (and the Jetzy inbox) that a seat just came back. Non-fatal by design —
 * a guest's cancellation must never fail because an operational email bounced.
 */
export const sendHostCancellationNotice = async ({
  event,
  eventId,
  guestName,
  guestEmail,
  guestPhone,
  ticketCount,
  orderNumber,
  totalAmount,
  moneyState,
  cancelledBy,
  organizerEmail,
}: HostCancellationNoticeData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  const senderEmail = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim()
  const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL as string)?.trim() || senderEmail

  if (baseUrl?.includes("localhost")) {
    console.log("[LOCALHOST MODE] Host cancellation notice skipped - would send to:", organizerEmail, adminEmail)
    return
  }

  // De-duplicate: the host may well be the admin address on a Jetzy-run event.
  const recipients = Array.from(new Set([organizerEmail, adminEmail].filter(Boolean))) as string[]
  if (recipients.length === 0) {
    console.warn("[sendHostCancellationNotice] No recipients resolved; skipping.")
    return
  }

  const moneyLine =
    moneyState === "captured"
      ? `${formatMoney(totalAmount)} was collected and is <strong>not</strong> refunded.`
      : moneyState === "hold" || moneyState === "released"
        ? `The ${formatMoney(totalAmount)} card hold was released — nothing was ever collected.`
        : moneyState === "unknown"
          ? `Booking total was ${formatMoney(totalAmount)}, but there is no payment record against it — check Stripe if you need to confirm whether it was collected. Nothing has been refunded.`
          : "This was a free booking; no money was involved."

  const manageUrl = `${(baseUrl || "").replace(/\/$/, "")}/console/events/${eventId}/manage`

  try {
    await sgMail.send({
      to: recipients,
      from: mailFrom(senderEmail),
      subject: `Jetzy [Booking Cancelled] ${decodeHTMLEntities(event.name)} — ${guestName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">A booking was cancelled</h1>

          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="color: #856404; margin: 0;">
              <strong>${ticketCount} ${ticketCount === 1 ? "ticket" : "tickets"}</strong> for
              "${decodeHTMLEntities(event.name)}" ${cancelledBy === "guest" ? "were cancelled by the guest" : `were cancelled by the ${cancelledBy}`}
              and are back in your available capacity.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Guest</h2>
            <p style="margin: 6px 0;"><strong>Name:</strong> ${guestName}</p>
            <p style="margin: 6px 0;"><strong>Email:</strong> ${guestEmail}</p>
            ${guestPhone ? `<p style="margin: 6px 0;"><strong>Phone:</strong> ${guestPhone}</p>` : ""}
            <p style="margin: 6px 0;"><strong>Booking Ref:</strong> ${orderNumber}</p>
            <p style="margin: 6px 0;"><strong>Cancelled:</strong> ${new Date().toUTCString()}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Payment</h2>
            <p style="margin: 0;">${moneyLine}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${manageUrl}" style="background-color: #F79432; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Manage Event
            </a>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #1877F2; text-decoration: none;">${CONTACT_EMAIL}</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `),
      text: `Booking cancelled for ${event.name}.\n\nGuest: ${guestName} (${guestEmail})\nTickets: ${ticketCount}\nRef: ${orderNumber}\n${moneyLine.replace(/<[^>]+>/g, "")}\n\nManage: ${manageUrl}`,
    })
    console.log("[sendHostCancellationNotice] Sent to:", recipients.join(", "))
  } catch (error: any) {
    // Non-fatal — the cancellation itself already succeeded.
    console.error("[sendHostCancellationNotice] Failed to send:", error?.message || error)
  }
}

export const sendDiscussionNotification = async ({
  email,
  firstName,
  lastName,
  authorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
}: DiscussionNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`${eventPath(eventSlug)}?view=discussion&postId=${postId}`)}`

  const subject = hasImages
    ? `New photos added to ${decodeHTMLEntities(eventName)}`
    : `${authorName} Posted in ${decodeHTMLEntities(eventName)}`

  const bodyContent = hasImages
    ? `We've added new photos and videos to <strong>${decodeHTMLEntities(eventName)}</strong>.`
    : `<strong>${authorName}</strong> Posted in <strong>${decodeHTMLEntities(eventName)}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              ${bodyContent}
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                View it here: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Discussion notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send discussion notification email:", error)
    throw error
  }
}

export const sendCommentNotification = async ({
  email,
  firstName,
  lastName,
  commenterName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
  isPostAuthor = false,
}: CommentNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`${eventPath(eventSlug)}?view=discussion&postId=${postId}`)}`

  const decodedEvent = decodeHTMLEntities(eventName)

  // Post author gets personalised "your post" copy; other participants get activity copy
  const subject = hasImages
    ? `New photos added to ${decodedEvent}`
    : isPostAuthor
      ? `${commenterName} commented on your post in ${decodedEvent}`
      : `${commenterName} commented in ${decodedEvent}`

  const bodyContent = hasImages
    ? `We've added new photos and videos to <strong>${decodedEvent}</strong>.`
    : isPostAuthor
      ? `<strong>${commenterName}</strong> commented on your post in <strong>${decodedEvent}</strong>.`
      : `<strong>${commenterName}</strong> commented in <strong>${decodedEvent}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              ${bodyContent}
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                ${hasImages ? "View it here: [Photo Link]" : "View and reply: [Comment Link]"}
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>

            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Comment notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send comment notification email:", error)
    throw error
  }
}

export const sendTagNotification = async ({
  email,
  firstName,
  lastName,
  authorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
}: TagNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`${eventPath(eventSlug)}?view=discussion&postId=${postId}`)}`

  const subject = hasImages
    ? `${authorName} tagged you in a photo from ${decodeHTMLEntities(eventName)}`
    : `${authorName} tagged you in ${decodeHTMLEntities(eventName)}`

  const bodyContent = hasImages
    ? `<strong>${authorName}</strong> tagged you in a photo from <strong>${decodeHTMLEntities(eventName)}</strong>.`
    : `<strong>${authorName}</strong> tagged you in a discussion in <strong>${decodeHTMLEntities(eventName)}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              ${bodyContent}
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                View it here: [Photo Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Tag notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send tag notification email:", error)
    throw error
  }
}

export const sendReactionNotification = async ({
  email,
  firstName,
  lastName,
  reactorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
}: ReactionNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`${eventPath(eventSlug)}?view=discussion&postId=${postId}`)}`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `${reactorName} reacted to your post in ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${reactorName}</strong> Liked your post in <strong>${decodeHTMLEntities(eventName)}</strong>.
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                See the update: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${reactorName} Liked your post in ${decodeHTMLEntities(eventName)}.\n\nSee the update here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Reaction notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send reaction notification email:", error)
    throw error
  }
}

export const sendViewMilestoneNotification = async ({
  email,
  firstName,
  lastName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  viewCount,
}: ViewMilestoneNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`${eventPath(eventSlug)}?view=discussion&postId=${postId}`)}`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `Your post in ${decodeHTMLEntities(eventName)} is getting attention`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              Your post in <strong>${decodeHTMLEntities(eventName)}</strong> has received <strong>${viewCount}</strong> views.
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                Take a look: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\nYour post in ${decodeHTMLEntities(eventName)} has received ${viewCount} views.\n\nTake a look here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ View milestone notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send view milestone notification email:", error)
    throw error
  }
}

export const sendThankYouNotification = async ({
  email,
  firstName,
  lastName,
  eventName,
  eventSlug,
  magicToken,
  formLink,
}: ThankYouNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const eventUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(eventPath(eventSlug))}`

  const subject = `Thank you for making ${decodeHTMLEntities(eventName)} unforgettable 💫`

  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
          Hi ${firstName},
        </p>
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
          It was a pleasure having you with us — the evening truly came alive because of your energy and presence. We've uploaded the photos and videos from the night on the Jetzy event page: <strong><a href="${eventUrl}" style="color: #F79432; text-decoration: none;">[Event Link]</a></strong>.
        </p>

        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 25px 0 25px 0;">
          We are in the process of curating the next events. Click this link to inform which event you would like to attend <strong><a href="${formLink}" style="color: #F79432; text-decoration: none;">[Form Link]</a></strong>
        </p>

        <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
          — Team Jetzy
        </p>
        
        <div style="margin-top: 40px;">
          <p style="color: #1F2937; font-size: 14px; margin-bottom: 10px; font-weight: 600;">App download options</p>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
            <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
          </div>
        </div>
      </div>
    </div>
  `

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(bodyHtml),
      text: `${firstName},\n\nIt was a pleasure having you with us — the evening truly came alive because of your energy and presence. We've uploaded the photos and videos from the night on the Jetzy event page: ${eventUrl}\n\nWe are in the process of curating the next events. Click this link to inform which event you would like to attend: ${formLink}\n\n— Team Jetzy`,
    })
    console.log(`✅ Thank you notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send thank you notification email:", error)
    throw error
  }
}

export const sendWelcomeEmail = async ({ email, firstName, lastName, password, context }: WelcomeEmailData) => {
  // CEO directive: one consistent font across the whole email (Times New Roman, fallback Arial).
  // Applied inline on every text element because Outlook doesn't reliably inherit container font.
  const FONT = "'Times New Roman', Times, Arial, serif";
  const CONCIERGE_LINK = "https://selectmember.jetzy.com/";
  const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
  const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";
  const DOWNLOAD_LINK = "https://jetzyapp.com/download.html";
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com";

  // Encode email so the block link is personalized
  const encodedEmail = encodeURIComponent(email);
  const blockLink = `${baseUrl}/api/auth/report-abuse?email=${encodedEmail}`;

  const html = `
    <div style="font-family: ${FONT}; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
      </div>
      <h1 style="font-family: ${FONT}; color: #333; text-align: center;">Welcome to Jetzy!</h1>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6;">
        Jetzy is an invite-only social network that helps you connect with inspiring, global-minded people based on your interests and location. Whether you’re a foodie looking to discover great restaurants, a hiker seeking adventure partners, or passionate about any other activity, Jetzy helps you find and connect with like-minded people around you and around the world.
      </p>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6;">
        In addition, with our <a href="${CONCIERGE_LINK}" style="color: #F79432; font-weight: bold; text-decoration: underline;">Jetzy Select Concierge</a> you can unlock exclusive savings of up to 70% across travel and leisure.
      </p>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 8px;">
        For example:
      </p>
      <ul style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6; padding-left: 22px; margin-top: 0;">
        <li style="font-family: ${FONT}; margin-bottom: 8px;"><strong>VIP restaurant benefits</strong> — priority seating, 10–30% discounts, and complimentary drinks, appetizers, or desserts for your entire table at premier restaurants.</li>
        <li style="font-family: ${FONT}; margin-bottom: 8px;"><strong>Exclusive nightlife perks</strong> — VIP entry, complimentary drinks, and bottle experiences at top venues.</li>
        <li style="font-family: ${FONT}; margin-bottom: 8px;"><strong>Private event invitations</strong> — access to exclusive gatherings and experiences.</li>
        <li style="font-family: ${FONT}; margin-bottom: 8px;"><strong>Luxury travel &amp; lifestyle savings</strong> — up to 70% off hotels, car rentals, sporting events, private jets, yachts, spas, luggage, luxury goods, and more.</li>
      </ul>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6;">
        Download the Jetzy mobile app from the link below. Log in using your email address and select “Forgot Password” to reset your password.
      </p>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6;">
        We look forward to welcoming you to the Jetzy community and connecting with you soon!
      </p>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 0;">
        Live the Jetzy Life!<br/>
        <a href="https://jetzy.com/" style="color: #F79432; font-weight: bold; text-decoration: underline;">Jetzy.com</a>
      </p>

      <p style="font-family: ${FONT}; font-size: 16px; color: #555; line-height: 1.6; font-style: italic; margin-top: 8px;">
        Live like a Traveler | Travel like a Local
      </p>

      <div style="text-align: center; margin: 35px 0;">
        <p style="font-family: ${FONT}; font-weight: bold; color: #F79432; font-size: 18px; margin-bottom: 15px;">Download the Jetzy App to Get Started</p>
        <div style="margin-bottom: 20px;">
          <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
            <img src="${baseUrl}/email/appstore-badge-v2.png" alt="Download on the App Store" width="135" height="40" style="height: 40px; width: 135px;" />
          </a>
          <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
            <img src="${baseUrl}/email/googleplay-badge-v2.png" alt="Get it on Google Play" width="135" height="40" style="height: 40px; width: 135px;" />
          </a>
        </div>
        <a href="${DOWNLOAD_LINK}" style="font-family: ${FONT}; background-color: #F79432; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Visit Download Page
        </a>
      </div>

      <!-- Account Safety Notice -->
      <div style="margin: 25px 0; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-family: ${FONT}; font-size: 14px; color: #555; line-height: 1.6; margin: 0;">
          An account has been created on Jetzy using your email address${context ? ` ${context}` : ""}. If you created this account, no action is needed.<br/><br/>
          If you did <strong>not</strong> create this account, please
          <a href="${blockLink}" style="color: #F79432; font-weight: bold; text-decoration: underline;">click here to block this account</a>.
        </p>
      </div>

      <p style="font-family: ${FONT}; font-size: 14px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #F79432; text-decoration: none;">${CONTACT_EMAIL}</a>
        <br />
        &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(process.env.SENDGRID_FROM_WELCOME),
      subject: "Welcome to Jetzy - Your Account is Ready!",
      html: wrapHtml(html),
      text: `Welcome to Jetzy!\n\nJetzy is an invite-only social network that helps you connect with inspiring, global-minded people based on your interests and location. Whether you're a foodie looking to discover great restaurants, a hiker seeking adventure partners, or passionate about any other activity, Jetzy helps you find and connect with like-minded people around you and around the world.\n\nIn addition, with our Jetzy Select Concierge (${CONCIERGE_LINK}) you can unlock exclusive savings of up to 70% across travel and leisure.\n\nFor example:\n- VIP restaurant benefits — priority seating, 10–30% discounts, and complimentary drinks, appetizers, or desserts for your entire table at premier restaurants.\n- Exclusive nightlife perks — VIP entry, complimentary drinks, and bottle experiences at top venues.\n- Private event invitations — access to exclusive gatherings and experiences.\n- Luxury travel & lifestyle savings — up to 70% off hotels, car rentals, sporting events, private jets, yachts, spas, luggage, luxury goods, and more.\n\nDownload the Jetzy mobile app: ${DOWNLOAD_LINK}\nLog in using your email address and select "Forgot Password" to reset your password.\n\nWe look forward to welcoming you to the Jetzy community and connecting with you soon!\n\nLive the Jetzy Life!\nJetzy.com (https://jetzy.com/)\n\nLive like a Traveler | Travel like a Local\n\n---\nACCOUNT SAFETY: An account has been created on Jetzy using your email address${context ? ` ${context}` : ""}. If you created this account, no action is needed. If you did NOT create this account, please click here to block it: ${blockLink}`
    });
    console.log(`✅ Welcome email sent successfully to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
    throw error;
  }
}

export const sendVerificationEmail = async ({
  email,
  firstName,
  token,
  cb,
  trialMonths,
}: {
  email: string
  firstName?: string
  token: string
  cb?: string
  /**
   * Free months of Jetzy Premium waiting behind the link, from an invite code typed at signup.
   *
   * Named in this email because it is the strongest reason the person has to click it, and the
   * membership does NOT exist until they do — the grant happens at `complete-signup`, once the
   * address is proven. Phrased as waiting rather than granted, for exactly that reason.
   */
  trialMonths?: number
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const verifyUrl = `${baseUrl}/auth/verify-signup?token=${encodeURIComponent(token)}${cb ? `&_cb=${encodeURIComponent(cb)}` : ""}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
      </div>
      <h1 style="color: #333; text-align: center;">Verify your email</h1>

      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        Hi ${firstName || "there"},
      </p>

      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        Tap the button below to verify your email and finish creating your Jetzy account. You'll choose a password on the next screen.
      </p>

      ${trialMonths && trialMonths > 0
        ? `<div style="background-color: #fff8e1; border: 1px solid #f0d78c; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 6px 0; color: #7a5c00; font-weight: bold; font-size: 16px;">
          🎁 ${trialMonths} month${trialMonths === 1 ? "" : "s"} of Jetzy Premium are waiting
        </p>
        <p style="margin: 0; color: #7a5c00; font-size: 14px; line-height: 1.6;">
          Your invite code adds them to your account as soon as you verify this email. Nothing is charged
          — it simply ends after ${trialMonths === 1 ? "the month" : `the ${trialMonths} months`} unless you choose to continue.
        </p>
      </div>`
        : ""}

      <div style="text-align: center; margin: 35px 0;">
        <a href="${verifyUrl}" style="background-color: #F79432; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
          Verify Email
        </a>
      </div>

      <p style="font-size: 14px; color: #777; line-height: 1.6;">
        Or paste this link into your browser:<br/>
        <a href="${verifyUrl}" style="color: #F79432; word-break: break-all;">${verifyUrl}</a>
      </p>

      <p style="font-size: 13px; color: #999; line-height: 1.6; margin-top: 20px;">
        If you didn't request this, you can safely ignore this email.
      </p>

      <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color: #F79432; text-decoration: none;">${CONTACT_EMAIL}</a>
        <br />
        &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
      </p>
    </div>
  `

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(process.env.SENDGRID_FROM_WELCOME),
      subject: trialMonths && trialMonths > 0
        ? `Verify your email — ${trialMonths} month${trialMonths === 1 ? "" : "s"} of Jetzy Premium inside`
        : "Verify your email — Jetzy Life",
      html: wrapHtml(html),
      text: `Hi ${firstName || "there"},\n\nVerify your email and finish creating your Jetzy account:\n${verifyUrl}\n${
        trialMonths && trialMonths > 0
          ? `\n${trialMonths} month${trialMonths === 1 ? "" : "s"} of Jetzy Premium are added to your account as soon as you verify.\n`
          : ""
      }\nIf you didn't request this, ignore this email.`,
    })
    console.log(`✅ Verification email sent to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send verification email:", error)
    throw error
  }
}

export const sendBlockNotificationEmail = async ({ email, blockedAt }: { email: string; blockedAt: string }) => {
  try {
    await sgMail.send({
      to: process.env.ADMIN_NOTIFICATION_EMAIL || "tech@jetzyapp.com",
      // Internal alert to the admin inbox — the distinct name is a triage label, not the
      // guest-facing sender, so it deliberately doesn't use `mailFrom()`.
      from: {
        email: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
        name: "Jetzy Security"
      },
      subject: `🚨 [COMPLIANCE] Account Blocked - ${email}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #DC3545; border-radius: 12px;">
          <h1 style="color: #DC3545; text-align: center;">🚨 Security Alert: Account Blocked</h1>
          
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC3545;">
            <h3 style="color: #721c24; margin-top: 0;">Action Required – Compliance Review</h3>
            <p style="color: #721c24; margin: 0;">
              A user has reported that they did not create a Jetzy account with their email. The account has been automatically blocked.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Account Details</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Blocked At:</strong> ${blockedAt}</p>
            <p><strong>Reason:</strong> User reported account was created without their consent.</p>
          </div>

          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FFC107;">
            <h3 style="color: #856404; margin-top: 0;">What has been done automatically:</h3>
            <ul style="color: #856404;">
              <li>Account has been flagged as <strong>isBlocked = true</strong></li>
              <li>Account has been flagged as <strong>requiresVerification = true</strong></li>
              <li>User will see a verification prompt on next login attempt</li>
            </ul>
          </div>

          <p style="color: #333; font-size: 14px;">Please review this account in the database for compliance.</p>
          
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 20px; padding-top: 15px;">
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc. – Internal Compliance System
          </p>
        </div>
      `),
      text: `SECURITY ALERT: Account Blocked\n\nEmail: ${email}\nBlocked At: ${blockedAt}\nReason: User reported account was created without their consent.\n\nThe account has been automatically blocked and flagged for compliance review. Please review this account in the admin dashboard.`
    });
    console.log(`✅ Block notification sent to tech@jetzyapp.com for: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send block notification:", error);
    throw error;
  }
}

/**
 * PHASE 2: Mandatory Verification Email
 */
export const sendManualVerificationEmail = async ({ email, code }: { email: string; code: string }) => {
  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `Your Jetzy Verification Code: ${code}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
            <h1 style="color: #333; font-size: 24px; margin: 0;">Verify Your Email</h1>
          </div>
          
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            You requested a verification code to reactivate your Jetzy account. Please use the 6-digit code below to proceed:
          </p>
          
          <div style="background-color: #f9f9f9; padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0; border: 1px dashed #F79432;">
            <span style="font-family: monospace; font-size: 42px; font-weight: 800; color: #F79432; letter-spacing: 12px;">${code}</span>
          </div>
          
          <p style="color: #999; font-size: 14px; line-height: 1.4;">
            This code will expire in 30 minutes. If you did not request this, please ignore this email.
          </p>
          
          <p style="font-size: 12px; color: #ccc; text-align: center; border-top: 1px solid #eee; margin-top: 30px; padding-top: 15px;">
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
          </p>
        </div>
      `),
      text: `Your Jetzy Verification Code: ${code}\n\nUse this code to verify your email. It expires in 30 minutes.`
    });
    console.log(`✅ Manual verification code sent to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send manual verification email:", error);
    throw error;
  }
}

/**
 * Album access verification code.
 *
 * Sent before a visitor is let into a shared album, so the email we capture (and the
 * interests attached to it) belongs to the person typing it. Names the event so it can't be
 * mistaken for the account-reactivation code sent by sendManualVerificationEmail.
 */
export const sendAlbumVerificationCode = async ({ email, code, eventName }: { email: string; code: string; eventName?: string }) => {
  const cleanEventName = eventName ? stripHtml(decodeHTMLEntities(eventName)) : ""
  const forEvent = cleanEventName ? ` for &quot;${cleanEventName}&quot;` : ""
  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `Your album access code: ${code}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
            <h1 style="color: #333; font-size: 24px; margin: 0;">View the photos</h1>
          </div>

          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Enter this code to confirm your email and open the photo album${forEvent}:
          </p>

          <div style="background-color: #f9f9f9; padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0; border: 1px dashed #F79432;">
            <span style="font-family: monospace; font-size: 42px; font-weight: 800; color: #F79432; letter-spacing: 12px;">${code}</span>
          </div>

          <p style="color: #999; font-size: 14px; line-height: 1.4;">
            This code expires in 10 minutes. If you didn't ask to view an album, you can ignore this email — nothing has been created for you.
          </p>

          <p style="font-size: 12px; color: #ccc; text-align: center; border-top: 1px solid #eee; margin-top: 30px; padding-top: 15px;">
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
          </p>
        </div>
      `),
      text: `Your album access code: ${code}

Enter this code to confirm your email and open the photo album${cleanEventName ? ` for "${cleanEventName}"` : ""}. It expires in 10 minutes.`
    });
    console.log(`✅ Album verification code sent to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send album verification code:", error);
    throw error;
  }
}

/**
 * Confirms that we received a request for the unwatermarked original of an album photo.
 *
 * Copy is the CEO's, verbatim (2026-08-27). It deliberately promises follow-up rather than a
 * file: nothing is fulfilled automatically, a person handles it from the Photo Requests tab
 * in the manage console. Saying anything more here would be a promise the product doesn't keep.
 */
export const sendAlbumPhotoRequestReceived = async ({
  email,
  eventName,
  albumTitle,
  mediaUrls,
}: {
  email: string
  eventName?: string
  albumTitle?: string
  /** Every photo in this submission — one email covers the lot, never one per photo. */
  mediaUrls?: string[]
}) => {
  const cleanEventName = eventName ? stripHtml(decodeHTMLEntities(eventName)) : ""
  const cleanAlbumTitle = albumTitle ? stripHtml(decodeHTMLEntities(albumTitle)) : ""
  // Images only — a video frame can't be shown in an email client.
  const images = (mediaUrls || []).filter((u) => !/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u))
  // Enough to confirm what was asked for without building a mail nobody can open.
  const shown = images.slice(0, 6)
  const extra = images.length - shown.length
  const count = (mediaUrls || []).length
  const context = [cleanAlbumTitle, cleanEventName].filter(Boolean).join(" — ")
  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: count > 1 ? `We received your request for ${count} unwatermarked photos` : `We received your request for unwatermarked photos`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
            <h1 style="color: #333; font-size: 24px; margin: 0;">Request received</h1>
          </div>

          <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi,</p>
          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            We received your request for unwatermarked photos. We&#39;ll get back to you with more information soon.
          </p>

          ${shown.length > 0 ? `
          <div style="background-color: #f9f9f9; padding: 12px; border-radius: 12px; margin: 25px 0; text-align: center;">
            ${shown.map((u) => `<img src="${u}" alt="Requested photo" style="max-width: ${shown.length > 1 ? "45%" : "100%"}; border-radius: 8px; margin: 4px;" />`).join("")}
            ${extra > 0 ? `<p style="color: #999; font-size: 13px; margin: 10px 0 0;">and ${extra} more</p>` : ""}
            ${context ? `<p style="color: #999; font-size: 13px; margin: 10px 0 0;">${context}</p>` : ""}
          </div>` : context ? `
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; color: #666; font-size: 14px;">${context}</p>
          </div>` : ""}

          <p style="color: #333; font-size: 16px; line-height: 1.6; margin-top: 25px;">
            Thank you,<br />Jetzy Team
          </p>

          <p style="font-size: 12px; color: #ccc; text-align: center; border-top: 1px solid #eee; margin-top: 30px; padding-top: 15px;">
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
          </p>
        </div>
      `),
      text: `Hi,

We received your request for unwatermarked photos. We'll get back to you with more information soon.

Thank you,
Jetzy Team`,
    });
    console.log(`✅ Photo request confirmation sent to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send photo request confirmation:", error);
    // Best-effort: the request is already recorded, and failing the call would tell the
    // visitor their request didn't land when it did.
  }
}

/**
 * Tells the Jetzy inbox that somebody asked for an unwatermarked photo.
 *
 * The request also lands in the manage console's Photo Requests tab; this exists because
 * nobody is watching that tab, and the confirmation email has already promised a reply.
 */
export const sendAlbumPhotoRequestNotice = async ({
  requesterName,
  requesterEmail,
  eventName,
  eventSlug,
  albumTitle,
  albumId,
  mediaUrls,
}: {
  requesterName: string
  requesterEmail: string
  eventName: string
  eventSlug: string
  albumTitle: string
  albumId: string
  mediaUrls: string[]
}) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (baseUrl?.includes("localhost")) {
    console.log(`[LOCALHOST MODE] sendAlbumPhotoRequestNotice skipped - would notify admin for:`, requesterEmail)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  const senderEmail = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim()
  // Its OWN recipient, not the shared ADMIN_NOTIFICATION_EMAIL: these requests are worked by
  // the tech inbox, and pointing them there must not move the album-access notices or the
  // security alerts that share that variable. Defaulted rather than required so it works
  // without an env change; the env var is there to redirect staging traffic.
  const recipient = (process.env.PHOTO_REQUEST_NOTIFICATION_EMAIL as string)?.trim() || PHOTO_REQUEST_INBOX
  if (!senderEmail) {
    console.error("SENDGRID_EMAIL_SENDER not set — cannot send photo request notice")
    return
  }
  const cleanEventName = decodeHTMLEntities(eventName)
  const albumUrl = buildEventAlbumUrl(baseUrl || "", eventSlug, albumId)
  const urls = mediaUrls || []
  const images = urls.filter((u) => !/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u))
  const others = urls.filter((u) => !images.includes(u))
  const when = new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC"
  try {
    await sgMail.send({
      to: recipient,
      // Still the verified sender — only the RECIPIENT is different. Changing `from` would
      // break sender verification.
      from: mailFrom(senderEmail),
      subject: `[Album] ${urls.length > 1 ? `${urls.length} unwatermarked photos` : "Unwatermarked photo"} requested — ${cleanEventName}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid #F79432; border-radius: 12px;">
          <h2 style="color: #F79432; margin-top: 0;">Unwatermarked Photo Request</h2>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${requesterName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${requesterEmail}</p>
            <p style="margin: 5px 0;"><strong>Event:</strong> ${cleanEventName}</p>
            <p style="margin: 5px 0;"><strong>Album:</strong> ${albumTitle}</p>
            <p style="margin: 5px 0;"><strong>Photos:</strong> ${urls.length}</p>
            <p style="margin: 5px 0;"><strong>When:</strong> ${when}</p>
          </div>
          ${images.length > 0 ? `<div style="text-align: center; margin: 20px 0;">${images.map((u) => `<img src="${u}" alt="Requested photo" style="max-width: ${images.length > 1 ? "45%" : "100%"}; border-radius: 8px; margin: 4px;" />`).join("")}</div>` : ""}
          ${others.map((u) => `<p style="margin: 5px 0; word-break: break-all;"><strong>File:</strong> ${u}</p>`).join("")}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${albumUrl}" style="background-color: #F79432; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Open Album
            </a>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
            Automated notification from Jetzy Events.
          </p>
        </div>
      `),
      text: `Unwatermarked photo request\nName: ${requesterName}\nEmail: ${requesterEmail}\nEvent: ${cleanEventName}\nAlbum: ${albumTitle}\nPhotos: ${urls.length}\n${urls.join("\n")}\nWhen: ${when}\nOpen: ${albumUrl}`,
    })
  } catch (error) {
    console.error("Failed to send photo request notice:", error)
    // Non-fatal — do not throw; the request is already recorded.
  }
}


/**
 * The code that lets somebody claim free Jetzy Premium from a shared referral link without ever
 * making a password.
 *
 * Deliberately its own template rather than reusing the album one: this email confirms an address
 * that is about to become an account and start a membership, and telling that person about "photo
 * albums" would read as the wrong email entirely. It names the months so the code arrives with the
 * offer it belongs to still attached.
 */
/**
 * The 6-digit code that proves an address before buying Jetzy Premium.
 *
 * Deliberately says nothing about what is being claimed. It used to name the free months on a
 * shared referral link ("claim 1 month of Jetzy Premium free"), which put an offer in an email
 * that is sent BEFORE anything is checked against the recipient's account — so it read as a
 * promise the checkout could still refuse. This email does one job: confirm the address.
 */
export const sendPremiumVerificationCode = async ({ email, code }: { email: string; code: string }) => {
  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `Your Jetzy verification code: ${code}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
            <h1 style="color: #333; font-size: 24px; margin: 0;">Confirm your email</h1>
          </div>

          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Enter this code to confirm your email:
          </p>

          <div style="background-color: #f9f9f9; padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0; border: 1px dashed #F5C518;">
            <span style="font-family: monospace; font-size: 42px; font-weight: 800; color: #B7860B; letter-spacing: 12px;">${code}</span>
          </div>

          <p style="color: #999; font-size: 14px; line-height: 1.4;">
            This code expires in 10 minutes. If you didn't ask for it, you can ignore this email — nothing has been created for you.
          </p>

          <p style="font-size: 12px; color: #ccc; text-align: center; border-top: 1px solid #eee; margin-top: 30px; padding-top: 15px;">
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
          </p>
        </div>
      `),
      text: `Your Jetzy verification code: ${code}

Enter this code to confirm your email. It expires in 10 minutes.`
    });
    console.log(`✅ Premium verification code sent to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send premium verification code:", error);
    throw error;
  }
}

/**
 * PHASE 2: Admin Compliance Review Alert
 */
export const sendAdminComplianceAlert = async ({ email, unblockToken }: { email: string; unblockToken: string }) => {
  const adminUrl = `${process.env.NEXT_PUBLIC_URL || 'https://events.jetzy.com'}/api/admin/compliance/unblock?token=${unblockToken}`;
  
  try {
    await sgMail.send({
      to: process.env.ADMIN_NOTIFICATION_EMAIL || "tech@jetzyapp.com",
      // Internal alert to the admin inbox — see the note on "Jetzy Security" above.
      from: {
        email: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
        name: "Jetzy Compliance"
      },
      subject: `ACTION REQUIRED: User Verified - Compliance Review for ${email}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid #F79432; border-radius: 12px;">
          <h2 style="color: #F79432; margin-top: 0;">Compliance Review Required</h2>
          
          <p style="color: #333; font-size: 16px;">
            The following user has successfully verified their email address and is requesting their account be unblocked:
          </p>
          
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> Verified (Pending Admin Review)</p>
          </div>
          
          <p style="color: #333;">If you have reviewed this account and everything looks correct, click the button below to <strong>Unblock</strong> the user instantly:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${adminUrl}" style="background-color: #28a745; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">
              Approve & Unblock Account
            </a>
          </div>
          
          <p style="font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px;">
            This is an automated security notification.
          </p>
        </div>
      `),
      text: `ACTION REQUIRED: User Verified\n\nEmail: ${email}\n\nThe user has verified their email. Review and unblock using this link:\n${adminUrl}`
    });
    console.log(`✅ Admin compliance alert sent for: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send admin compliance alert:", error);
    throw error;
  }
}

/**
 * PHASE 2: Account Approved & Password Notification
 */
export const sendAccountApprovedEmail = async ({ email, password }: { email: string; password?: string }) => {
  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject: `Your Jetzy Account is Approved! 🎉`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; border-top: 5px solid #28a745;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" style="vertical-align: middle; margin-bottom: 10px;" />
            <h1 style="color: #28a745; font-size: 26px; margin: 0;">Good News! Your Account is Active</h1>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            Hi there, <br><br>
            Our compliance team has reviewed and <strong>Approved</strong> your Jetzy account. You can now log in and access all event features.
          </p>
          
          ${password ? `
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border: 1px solid #e9ecef; margin: 25px 0;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Temporary Password</p>
            <span style="font-family: monospace; font-size: 24px; font-weight: 700; color: #333;">${password}</span>
          </div>
          <p style="color: #F79432; font-size: 14px; font-weight: bold;">Important: Please change your password immediately after logging in for security.</p>
          ` : ''}
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${process.env.NEXT_PUBLIC_URL || 'https://events.jetzy.com'}/login" style="background-color: #F79432; color: white; padding: 14px 35px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(247, 148, 50, 0.2);">
              Log In Now
            </a>
          </div>
          
          <p style="color: #999; font-size: 13px; line-height: 1.5; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            Welcome to the Jetzy family! We're excited to have you back.<br>
            &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
          </p>
        </div>
      `),
      text: `Good News! Your Jetzy account is approved.\n\n${password ? `Your temporary password is: ${password}\nPlease change it after logging in.` : ''}\n\nLog in here: ${process.env.NEXT_PUBLIC_URL || 'https://events.jetzy.com'}/login`
    });
    console.log(`✅ Account approval email sent to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send account approval email:", error);
    throw error;
  }
}

type ChatTagNotificationData = {
  email: string
  taggedName?: string
  taggerName: string
  eventName: string
  eventSlug: string
}

export const sendChatTagNotification = async ({
  email,
  taggedName,
  taggerName,
  eventName,
  eventSlug,
}: ChatTagNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  // view=discussion so the event page auto-expands + scrolls to the chat (handled in HostedEvents.tsx)
  const chatUrl = `${buildEventUrl(baseUrl, eventSlug)}?view=discussion`

  const displayName = taggedName || email.split('@')[0]
  const cleanEventName = decodeHTMLEntities(eventName)

  const subject = `${taggerName} mentioned you in ${cleanEventName} chat`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${displayName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${taggerName}</strong> mentioned you in the chat for <strong>${cleanEventName}</strong>.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${chatUrl}" style="background: linear-gradient(135deg, #F79432 0%, #e8842a 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(247, 148, 50, 0.3);">
                Open Chat
              </a>
            </div>

            <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">
              Click the button above to view the conversation and reply.
            </p>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `Hi ${displayName},\n\n${taggerName} mentioned you in the chat for ${cleanEventName}.\n\nOpen the chat: ${chatUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Chat tag notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send chat tag notification email:", error)
    throw error
  }
}

type ChatMessageNotificationData = {
  email: string
  recipientName?: string
  senderName: string
  eventName: string
  eventSlug: string
}

export const sendChatMessageNotification = async ({
  email,
  recipientName,
  senderName,
  eventName,
  eventSlug,
}: ChatMessageNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  // view=discussion so the event page auto-expands + scrolls to the chat (handled in HostedEvents.tsx)
  const chatUrl = `${buildEventUrl(baseUrl, eventSlug)}?view=discussion`

  const displayName = recipientName || email.split('@')[0]
  const cleanEventName = decodeHTMLEntities(eventName)

  const subject = `New message in ${cleanEventName}`

  try {
    await sgMail.send({
      to: email,
      from: mailFrom(),
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${displayName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${senderName}</strong> sent a new message in <strong>${cleanEventName}</strong>. Open the chat to read it and reply.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${chatUrl}" style="background: linear-gradient(135deg, #F79432 0%, #e8842a 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(247, 148, 50, 0.3);">
                Open Chat
              </a>
            </div>

            <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">
              Click the button above to view the conversation and reply.
            </p>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>

            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `Hi ${displayName},\n\n${senderName} sent a new message in ${cleanEventName}. Open the chat to read it and reply.\n\nOpen the chat: ${chatUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Chat message notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send chat message notification email:", error)
    throw error
  }
}

/* ------------------------------------------------------------------------- *
 * Jetzy Premium membership lifecycle emails
 *
 * A membership can now be acquired as a side effect of buying a ticket
 * (`IEventTicket.includesPremium`), so the buyer may not think of themselves as
 * having "subscribed to" anything. That makes these messages more important than they
 * would be for a deliberate signup: every recurring charge, every failure, every plan
 * change and every ending has to be announced, and each one says how to cancel.
 *
 * All of them are best-effort — a failed send must never break webhook processing.
 * ------------------------------------------------------------------------- */

type MembershipEmailData = {
	email: string
	firstName?: string
	/** Major units (dollars). */
	amount: number
	interval: string
	/** Start of the next period, for renewal/cancellation copy. */
	nextBillingDate?: Date
	/**
	 * Which membership this is about — "Jetzy Premium" or "Full Concierge Membership".
	 * Comes from `MEMBERSHIPS[key].label`. Defaulted rather than required so a caller that
	 * can't identify the product still sends a message, but naming it matters: a member of
	 * both who gets an unlabelled "your membership has ended" cannot tell which one.
	 */
	label?: string
}

const DEFAULT_MEMBERSHIP_LABEL = "Jetzy Premium"

/**
 * The rate is HALF the "regular price" we advertise — the same claim `COMPARE_AT_MULTIPLIER`
 * makes on the plan card, kept as one number here so the two can't drift. It is marketing copy:
 * nothing in Stripe holds a higher price and nobody has ever been billed one.
 */
const LAUNCH_DISCOUNT_LABEL = "50% off"

const membershipShell = (bodyHtml: string, accent: string) => wrapHtml(`
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
    <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-top: 4px solid ${accent};">
      ${bodyHtml}
      <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 25px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 15px;">
        Manage or cancel your membership any time from <strong>Manage membership</strong> in your account menu.
        Questions? Reply to this email or contact us at ${CONTACT_EMAIL}.
      </p>
    </div>
  </div>
`)

const money = (n: number) => `$${n.toFixed(2)}`

/** Sent on each RENEWAL — never on the first invoice, which the ticket receipt already covers. */
export const sendMembershipRenewed = async ({ email, firstName, amount, interval, nextBillingDate, label }: MembershipEmailData) => {
	const name = firstName || email.split("@")[0]
	const product = label || DEFAULT_MEMBERSHIP_LABEL
	const nextLine = nextBillingDate
		? `Your next payment is due on ${dayjs(nextBillingDate).format("MMMM D, YYYY")}.`
		: ""

	try {
		await sgMail.send({
			to: email,
			from: mailFrom(),
			subject: `Your ${product} membership renewed — ${money(amount)}`,
			html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:15px 0;">
          Your ${product} membership has renewed. We've charged <strong>${money(amount)}</strong> for another ${interval}.
        </p>
        ${nextLine ? `<p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">${nextLine}</p>` : ""}
      `, "#F5C518"),
			text: `Hi ${name},\n\nYour ${product} membership has renewed. We've charged ${money(amount)} for another ${interval}.\n${nextLine}\n\nManage or cancel any time from Manage membership in your account menu.\n\n— Team Jetzy`,
		})
		console.log(`✅ Membership renewal email sent to: ${email}`)
	} catch (error) {
		console.error("❌ Failed to send membership renewal email:", error)
	}
}

/**
 * Sent when a membership STARTS from a deliberate signup — `/subscribe` or the paywall.
 *
 * Not sent for a membership bought as part of a ticket: those are created by
 * `startMembershipSubscription` after the payment, never by a subscription Checkout Session, and
 * the ticket confirmation already states the amount, the interval and the renewal date. Two
 * receipts for one transaction is worse than one.
 *
 * Trial-aware, because the two cases are materially different at the point of purchase: an
 * invite code means nothing has been charged yet and the first payment lands on a named date.
 * Saying "we've charged you" over a free trial, or hiding the charge that follows one, are both
 * misstatements — the same rule the checkout disclosure follows.
 */
export const sendMembershipStarted = async ({
	email,
	firstName,
	amount,
	interval,
	label,
	trialEndsOn,
	nextBillingDate,
	endsWithoutCard,
}: MembershipEmailData & {
	/** Set when the membership started on a free trial — the date the first real charge lands. */
	trialEndsOn?: Date
	/**
	 * No card was collected, so the membership ENDS at the trial rather than renewing — a gift
	 * granted at signup. "Renews until you cancel" would be plainly untrue here, and would leave
	 * someone waiting for a charge that never comes while their membership quietly lapses.
	 */
	endsWithoutCard?: boolean
}) => {
	const name = firstName || email.split("@")[0]
	const product = label || DEFAULT_MEMBERSHIP_LABEL
	const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
	const chargesOn = trialEndsOn ? dayjs(trialEndsOn).format("MMMM D, YYYY") : null
	const renewsOn = nextBillingDate ? dayjs(nextBillingDate).format("MMMM D, YYYY") : null

	// The one sentence that has to be exactly right: what has been taken, what will be taken,
	// and when. This is a card-network disclosure, not decoration — it stays regardless of what
	// the surrounding marketing copy says, and it is the only place the exact date and amount
	// appear together.
	const terms = chargesOn && endsWithoutCard
		? `Your membership is <strong>free until ${chargesOn}</strong>. There's no card on file, so nothing will be charged — it simply ends on that date unless you add one. Keeping it costs ${money(amount)} every ${interval}.`
		: chargesOn
			? `Your membership is <strong>free until ${chargesOn}</strong>. After that it renews at <strong>${money(amount)} every ${interval}</strong> until you cancel — cancel any time before then and you won't be charged.`
			: `You've been charged <strong>${money(amount)}</strong>, and your membership renews at that amount every ${interval} until you cancel${renewsOn ? `, starting <strong>${renewsOn}</strong>` : ""}.`

	// ---- The CEO's welcome copy (2026-08-27), reproduced as written ----
	//
	// Premium only. Full Concierge is sold on selectmember.jetzy.com's terms, and its benefits and
	// price are not these; the plain welcome it always had still serves it.
	const isPremiumProduct = product === DEFAULT_MEMBERSHIP_LABEL
	// "$20/month", not "$20.00/month" — whole dollars drop the cents, as on the plan card.
	const rate = `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}/${interval}`

	const opening = chargesOn
		? `Your ${product} free trial is now active.`
		: `Your ${product} membership is now active.`

	const benefits =
		"You now have access to <strong>Premium benefits, exclusive events, curated networking, customized matches, ability to host events with other members and special travel &amp; lifestyle offers</strong> available to Jetzy Premium members."

	const launch = `As an early member, you've also unlocked our <strong>limited-time launch pricing of just ${rate} — ${LAUNCH_DISCOUNT_LABEL} the regular membership price.</strong>`

	const lockIn = `Your <strong>${LAUNCH_DISCOUNT_LABEL} discounted rate will be locked in for one full year from the date you sign up</strong>, as long as your membership remains active.`

	// Only where it is true. A trial with no card on file never converts, so "cancel before it
	// ends and you won't be charged" describes a charge that was never coming — the terms box
	// above already says what actually happens there.
	const riskFree =
		chargesOn && !endsWithoutCard
			? "Enjoy your free trial <strong>risk-free</strong>. Cancel anytime before your trial ends and you won't be charged."
			: null

	const signOff = `<strong>Welcome to ${product}. Enjoy the world differently.</strong>`

	const para = (html: string, color = "#4B5563", size = 15) =>
		`<p style="color:${color};font-size:${size}px;line-height:1.6;margin:15px 0;">${html}</p>`

	const heading = isPremiumProduct
		? `<h1 style="color:#1F2937;font-size:22px;line-height:1.4;margin:0 0 15px 0;">Welcome to ${product}!</h1>`
		: ""

	const marketing = isPremiumProduct
		? [para(opening, "#1F2937", 16), para(benefits), para(launch), para(lockIn), riskFree ? para(riskFree) : ""].join("")
		: para(`Your ${product} membership is active. Welcome aboard.`, "#1F2937", 16)

	const textLines = isPremiumProduct
		? [
				`Hi ${name},`,
				`Welcome to ${product}!`,
				stripHtml(opening),
				stripHtml(benefits).replace(/&amp;/g, "&"),
				stripHtml(launch),
				stripHtml(lockIn),
				riskFree ? stripHtml(riskFree) : null,
				stripHtml(terms),
				`Browse events at ${baseUrl}`,
				stripHtml(signOff),
				"— Team Jetzy",
		  ]
		: [
				`Hi ${name},`,
				`Your ${product} membership is active. Welcome aboard.`,
				stripHtml(terms),
				`Browse events at ${baseUrl}`,
				"— Team Jetzy",
		  ]

	try {
		await sgMail.send({
			to: email,
			from: mailFrom(),
			subject: isPremiumProduct
				? `Welcome to ${product}!`
				: chargesOn
					? `Your ${product} membership is active — free until ${chargesOn}`
					: `Welcome to ${product}`,
			html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        ${heading}
        ${marketing}
        <div style="background-color:#FFFBEB;border:1px solid #F0D78C;border-radius:8px;padding:15px;margin:20px 0;">
          <p style="color:#7A5C00;font-size:15px;line-height:1.6;margin:0;">${terms}</p>
        </div>
        <div style="text-align:center;margin:25px 0;">
          <a href="${baseUrl}" style="background-color:#F5C518;color:#000;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
            Browse events
          </a>
        </div>
        ${isPremiumProduct ? para(signOff, "#1F2937", 16) : ""}
      `, "#F5C518"),
			text: textLines.filter(Boolean).join("\n\n"),
		})
		console.log(`✅ Membership welcome email sent to: ${email}`)
	} catch (error) {
		console.error("❌ Failed to send membership welcome email:", error)
	}
}

/**
 * Sent when a member CHANGES PLAN — monthly to annual, in practice.
 *
 * A plan switch happens inside Stripe's billing portal, so nothing on this site ever confirms
 * it: the member clicks through a Stripe screen, lands back here, and has only their card
 * statement to tell them what they now pay. Naming both the old and new rate is the point — the
 * amount changed, and a message that states only the new one reads like a price rise nobody
 * announced.
 */
export const sendMembershipPlanChanged = async ({
	email,
	firstName,
	amount,
	interval,
	previousAmount,
	previousInterval,
	nextBillingDate,
	label,
}: MembershipEmailData & {
	/** What they were paying before, so the change is legible rather than just a new number. */
	previousAmount?: number
	previousInterval?: string
}) => {
	const name = firstName || email.split("@")[0]
	const product = label || DEFAULT_MEMBERSHIP_LABEL
	const renewsOn = nextBillingDate ? dayjs(nextBillingDate).format("MMMM D, YYYY") : null
	const from =
		previousAmount != null && previousInterval
			? `You were on <strong>${money(previousAmount)}/${previousInterval}</strong>.`
			: ""

	try {
		await sgMail.send({
			to: email,
			from: mailFrom(),
			subject: `Your ${product} plan is now ${money(amount)}/${interval}`,
			html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:15px 0;">
          Your ${product} membership has moved to <strong>${money(amount)} every ${interval}</strong>.
          ${from}
        </p>
        <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">
          ${renewsOn ? `Your next payment is due on <strong>${renewsOn}</strong>. ` : ""}Stripe has applied any
          credit or charge for the part of your old plan you had already paid for — see your billing page for the
          exact figures.
        </p>
      `, "#F5C518"),
			text: `Hi ${name},\n\nYour ${product} membership has moved to ${money(amount)} every ${interval}. ${stripHtml(from)}\n\n${renewsOn ? `Your next payment is due on ${renewsOn}. ` : ""}Stripe has applied any credit or charge for the part of your old plan you had already paid for.\n\n— Team Jetzy`,
		})
		console.log(`✅ Membership plan-change email sent to: ${email}`)
	} catch (error) {
		console.error("❌ Failed to send membership plan-change email:", error)
	}
}

/**
 * Sent when a renewal payment FAILS. The most important of the three: without it a
 * member's card expires, Stripe stops retrying, and they lose membership silently.
 */
export const sendMembershipPaymentFailed = async ({ email, firstName, amount, interval, label }: MembershipEmailData) => {
	const name = firstName || email.split("@")[0]
	const product = label || DEFAULT_MEMBERSHIP_LABEL
	const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"

	try {
		await sgMail.send({
			to: email,
			from: mailFrom(),
			subject: `Action needed: your ${product} payment didn't go through`,
			html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:15px 0;">
          We couldn't take the <strong>${money(amount)}</strong> payment for your ${product} membership.
          This usually means the card on file has expired or was declined.
        </p>
        <div style="background-color:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:15px;margin:20px 0;">
          <p style="color:#991B1B;font-size:14px;line-height:1.6;margin:0;">
            We'll retry over the next few days. If the payment still doesn't go through,
            your membership will end.
          </p>
        </div>
        <div style="text-align:center;margin:25px 0;">
          <a href="${baseUrl}" style="background-color:#F5C518;color:#000;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
            Update your card
          </a>
        </div>
        <p style="color:#4B5563;font-size:14px;line-height:1.6;margin:15px 0 0 0;">
          Sign in and choose <strong>Manage membership</strong> from your account menu to update your payment details.
        </p>
      `, "#DC2626"),
			text: `Hi ${name},\n\nWe couldn't take the ${money(amount)} payment for your ${product} membership. The card on file may have expired or been declined.\n\nWe'll retry over the next few days. If the payment still doesn't go through, your membership will end.\n\nSign in at ${baseUrl} and choose "Manage membership" to update your card.\n\n— Team Jetzy`,
		})
		console.log(`✅ Membership payment-failed email sent to: ${email}`)
	} catch (error) {
		console.error("❌ Failed to send membership payment-failed email:", error)
	}
}

/**
 * Sent when a membership is SCHEDULED to end (cancelled, still active until the period
 * ends) or has ACTUALLY ended. One function, two states — the difference matters to the
 * reader, who otherwise can't tell whether they still have access.
 */
export const sendMembershipCancelled = async ({
	email,
	firstName,
	endsOn,
	alreadyEnded,
	label,
	onTrial = false,
	amount,
	interval,
	reactivateUrl,
}: {
	email: string
	firstName?: string
	endsOn?: Date
	alreadyEnded: boolean
	/** Which membership ended. A member of both cannot tell from an unlabelled message. */
	label?: string
	/**
	 * Cancelled DURING a free trial.
	 *
	 * Changes what the member is losing and when: "the end of your free trial" is the honest
	 * description of a period they were never charged for, and "your current billing period"
	 * would imply a payment that never happened.
	 */
	onTrial?: boolean
	/** What they were paying, for the win-back. Both or neither — the sentence needs the pair. */
	amount?: number
	interval?: string
	/** Where "Reactivate" points. Omitted and no win-back block renders. */
	reactivateUrl?: string
}) => {
	const name = firstName || email.split("@")[0]
	const product = label || DEFAULT_MEMBERSHIP_LABEL
	const endsOnLabel = endsOn ? dayjs(endsOn).format("MMMM D, YYYY") : null

	// The win-back copy is Jetzy Premium's, supplied by the CEO. Full Concierge is sold on
	// selectmember.jetzy.com's own terms, so it keeps the plain message it always had — quoting
	// Premium's launch price at a Concierge member would be a straightforwardly wrong statement.
	const isPremiumProduct = product === DEFAULT_MEMBERSHIP_LABEL
	// "$20/month", not "$20.00/month" — whole dollars drop the cents, matching how the price
	// reads on the plan card and in the CEO's copy.
	const rate =
		amount != null && interval
			? `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}/${interval}`
			: null
	const useWinBack = isPremiumProduct && !!reactivateUrl

	if (!useWinBack) {
		const headline = alreadyEnded
			? `Your ${product} membership has ended.`
			: endsOnLabel
				? `Your ${product} membership is set to end on <strong>${endsOnLabel}</strong>.`
				: `Your ${product} membership is set to end at the close of your current billing period.`

		const body = alreadyEnded
			? "You won't be charged again. Any tickets you've already bought are unaffected and remain valid."
			: "You keep full access until then, and you won't be charged again. Any tickets you've already bought are unaffected and remain valid."

		try {
			await sgMail.send({
				to: email,
				from: mailFrom(),
				subject: alreadyEnded ? `Your ${product} membership has ended` : `Your ${product} membership is scheduled to end`,
				html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:15px 0;">${headline}</p>
        <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">${body}</p>
      `, "#6B7280"),
				text: `Hi ${name},\n\n${stripHtml(headline)}\n\n${body}\n\n— Team Jetzy`,
			})
			console.log(`✅ Membership cancellation email sent to: ${email} (alreadyEnded=${alreadyEnded})`)
		} catch (error) {
			console.error("❌ Failed to send membership cancellation email:", error)
		}
		return
	}

	// ---- Jetzy Premium: the CEO's win-back copy, reproduced as written ----
	//
	// Only the date and the rate are substituted, and each sentence that needs one is dropped
	// rather than half-written when it is missing.
	const period = onTrial ? "free trial" : "current billing period"
	const ends = onTrial ? "your trial ends" : "your membership ends"

	const headline = `Your ${product} membership has been canceled.`

	const throughLine = alreadyEnded
		? null
		: endsOnLabel
			? `You'll continue to enjoy ${product} benefits through the end of your ${period} on <strong>${endsOnLabel}</strong>.`
			: `You'll continue to enjoy ${product} benefits through the end of your ${period}.`

	const losingLine = rate
		? alreadyEnded
			? `You've lost access to Premium benefits and events, as well as our limited-time launch pricing of <strong>${rate} — ${LAUNCH_DISCOUNT_LABEL} the regular price</strong>.`
			: `After ${ends}, you'll lose access to Premium benefits and events, as well as our limited-time launch pricing of <strong>${rate} — ${LAUNCH_DISCOUNT_LABEL} the regular price</strong>.`
		: alreadyEnded
			? "You've lost access to Premium benefits and events."
			: `After ${ends}, you'll lose access to Premium benefits and events.`

	const lockInLine = rate
		? `If you reactivate, your <strong>${rate}</strong> launch rate will be locked in for one full year from the date you sign up, as long as your membership remains active.`
		: null

	try {
		await sgMail.send({
			to: email,
			from: mailFrom(),
			subject: `Your ${product} membership has been canceled`,
			html: membershipShell(`
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:0;">Hi ${name},</p>
        <p style="color:#1F2937;font-size:16px;line-height:1.6;margin:15px 0;">${headline}</p>
        ${throughLine ? `<p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">${throughLine}</p>` : ""}
        <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">${losingLine}</p>
        ${lockInLine ? `<p style="color:#4B5563;font-size:15px;line-height:1.6;margin:15px 0;">${lockInLine}</p>` : ""}
        <div style="background-color:#FEF9E7;border:1px solid #F5C518;border-radius:10px;padding:18px;margin:22px 0;text-align:center;">
          <p style="color:#1F2937;font-size:15px;font-weight:bold;line-height:1.5;margin:0 0 14px 0;">
            Want to keep your Premium benefits and lock in the ${LAUNCH_DISCOUNT_LABEL} launch discount?
          </p>
          <a href="${reactivateUrl}" style="display:inline-block;background-color:#F5C518;color:#000000;font-weight:bold;font-size:15px;text-decoration:none;padding:12px 26px;border-radius:999px;">
            Reactivate my membership
          </a>
        </div>
      `, "#F5C518"),
			text: [
				`Hi ${name},`,
				stripHtml(headline),
				throughLine ? stripHtml(throughLine) : null,
				stripHtml(losingLine),
				lockInLine ? stripHtml(lockInLine) : null,
				`Want to keep your Premium benefits and lock in the ${LAUNCH_DISCOUNT_LABEL} launch discount? Reactivate your membership here: ${reactivateUrl}`,
				"— Team Jetzy",
			]
				.filter(Boolean)
				.join("\n\n"),
		})
		console.log(`✅ Membership cancellation email sent to: ${email} (alreadyEnded=${alreadyEnded}, onTrial=${onTrial})`)
	} catch (error) {
		console.error("❌ Failed to send membership cancellation email:", error)
	}
}
