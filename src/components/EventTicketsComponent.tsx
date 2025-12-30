import { setSelectedTickets, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch } from "@Jetzy/redux/stores"
import React, { useState, useEffect } from "react"
import { waitUntil } from "@Jetzy/lib/utils"
import Spinner from "./misc/Spinner"
import { Error } from "@Jetzy/lib/_toaster"
import { IEvent } from "@/models/events/types"
import { CheckmarkSVG } from "@/assets/icons"
import { FiX, FiPlus, FiUser } from "react-icons/fi"
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

	// format the event tickets - include all tickets (enabled and disabled)
	const ticketsItems = (event.tickets && Array.isArray(event.tickets) ? event.tickets : [])
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
				disabled: ticket.disabled || false,
			}
		})
	
	// Get disabled tickets for warning message
	const disabledTickets = event.tickets && Array.isArray(event.tickets) 
		? event.tickets.filter((ticket) => ticket.disabled).map((t) => t.name)
		: []
	const hasDisabledTickets = disabledTickets.length > 0

	// State for ticket quantities - only include enabled tickets for selection
	const [tickets, setTickets] = useState(ticketsItems.filter((t) => !t.disabled))

	// Clone a static version of the enabled tickets so when increasing the qty the amount is not recalculated from the original price
	const staticTickets = ticketsItems.filter((t) => !t.disabled).copyWithin(0, 0)

	// State for loader
	const [isLoading, setLoader] = useState(false)

	// State for checkout modal
	const dispatcher = useAppDispatch()

	// State for guest emails
	const [guestEmails, setGuestEmails] = useState<string[]>([])

	// Calculate total selected ticket quantity
	const totalSelectedQuantity = tickets
		.filter((ticket) => ticket.isSelected)
		.reduce((sum, ticket) => sum + ticket.quantity, 0)

	// Calculate number of paid tickets (excluding free tickets)
	const paidTicketQuantity = tickets
		.filter((ticket) => ticket.isSelected && ticket.price > 0)
		.reduce((sum, ticket) => sum + ticket.quantity, 0)

	// Guests are now unlimited - no dependency on ticket quantity

	// Handle guest email changes
	const handleGuestEmailChange = (index: number, value: string) => {
		const newGuestEmails = [...guestEmails]
		newGuestEmails[index] = value
		setGuestEmails(newGuestEmails)
	}

	// Add a new guest slot
	const handleAddGuest = () => {
		setGuestEmails([...guestEmails, ""])
	}

	// Remove a guest slot
	const handleRemoveGuest = (index: number) => {
		const newGuestEmails = guestEmails.filter((_: string, i: number) => i !== index)
		setGuestEmails(newGuestEmails)
	}

	// Validate email format
	const validateEmail = (email: string): boolean => {
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailPattern.test(email)
	}

	// Handle increment/decrement for tickets
	const handleQuantityChange = (id: string, delta: number) => {
		setTickets((prevTickets) => {
			const updatedTickets = prevTickets.map((ticket) => {
				if (ticket.id !== id) return ticket
				
				const newQty = Math.max(0, ticket.quantity + delta)
				// Find the original ticket price from ticketsItems
				const originalTicket = ticketsItems.find((t) => t.id === id && !t.disabled)
				const basePrice = originalTicket?.price || ticket.price

				// If quantity reaches 0, deselect the ticket
				if (newQty === 0) {
					return {
						...ticket,
						quantity: 0,
						isSelected: false,
						price: basePrice,
					}
				}

				// If quantity becomes greater than 0 and ticket wasn't selected, select it
				return {
					...ticket,
					quantity: newQty,
					isSelected: newQty > 0 ? true : ticket.isSelected,
					price: newQty * basePrice,
				}
			})
			
			// If any ticket is selected and no guest fields exist, add one
			const hasSelectedTickets = updatedTickets.some((t) => t.isSelected)
			if (hasSelectedTickets) {
				setGuestEmails((prevEmails) => {
					if (prevEmails.length === 0) {
						return [""]
					}
					return prevEmails
				})
			}
			
			return updatedTickets
		})
	}

	const handleTicketSelection = (id: string) => {
		setTickets((prevTickets) => {
			const updatedTickets = prevTickets.map((ticket) => {
				if (ticket.id !== id) return ticket
				
				const newIsSelected = !ticket.isSelected
				// Find the original ticket price from ticketsItems
				const originalTicket = ticketsItems.find((t) => t.id === id && !t.disabled)
				const basePrice = originalTicket?.price || ticket.price
				
				// If selecting, keep quantity at 0 (user must increment manually). If deselecting, set quantity to 0.
				const newQuantity = newIsSelected 
					? 0  // Start at 0, not 1
					: 0

				return {
					...ticket,
					isSelected: newIsSelected,
					quantity: newQuantity,
					price: newQuantity * basePrice,
				}
			})
			
			// If any ticket is selected and no guest fields exist, add one
			const hasSelectedTickets = updatedTickets.some((t) => t.isSelected)
			if (hasSelectedTickets) {
				setGuestEmails((prevEmails) => {
					if (prevEmails.length === 0) {
						return [""]
					}
					return prevEmails
				})
			}
			
			return updatedTickets
		})
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
			.map((ticket) => {
				// Find the original ticket from ticketsItems to get the base price
				const originalTicket = ticketsItems.find((t) => t.id === ticket.id && !t.disabled)
				return {
					id: ticket.id,
					name: ticket.name,
					price: originalTicket?.price || ticket.price,
					description: ticket.description,
					quantity: ticket.quantity,
					isSelected: ticket.isSelected,
					priceId: ticket.priceId,
					eventId: ticket.eventId,
				}
			})
			.filter((ticket) => ticket.isSelected)

		// Validate guest emails if provided
		const filledGuestEmails = guestEmails.filter((email: string) => email.trim() !== "")
		const invalidEmails = filledGuestEmails.filter((email: string) => !validateEmail(email))

		if (invalidEmails.length > 0) {
			Error("Invalid Email", "Please enter valid email addresses for your guests.")
			setLoader(false)
			return
		}

		// Store guest emails in localStorage to pass to checkout form
		if (filledGuestEmails.length > 0) {
			localStorage.setItem("eventGuestEmails", JSON.stringify(filledGuestEmails))
		} else {
			localStorage.removeItem("eventGuestEmails")
		}

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
							{/* Warning for disabled tickets */}
							{hasDisabledTickets && (
								<div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg">
									<div className="flex items-start">
										<div className="flex-shrink-0">
											<svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
												<path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
											</svg>
										</div>
										<div className="ml-3 flex-1">
											<p className="text-sm text-yellow-700">
												<strong className="font-medium">Notice:</strong> The following ticket{disabledTickets.length > 1 ? 's' : ''} {disabledTickets.length > 1 ? 'are' : 'is'} no longer available for purchase:
											</p>
											<ul className="mt-2 list-disc list-inside text-sm text-yellow-700">
												{disabledTickets.map((ticketName, idx) => (
													<li key={idx} className="font-medium">{ticketName}</li>
												))}
											</ul>
										</div>
									</div>
								</div>
							)}
							
							{/* Ticket Section */}
							<div className="space-y-4">
								{ticketsItems.map((ticket, index) => {
									const isDisabled = ticket.disabled || false
									const ticketIndex = tickets.findIndex((t) => t.id === ticket.id)
									const isSelected = ticketIndex >= 0 && tickets[ticketIndex]?.isSelected
									
									return (
										<div
											key={ticket.id}
											className={`relative p-5 rounded-xl border-2 transition-all duration-200 ${
												isDisabled
													? "bg-gray-100 border-gray-300 opacity-60 cursor-not-allowed"
													: isSelected
													? "bg-background-gray border-primary-purple bg-primary-purple/5 cursor-pointer hover:shadow-md"
													: "bg-background-gray border-border-light cursor-pointer hover:shadow-md hover:border-primary-purple/30"
											}`}
											onClick={() => {
												if (!isDisabled) {
													handleTicketSelection(ticket.id)
													sendGAEvent({
														category: "Event",
														action: "Ticket Selected",
														label: ticket.name,
														eventName: event.name,
													})
												}
											}}
										>
											{isSelected && !isDisabled && (
												<span className="absolute top-3 right-3 w-6 h-6 bg-primary-purple rounded-full flex items-center justify-center">
													<CheckmarkSVG />
												</span>
											)}
											<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-4">
												<div className="flex-1">
													<div className="flex items-center gap-2 flex-wrap">
														<h3 className={`font-semibold text-lg ${isDisabled ? "text-gray-500" : "text-text-primary"}`}>
															{ticket.name}
														</h3>
														{isDisabled && (
															<span className="px-2 py-1 bg-gray-400 text-white text-xs font-semibold rounded-full">
																No longer available
															</span>
														)}
													</div>
													{!isDisabled && (
														<p className="text-xs text-text-muted mt-1">Select your tickets and proceed to checkout</p>
													)}
													{ticket.description && (
														<div className={`text-sm mt-2 ${isDisabled ? "text-gray-400" : "text-text-secondary"}`}>
															<Linkify
																options={{
																	target: "_blank",
																	className: isDisabled 
																		? "text-gray-400" 
																		: "text-primary-purple underline hover:text-primary-dark font-medium",
																}}
															>
																{ticket.description}
															</Linkify>
														</div>
													)}
												</div>

												<div className="flex items-center gap-4 sm:flex-row flex-col-reverse w-full sm:w-auto">
													<p className={`font-bold text-2xl ${isDisabled ? "text-gray-400 line-through" : "text-primary-purple"}`}>
														{ticket.price.toLocaleString("en-US", {
															style: "currency",
															currency: "usd",
														})}
													</p>
													{isSelected && !isDisabled && (
														<div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
															<button
																onClick={() => handleQuantityChange(ticket.id, -1)}
																disabled={tickets[ticketIndex]?.quantity === 0}
																className="w-9 h-9 bg-white border-2 border-primary-purple text-primary-purple rounded-full flex items-center justify-center hover:bg-primary-purple hover:text-white transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
																aria-label="Decrease quantity"
															>
																−
															</button>
															<span className="text-text-primary text-lg font-semibold min-w-[2rem] text-center">
																{tickets[ticketIndex]?.quantity || 0}
															</span>
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
									)
								})}
							</div>

							{/* Guest Invitation Section */}
							{totalSelectedQuantity > 0 && (
								<div className="mt-6 pt-6 border-t border-border-light">
									<div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-5 border-2 border-blue-200">
										<div className="flex items-start gap-3 mb-4">
											<div className="bg-blue-100 p-2 rounded-lg">
												<FiUser className="w-5 h-5 text-blue-600" />
											</div>
											<div className="flex-1">
												<h3 className="font-bold text-lg text-text-primary mb-1">
													👥 Invite Your Guests
												</h3>
												<p className="text-sm text-text-secondary">
													You can invite <strong className="text-primary-purple">unlimited guests</strong> to join you at this event.
												</p>
												<p className="text-xs text-text-muted mt-2">
													💡 Your guests will receive an invitation email with event details. This is optional - you can skip if you prefer.
												</p>
											</div>
										</div>

										<div className="space-y-3 mt-4">
											{guestEmails.map((email: string, index: number) => (
												<div key={index} className="flex items-center gap-2">
													<div className="flex-1">
														<input
															type="email"
															placeholder={`Guest ${index + 1} email address (optional)`}
															value={email}
															onChange={(e) => handleGuestEmailChange(index, e.target.value)}
															className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all"
														/>
													</div>
													<button
														type="button"
														onClick={() => handleRemoveGuest(index)}
														className="px-3 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors text-sm font-semibold border border-red-200 hover:border-red-300"
														aria-label="Remove guest"
													>
														<FiX className="w-4 h-4" />
													</button>
												</div>
											))}
											<button
												type="button"
												onClick={handleAddGuest}
												className="w-full mt-2 px-4 py-3 bg-primary-purple/10 hover:bg-primary-purple/20 text-primary-purple font-semibold rounded-lg transition-colors border-2 border-primary-purple/30 hover:border-primary-purple/50 flex items-center justify-center gap-2"
											>
												<FiPlus className="w-5 h-5" />
												Add Guest
											</button>
										</div>
									</div>
								</div>
							)}
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
								className="relative w-full sm:w-auto bg-gradient-to-r from-primary-purple via-purple-600 to-primary-dark text-white font-extrabold px-10 py-4 rounded-xl hover:from-purple-600 hover:via-purple-700 hover:to-primary-dark transition-all duration-300 shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 text-lg"
								style={{
									animation: isLoading ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
								}}
							>
								{isLoading ? (
									<>
										<Spinner />
										<span>Processing...</span>
									</>
								) : (
									<>
										<span className="text-xl">🎫</span>
										<span>Proceed to Checkout</span>
										<span className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full animate-bounce">
											⚡
										</span>
									</>
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
