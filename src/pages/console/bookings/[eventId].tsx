import { GetServerSideProps } from "next"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { Pages } from "@/types"
import { Booking } from "."
import { authorizedOnly } from "@/lib/authSession"
import Head from "next/head"
import React, { useState, useMemo } from "react"
import Link from "next/link"
import { downloadExcel } from "react-export-table-to-excel"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

type Props = {
	bookings: Booking[]
	event: { _id: string; name: string; startsOn: string; endsOn: string }
	filters: { status?: string; search?: string; date?: string; amount?: string; minTickets?: string }
	exportable: any[]
}

export default function BookingsEventPage({ bookings, event, filters, exportable }: Props) {
	const [activeTab, setActiveTab] = useState<"bookings" | "waiting-list">("bookings")
	const [currentFilters, setCurrentFilters] = useState(filters)
	const [currentPage, setCurrentPage] = useState(1)
	const itemsPerPage = 10

	// Calculate statistics
	const statistics = useMemo(() => {
		const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "approved")
		const canceledBookings = bookings.filter((b) => b.status === "cancelled")

		const activeTickets = activeBookings.reduce((sum, b) => sum + b.tickets.reduce((ticketSum, t) => ticketSum + t.quantity, 0), 0)
		const canceledTickets = canceledBookings.reduce((sum, b) => sum + b.tickets.reduce((ticketSum, t) => ticketSum + t.quantity, 0), 0)

		const uniqueActiveCustomers = new Set(activeBookings.map((b) => b.customerEmail)).size
		const uniqueCanceledCustomers = new Set(canceledBookings.map((b) => b.customerEmail)).size

		return {
			activeTickets,
			activeCustomers: uniqueActiveCustomers,
			canceledTickets,
			canceledCustomers: uniqueCanceledCustomers,
		}
	}, [bookings])

	// Export function
	const handleExport = () => {
		const exportTableHeaders = ["Reference", "Event", "Amount", "Status", "Customer", "Tickets", "Date"]
		const exportTableData = exportable.map((row) => [
			row.booking.bookingRef,
			row.event.name,
			row.booking.total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
			row.booking.status,
			`${row.booking.customerName} | ${row.booking.customerEmail} | ${row.booking.customerPhone}`,
			row.bookedTickets.join(", "),
			new Date(row.booking.createdAt).toLocaleString(),
		])

		downloadExcel({
			fileName: `${event.name}-Bookings-Export`,
			sheet: "Bookings",
			tablePayload: {
				header: exportTableHeaders,
				body: exportTableData,
			},
		})
	}

	// Pagination
	const paginatedBookings = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage
		const endIndex = startIndex + itemsPerPage
		return bookings.slice(startIndex, endIndex)
	}, [bookings, currentPage])

	const totalPages = Math.ceil(bookings.length / itemsPerPage)

	return (
		<>
			<Head>
				<title>{event.name} - Bookings - Jetzy Events</title>
				<meta name="description" content={`View and manage bookings for ${event.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Bookings}>
				<div className="px-4 sm:px-6 lg:px-8">
					{/* Back Button */}
					<div className="mb-6">
						<Link href="/console/bookings">
							<button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg hover:bg-background-gray transition-colors">
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
								</svg>
								Back to Events
							</button>
						</Link>
					</div>

					{/* Event Info Header */}
					<div className="bg-white rounded-xl border border-border-light p-6 mb-6">
						<h2 className="text-2xl font-bold text-text-primary mb-4">{event.name}</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
							<div>
								<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Date</label>
								<p className="text-sm font-semibold text-text-primary">{new Date(event.startsOn).toLocaleDateString()}</p>
							</div>
							<div>
								<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Time</label>
								<p className="text-sm font-semibold text-text-primary">{new Date(event.startsOn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
							</div>
							<div>
								<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Number of Attendees</label>
								<p className="text-sm font-semibold text-text-primary">{statistics.activeTickets}</p>
							</div>
							<div>
								<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Reference ID</label>
								<p className="text-sm font-semibold text-text-primary truncate">{event._id}</p>
							</div>
						</div>

						{/* Tabs */}
						<div className="flex gap-3 mt-6 border-b border-border-light">
							<button
								onClick={() => setActiveTab("bookings")}
								className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
									activeTab === "bookings" ? "border-primary-purple text-primary-purple" : "border-transparent text-text-muted hover:text-text-primary"
								}`}
							>
								Bookings
							</button>
							<button
								onClick={() => setActiveTab("waiting-list")}
								className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
									activeTab === "waiting-list" ? "border-primary-purple text-primary-purple" : "border-transparent text-text-muted hover:text-text-primary"
								}`}
							>
								Waiting List
							</button>
						</div>
					</div>

					{/* Statistics Cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
						<div className="bg-white rounded-xl border border-border-light p-6">
							<p className="text-sm font-medium text-text-secondary mb-1">Active Tickets</p>
							<p className="text-3xl font-bold text-green-600">{statistics.activeTickets}</p>
						</div>
						<div className="bg-white rounded-xl border border-border-light p-6">
							<p className="text-sm font-medium text-text-secondary mb-1">Active Customers</p>
							<p className="text-3xl font-bold text-green-600">{statistics.activeCustomers}</p>
						</div>
						<div className="bg-white rounded-xl border border-border-light p-6">
							<p className="text-sm font-medium text-text-secondary mb-1">Canceled Tickets</p>
							<p className="text-3xl font-bold text-red-600">{statistics.canceledTickets}</p>
						</div>
						<div className="bg-white rounded-xl border border-border-light p-6">
							<p className="text-sm font-medium text-text-secondary mb-1">Canceled Customers</p>
							<p className="text-3xl font-bold text-red-600">{statistics.canceledCustomers}</p>
						</div>
					</div>

					{/* Filters and Export */}
					<div className="bg-white rounded-xl border border-border-light p-6 mb-6">
						<div className="flex flex-col lg:flex-row gap-4 items-end">
							{/* Search */}
							<div className="flex-1">
								<label className="text-xs font-medium text-text-secondary mb-2 block">Search</label>
								<input
									type="text"
									placeholder="Name or Email"
									defaultValue={filters.search}
									className="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
									onChange={(e) => setCurrentFilters({ ...currentFilters, search: e.target.value })}
								/>
							</div>

							{/* Status */}
							<div className="w-full lg:w-48">
								<label className="text-xs font-medium text-text-secondary mb-2 block">Status</label>
								<select
									defaultValue={filters.status}
									className="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
									onChange={(e) => setCurrentFilters({ ...currentFilters, status: e.target.value })}
								>
									<option value="">All Status</option>
									<option value="confirmed">Confirmed</option>
									<option value="pending">Pending</option>
									<option value="approved">Approved</option>
									<option value="cancelled">Cancelled</option>
									<option value="refunded">Refunded</option>
									<option value="failed">Failed</option>
								</select>
							</div>

							{/* Min Amount */}
							<div className="w-full lg:w-40">
								<label className="text-xs font-medium text-text-secondary mb-2 block">Min Amount</label>
								<input
									type="number"
									placeholder="$0"
									defaultValue={filters.amount}
									className="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
									onChange={(e) => setCurrentFilters({ ...currentFilters, amount: e.target.value })}
								/>
							</div>

							{/* Min Tickets */}
							<div className="w-full lg:w-40">
								<label className="text-xs font-medium text-text-secondary mb-2 block">Min Tickets</label>
								<input
									type="number"
									placeholder="0"
									defaultValue={filters.minTickets}
									className="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
									onChange={(e) => setCurrentFilters({ ...currentFilters, minTickets: e.target.value })}
								/>
							</div>

							{/* Date */}
							<div className="w-full lg:w-48">
								<label className="text-xs font-medium text-text-secondary mb-2 block">Date</label>
								<input
									type="date"
									defaultValue={filters.date}
									className="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
									onChange={(e) => setCurrentFilters({ ...currentFilters, date: e.target.value })}
								/>
							</div>

							{/* Apply Button */}
							<button
								onClick={() => {
									const params = new URLSearchParams()
									if (currentFilters.status) params.set("status", currentFilters.status)
									if (currentFilters.search) params.set("search", currentFilters.search.trim())
									if (currentFilters.date) params.set("date", currentFilters.date)
									if (currentFilters.amount) params.set("amount", currentFilters.amount.trim())
									if (currentFilters.minTickets) params.set("minTickets", currentFilters.minTickets.trim())
									window.location.href = `/console/bookings/${event._id}?${params.toString()}`
								}}
								className="px-6 py-2.5 bg-primary-purple text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap"
							>
								Apply Filters
							</button>

							{/* Export Button */}
							<button
								onClick={handleExport}
								className="px-6 py-2.5 bg-white border border-border-light text-text-primary text-sm font-medium rounded-lg hover:bg-background-gray transition-colors whitespace-nowrap inline-flex items-center gap-2"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								Export
							</button>
						</div>
					</div>

					{/* Bookings List */}
					{activeTab === "bookings" && (
						<div className="space-y-4 mb-6">
							{paginatedBookings.length === 0 ? (
								<div className="bg-white rounded-xl border border-border-light p-12 text-center">
									<div className="w-16 h-16 mx-auto mb-4 bg-background-light rounded-full flex items-center justify-center">
										<svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
											/>
										</svg>
									</div>
									<h3 className="text-xl font-semibold text-text-primary mb-2">No Bookings Found</h3>
									<p className="text-text-secondary">There are no bookings matching your criteria.</p>
								</div>
							) : (
								paginatedBookings.map((booking) => (
									<div key={booking._id} className="bg-white rounded-xl border border-border-light p-6 hover:shadow-md transition-shadow">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
											{/* Left Column */}
											<div className="space-y-4">
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Attendee</label>
													<p className="text-base font-semibold text-text-primary">{booking.customerName}</p>
												</div>
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Email</label>
													<p className="text-sm text-text-secondary">{booking.customerEmail}</p>
												</div>
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Phone Number</label>
													<p className="text-sm text-text-secondary">{booking.customerPhone}</p>
												</div>
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Status</label>
													<span
														className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
															booking.status === "confirmed" || booking.status === "approved"
																? "bg-green-100 text-green-800"
																: booking.status === "pending"
																? "bg-yellow-100 text-yellow-800"
																: booking.status === "cancelled"
																? "bg-red-100 text-red-800"
																: "bg-gray-100 text-gray-800"
														}`}
													>
														{booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
													</span>
												</div>
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Created</label>
													<p className="text-sm text-text-secondary">{new Date(booking.createdAt).toLocaleString()}</p>
												</div>
												<div>
													<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Tickets</label>
													<p className="text-sm font-semibold text-text-primary">Quantity: {booking.tickets.reduce((sum, t) => sum + t.quantity, 0)}</p>
												</div>
											</div>

											{/* Right Column - Pricing */}
											<div className="flex flex-col justify-between">
												<div className="space-y-3">
													<div className="flex justify-between items-center">
														<span className="text-sm text-text-secondary">Subtotal</span>
														<span className="text-sm font-medium text-text-primary">${booking.total.toFixed(2)}</span>
													</div>
													<div className="flex justify-between items-center">
														<span className="text-sm text-text-secondary">Tax</span>
														<span className="text-sm font-medium text-text-primary">$0</span>
													</div>
													<div className="border-t border-border-light pt-3 flex justify-between items-center">
														<span className="text-base font-semibold text-text-primary">Total</span>
														<span className="text-2xl font-bold text-text-primary">${booking.total.toFixed(2)}</span>
													</div>
												</div>
											</div>
										</div>
									</div>
								))
							)}
						</div>
					)}

					{/* Waiting List Tab */}
					{activeTab === "waiting-list" && <WaitingListTab eventId={event._id} eventName={event.name} />}

					{/* Pagination */}
					{activeTab === "bookings" && totalPages > 1 && (
						<div className="flex justify-center items-center gap-2 mt-6">
							<button
								onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
								disabled={currentPage === 1}
								className="px-4 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg hover:bg-background-gray disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								Previous
							</button>

							{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
								<button
									key={page}
									onClick={() => setCurrentPage(page)}
									className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
										page === currentPage ? "bg-primary-purple text-white" : "text-text-primary bg-white border border-border-light hover:bg-background-gray"
									}`}
								>
									{page}
								</button>
							))}

							<button
								onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
								disabled={currentPage === totalPages}
								className="px-4 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg hover:bg-background-gray disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								Next
							</button>
						</div>
					)}
				</div>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
	const session = await authorizedOnly(ctx)
	if (!session) return session

	// Ensure database connection
	const { connectDB } = await import("@/lib/connect-db")
	await connectDB()

	const { eventId } = ctx.params as { eventId: string }
	const { status, date, search, amount, minTickets } = ctx.query

	// Get the event doc
	const eventDoc = await Events.findById(eventId, {
		_id: 1,
		name: 1,
		startsOn: 1,
		endsOn: 1,
	}).lean()

	if (!eventDoc) return { notFound: true }

	const filter: any = { eventId }

	if (status && typeof status === "string") filter.status = status

	if (date && typeof date === "string") {
		const selectedDate = new Date(date)
		const startOfDay = new Date(selectedDate)
		startOfDay.setUTCHours(0, 0, 0, 0)
		const endOfDay = new Date(selectedDate)

		endOfDay.setUTCHours(23, 59, 59, 999)
		filter.createdAt = { $gte: startOfDay, $lte: endOfDay }
	}

	if (search && typeof search === "string") {
		filter.$or = [{ customerName: { $regex: search, $options: "i" } }, { customerEmail: { $regex: search, $options: "i" } }]
	}
	if (amount && !isNaN(Number(amount))) {
		filter.total = { $gte: Number(amount) }
	}

	if (minTickets && !isNaN(Number(minTickets))) {
		filter["tickets.quantity"] = { $gte: Number(minTickets) }
	}

	// query db
	const bookings = await Bookings.find(filter, {
		bookingRef: 1,
		eventId: 1,
		tickets: 1,
		status: 1,
		customerName: 1,
		customerEmail: 1,
		customerPhone: 1,
		total: 1,
		createdAt: 1,
	})
		.sort({ createdAt: -1 })
		.lean()
		.exec()

	//exportable data for excel
	const exportable = await Promise.all(
		bookings.map(async (b) => {
			const event = eventDoc

			//get ticket summary
			const bookedTickets = b.tickets.map((t: any) => {
				return `Ticket ${t.ticketId.toString()} x ${t.quantity}`
			})

			return {
				booking: {
					...b,
					_id: b._id.toString(),
					eventId: b.eventId.toString(),
					createdAt: b.createdAt ? b.createdAt.toString() : "",
					tickets: bookedTickets,
				},
				event: {
					...event,
					name: event.name,
					_id: event._id.toString(),
					startsOn: event.startsOn.toISOString(),
					endsOn: event.endsOn.toISOString(),
				},
				bookedTickets,
			}
		}),
	)

	return {
		props: {
			event: {
				...eventDoc,
				_id: eventDoc._id.toString(),
				startsOn: eventDoc.startsOn.toISOString(),
				endsOn: eventDoc.endsOn.toISOString(),
			},
			bookings: bookings.map((b) => ({
				...b,
				_id: b._id.toString(),
				eventId: b.eventId.toString(),
				createdAt: b.createdAt ? b.createdAt.toString() : "",
				tickets: b.tickets.map((t: any) => ({
					ticketId: t.ticketId.toString(),
					quantity: t.quantity,
				})),
			})),
			exportable,
			// exportable: JSON.stringify(exportable),
			filters: {
				status: (status as string) || "",
				date: (date as string) || "",
				search: (search as string) || "",
				amount: (amount as string) || "",
				minTickets: (minTickets as string) || "",
			},
		},
	}
}

function WaitingListTab({ eventId, eventName }: { eventId: string; eventName: string }) {
	const [loadingStates, setLoadingStates] = useState<{ [key: string]: "approving" | "removing" | null }>({})

	const {
		data: waitingList,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["eventWaitingList", eventId],
		queryFn: () => axios.get(`/api/waiting-list/${eventId}`),
	})

	const handleApprove = async (waitingListId: string) => {
		setLoadingStates((prev) => ({ ...prev, [waitingListId]: "approving" }))
		try {
			const response = await axios.post("/api/waiting-list/approve", {
				waitingListId,
				eventName,
			})

			if (response.data.status) {
				alert("User approved and notified successfully!")
				refetch()
			} else {
				alert(`Failed to approve user: ${response.data.message || "Unknown error"}`)
			}
		} catch (error: any) {
			console.error("Error approving user:", error)
			const errorMessage = error.response?.data?.message || error.message || "Failed to approve user"
			alert(`Error: ${errorMessage}`)
		} finally {
			setLoadingStates((prev) => ({ ...prev, [waitingListId]: null }))
		}
	}

	const handleRemove = async (waitingListId: string) => {
		if (!confirm("Are you sure you want to remove this user from the waiting list?")) {
			return
		}

		setLoadingStates((prev) => ({ ...prev, [waitingListId]: "removing" }))
		try {
			const response = await axios.delete("/api/waiting-list/remove", {
				data: { waitingListId },
			})

			if (response.data.status) {
				alert("User removed from waiting list successfully!")
				refetch()
			} else {
				alert(`Failed to remove user: ${response.data.message || "Unknown error"}`)
			}
		} catch (error: any) {
			console.error("Error removing user:", error)
			const errorMessage = error.response?.data?.message || error.message || "Failed to remove user"
			alert(`Error: ${errorMessage}`)
		} finally {
			setLoadingStates((prev) => ({ ...prev, [waitingListId]: null }))
		}
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h3 className="text-xl font-bold text-text-primary">Waiting List</h3>
				{!isLoading && waitingList?.data?.data && (
					<div className="text-sm">
						<span className="font-semibold text-text-primary">
							Total: <span className="px-2 py-1 bg-primary-purple/10 text-primary-purple rounded-md">{waitingList.data.data.length}</span> users
						</span>
					</div>
				)}
			</div>

			{isLoading && (
				<div className="bg-white rounded-xl border border-border-light p-12 text-center">
					<div className="w-16 h-16 mx-auto mb-4 bg-background-light rounded-full flex items-center justify-center animate-pulse">
						<svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<p className="text-text-secondary">Loading waiting list...</p>
				</div>
			)}

			{!isLoading && waitingList?.data?.data?.length === 0 && (
				<div className="bg-white rounded-xl border border-border-light p-12 text-center">
					<div className="w-16 h-16 mx-auto mb-4 bg-background-light rounded-full flex items-center justify-center">
						<svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 className="text-xl font-semibold text-text-primary mb-2">No Users on Waiting List</h3>
					<p className="text-text-secondary">There are no users currently waiting for this event.</p>
				</div>
			)}

			{!isLoading && waitingList?.data?.data && Array.isArray(waitingList.data.data) && waitingList.data.data.length > 0 && (
				<div className="space-y-4">
					{waitingList.data.data.map((user: any) => (
						<div key={user._id} className="bg-white rounded-xl border border-border-light p-6 hover:shadow-md transition-shadow">
							<div className="flex justify-between items-start gap-4">
								<div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* Left Column */}
									<div className="space-y-4">
										<div>
											<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Name</label>
											<p className="text-base font-semibold text-text-primary">
												{user.firstName} {user.lastName}
											</p>
										</div>
										<div>
											<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Email</label>
											<p className="text-sm text-text-secondary">{user.email}</p>
										</div>
										<div>
											<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Phone</label>
											<p className="text-sm text-text-secondary">{user.phone}</p>
										</div>
										<div>
											<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Joined Waiting List</label>
											<p className="text-sm text-text-secondary">{new Date(user.createdAt).toLocaleString()}</p>
										</div>
									</div>

									{/* Right Column */}
									<div className="space-y-4">
										<div>
											<label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1 block">Requested Tickets</label>
											<div className="space-y-2 mt-2">
												{user.tickets.map((ticket: any, index: number) => (
													<div key={index} className="flex items-center justify-between bg-background-light rounded-lg px-3 py-2">
														<span className="text-sm text-text-secondary">{ticket.name}</span>
														<div className="flex items-center gap-2">
															<span className="text-sm font-semibold text-text-primary">{ticket.quantity}x</span>
															<span className="text-sm text-text-muted">${ticket.price}</span>
														</div>
													</div>
												))}
											</div>
										</div>
									</div>
								</div>

								{/* Action Buttons */}
								<div className="flex flex-col gap-2">
									<button
										onClick={() => handleApprove(user._id)}
										disabled={!!loadingStates[user._id]}
										className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm hover:shadow-md whitespace-nowrap inline-flex items-center justify-center gap-2 min-w-[100px] ${
											loadingStates[user._id] === "approving" ? "bg-green-400 text-white cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
										} disabled:opacity-70 disabled:cursor-not-allowed`}
									>
										{loadingStates[user._id] === "approving" ? (
											<>
												<svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
													<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
													<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
												</svg>
												<span>Approving...</span>
											</>
										) : (
											"Approve"
										)}
									</button>
									<button
										onClick={() => handleRemove(user._id)}
										disabled={!!loadingStates[user._id]}
										className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm hover:shadow-md whitespace-nowrap inline-flex items-center justify-center gap-2 min-w-[100px] ${
											loadingStates[user._id] === "removing" ? "bg-red-400 text-white cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"
										} disabled:opacity-70 disabled:cursor-not-allowed`}
									>
										{loadingStates[user._id] === "removing" ? (
											<>
												<svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
													<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
													<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
												</svg>
												<span>Removing...</span>
											</>
										) : (
											"Remove"
										)}
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
