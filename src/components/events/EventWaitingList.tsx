import React from "react"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import { Icon } from "@chakra-ui/react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import Pagination from "@/components/misc/Pagination"

/**
 * Waiting list for one event, with Approve (creates a confirmed booking + emails the guest)
 * and Remove. Shared by the event detail page and /console/bookings/[eventId] so the two
 * screens can't drift. Both backing APIs are admin OR owner.
 */
export function EventWaitingList({ eventId, eventName }: { eventId: string; eventName: string }) {
	const [page, setPage] = React.useState(1)
	const [openId, setOpenId] = React.useState<string | null>(null)
	const perPage = 10

	const {
		data: waitingList,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["eventWaitingList", eventId],
		queryFn: () => axios.get(`/api/waiting-list/${eventId}`),
	})

	const handleApprove = async (waitingListId: string) => {
		try {
			const response = await axios.post("/api/waiting-list/approve", {
				waitingListId,
				eventName,
			})

			if (response.data.status) {
				alert("User approved and notified successfully!")
				refetch()
			} else {
				alert("Failed to approve user")
			}
		} catch (error) {
			console.error("Error approving user:", error)
			alert("Failed to approve user")
		}
	}

	const handleRemove = async (waitingListId: string) => {
		if (!confirm("Are you sure you want to remove this user from the waiting list?")) {
			return
		}

		try {
			const response = await axios.delete("/api/waiting-list/remove", {
				data: { waitingListId },
			})

			if (response.data.status) {
				alert("User removed from waiting list successfully!")
				refetch()
			} else {
				alert("Failed to remove user")
			}
		} catch (error) {
			console.error("Error removing user:", error)
			alert("Failed to remove user")
		}
	}

	const list: any[] = Array.isArray(waitingList?.data?.data) ? waitingList.data.data : []
	const paged = list.slice((page - 1) * perPage, page * perPage)

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-white">Waiting List</h3>
				{!isLoading && (
					<div className="text-sm text-white">
						<span className="font-semibold text-white">Total: {list.length} users</span>
					</div>
				)}
			</div>

			{isLoading && <p className="text-gray-300">Loading waiting list...</p>}

			{!isLoading && list.length === 0 && <p className="text-gray-300">No users on waiting list.</p>}

			{!isLoading &&
				paged.map((user: any) => {
					const isOpen = openId === user._id
					return (
						<div key={user._id} className="border-b border-[#434343] last:border-b-0">
							<div className="flex justify-between items-center gap-4 py-4">
								<button
									type="button"
									onClick={() => setOpenId(isOpen ? null : user._id)}
									className="flex items-center gap-3 min-w-0 flex-1 text-left"
									aria-expanded={isOpen}
								>
									<div className="min-w-0">
										<p className="text-sm font-semibold text-white truncate">
											{user.firstName} {user.lastName}
										</p>
										<p className="text-xs text-[#bbbbbb] mt-0.5 truncate">{user.email}</p>
									</div>
									<Icon as={isOpen ? FiChevronUp : FiChevronDown} color="white" boxSize={5} className="flex-shrink-0" />
								</button>

								<div className="flex gap-2 flex-shrink-0">
									<button
										onClick={(e) => {
											e.stopPropagation()
											handleApprove(user._id)
										}}
										className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
									>
										Approve
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation()
											handleRemove(user._id)
										}}
										className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
									>
										Remove
									</button>
								</div>
							</div>

							{isOpen && (
								<div className="pb-4">
									<p className="text-sm text-[#bbbbbb]">
										<span className="font-semibold text-white">Phone:</span> {user.phone}
									</p>
									<p className="text-sm text-[#bbbbbb] mt-1">
										<span className="font-semibold text-white">Joined:</span> {new Date(user.createdAt).toLocaleString()}
									</p>

									<div className="mt-3">
										<p className="font-semibold text-white text-sm">Requested Tickets:</p>
										{user.tickets.length > 0 ? (
											<ul className="list-disc pl-5 mt-1 text-[#bbbbbb] text-sm">
												{user.tickets.map((ticket: any, index: number) => (
													<li key={index}>
														{ticket.quantity} x {ticket.name} (${ticket.price} each)
													</li>
												))}
											</ul>
										) : (
											<p className="mt-1 text-[#bbbbbb] text-sm">No-ticket event (registration only)</p>
										)}
									</div>
								</div>
							)}
						</div>
					)
				})}

			<Pagination totalItems={list.length} perPageItems={perPage} pageNo={page} onPageChange={setPage} />
		</div>
	)
}
