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
import Linkify from "linkify-react";
import { sendGAEvent } from "@next/third-parties/google";
import { stripHtml } from "@/utils/text";
import { StarIcon } from "@heroicons/react/24/solid";
import { usePremiumStatus } from "@/hooks/usePremiumStatus";
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn";
import PremiumPaywallModal from "@/components/premium/PremiumPaywallModal";

type Props = {
  event: IEvent;
};

const EventTicketsComponent: React.FC<Props> = ({ event }) => {
  const dispatcher = useAppDispatch();
  const { isPremium } = usePremiumStatus();
  const [showPremiumPromo, setShowPremiumPromo] = useState(false);
  usePremiumSubscriptionReturn();

  const memberDiscountPercentage = Number(event.premiumMemberDiscountPercentage) || 0;
  const hasMemberDiscount = !!event.premium && memberDiscountPercentage > 0;

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
        const newQty = Math.max(0, ticket.quantity + delta);
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
      }))
      .filter((ticket) => ticket.isSelected);

    dispatcher(setSelectedTickets(ticketsSelected));

    waitUntil(500).then(() => {
      setLoader(false);
      dispatcher(toggleCheckoutForm(showCheckout));
    });
  };

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
        <div className="p-6 sm:p-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
            <div className="text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-bold">Tickets</h2>
              <p className="text-[#bbbbbb] text-sm sm:text-base">
                Select your tickets and proceed to checkout.
              </p>
            </div>
          </div>

          {/* Member pricing notice — Premium Events are open to everyone; a subscription
              just unlocks a discount, so this is a promo, not a gate. */}
          {hasMemberDiscount && (
            <div className="flex items-center justify-between gap-2 rounded-lg p-3 mb-6" style={{ background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.4)" }}>
              <div className="flex items-center gap-2">
                <StarIcon className="w-4 h-4 flex-shrink-0" style={{ color: "#F5C518" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#F5C518" }}>Premium Event</p>
                  <p className="text-gray-300 text-xs mt-1">
                    {isPremium
                      ? `As a Jetzy Premium member, you save ${memberDiscountPercentage}% on this event.`
                      : `Jetzy Premium members save ${memberDiscountPercentage}% on this event.`}
                  </p>
                </div>
              </div>
              {!isPremium && (
                <button
                  onClick={() => setShowPremiumPromo(true)}
                  className="text-xs font-bold underline flex-shrink-0"
                  style={{ color: "#F5C518" }}
                >
                  Subscribe
                </button>
              )}
            </div>
          )}

          {/* Approval-required notice — only for all-free events. On mixed
              (paid+free) events approval applies to the free tier only, so the
              blanket notice would confuse paid buyers; the checkout modal shows
              a contextual banner for free-only selections instead. */}
          {event.requireApproval && !ticketsItems.some((t) => Number(t.price) > 0) && (
            <div className="bg-[#F79432]/15 border border-[#F79432]/40 rounded-lg p-3 mb-6">
              <p className="text-[#F79432] font-semibold text-sm">Approval Required</p>
              <p className="text-gray-300 text-xs mt-1">Your registration is subject to host approval.</p>
            </div>
          )}

          {/* Ticket Section */}
          <div className="space-y-6">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                className="flex items-center gap-4 cursor-pointer"
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
                {/* Checkbox — outside left */}
                <div className="flex-shrink-0 self-center">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors border-2 ${
                    ticket.isSelected ? 'bg-jetzy border-jetzy' : 'border-gray-500 bg-transparent'
                  }`}>
                    {ticket.isSelected && (
                      <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Card */}
                <div className={`flex-1 relative bg-[#2b2b2b] p-4 rounded-lg border-2 ${
                  ticket.isSelected ? "border-jetzy" : "border-transparent"
                }`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full">
                    <div className="text-left w-full sm:w-2/3">
                      <h3 className={`font-semibold text-lg ${ticket.isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {ticket.name}
                      </h3>
                      <p className="text-xs text-gray-400 my-1">
                        Select to proceed to checkout
                      </p>
                      {ticket.description && (
                        <p className="text-xs text-gray-300 my-2">
                          <Linkify options={{
                            target: '_blank',
                            className: 'text-[#F79432] underline hover:text-orange-400',
                          }}>
                            {stripHtml(ticket.description)}
                          </Linkify>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-start sm:items-end w-full sm:w-1/3 mt-4 sm:mt-0 pt-3 sm:pt-0">
                      {hasMemberDiscount && isPremium && staticTickets[index].price > 0 ? (
                        <>
                          <p className="text-sm text-gray-500 line-through">
                            {staticTickets[index].price.toLocaleString("en-US", { style: "currency", currency: "usd" })}
                          </p>
                          <p className="font-bold text-2xl" style={{ color: "#F5C518" }}>
                            {(staticTickets[index].price * (1 - memberDiscountPercentage / 100)).toLocaleString("en-US", { style: "currency", currency: "usd" })}
                          </p>
                          <p className="text-xs" style={{ color: "#F5C518" }}>Member price ({memberDiscountPercentage}% off)</p>
                        </>
                      ) : (
                        <p className={`font-bold text-2xl ${ticket.isSelected ? 'text-jetzy' : 'text-white'}`}>
                          {staticTickets[index].price.toLocaleString("en-US", {
                            style: "currency",
                            currency: "usd",
                          })}
                        </p>
                      )}

                      {event.isPaid && ticket.isSelected && (
                        <div
                          className="flex items-center space-x-4 mt-3 text-slate-800 bg-[#1e1e1e] p-1.5 rounded-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleQuantityChange(ticket.id, -1)}
                            className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
                          >
                            -
                          </button>
                          <p className="text-white text-lg font-semibold min-w-[20px] text-center">
                            {ticket.quantity}
                          </p>
                          <button
                            onClick={() => handleQuantityChange(ticket.id, 1)}
                            className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Section */}
          <div className="flex justify-between items-center my-4">
            {/* Total Price to pay */}
            <div className="text-center sm:text-right">
              <h3 className="text-2xl font-semibold">
                {tickets
                  .reduce(
                    (acc, ticket) =>
                      ticket.isSelected ? acc + ticket.price : acc,
                    0
                  )
                  .toLocaleString("en-US", {
                    style: "currency",
                    currency: "usd",
                  })}
              </h3>
            </div>

            <button
              disabled={isLoading}
              onClick={handleCheckoutClick}
              className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <Spinner /> : "Checkout"}
            </button>
          </div>
        </div>
      </div>

      <PremiumPaywallModal
        isOpen={showPremiumPromo}
        onClose={() => setShowPremiumPromo(false)}
        returnTo={`/${event.slug}`}
        title="Save with Jetzy Premium"
        message={`Subscribe to Jetzy Premium and save ${memberDiscountPercentage}% on this and every other Premium Event.`}
      />

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