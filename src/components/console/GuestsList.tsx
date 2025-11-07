import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Spinner, Text, Badge, Avatar, Divider } from "@chakra-ui/react"
import { FiMail, FiCheckCircle, FiPhone } from "react-icons/fi"
import { DateTime } from "luxon"
import axios from "axios"

interface GuestsListProps {
	eventId: string
}

export function GuestsList({ eventId }: GuestsListProps) {
	const [activeTab, setActiveTab] = React.useState<"invited" | "checkedIn">("invited")

	// Fetch invited guests from the event guests list
	const fetchInvitedGuests = async () => {
		const res = await axios.get("/api/guests-list", { params: { eventId } })
		return res.data || []
	}

	// Fetch checked-in guests from the database (EventGuest model)
	const fetchCheckedInGuests = async () => {
		try {
			const res = await axios.get(`/api/check-in/guests?eventId=${eventId}`)
			if (res.data?.status && res.data?.data?.guests) {
				return res.data.data.guests
			}
			return []
		} catch (error) {
			console.error("Error fetching checked-in guests:", error)
			return []
		}
	}

	// Fetch check-in stats
	const fetchCheckInStats = async () => {
		try {
			const res = await axios.get(`/api/check-in/stats?eventId=${eventId}`)
			if (res.data?.status && res.data?.data) {
				return res.data.data
			}
			return { totalGuestsCheckedIn: 0 }
		} catch (error) {
			console.error("Error fetching check-in stats:", error)
			return { totalGuestsCheckedIn: 0 }
		}
	}

	const {
		data: invitedGuests = [],
		isLoading: isLoadingInvited,
		isError: isErrorInvited,
	} = useQuery({
		queryKey: ["guests-list", eventId],
		queryFn: fetchInvitedGuests,
	})

	const {
		data: checkedInGuests = [],
		isLoading: isLoadingCheckedIn,
		isError: isErrorCheckedIn,
	} = useQuery({
		queryKey: ["checked-in-guests", eventId],
		queryFn: fetchCheckedInGuests,
		refetchInterval: 5000,
	})

	const { data: checkInStats, isError: isStatsError } = useQuery({
		queryKey: ["check-in-stats", eventId],
		queryFn: fetchCheckInStats,
		refetchInterval: 5000,
		retry: 1,
		enabled: !!eventId,
	})

	const totalCheckedIn = isStatsError ? checkedInGuests.length : checkInStats?.totalGuestsCheckedIn || checkedInGuests.length
	const guestsWithDetails = checkedInGuests.length
	const anonymousCheckIns = Math.max(0, totalCheckedIn - guestsWithDetails)

	return (
		<div className="space-y-6">
			{/* Tab Selector */}
			<div className="inline-flex bg-white rounded-xl shadow-sm border border-border-light p-1 w-full sm:w-auto">
				<button
					onClick={() => setActiveTab("invited")}
					className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
						activeTab === "invited" ? "bg-primary-purple text-white shadow-md" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
					}`}
				>
					<FiMail className="w-4 h-4" />
					<span>Invited ({invitedGuests.length})</span>
				</button>
				<button
					onClick={() => setActiveTab("checkedIn")}
					className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
						activeTab === "checkedIn" ? "bg-primary-purple text-white shadow-md" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
					}`}
				>
					<FiCheckCircle className="w-4 h-4" />
					<span>Checked-In ({totalCheckedIn})</span>
				</button>
			</div>

			{/* Invited Guests Tab */}
			{activeTab === "invited" && (
				<div>
					{isLoadingInvited ? (
						<div className="flex justify-center items-center py-12">
							<Spinner size="lg" color="primary.purple" />
						</div>
					) : isErrorInvited ? (
						<div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
							<Text color="red.600" fontWeight="medium">
								Failed to load invited guests.
							</Text>
						</div>
					) : invitedGuests.length === 0 ? (
						<div className="bg-white rounded-xl border border-border-light p-12 text-center">
							<div className="text-6xl mb-4">📧</div>
							<h3 className="text-lg font-bold text-text-primary mb-2">No Invited Guests Yet</h3>
							<p className="text-text-muted text-sm">Start by inviting guests to your event</p>
						</div>
					) : (
						<div className="bg-white rounded-xl border border-border-light overflow-hidden shadow-sm">
							{/* Desktop Table Header */}
							<div className="hidden md:grid grid-cols-3 gap-4 px-6 py-4 bg-background-light border-b border-border-light font-semibold text-sm text-text-secondary">
								<div>Email Address</div>
								<div>Status</div>
								<div>Invited At</div>
							</div>

							{/* Guest Rows */}
							<div className="divide-y divide-border-light">
								{invitedGuests.map((guest: { email: string; status: string; invitedAt: string }) => (
									<div key={guest.email} className="px-6 py-4 hover:bg-background-light transition-colors">
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
											{/* Email */}
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 bg-primary-purple/10 rounded-lg flex items-center justify-center flex-shrink-0">
													<FiMail className="w-5 h-5 text-primary-purple" />
												</div>
												<div className="min-w-0 flex-1">
													<p className="text-sm md:hidden text-text-muted font-medium mb-1">Email</p>
													<p className="text-sm font-medium text-text-primary truncate">{guest.email}</p>
												</div>
											</div>

											{/* Status */}
											<div className="flex items-center">
												<div className="w-full md:w-auto">
													<p className="text-sm md:hidden text-text-muted font-medium mb-1">Status</p>
													<Badge
														colorScheme={guest.status === "accepted" ? "green" : guest.status === "rejected" ? "red" : "yellow"}
														fontSize="xs"
														px={3}
														py={1}
														borderRadius="full"
														fontWeight="semibold"
													>
														{guest.status}
													</Badge>
												</div>
											</div>

											{/* Invited At */}
											<div className="flex items-center">
												<div>
													<p className="text-sm md:hidden text-text-muted font-medium mb-1">Invited At</p>
													<p className="text-sm text-text-secondary">{guest.invitedAt ? DateTime.fromISO(guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : "-"}</p>
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Checked-In Guests Tab */}
			{activeTab === "checkedIn" && (
				<div>
					{isLoadingCheckedIn && !isStatsError ? (
						<div className="flex justify-center items-center py-12">
							<Spinner size="lg" color="primary.purple" />
						</div>
					) : isErrorCheckedIn ? (
						<div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
							<Text color="red.600" fontWeight="medium">
								Failed to load checked-in guests.
							</Text>
						</div>
					) : totalCheckedIn === 0 ? (
						<div className="bg-white rounded-xl border border-border-light p-12 text-center">
							<div className="text-6xl mb-4">🎟️</div>
							<h3 className="text-lg font-bold text-text-primary mb-2">No Check-Ins Yet</h3>
							<p className="text-text-muted text-sm">Guests will appear here once they check in to the event</p>
						</div>
					) : (
						<div className="space-y-6">
							{/* Summary Banner */}
							{anonymousCheckIns > 0 && (
								<div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-primary-purple/30 rounded-xl p-6">
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
										<div className="text-center sm:text-left">
											<p className="text-sm text-text-muted mb-1">Total Check-Ins</p>
											<p className="text-3xl font-bold text-text-primary">{totalCheckedIn}</p>
										</div>
										<div className="text-center sm:text-left">
											<p className="text-sm text-text-muted mb-1">With Details</p>
											<p className="text-3xl font-bold text-primary-purple">{guestsWithDetails}</p>
										</div>
										<div className="text-center sm:text-left">
											<p className="text-sm text-text-muted mb-1">Without Details</p>
											<p className="text-3xl font-bold text-orange-500">{anonymousCheckIns}</p>
										</div>
									</div>
								</div>
							)}

							{/* Guests Grid */}
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{/* Guests with details */}
								{checkedInGuests.map((guest: any) => (
									<div key={guest.id} className="bg-white border-2 border-border-light rounded-xl p-5 hover:border-primary-purple hover:shadow-lg transition-all duration-300 group">
										<div className="space-y-4">
											{/* Header */}
											<div className="flex items-start justify-between">
												<div className="flex items-center gap-3 flex-1 min-w-0">
													<Avatar name={guest.guestName} bg="primary.purple" color="white" size="md" fontWeight="bold" className="flex-shrink-0" />
													<div className="min-w-0 flex-1">
														<h3 className="font-bold text-text-primary truncate">{guest.guestName}</h3>
														<div className="flex items-center gap-1 mt-1">
															<FiCheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
															<span className="text-xs text-green-600 font-semibold">Checked In</span>
														</div>
													</div>
												</div>
											</div>

											<Divider />

											{/* Contact Info */}
											<div className="space-y-2 text-sm">
												<div className="flex items-center gap-2 text-text-secondary">
													<FiMail className="w-4 h-4 flex-shrink-0" />
													<span className="truncate">{guest.guestEmail}</span>
												</div>
												<div className="flex items-center gap-2 text-text-secondary">
													<FiPhone className="w-4 h-4 flex-shrink-0" />
													<span>{guest.guestPhone}</span>
												</div>
											</div>

											<Divider />

											{/* Check-in Details */}
											<div className="space-y-1 text-xs text-text-muted">
												<div className="flex justify-between">
													<span>Check-In Time:</span>
													<span className="text-text-primary font-semibold">{DateTime.fromISO(guest.checkedInAt).toLocaleString(DateTime.DATETIME_SHORT)}</span>
												</div>
												<div className="flex justify-between">
													<span>Booking Email:</span>
													<span className="text-text-primary truncate max-w-[60%]">{guest.bookingEmail}</span>
												</div>
												<div className="flex justify-between items-center">
													<span>Checked In By:</span>
													<Badge colorScheme="purple" fontSize="2xs">
														{guest.checkedInBy}
													</Badge>
												</div>
											</div>
										</div>
									</div>
								))}

								{/* Anonymous check-ins */}
								{Array.from({ length: anonymousCheckIns }).map((_, index) => (
									<div key={`anonymous-${index}`} className="bg-background-light border-2 border-dashed border-border-gray rounded-xl p-5 opacity-75">
										<div className="space-y-4">
											<div className="flex items-center gap-3">
												<Avatar name="?" bg="gray.400" color="white" size="md" fontWeight="bold" />
												<div>
													<h3 className="font-bold text-text-primary">Guest #{guestsWithDetails + index + 1}</h3>
													<div className="flex items-center gap-1 mt-1">
														<FiCheckCircle className="w-3 h-3 text-green-500" />
														<span className="text-xs text-green-600 font-semibold">Checked In</span>
													</div>
												</div>
											</div>

											<Divider />

											<div className="bg-white border border-border-light rounded-lg p-4 text-center">
												<div className="text-4xl mb-2">👤</div>
												<p className="text-sm text-text-muted font-medium mb-1">Details not captured</p>
												<p className="text-xs text-text-muted">Anonymous check-in</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
