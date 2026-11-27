import {
  setSelectedTickets,
  toggleCheckoutForm,
} from "@Jetzy/redux/reducers/checkoutSlice";
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores";
import { getCheckoutStore } from "@Jetzy/redux/reducers/checkoutSlice";
import React, { useRef, useState } from "react";
import { waitUntil } from "@Jetzy/lib/utils";
import Spinner from "./misc/Spinner";
import { Error } from "@Jetzy/lib/_toaster";
import { IEvent } from "@/models/events/types";
import { CheckmarkSVG } from "@/assets/icons";
import { eventHasAnyApprovalTicket, eventRequiresApprovalForAllTickets, selectionRequiresApproval, ticketApprovalFlag } from "@/lib/ticket-approval";
import { eventPath } from "@/lib/event-slug";
import { buildTicketPricing } from "@/lib/ticket-pricing";
import { freeMonthsLabel, membershipQuantityInSelection, premiumOrderCapMessage, PREMIUM_TICKET_MAX_PER_ORDER, selectionMemberships, selectionMembershipFreeMonths, selectionMembershipInterval, splitBundleCharges, ticketMemberships } from "@/lib/premium-bundle";
import { MEMBERSHIPS, MEMBERSHIP_KEYS, expandEntitlements, type MembershipKey } from "@/lib/memberships";
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
import { useSession } from "next-auth/react";
import { membershipIncludesLine } from "@/lib/booking-membership-display";
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn";
import { useRouter } from "next/router";
import { useAnalytics } from "@/hooks/useAnalytics";
import { isPreviewQuery } from "@/lib/event-preview";
import { LOW_STOCK_THRESHOLD, notEnoughLeftMessage, remainingMessage } from "@/lib/ticket-quantity";
import type { EventAvailability } from "@/lib/ticket-availability";
import { BID_APPROVAL_NOTICE, BID_BUTTON_STEP, BID_SLIDER_MULTIPLE, BID_STEP, bidRange, clampBid, formatBidMoney, isBidOnlyTicket } from "@/lib/ticket-bid";

