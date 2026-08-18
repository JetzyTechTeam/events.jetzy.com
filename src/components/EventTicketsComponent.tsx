import {
  setSelectedTickets,
  toggleCheckoutForm,
} from "@Jetzy/redux/reducers/checkoutSlice";
import { useAppDispatch } from "@Jetzy/redux/stores";
import React, { useState } from "react";
import { waitUntil } from "@Jetzy/lib/utils";
import Spinner from "./misc/Spinner";
import { Error } from "@Jetzy/lib/_toaster";
import { IEvent } from "@/models/events/types";
import { CheckmarkSVG } from "@/assets/icons";
import { eventHasAnyApprovalTicket, eventRequiresApprovalForAllTickets, selectionRequiresApproval, ticketApprovalFlag } from "@/lib/ticket-approval";
import { eventPath } from "@/lib/event-slug";
import { buildTicketPricing } from "@/lib/ticket-pricing";
import { membershipQuantityInSelection, premiumOrderCapMessage, PREMIUM_TICKET_MAX_PER_ORDER, selectionMemberships, selectionMembershipInterval, ticketMemberships } from "@/lib/premium-bundle";
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships";
import { planPriceForInterval, useMembershipPlans } from "@/hooks/usePremiumPlan";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sendGAEvent } from "@next/third-parties/google";
import { stripHtml } from "@/utils/text";
import EventDescription from "@/components/events/EventDescription";
import { usePremiumStatus } from "@/hooks/usePremiumStatus";
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn";

type Props = {
  event: IEvent;
};

/**
 * Ticket blurb, collapsed to a few lines with a Show more toggle.
 *
 * Hosts paste multi-paragraph instructions (share the flyer, tag three friends, email a
 * screenshot…) into this field. Rendered in full on a phone, one ticket filled the screen and
 * the tickets under it were invisible without scrolling past it.
 *
 * The toggle stops propagation — the whole card is the selection target, so without it
 * "Show more" would also buy the ticket.
 */
