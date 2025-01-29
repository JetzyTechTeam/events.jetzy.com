import { setSelectedTickets, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch } from "@Jetzy/redux/stores"
import React, { useState } from "react"
import ExpandText from "./misc/ExpandText"
import { waitUntil } from "@Jetzy/lib/utils"
import Spinner from "./misc/Spinner"
import { Error } from "@Jetzy/lib/_toaster"

const ticketsItems = [
	{
		id: 1,
		name: "VVIP",
		price: 100,
		quantity: 1,
		isSelected: false,
		text: "Sales end on Feb 15, 2025",
		desc: "Includes unlimited wine and champagne bracelet and automatic entry into raffle for a piece of Sergey Kir's Art!",
	},
	{
		id: 2,
		name: "VIP",
		price: 60,
		quantity: 1,
		isSelected: false,
		text: "Sales end on Feb 15, 2025",
		desc: "Includes unlimited wine and champagne bracelet and automatic entry into raffle for a piece of Sergey Kir's Art! \n \n 2 months free Jetzy Select $90 value",
	},
	{
		id: 3,
		name: "General Admission",
		price: 30,
		quantity: 1,
		isSelected: false,
		text: "Sales end on Feb 15, 2025",
		desc: "Automatic entry into raffle for a piece of Sergey Kir's Art. Do not purchase this ticket if you would like to drink you will need to pay the difference of the all inclusive ticket on site.",
	},
]

const EventPage: React.FC = () => {
	// State for ticket quantities
	const [tickets, setTickets] = useState(ticketsItems)
	const [isLoading, setLoader] = useState(false)

	// State for checkout modal
	const dispatcher = useAppDispatch()

	// Handle increment/decrement for tickets
	const handleQuantityChange = (id: number, delta: number) => {
		setTickets((prevTickets) =>
			prevTickets.map((ticket, index) => {
				const newQty = Math.max(1, ticket.quantity + delta)
				const ticketItem = ticketsItems[index]

				return ticket.id === id ? { ...ticket, quantity: newQty, price: newQty === 0 ? ticketItem.price : newQty * ticketItem.price } : ticket
			}),
		)
	}

	const handleTicketSelection = (id: number) => {
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
		if (!hasSelected) {
			// alert("Please select at least one ticket.")
			setLoader(false)
			Error("Ticket Required", "Please select at least one ticket.")
			return
		}

		const ticketsSelected = tickets
			.map((ticket, index) => ({ id: ticket.id, name: ticket.name, price: ticketsItems[index].price, quantity: ticket.quantity, isSelected: ticket.isSelected }))
			.filter((ticket) => ticket.isSelected)
		dispatcher(setSelectedTickets(ticketsSelected))

		waitUntil(500).then(() => {
			setLoader(false)
			dispatcher(toggleCheckoutForm(showCheckout))
		})
	}

	return (
		<>
			{/* Main Container */}
			<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all mt-8" id="event-tickets">
				{/* Content Section */}
				<div className="p-6 sm:p-8">
					{/* Header Section */}
					<div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
						<div className="text-center sm:text-left">
							<h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Tickets</h2>
							<p className="text-gray-600 text-sm sm:text-base">Select your ticket and checkout event.</p>
						</div>
						<button
							disabled={isLoading}
							onClick={() => showCheckoutForm(true)}
							className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50"
						>
							{isLoading ? <Spinner /> : "Checkout"}
						</button>
					</div>

					{/* Ticket Section */}
					<div className="space-y-6">
						{tickets.map((ticket) => (
							<div key={ticket.id} className="bg-gray-50 p-4 rounded-lg">
								<div className="flex flex-col sm:flex-row justify-between items-center">
									<div className="md:text-left xs:text-center">
										<h3 className="font-semibold text-lg text-gray-800">{ticket.name}</h3>
										<p className="text-gray-600">${ticket.price}</p>
									</div>

									{!ticket.isSelected ? (
										<div className="flex items-center space-x-4 mt-4 sm:mt-0 text-slate-800">
											<button
												onClick={() => handleTicketSelection(ticket.id)}
												className={`bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300 ${ticket.isSelected ? "bg-purple-600 text-white" : ""}`}
											>
												{ticket.isSelected ? "✓" : "+"}
											</button>
										</div>
									) : (
										<div className="flex items-center space-x-4 mt-4 sm:mt-0 text-slate-800">
											<button onClick={() => handleQuantityChange(ticket.id, -1)} className="bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300">
												-
											</button>
											<span className="text-lg font-semibold">{ticket.quantity}</span>
											<button onClick={() => handleQuantityChange(ticket.id, 1)} className="bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300">
												+
											</button>
											{/* remove   */}

											<button onClick={() => handleTicketSelection(ticket.id)} className="bg-red-200 text-red-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-300">
												-
											</button>
										</div>
									)}
								</div>
								<p className="text-gray-600 mt-1 text-xs md:text-left xs:text-center">{ticket.text}</p>
								<ExpandText content={ticket.desc} maxChars={25} />
							</div>
						))}
					</div>
				</div>
			</div>
		</>
	)
}

export default EventPage