type Props = {
  event: IEvent;
  /** Renders the host's "Edit tickets" control in the header. Omitted for guests. */
  canManage?: boolean;
  onEditTickets?: () => void;
  /** Opens ONE ticket's editor (admin or host), from the Edit button on its card. */
  onEditTicket?: (ticketId: string) => void;
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

const EventTicketsComponent: React.FC<Props> = ({ event, canManage = false, onEditTickets, onEditTicket }) => {
  const dispatcher = useAppDispatch();
  const { isPremium, memberships: heldMembershipRecords } = usePremiumStatus();
  // Everything the logged-in viewer holds, entitlements included (Concierge → Premium). Checkout
  // re-decides from the typed email; this only shapes the preview beside the total.
  const viewerHeld = expandEntitlements([
    ...MEMBERSHIP_KEYS.filter((key) => !!(heldMembershipRecords as any)?.[key]?.active),
    ...(isPremium ? (["premium"] as MembershipKey[]) : []),
  ]);
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
        // Free months the host put on this ticket, given with no code typed. Display and
        // selection state only, re-read server-side for the same reason as the interval.
        membershipFreeMonths: ticket.membershipFreeMonths,
        // Takes bids ("name your price", `src/lib/ticket-bid.ts`) beside its normal price: the
        // guest may bid their own amount instead, one seat per bid. Null when it takes none.
        // The server re-validates every bid.
        bid: bidRange(ticket as any),
        // Takes ONLY bids (no normal price): the card says "Bid", never $0.00, and tapping it
        // opens the bid box. The server refuses a normal order on it.
        bidOnly: isBidOnlyTicket(ticket as any),
        // The host's suggested bid as stored — `bid.suggested` falls back to the floor when unset.
        hasSuggested: Number.isFinite(Number((ticket as any).bidSuggested)) && (ticket as any).bidSuggested !== null && (ticket as any).bidSuggested !== "",
      };
    });

  // State for ticket quantities
  const [tickets, setTickets] = useState(ticketsItems);
  // Which ticket the guest chose to BID on instead of paying its normal price. One at most (the
  // selection is single-select). A card click always means the normal price and clears it.
  const [bidMode, setBidMode] = useState<Record<string, boolean>>({});
  const isBidding = (id: string) => !!bidMode[id];
  // The amount the guest is bidding on each ticket — starts at the host's suggested bid.
  const [bidAmounts, setBidAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(ticketsItems.filter((t) => t.bid).map((t) => [t.id, t.bid!.suggested])),
  );
  const bidFor = (id: string) => bidAmounts[id] ?? ticketsItems.find((t) => t.id === id)?.bid?.suggested ?? 0;
  // What the guest is TYPING in the amount box, before it is checked. Kept apart from the bid so
  // the box can be cleared completely and retyped (QA, 2026-11-27) — and so a half-typed "9" on a
  // $10 minimum never shows as the price on the card. Committed on blur / Enter.
  const [bidDrafts, setBidDrafts] = useState<Record<string, string>>({});
  // Where the drag slider ends. There is no maximum bid (CEO, 2026-11-27) — the typed box takes
  // any amount up to Stripe's limit — so the slider spans a range that makes dragging useful:
  // $1 up to BID_SLIDER_MULTIPLE (10×) the higher of the normal price and the suggested bid,
  // rounded up to a whole dollar. A bid typed above it simply pins the thumb at the end.
  const sliderMaxFor = (id: string) => {
    const ticket = ticketsItems.find((t) => t.id === id);
    if (!ticket?.bid) return 0;
    const top = Math.max(Number(ticket.price) || 0, ticket.bid.suggested) * BID_SLIDER_MULTIPLE;
    return Math.max(Math.ceil(ticket.bid.min) + BID_STEP, Math.ceil(top));
  };
  const effectiveBid = (id: string) => {
    const ticket = ticketsItems.find((t) => t.id === id);
    const value = parseFloat(bidDrafts[id] ?? "");
    if (!ticket?.bid || !Number.isFinite(value)) return bidFor(id);
    return clampBid({ pricingMode: "bid", bidSuggested: ticket.bid.suggested }, value);
  };
  const commitBidDraft = (id: string) => {
    const draft = bidDrafts[id];
    if (draft === undefined) return;
    const value = parseFloat(draft);
    // Left empty or not a number: keep the bid they had. Otherwise clamp into the range.
    if (Number.isFinite(value)) setBid(id, value);
    setBidDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const setBid = (id: string, raw: number) => {
    const ticket = ticketsItems.find((t) => t.id === id);
    if (!ticket?.bid) return;
    const amount = clampBid({ pricingMode: "bid", bidSuggested: ticket.bid.suggested }, raw);
    setBidAmounts((prev) => ({ ...prev, [id]: amount }));
    // The slider / − + win over anything half-typed in the box.
    setBidDrafts((prev) => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // While bidding, the selected ticket's line total IS the bid (one seat).
    if (bidMode[id]) setTickets((prev) => prev.map((t) => (t.id === id && t.isSelected ? { ...t, price: amount } : t)));
  };

  // State for loader
  const [isLoading, setLoader] = useState(false);

  const eventId = event._id.toString();

  // How many spots are left, per ticket and overall.
  //
  // Fetched client-side rather than passed through props: `HostedEvents` is already
  // `ssr: false`, so there is no server-rendered first paint to improve, and a number baked
  // into props goes stale the moment the visitor sits on the page. `refetch` runs when the
  // checkout modal closes.
  //
  // Only the TYPE is imported from `ticket-availability` (server-only); the runtime helpers
  // come from the pure `ticket-quantity`, or webpack would pull the models into this bundle.
  // Is the logged-in viewer a MONTHLY member whom a yearly ticket here would move to yearly
  // billing? Asked of the same endpoint checkout uses (keys only, by the session's email), and
  // only when a yearly ticket on this event sells a membership the viewer already holds — so the
  // line beside the total can name the upgrade before they open checkout.
  const { data: viewerSession } = useSession();
  const viewerEmail = viewerSession?.user?.email || "";
  const eventSellsYearlyUpgrade = (event.tickets || []).some(
    (t: any) =>
      !t?.isDeleted &&
      selectionMembershipInterval([{ ...t, isSelected: true }] as any) === "year" &&
      ticketMemberships(t).some((key) => MEMBERSHIPS[key]?.upgradeOnTicket && viewerHeld.includes(key)),
  );
  const { data: viewerUpgrades = [] } = useQuery<MembershipKey[]>({
    queryKey: ["viewer-membership-upgrades", event._id?.toString(), viewerEmail],
    queryFn: async () => {
      const response = await fetch("/api/premium/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: viewerEmail, eventId: event._id?.toString() }),
      });
      const result = await response.json();
      return Array.isArray(result?.data?.upgrades) ? (result.data.upgrades as MembershipKey[]) : [];
    },
    enabled: !!viewerEmail && eventSellsYearlyUpgrade,
    staleTime: 60_000,
  });

  const { data: availability, refetch: refetchAvailability, isFetched: availabilityFetched } = useQuery<EventAvailability>({
    queryKey: ["event-availability", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/availability`);
      // Not `new Error(...)`: `Error` in this file is the toaster helper, not the global.
      if (!res.ok) return Promise.reject("Failed to load availability");
      return res.json();
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  /** How many of this ticket are left. `null` = unlimited (no limit, or not loaded yet). */
  const remainingFor = (ticketId: string): number | null => {
    if (!availability) return null;
    const row = availability.tickets.find((t) => t.ticketId === ticketId);
    const ticketRemaining = row?.remaining ?? null;
    const eventRemaining = availability.eventRemaining;
    // The event ceiling composes on top of the per-ticket limit — whichever bites first.
    const limits = [ticketRemaining, eventRemaining].filter((n): n is number => n !== null);
    return limits.length > 0 ? Math.min(...limits) : null;
  };

  const isSoldOutFor = (ticketId: string) => remainingFor(ticketId) === 0;

  // Re-count when the checkout modal closes. A buyer who books and comes back (the free path
  // for an app buyer doesn't reload, and an abandoned checkout doesn't either) would otherwise
  // keep looking at the number the page mounted with.
  const { showCheckout } = useAppSelector(getCheckoutStore);
  const wasCheckoutOpen = useRef(false);
  React.useEffect(() => {
    if (wasCheckoutOpen.current && !showCheckout) refetchAvailability();
    wasCheckoutOpen.current = showCheckout;
  }, [showCheckout, refetchAvailability]);

  // Checkout funnel instrumentation.
  //
  // `ticket_select` and `booking_start` have been accepted by the API and read by the funnel
  // since it was built, but nothing ever WROTE them — so "Picked a ticket" and "Opened
  // checkout" sat at zero on every event forever, and the drop-off between viewing and buying
  // was invisible. These two calls are the writers.
  //
  // Suppressed under `?preview=1` for the same reason the event page skips its view tracking:
  // a host checking their own page must not move the numbers they are checking.
  const router = useRouter();
  const { trackEventInteraction } = useAnalytics();
  const previewAsGuest = isPreviewQuery(router.query);
  const track = (type: string, metadata?: Record<string, unknown>) => {
    if (previewAsGuest) return;
    // Fire and forget — an analytics failure must never interrupt someone buying a ticket.
    trackEventInteraction(eventId, type, metadata).catch(() => {});
  };

  // A ticket can be selected two ways — clicking the card, or pressing `+` from zero — and a
  // visitor comparing options may toggle several times. Report each ticket at most once per
  // mount so the raw row count stays close to the number of real decisions. (The funnel counts
  // distinct sessions and would survive duplicates; the Page Views style totals would not.)
  const selectionReported = useRef<Set<string>>(new Set());
  const reportTicketSelected = (id: string, name?: string) => {
    if (selectionReported.current.has(id)) return;
    selectionReported.current.add(id);
    track("ticket_select", { ticketId: id, ticketName: name });
  };

  // Clone a static verion of the tickets so when increasing the qty the amount is not recalculated from the original price
  const staticTickets = ticketsItems.copyWithin(0, 0);

  // Handle increment/decrement for tickets
  const handleQuantityChange = (id: string, delta: number) => {
    // Pressing `+` from zero selects the ticket without ever going through
    // handleTicketSelection, so the funnel would miss everyone who buys that way.
    const stepped = tickets.find((t) => t.id === id);
    if (delta > 0 && isSoldOutFor(id)) return;
    if (stepped && delta > 0 && stepped.quantity === 0) {
      reportTicketSelected(id, stepped.name);
    }

    setTickets((prevTickets) =>
      prevTickets.map((ticket, index) => {
        // Two independent caps, whichever bites first: a Premium ticket also sells a
        // membership and is capped per order, and any ticket may have a capacity limit.
        // The `+` button is disabled at both — this clamp is the backstop for a rapid
        // double-click landing two increments in one batch.
        const membershipCap = ticket.memberships.length > 0 ? PREMIUM_TICKET_MAX_PER_ORDER : Infinity;
        const stockCap = remainingFor(ticket.id) ?? Infinity;
        const maxQty = Math.min(membershipCap, stockCap);
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
    // A sold-out ticket can't be picked at all. The stepper only renders on a paid event
    // (see the `event.isPaid` gate below), so on a FREE event this is the only thing standing
    // between a visitor and a booking for a ticket that has none left.
    const target = tickets.find((t) => t.id === id);
    if (target && !target.isSelected && isSoldOutFor(id)) return;
    // Only the turning-ON edge counts. De-selecting is not a funnel step, and counting it
    // would let one undecided visitor inflate "Picked a ticket" by toggling.
    const picked = tickets.find((t) => t.id === id);
    if (picked && !picked.isSelected) {
      reportTicketSelected(id, picked.name);
    }

    // A card click selects at the NORMAL price (or deselects) — never a bid.
    setBidMode({});
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

  /**
   * Switch a ticket between its normal price and a bid. Bidding selects the ticket for ONE seat
   * at the bid; going back selects it for one seat at the normal price. Single-select, like a
   * card click.
   */
  const chooseBid = (id: string, on: boolean) => {
    const target = tickets.find((t) => t.id === id);
    if (!target?.bid) return;
    if (on && !target.isSelected && isSoldOutFor(id)) return;
    // Bid only: there is no normal price to fall back to — leaving bid mode deselects it.
    if (!on && target.bidOnly) {
      setBidMode({});
      setTickets((prev) => prev.map((t, index) => (t.id === id ? { ...t, isSelected: false, quantity: 0, price: ticketsItems[index].price } : t)));
      return;
    }
    if (!target.isSelected) reportTicketSelected(id, target.name);
    setBidMode(on ? { [id]: true } : {});
    setTickets((prev) =>
      prev.map((t, index) => {
        const item = ticketsItems[index];
        if (t.id === id) return { ...t, isSelected: true, quantity: 1, price: on ? bidFor(id) : item.price };
        return t.isSelected ? { ...t, isSelected: false, quantity: 0, price: item.price } : t;
      }),
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

    // Same backstop for capacity. The real enforcement is server-side in `api/checkout` and
    // `api/checkout/free-events` — this only stops someone reaching the modal for a ticket
    // the page already knows is gone, so they aren't asked to fill a form that can't succeed.
    const overStock = tickets.find(
      (t) => t.isSelected && remainingFor(t.id) !== null && Math.max(1, t.quantity) > remainingFor(t.id)!,
    );
    if (overStock) {
      setLoader(false);
      Error("Not enough tickets", notEnoughLeftMessage(remainingFor(overStock.id)!, overStock.name));
      return;
    }

    const ticketsSelected = tickets
      .map((ticket, index) => {
        // A BID (the guest chose "name your price"): one seat at the bid, and it always needs
        // the host's approval whatever the ticket's own setting. Otherwise the normal ticket.
        const asBid = !!ticket.bid && isBidding(ticket.id);
        return {
        id: ticket.id,
        name: ticket.name,
        price: asBid ? effectiveBid(ticket.id) : ticketsItems[index].price,
        description: ticket.description,
        quantity: asBid ? 1 : ticket.quantity,
        ...(asBid ? { pricingMode: "bid", bidAmount: effectiveBid(ticket.id) } : {}),
        isSelected: ticket.isSelected,
        priceId: ticket.priceId,
        eventId: ticket.eventId,
        requireApproval: asBid ? true : ticket.requireApproval,
        // Must survive into redux: the checkout modal decides which memberships to check
        // the buyer against, and which recurring disclosures to show, from THIS list.
        // Dropping it made every bundled ticket look ordinary in the modal.
        memberships: ticket.memberships,
        // Must survive into redux too, or the checkout modal quotes the monthly figure on a
        // ticket the server will charge annually.
        membershipInterval: ticket.membershipInterval,
        // Same rule again: without this the modal offers no free months on a ticket that
        // gives them, and the buyer reads a price the server is not going to charge.
        membershipFreeMonths: ticket.membershipFreeMonths,
        };
      })
      .filter((ticket) => ticket.isSelected);

    dispatcher(setSelectedTickets(ticketsSelected));

    // The modal is definitely opening — every early return above has already fired. This is
    // "Opened checkout" in the funnel; what happens inside it is EventCheckoutModel's to report.
    if (showCheckout) {
      track("booking_start", {
        ticketCount: ticketsSelected.reduce((n, t) => n + (t.quantity || 0), 0),
        subtotal: ticketsSelected.reduce((n, t) => n + (t.price || 0) * (t.quantity || 0), 0),
      });
    }

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
  // Which memberships does the CURRENT selection add? Anything the logged-in viewer already
  // holds (`viewerHeld`, Concierge counting as Premium) is dropped, and `splitBundleCharges` drops
  // Premium when the ticket sells Concierge too. Our own records only — a Concierge member known
  // solely to SelectMember still sees the line here; checkout settles it from the typed email.
  // Priced at the SELECTED TICKET's interval, not the product default, so an annual bundle
  // reads "$200/year" beside the order total rather than the monthly figure.
  const selectionInterval = selectionMembershipInterval(tickets as any);
  // A monthly member on a yearly ticket is charged for the switch to yearly (`membership-upgrade.ts`).
  const selectionUpgradeKeys = selectionInterval === "year" ? viewerUpgrades : [];
  const selectionSplit = splitBundleCharges(
    selectionMemberships(tickets.filter((t) => t.isSelected) as any),
    viewerHeld,
    selectionUpgradeKeys,
  );
  const selectionAddedKeys = selectionSplit.toCharge;
  // Free months the host gave on the selected ticket. A referral code can beat this at
  // checkout, never reduce it, so the figure shown here is the floor of what the buyer gets.
  const selectionFreeMonths = selectionMembershipFreeMonths(tickets as any);
  const selectionPricing = buildTicketPricing({
    subtotal: selectionSubtotal,
    recurring: selectionAddedKeys
      .map(planFor)
      .filter((plan): plan is NonNullable<typeof plan> => !!plan)
      .map((plan) => ({ plan, price: planPriceForInterval(plan, selectionInterval) }))
      .filter(({ price }) => price.amount != null)
      .map(({ plan, price }) => ({
        label: MEMBERSHIPS[plan.key].receiptLabel,
        amount: price.amount as number,
        interval: price.interval,
        // A trialled line is excluded from `dueToday` by `recurringTotal` but still renders —
        // it is a charge the buyer is agreeing to, just not today's.
        // An upgrader pays the yearly price — no free months on that line.
        ...(selectionFreeMonths > 0 && !selectionSplit.upgrades.includes(plan.key) ? { trialMonths: selectionFreeMonths } : {}),
      })),
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

  // Walk-in deep link: `?buy=1` (the QR on the check-in page). Decided HERE, when the guest
  // scans, not on the check-in page when it loaded — a host can add a ticket or sell one out
  // while the door screen sits open, and one QR has to stay right all night.
  //  - exactly one ticket and it isn't sold out → select it and open its checkout;
  //  - a free event with no tickets → open the register form (what the button does);
  //  - otherwise (several tickets, or the only one is sold out) → scroll to the tickets.
  // Waits for availability: before it loads `remainingFor` reads as unlimited and would open
  // checkout on a sold-out ticket. Auto-open goes through `handleCheckoutClick`, so every check
  // `showCheckoutForm` makes (membership cap, stock, funnel tracking) still applies. The param
  // is consumed so a refresh or closing the modal doesn't reopen it; inert under `?preview=1`.
  const buyHandledRef = useRef(false);
  const autoOpenRef = useRef(false);
  React.useEffect(() => {
    if (buyHandledRef.current) return;
    if (!router.isReady || router.query.buy !== "1" || previewAsGuest) return;
    if (!availabilityFetched) return;
    buyHandledRef.current = true;

    const { buy: _buy, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });

    if (tickets.length === 1 && !isSoldOutFor(tickets[0].id)) {
      if (tickets[0].isSelected) {
        handleCheckoutClick();
      } else {
        // Selection is async — the effect below opens checkout once it has landed, since
        // `showCheckoutForm` reads the tickets of the render it is called from.
        autoOpenRef.current = true;
        handleTicketSelection(tickets[0].id);
      }
      return;
    }
    if (tickets.length === 0 && !event.isPaid) {
      handleCheckoutClick();
      return;
    }
    document.getElementById("event-tickets")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Runs once (latched by `buyHandledRef`); reads the tickets of the render that fires it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.buy, previewAsGuest, availabilityFetched]);

  React.useEffect(() => {
    if (!autoOpenRef.current || !tickets.some((t) => t.isSelected)) return;
    autoOpenRef.current = false;
    handleCheckoutClick();
    // `handleCheckoutClick` is recreated every render; only a tickets change should fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

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
            {/* The right half of this justify-between row was always empty — the host's Edit
                goes here, beside the heading, rather than above the whole page. */}
            {canManage && onEditTickets && (
              <button
                type="button"
                onClick={onEditTickets}
                className="border border-[#F79432] text-[#F79432] py-1 px-3 text-xs rounded-lg hover:bg-[#F79432] hover:text-black transition-colors flex-shrink-0"
              >
                Edit tickets
              </button>
            )}
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
                  // A bid-only ticket is selected BY bidding — the card opens / closes its bid box.
                  if (ticket.bid && ticket.bidOnly) chooseBid(ticket.id, !ticket.isSelected);
                  else handleTicketSelection(ticket.id)
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
                      {/* Price, then the Bid / Edit buttons — one row from `sm`, buttons under the
                          price on a phone so a long ticket name keeps its width. */}
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2.5 flex-shrink-0">
                        {/* The normal price — or, while the guest is bidding, their bid. No struck-through
                            normal price under it: it read as a discount and confused buyers. */}
                        <div className="text-right">
                          <p className={`font-bold text-xl sm:text-2xl whitespace-nowrap leading-snug ${ticket.isSelected ? 'text-jetzy' : 'text-white'}`}>
                            {ticket.bid && ticket.isSelected && isBidding(ticket.id)
                              ? formatBidMoney(bidFor(ticket.id))
                              : ticket.bid && ticket.bidOnly
                                ? "Bid"
                                : staticTickets[index].price.toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "usd",
                                  })}
                          </p>
                          {/* Bid only: no price to show, so the host's suggestion sits under "Bid". */}
                          {ticket.bid && ticket.bidOnly && ticket.hasSuggested && !(ticket.isSelected && isBidding(ticket.id)) && (
                            <p className="text-[11px] text-gray-400 whitespace-nowrap">Suggested {formatBidMoney(ticket.bid.suggested)}</p>
                          )}
                        </div>
                        {(ticket.bid && !ticket.bidOnly && remainingFor(ticket.id) !== 0) || (canManage && onEditTicket) ? (
                          <div className="flex items-center gap-2">
                            {/* Takes bids: name your own price instead of the one shown. A toggle —
                                pressing it again goes back to the normal price. */}
                            {/* Not on a bid-only ticket: "Bid" already sits where the price is. */}
                            {ticket.bid && !ticket.bidOnly && remainingFor(ticket.id) !== 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  chooseBid(ticket.id, !(ticket.isSelected && isBidding(ticket.id)));
                                }}
                                aria-pressed={ticket.isSelected && isBidding(ticket.id)}
                                title={ticket.isSelected && isBidding(ticket.id) ? "Pay the normal price instead" : "Name your own price"}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                                  ticket.isSelected && isBidding(ticket.id)
                                    ? "bg-[#7DD3FC] border-[#7DD3FC] text-black hover:bg-[#a5e1fd]"
                                    : "bg-[#7DD3FC]/10 border-[#7DD3FC] text-[#7DD3FC] hover:bg-[#7DD3FC] hover:text-black"
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  {ticket.isSelected && isBidding(ticket.id) ? (
                                    <path d="M5 13l4 4L19 7" />
                                  ) : (
                                    <>
                                      <path d="M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" />
                                      <path d="M16 16l6-6" />
                                      <path d="M8 8l6-6" />
                                      <path d="M9 7l8 8" />
                                    </>
                                  )}
                                </svg>
                                {ticket.isSelected && isBidding(ticket.id) ? "Bidding" : "Bid"}
                              </button>
                            )}
                            {/* Admin / host: edit THIS ticket straight away (CEO, 2026-11-27). */}
                            {canManage && onEditTicket && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditTicket(ticket.id);
                                }}
                                aria-label={`Edit ${ticket.name}`}
                                className="inline-flex items-center rounded-full border border-[#F79432] text-[#F79432] py-1.5 px-3 text-sm hover:bg-[#F79432] hover:text-black transition-colors"
                              >
                                ✎ Edit
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* The long form of this pill ("card authorized, charged on approval") is
                        three wrapped lines on a 360px screen. The short form carries the same
                        warning; the full sentence is in the notice above the list. */}
                    {/* Sold out, or the last ticket. Rendered on the CARD, not beside the
                        stepper, because the stepper only exists on a paid event — a free event
                        needs to show this too.

                        Only the LAST one is announced (LOW_STOCK_THRESHOLD = 1). A standing
                        "Only 4 left" tells a visitor how little has sold, which reads as a quiet
                        event; "Only 1 left" is the one count that is purely urgent. */}
                    {remainingFor(ticket.id) === 0 ? (
                      <span className="inline-block mt-2 mr-2 text-[10px] font-semibold uppercase tracking-wide text-gray-300 bg-gray-500/20 border border-gray-500/50 rounded px-2 py-0.5">
                        Sold out
                      </span>
                    ) : remainingFor(ticket.id) !== null && remainingFor(ticket.id)! <= LOW_STOCK_THRESHOLD ? (
                      <span className="inline-block mt-2 mr-2 text-[10px] font-semibold uppercase tracking-wide text-[#F5C518] bg-[#F5C518]/15 border border-[#F5C518]/40 rounded px-2 py-0.5">
                        Only {remainingFor(ticket.id)} left
                      </span>
                    ) : null}

                    {(ticket.requireApproval || ticket.bidOnly) && !(ticket.isSelected && isBidding(ticket.id)) && (
                      <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#F79432] bg-[#F79432]/15 border border-[#F79432]/40 rounded px-2 py-0.5">
                        Approval required
                        {/* A bid-only ticket's bid is always a card hold, even at a $0 list price. */}
                        {(Number(staticTickets[index].price) > 0 || ticket.bidOnly) && (
                          <span className="hidden sm:inline"> · card authorized, charged on approval</span>
                        )}
                      </span>
                    )}

                    {/* Bid ticket: the guest sets their price. Sealed — nobody sees anyone else's
                        bid. The card is HELD for the bid and charged only if the host accepts. */}
                    {/* ABOVE the description (QA, 2026-11-27): a long description pushed the bid box
                        off the screen, so tapping Bid seemed to do nothing. */}
                    {ticket.bid && ticket.isSelected && isBidding(ticket.id) && (
                      <div className="mt-3 bg-[#1e1e1e] border border-[#7DD3FC]/30 rounded-xl p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="text-sm font-semibold text-white">Name your price</p>
                          <span className="text-[11px] font-semibold text-[#7DD3FC] bg-[#7DD3FC]/10 border border-[#7DD3FC]/30 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                            Suggested {formatBidMoney(ticket.bid.suggested)}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-2">
                          <span className="text-sm text-[#bbbbbb]">Your bid</span>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              aria-label="Lower bid"
                              onClick={() => setBid(ticket.id, bidFor(ticket.id) - BID_BUTTON_STEP)}
                              disabled={bidFor(ticket.id) <= ticket.bid.min}
                              className="flex-shrink-0 bg-black text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              -
                            </button>
                            <div className="flex flex-1 sm:flex-none min-w-0 items-center bg-black rounded-full px-3 h-9">
                              <span className="text-gray-400 mr-1">$</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min={ticket.bid.min}
                                value={bidDrafts[ticket.id] ?? String(bidFor(ticket.id))}
                                onChange={(e) => setBidDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                                onBlur={() => commitBidDraft(ticket.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                                aria-label="Your bid in dollars"
                                className="w-full sm:w-20 min-w-0 bg-transparent text-white text-base font-semibold outline-none"
                              />
                            </div>
                            <button
                              aria-label="Raise bid"
                              onClick={() => setBid(ticket.id, bidFor(ticket.id) + BID_BUTTON_STEP)}
                              disabled={bidFor(ticket.id) >= ticket.bid.max}
                              className="flex-shrink-0 bg-black text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {(() => {
                          const draft = bidDrafts[ticket.id];
                          if (draft === undefined || draft.trim() === "") return null;
                          const v = parseFloat(draft);
                          if (!Number.isFinite(v)) return null;
                          if (v < ticket.bid.min) return <p className="text-xs text-[#F5C518] mb-1">The lowest bid is {formatBidMoney(ticket.bid.min)}.</p>;
                          return null;
                        })()}
                        {/* Drag to raise or lower the bid. Its end is a convenience, not a cap —
                            see sliderMaxFor; the box above takes any amount. */}
                        <input
                          type="range"
                          min={Math.ceil(ticket.bid.min)}
                          max={sliderMaxFor(ticket.id)}
                          step={BID_STEP}
                          value={Math.min(Math.max(bidFor(ticket.id), Math.ceil(ticket.bid.min)), sliderMaxFor(ticket.id))}
                          onChange={(e) => setBid(ticket.id, Number(e.target.value))}
                          aria-label="Drag to raise or lower your bid"
                          className="w-full mt-1 accent-[#7DD3FC] cursor-pointer"
                        />
                        <div className="flex justify-between text-[11px] text-gray-400 mt-1 mb-2">
                          <span>{formatBidMoney(Math.ceil(ticket.bid.min))}</span>
                          <span>Suggested {formatBidMoney(ticket.bid.suggested)}</span>
                          <span>{formatBidMoney(sliderMaxFor(ticket.id))}+</span>
                        </div>
                        <p className="text-xs font-semibold text-[#F79432] mt-1">{BID_APPROVAL_NOTICE}</p>
                        <p className="text-xs text-[#bbbbbb] mt-1">
                          One seat per bid. Your card is held for your bid and charged only if the host accepts it. Want more seats or a different amount? Place another bid.
                        </p>
                        {!ticket.bidOnly && (
                        <button
                          type="button"
                          onClick={() => chooseBid(ticket.id, false)}
                          className="mt-3 text-xs font-semibold text-gray-300 underline underline-offset-2 hover:text-white"
                        >
                          Pay the normal price instead ({staticTickets[index].price.toLocaleString("en-US", { style: "currency", currency: "usd" })})
                        </button>
                        )}
                      </div>
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

                    {event.isPaid && ticket.isSelected && !(ticket.bid && isBidding(ticket.id)) && (
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
                            disabled={
                              (ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER) ||
                              (remainingFor(ticket.id) !== null && ticket.quantity >= remainingFor(ticket.id)!)
                            }
                            title={
                              ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER
                                ? premiumOrderCapMessage(ticket.memberships[0])
                                : remainingFor(ticket.id) !== null && ticket.quantity >= remainingFor(ticket.id)!
                                  ? remainingMessage(remainingFor(ticket.id)!, ticket.name)
                                  : undefined
                            }
                            className="bg-black text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black"
                          >
                            +
                          </button>
                        </div>
                        {/* Say why the stepper stopped, rather than leaving a dead button. */}
                        {ticket.memberships.length > 0 && ticket.quantity >= PREMIUM_TICKET_MAX_PER_ORDER ? (
                          <p className="text-xs flex-1 min-w-[140px]" style={{ color: "#F5C518" }}>
                            {premiumOrderCapMessage(ticket.memberships[0])}
                          </p>
                        ) : remainingFor(ticket.id) !== null && ticket.quantity >= remainingFor(ticket.id)! ? (
                          <p className="text-xs flex-1 min-w-[140px]" style={{ color: "#F5C518" }}>
                            {remainingMessage(remainingFor(ticket.id)!, ticket.name)}
                          </p>
                        ) : null}
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
                // Free months lead, because they are what changes the decision: "$20/month"
                // and "free for a month, then $20/month" are different offers and the second
                // one has to be legible before the buyer commits, not only in the modal.
                const isUpgrade = selectionSplit.upgrades.includes(key);
                const freeLead = selectionFreeMonths > 0 && !isUpgrade ? `first ${freeMonthsLabel(selectionFreeMonths)} free, then ` : "";
                return (
                  <p key={key} className="text-xs mt-0.5" style={{ color: "#F5C518" }}>
                    {isUpgrade
                      ? `+ ${plan?.name || MEMBERSHIPS[key].label} — switch from monthly to ${price?.label || "yearly"}, starting when your paid month ends; confirmed at checkout`
                      : price?.label
                        ? `+ ${plan?.name}${membershipIncludesLine(key) ? ` (${membershipIncludesLine(key)!.replace(/^Includes/, "includes")})` : ""} — ${freeLead}${price.label}, confirmed at checkout`
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
              {isLoading ? <Spinner /> : tickets.some((t) => t.isSelected && t.bid && isBidding(t.id)) ? "Place bid" : selectionNeedsApproval ? "Request to Book" : "Checkout"}
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