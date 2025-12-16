import { setSelectedTickets, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch } from "@Jetzy/redux/stores"
import React, { useState } from "react"
import { waitUntil } from "@Jetzy/lib/utils"
import Spinner from "./misc/Spinner"
import { Error } from "@Jetzy/lib/_toaster"
import { IEvent } from "@/models/events/types"
import { CheckmarkSVG } from "@/assets/icons"
import { FiX } from "react-icons/fi"
import { sendGAEvent } from "@next/third-parties/google"
import Linkify from "linkify-react"
import { useSession } from "next-auth/react"

type Props = {
	event: IEvent
	isOpen: boolean
	onClose: () => void
}

const EventTicketsComponent: React.FC<Props> = ({ event, isOpen, onClose }) => {
	const eventId = event._id.toString()

	const session = useSession()

	// format the event tickets
	const ticketsItems = (event.tickets && Array.isArray(event.tickets) ? event.tickets : []).map((ticket) => {
		return {
			id: ticket._id.toString(),
			name: ticket.name,
			price: ticket.price,
			description: ticket.desc,
			quantity: 1,
			isSelected: event.isPaid ? true : false,
			priceId: ticket.stripeProductId,
			eventId: event._id.toString(),
		}
	})

	// State for ticket quantities
	const [tickets, setTickets] = useState(ticketsItems)

	// Clone a static verion of the tickets so when increasing the qty the amount is not recalculated from the original price
	const staticTickets = ticketsItems.copyWithin(0, 0)

	// State for loader
	const [isLoading, setLoader] = useState(false)

	// State for checkout modal
	const dispatcher = useAppDispatch()

	// Handle increment/decrement for tickets
	const handleQuantityChange = (id: string, delta: number) => {
		setTickets((prevTickets) =>
			prevTickets.map((ticket, index) => {
				const newQty = Math.max(1, ticket.quantity + delta)
				const ticketItem = ticketsItems[index]

				return ticket.id === id
					? {
							...ticket,
							quantity: newQty,
							price: newQty === 0 ? ticketItem.price : newQty * ticketItem.price,
					  }
					: ticket
			}),
		)
	}

	const handleTicketSelection = (id: string) => {
		setTickets((prevTickets) =>
			prevTickets.map((ticket) => {
				return ticket.id === id ? { ...ticket, isSelected: !ticket.isSelected } : ticket
			}),
		)
	}

	const showCheckoutForm = (showCheckout: boolean) => {
		setLoader(true)
		// make sure the ticket at least one is selected
		const hasSelected = tickets.some((ticket) => ticket.isSelected)
		if (event.isPaid && !hasSelected) {
			alert("Please select at least one ticket.")
			setLoader(false)
			Error("Ticket Required", "Please select at least one ticket.")
			return
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
			.filter((ticket) => ticket.isSelected)

		dispatcher(setSelectedTickets(ticketsSelected))

		waitUntil(500).then(() => {
			setLoader(false)
			dispatcher(toggleCheckoutForm(showCheckout))
		})
	}

	return (
		<>
			{/* Ticket Selection Modal */}
			{isOpen && (
				<div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={onClose}>
					{/* Modal Container */}
					<div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-border-light" onClick={(e) => e.stopPropagation()}>
						{/* Modal Header */}
						<div className="flex items-center justify-between p-6 border-b border-border-light sticky top-0 bg-white z-10">
							<div>
								<h2 className="text-2xl font-bold text-text-primary">Select Tickets</h2>
								<p className="text-text-secondary text-sm mt-1">Choose your tickets and proceed to checkout</p>
							</div>
							<button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors p-2 rounded-lg hover:bg-background-gray">
								<FiX className="text-2xl" />
							</button>
						</div>

						{/* Modal Body - Scrollable */}
						<div className="overflow-y-auto max-h-[calc(90vh-200px)] p-6">
							{/* Ticket Section */}
							<div className="space-y-4">
								{tickets.map((ticket, index) => (
									<div
										key={ticket.id}
										className={`relative bg-background-gray p-5 rounded-xl cursor-pointer border-2 transition-all duration-200 hover:shadow-md ${
											ticket.isSelected ? "border-primary-purple bg-primary-purple/5" : "border-border-light hover:border-primary-purple/30"
										}`}
										onClick={() => {
											handleTicketSelection(ticket.id)
											sendGAEvent({
												category: "Event",
												action: "Ticket Selected",
												label: ticket.name,
												eventName: event.name,
											})
										}}
									>
										{ticket.isSelected && (
											<span className="absolute top-3 right-3 w-6 h-6 bg-primary-purple rounded-full flex items-center justify-center">
												<CheckmarkSVG />
											</span>
										)}
										<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-4">
											<div className="flex-1">
												<h3 className="font-semibold text-lg text-text-primary">{ticket.name}</h3>
												<p className="text-xs text-text-muted mt-1">Select your tickets and proceed to checkout</p>
												{ticket.description && (
													<div className="text-sm text-text-secondary mt-2">
														<Linkify
															options={{
																target: "_blank",
																className: "text-primary-purple underline hover:text-primary-dark font-medium",
															}}
														>
															{ticket.description}
														</Linkify>
													</div>
												)}
											</div>

											<div className="flex items-center gap-4 sm:flex-row flex-col-reverse w-full sm:w-auto">
												<p className="text-primary-purple font-bold text-2xl">
													{staticTickets[index].price.toLocaleString("en-US", {
														style: "currency",
														currency: "usd",
													})}
												</p>
												{event.isPaid && ticket.isSelected && (
													<div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
														<button
															onClick={() => handleQuantityChange(ticket.id, -1)}
															className="w-9 h-9 bg-white border-2 border-primary-purple text-primary-purple rounded-full flex items-center justify-center hover:bg-primary-purple hover:text-white transition-colors font-semibold text-lg"
															aria-label="Decrease quantity"
														>
															−
														</button>
														<span className="text-text-primary text-lg font-semibold min-w-[2rem] text-center">{ticket.quantity}</span>
														<button
															onClick={() => handleQuantityChange(ticket.id, 1)}
															className="w-9 h-9 bg-primary-purple text-white rounded-full flex items-center justify-center hover:bg-primary-dark transition-colors font-semibold text-lg"
															aria-label="Increase quantity"
														>
															+
														</button>
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* Modal Footer - Sticky */}
						<div className="flex flex-col sm:flex-row justify-between items-center p-6 border-t border-border-light gap-4 sticky bottom-0 bg-white">
							{/* Total Price */}
							<div className="text-center sm:text-left">
								<p className="text-sm text-text-muted uppercase tracking-wide mb-1">Total</p>
								<h3 className="text-3xl font-bold text-text-primary">
									{tickets
										.reduce((acc, ticket) => (ticket.isSelected ? acc + ticket.price : acc), 0)
										.toLocaleString("en-US", {
											style: "currency",
											currency: "usd",
										})}
								</h3>
							</div>

							<button
								disabled={isLoading}
								onClick={() => {
									showCheckoutForm(true)
									sendGAEvent({
										category: "Event",
										action: "Checkout Button Clicked",
										label: event.name,
									})
								}}
								className="w-full sm:w-auto bg-primary-purple text-white font-semibold px-8 py-3.5 rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							>
								{isLoading ? (
									<>
										<Spinner />
										<span>Processing...</span>
									</>
								) : (
									"Checkout"
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	)
}

export default EventTicketsComponent