const TicketDescription: React.FC<{ description: string }> = ({ description }) => {
  const [expanded, setExpanded] = useState(false);
  // Short blurbs are shown whole — a "Show more" under two lines is noise.
  const isLong = stripHtml(description || "").length > 140;

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className={!isLong || expanded ? "" : "line-clamp-3"}>
        <EventDescription
          description={description}
          className="text-sm text-gray-400 [&_a]:break-all"
        />
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-jetzy underline underline-offset-2"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};

const EventTicketsComponent: React.FC<Props> = ({ event }) => {
  const dispatcher = useAppDispatch();
  const { isPremium } = usePremiumStatus();
  const [showPremiumPromo, setShowPremiumPromo] = useState(false);
  usePremiumSubscriptionReturn();

  // Which memberships do this event's tickets sell? Drives the per-ticket price disclosure
  // below — the event-level banner that also used this was removed.
  const eventMembershipKeys = selectionMemberships(
    (event.tickets || []).map((t: any) => ({ ...t, isSelected: true })) as any,
  );
  // Only fetched when it's actually relevant — the endpoint is public, but there's no reason
  // to hit Stripe's plans on every event page.
  const { plans: membershipPlans } = useMembershipPlans(eventMembershipKeys);
  const planFor = (key: MembershipKey) => membershipPlans.find((plan) => plan.key === key);

  // format the event tickets
  const ticketsItems = (event.tickets && Array.isArray(event.tickets) ? event.tickets : [])
    .filter(t => t && t._id)
    .map((ticket) => {
      return {
        id: ticket._id.toString(),
        name: ticket.name,
        price: ticket.price,
        description: ticket.desc,
        quantity: 0,
        isSelected: false,
        priceId: ticket.stripeProductId,
        eventId: event._id.toString(),
        // Resolved (per-ticket flag, event fallback) so downstream consumers don't have to
        // re-derive it. This has to survive into the checkout payload.
        requireApproval: ticketApprovalFlag(event as any, ticket as any),
        // Whether buying this ticket also starts a Jetzy Premium subscription. The server
        // re-reads it from the event record, so this is only for display and selection state.
        memberships: ticketMemberships(ticket as any),
        // Monthly or annual. Display and selection state only — `api/checkout` re-reads it
        // from the event record before deciding what the card is charged.
        membershipInterval: ticket.membershipInterval,
      };
    });

  // State for ticket quantities
  const [tickets, setTickets] = useState(ticketsItems);

  // State for loader
  const [isLoading, setLoader] = useState(false);

  const eventId = event._id.toString();

  // Clone a static verion of the tickets so when increasing the qty the amount is not recalculated from the original price
  const staticTickets = ticketsItems.copyWithin(0, 0);

  // Handle increment/decrement for tickets
  const handleQuantityChange = (id: string, delta: number) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket, index) => {
        // A Premium ticket also sells a membership, so it is capped. Everything else is
        // unbounded, as before. The `+` button is disabled at the cap too — this clamp is
        // the backstop for a rapid double-click landing two increments in one batch.
        const maxQty = ticket.memberships.length > 0 ? PREMIUM_TICKET_MAX_PER_ORDER : Infinity;
        const newQty = Math.min(maxQty, Math.max(0, ticket.quantity + delta));
        const ticketItem = ticketsItems[index];

        return ticket.id === id
          ? {
            ...ticket,
            quantity: newQty,
            isSelected: newQty > 0,
            price:
              newQty === 0 ? ticketItem.price : newQty * ticketItem.price,
          }
          : ticket;
      })
    );
  };

  const handleTicketSelection = (id: string) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket, index) => {
        const ticketItem = ticketsItems[index];
        if (ticket.id === id) {
          const newIsSelected = !ticket.isSelected;
          const newQty = newIsSelected ? 1 : 0;
          return {
            ...ticket,
            isSelected: newIsSelected,
            quantity: newQty,
            price: newQty === 0 ? ticketItem.price : newQty * ticketItem.price
          }
        }
        // Single-select: only one ticket type per checkout — reset any other selection
        return ticket.isSelected
          ? { ...ticket, isSelected: false, quantity: 0, price: ticketItem.price }
          : ticket;
      })
    );
  };

  const showCheckoutForm = (showCheckout: boolean) => {
    setLoader(true);
    // make sure the ticket at least one is selected
    const hasSelected = tickets.some((ticket) => ticket.isSelected);
    if (event.isPaid && !hasSelected) {
      setLoader(false);
      Error("Ticket Required", "Please select at least one ticket.");
      return;
    }

    // Backstop for the stepper cap — this is the single funnel into redux, so anything that
    // got past the disabled button (stale state, a devtools nudge) stops here.
    const overCapKey = selectionMemberships(tickets as any).find(
      (key) => membershipQuantityInSelection(tickets as any, key) > PREMIUM_TICKET_MAX_PER_ORDER,
    );
    if (overCapKey) {
      setLoader(false);
      Error("Too many tickets", premiumOrderCapMessage(overCapKey));
      return;
    }

    const ticketsSelected = tickets
      .map((ticket, index) => ({
        id: ticket.id,
        name: ticket.name,
        price: ticketsItems[index].price,
        description: ticket.description,
        quantity: ticket.quantity,
        isSelected: ticket.isSelected,
        priceId: ticket.priceId,
        eventId: ticket.eventId,
        requireApproval: ticket.requireApproval,
        // Must survive into redux: the checkout modal decides which memberships to check
        // the buyer against, and which recurring disclosures to show, from THIS list.
        // Dropping it made every bundled ticket look ordinary in the modal.
        memberships: ticket.memberships,
        // Must survive into redux too, or the checkout modal quotes the monthly figure on a
        // ticket the server will charge annually.
        membershipInterval: ticket.membershipInterval,
      }))
      .filter((ticket) => ticket.isSelected);

    dispatcher(setSelectedTickets(ticketsSelected));

    waitUntil(500).then(() => {
      setLoader(false);
      dispatcher(toggleCheckoutForm(showCheckout));
    });
  };

  // Running total for the current selection.
  //
  // Membership status here is a PREVIEW off the session — this card has no email field, and
  // eligibility is settled against the address typed at checkout (see
  // `src/lib/premium-eligibility.ts`). It is shown anyway because the buyer needs to know
  // BEFORE they hit Checkout that a recurring charge is attached.
  const selectionSubtotal = tickets.reduce(
    (acc, ticket) => (ticket.isSelected ? acc + ticket.price : acc),
    0
  );
  // Which memberships does the CURRENT selection add? Jetzy Premium is dropped for a
  // logged-in member — an existing subscriber pays the ticket alone. Concierge status isn't
  // known here (no email field on this card), so it is always shown; checkout settles it.
  const selectionAddedKeys = selectionMemberships(tickets.filter((t) => t.isSelected) as any).filter(
    (key) => !(key === "premium" && isPremium),
  );
  // Priced at the SELECTED TICKET's interval, not the product default, so an annual bundle
  // reads "$200/year" beside the order total rather than the monthly figure.
  const selectionInterval = selectionMembershipInterval(tickets as any);
  const selectionPricing = buildTicketPricing({
    subtotal: selectionSubtotal,
    recurring: selectionAddedKeys
      .map(planFor)
      .filter((plan): plan is NonNullable<typeof plan> => !!plan)
      .map((plan) => ({ plan, price: planPriceForInterval(plan, selectionInterval) }))
      .filter(({ price }) => price.amount != null)
      .map(({ plan, price }) => ({ label: MEMBERSHIPS[plan.key].receiptLabel, amount: price.amount as number, interval: price.interval })),
  });

  const anyTicketNeedsApproval = eventHasAnyApprovalTicket(event as any);
  const allTicketsNeedApproval = eventRequiresApprovalForAllTickets(event as any);
  const hasPaidApprovalTicket = ticketsItems.some((t) => t.requireApproval && Number(t.price) > 0);
  // Whether the CURRENT selection needs approval — drives the CTA label.
  const selectionNeedsApproval = selectionRequiresApproval(event as any, tickets.filter((t) => t.isSelected) as any);

  const handleCheckoutClick = () => {
    showCheckoutForm(true);
    sendGAEvent({
      category: "Event",
      action: "Checkout Button Clicked",
      label: event.name,
    });
  };

  return (
    <>
      {/* Main Container */}
      <div
        className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8"
        id="event-tickets"
      >
        {/* Content Section */}
        <div className="p-4 sm:p-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 space-y-4 sm:space-y-0">
            <div className="text-left w-full sm:w-auto">
              <h2 className="text-xl sm:text-2xl font-bold">Tickets</h2>
              <p className="text-[#bbbbbb] text-sm sm:text-base">
                Select your tickets and proceed to checkout.
              </p>
            </div>
          </div>

          {/* The event-level "Includes Jetzy Premium" banner was removed — it duplicated the
              per-ticket line below on an event where only some tickets sell a membership.
              NOT a disclosure regression: each bundled ticket row still states the recurring
              amount and interval, and the checkout modal and receipt state them again. */}

          {/* Approval-required notice. Shown whenever ANY ticket needs approval; the copy
              distinguishes "every ticket" from "some tickets" so buyers of an
              instant-book tier aren't misled. Per-ticket pills below carry the detail. */}
          {anyTicketNeedsApproval && (
            <div className="bg-[#F79432]/15 border border-[#F79432]/40 rounded-lg p-3 mb-6">
              <p className="text-[#F79432] font-semibold text-sm">Approval Required</p>
              <p className="text-gray-300 text-xs mt-1">
                {allTicketsNeedApproval
                  ? hasPaidApprovalTicket
                    ? "Your booking is subject to host approval. Your card is authorized at checkout but only charged if the host approves."
                    : "Your registration is subject to host approval."
                  : "Some tickets on this event require host approval — see the ticket you select for details."}
              </p>
            </div>
          )}

          {/* Ticket Section */}
          <div className="space-y-3 sm:space-y-4">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => {
                  handleTicketSelection(ticket.id)
                  sendGAEvent({
                    category: "Event",
                    action: "Ticket Selected",
                    label: ticket.name,
                    eventName: event.name,
                  });
                }}
              >
                {/* Card. The checkbox sits INSIDE it, so the whole tile reads as one target —
                    the click handler is on the wrapper either way, so selection behaviour is
                    unchanged.

                    MOBILE LAYOUT: name and price share the top line (price never wraps under a
                    long name), everything else stacks beneath in one column. The old two-column
                    split put the price in a right-hand block that collapsed to a full-width row
                    on a phone, so a card read title → blurb → price → stepper, with the number
                    the buyer is looking for stranded in the middle. */}
                <div className={`relative bg-[#2b2b2b] p-3.5 sm:p-4 rounded-xl border-2 flex items-start gap-3 sm:gap-4 transition-colors ${
                  ticket.isSelected ? "border-jetzy bg-[#332b1f]" : "border-transparent"
                }`}>
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center transition-colors border-2 ${
                      ticket.isSelected ? 'bg-jetzy border-jetzy' : 'border-gray-500 bg-transparent'
                    }`}>
                      {ticket.isSelected && (
                        <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className={`font-semibold text-base sm:text-lg leading-snug min-w-0 break-words ${ticket.isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {ticket.name}
                      </h3>
                      <p className={`font-bold text-xl sm:text-2xl whitespace-nowrap leading-snug ${ticket.isSelected ? 'text-jetzy' : 'text-white'}`}>
                        {staticTickets[index].price.toLocaleString("en-US", {
                          style: "currency",
                          currency: "usd",
                        })}
                      </p>
                    </div>

                    {/* The long form of this pill ("card authorized, charged on approval") is
                        three wrapped lines on a 360px screen. The short form carries the same
                        warning; the full sentence is in the notice above the list. */}
                    {ticket.requireApproval && (
                      <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#F79432] bg-[#F79432]/15 border border-[#F79432]/40 rounded px-2 py-0.5">
                        Approval required
                        {Number(staticTickets[index].price) > 0 && (
                          <span className="hidden sm:inline"> · card authorized, charged on approval</span>
                        )}
                      </span>
                    )}

                    {/* Descriptions are host-authored and often carry a raw URL, which used to
                        push the card wider than the viewport — `break-all` on anchors only, so
                        ordinary prose still wraps on word boundaries. Collapsed by default so a
                        long blurb can't bury the tickets below it. */}
                    {ticket.description && (
                      <TicketDescription description={ticket.description} />
                    )}

                    {/* The membership notice that used to sit here — "+ Jetzy Premium
                        $20/month, renews until cancelled" — was removed by decision: it is
                        not wanted on the browse view of the ticket.

                        The recurring terms are STILL disclosed before purchase, in the
                        checkout modal and the order summary. That is the point of sale and
                        where the card-network requirement actually applies, so do not treat
                        this removal as licence to drop them there too. */}

                    {event.isPaid && ticket.isSelected && (
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <div
                          className="flex items-center gap-2 bg-[#1e1e1e] p-1.5 rounded-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            aria-label="Decrease quantity"
                            onClick={() => handleQuantityChange(ticket.id, -1)}
                            className="bg-black text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-800 transition-colors"
                          >
                            -
                          </button>
                          <p className="text-white text-lg font-semibold min-w-[28px] text-center">
                            {ticket.quantity}
                          </p>
                          <button
                            aria-label="Increase quantity"
                            onClick={() => handleQuantityChange(ticket.id, 1)}
                            disabled={ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER}
                            title={
                              ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER
                                ? premiumOrderCapMessage(ticket.memberships[0])
                                : undefined
                            }
                            className="bg-black text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black"
                          >
                            +
                          </button>
                        </div>
                        {/* Say why the stepper stopped, rather than leaving a dead button. */}
                        {ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER && (
                          <p className="text-xs flex-1 min-w-[140px]" style={{ color: "#F5C518" }}>
                            {premiumOrderCapMessage(ticket.memberships[0])}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Section.
              Total and CTA sit together on the RIGHT, matching the per-ticket prices above.
              They used to be pushed to opposite ends by `justify-between`, which left a wide
              gap and read as two unrelated things rather than "this is what you pay, here's
              the button". */}
          <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3 sm:gap-6 mt-5 sm:my-4 pt-4 sm:pt-0 border-t border-[#434343] sm:border-0">
            {/* Total Price to pay. On mobile it is labelled and sits on its own line above a
                full-width CTA — an unlabelled number floating right of nothing read as a
                leftover from the ticket rows. */}
            <div className="sm:text-right">
              <div className="flex items-baseline justify-between gap-3 sm:block">
                <span className="text-sm text-[#bbbbbb] sm:hidden">Total</span>
                <h3 className="text-2xl font-semibold">
                  {selectionPricing.total.toLocaleString("en-US", {
                    style: "currency",
                    currency: "usd",
                  })}
                </h3>
              </div>
              {/* The membership is charged with the ticket but is NOT part of the ticket
                  total, so it's spelled out separately rather than silently folded in.
                  Session-based preview: the real check is against the email typed at
                  checkout, and a referral code can lower the ticket further there. */}
              {selectionAddedKeys.map((key) => {
                const plan = planFor(key);
                // The SELECTED TICKET's interval, not the product default. This line read
                // "$20/month" beside an annual ticket that charges $200/year — the figure at the
                // point of sale has to be the one the card is charged.
                const price = plan ? planPriceForInterval(plan, selectionInterval) : null;
                return (
                  <p key={key} className="text-xs mt-0.5" style={{ color: "#F5C518" }}>
                    {price?.label
                      ? `+ ${plan?.name} ${price.label} — confirmed at checkout`
                      : `+ ${plan?.name || key} membership — confirmed at checkout`}
                  </p>
                );
              })}
            </div>

            <button
              disabled={isLoading}
              onClick={handleCheckoutClick}
              className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shrink-0"
            >
              {isLoading ? <Spinner /> : selectionNeedsApproval ? "Request to Book" : "Checkout"}
            </button>
          </div>
        </div>
      </div>

      {/* map section  */}
      {/* <div className="max-w-4xl mx-auto mt-5 bg-[#5656561e] border border-[#434343] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-xl">Event Location</h1>
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(
              event.location
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-jetzy p-2 rounded-xl"
          >
            <DirectionSVG />
          </a>
        </div>
        <p className="text-xl">{event.location}</p>
        <div className="mt-4 w-full h-64 rounded-xl overflow-hidden">
          <iframe
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              event.location
            )}&output=embed`}
          ></iframe>
        </div>
      </div> */}

      {/* comments section  */}

    </>
  );
};

export default EventTicketsComponent;