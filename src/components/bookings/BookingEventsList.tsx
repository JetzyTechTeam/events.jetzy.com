import React from "react"
import { IEvent } from "@/models/events/types"
import BookingEventCard from "./BookingEventCard"
import { useRouter } from "next/router"

type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type Props = {
	events: IEvent[]
	pagination: Pagination
}

const BookingEventsList: React.FC<Props> = ({ events, pagination }) => {
	const router = useRouter()

	const handlePrevPage = () => {
		if (pagination.page > 1) {
			router.push(`/console/bookings?page=${pagination.page - 1}`)
		}
	}

	const handleNextPage = () => {
		if (pagination.page < pagination.totalPages) {
			router.push(`/console/bookings?page=${pagination.page + 1}`)
		}
	}

	const goToPage = (page: number) => {
		router.push(`/console/bookings?page=${page}`)
	}

	// Generate page numbers to show
	const getPageNumbers = () => {
		const pages: (number | string)[] = []
		const { page, totalPages } = pagination

		if (totalPages <= 7) {
			// Show all pages if 7 or fewer
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i)
			}
		} else {
			// Always show first page
			pages.push(1)

			if (page > 3) {
				pages.push("...")
			}

			// Show pages around current page
			for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
				pages.push(i)
			}

			if (page < totalPages - 2) {
				pages.push("...")
			}

			// Always show last page
			pages.push(totalPages)
		}

		return pages
	}

	return (
		<div className="space-y-6">
			{/* Events List */}
			<div className="space-y-4">
				{events.map((event) => (
					<BookingEventCard key={event._id.toString()} event={event} />
				))}
			</div>

			{/* Pagination */}
			{pagination.totalPages > 1 && (
				<div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border-light">
					{/* Pagination Info */}
					<div className="text-sm text-text-secondary">
						Showing <span className="font-medium text-text-primary">{pagination.showing}</span> of <span className="font-medium text-text-primary">{pagination.total}</span> events
					</div>

					{/* Pagination Controls */}
					<div className="flex items-center gap-2">
						{/* Previous Button */}
						<button
							onClick={handlePrevPage}
							disabled={pagination.page === 1}
							className="px-3 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg hover:bg-background-gray disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Previous
						</button>

						{/* Page Numbers */}
						<div className="hidden sm:flex items-center gap-1">
							{getPageNumbers().map((pageNum, index) => {
								if (pageNum === "...") {
									return (
										<span key={`ellipsis-${index}`} className="px-3 py-2 text-text-muted">
											...
										</span>
									)
								}

								const isActive = pageNum === pagination.page

								return (
									<button
										key={pageNum}
										onClick={() => goToPage(pageNum as number)}
										className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
											isActive ? "bg-primary-purple text-white" : "text-text-primary bg-white border border-border-light hover:bg-background-gray"
										}`}
									>
										{pageNum}
									</button>
								)
							})}
						</div>

						{/* Mobile: Current Page Display */}
						<div className="sm:hidden px-3 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg">
							{pagination.page} / {pagination.totalPages}
						</div>

						{/* Next Button */}
						<button
							onClick={handleNextPage}
							disabled={pagination.page === pagination.totalPages}
							className="px-3 py-2 text-sm font-medium text-text-primary bg-white border border-border-light rounded-lg hover:bg-background-gray disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

export default BookingEventsList
