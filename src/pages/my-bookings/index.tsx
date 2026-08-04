import React, { useMemo, useState } from "react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { Box, Container, Flex, Heading, SimpleGrid, Spinner, Text, useToast } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import Navbar from "@/components/misc/Navbar"
import Pagination from "@/components/misc/Pagination"
import BookingCard, { BookingRow } from "@/components/bookings/BookingCard"
import BookingDetailModal from "@/components/bookings/BookingDetailModal"
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog"
import { authorizedOnly } from "@/lib/authSession"
import { MoneyState } from "@/lib/booking-cancellation"

/**
 * A guest's own bookings. Distinct from /console/bookings, which is the host-side list of
 * who booked events *you* run.
 *
 * Filter + page live in the URL so a refresh or a shared link lands on the same view, the
 * same convention the My Events console page uses.
 */

type FilterKey = "all" | "upcoming" | "past" | "pending" | "confirmed" | "cancelled"

const FILTERS: { key: FilterKey; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "upcoming", label: "Upcoming" },
	{ key: "past", label: "Past" },
	{ key: "pending", label: "Pending" },
	{ key: "confirmed", label: "Confirmed" },
	{ key: "cancelled", label: "Cancelled" },
]

const PER_PAGE = 12

export default function MyBookingsPage() {
	const router = useRouter()
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()

	const filter = (FILTERS.find((f) => f.key === router.query.filter)?.key || "all") as FilterKey
	const page = Math.max(1, parseInt((router.query.page as string) || "1", 10) || 1)

	const [selected, setSelected] = useState<BookingRow | null>(null)
	const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null)

	const { data, isLoading, isError } = useQuery({
		queryKey: ["myBookings", filter, page],
		queryFn: async () => {
			const res = await axios.get(`/api/bookings/mine?filter=${filter}&page=${page}&limit=${PER_PAGE}`)
			return res.data?.data
		},
	})

	const items: BookingRow[] = useMemo(() => data?.items || [], [data])
	const pagination = data?.pagination || { total: 0, page: 1, limit: PER_PAGE, totalPages: 0 }
	const counts = data?.counts || {}

	const cancelMutation = useMutation({
		mutationFn: async (bookingRef: string) => {
			const res = await axios.post("/api/bookings/cancel", { bookingRef })
			return res.data
		},
		onSuccess: (res) => {
			if (res?.status === false) {
				toast({ title: res?.message || "Could not cancel booking", status: "error" })
				return
			}
			toast({ title: "Booking cancelled", status: "success" })
			setCancelTarget(null)
			setSelected(null)
			queryClient.invalidateQueries({ queryKey: ["myBookings"] })
		},
		onError: (err: any) => {
			toast({ title: err?.response?.data?.message || "Could not cancel booking", status: "error" })
		},
	})

	const setQuery = (next: Partial<{ filter: FilterKey; page: number }>) => {
		const query: any = { filter, page, ...next }
		// Changing the filter always returns to page 1 — page 4 of "All" rarely exists in "Pending".
		if (next.filter && next.filter !== filter) query.page = 1
		if (query.filter === "all") delete query.filter
		if (query.page === 1) delete query.page
		router.push({ pathname: "/my-bookings", query }, undefined, { shallow: false })
	}

	return (
		<>
			<Head><title>My Bookings | Jetzy Events</title></Head>
			<Box className="min-h-screen w-full" bg="#0B0B0B" color="white">
				<Navbar />
				<Container maxW="container.lg" py={10}>
					<Heading size="lg" mb={2}>My Bookings</Heading>
					<Text color="#9C9C9C" mb={6}>Tickets you&apos;ve booked across Jetzy events.</Text>

					<Flex gap={2} mb={8} wrap="wrap">
						{FILTERS.map(({ key, label }) => {
							const active = key === filter
							const count = counts[key]
							return (
								<button
									key={key}
									onClick={() => setQuery({ filter: key })}
									className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${active
										? "bg-white text-black"
										: "bg-[#1E1E1E] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
										}`}
								>
									{label}{typeof count === "number" ? ` (${count})` : ""}
								</button>
							)
						})}
					</Flex>

					{isLoading ? (
						<Flex justify="center" py={20}><Spinner color="#F79432" size="lg" /></Flex>
					) : isError ? (
						<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={8} textAlign="center">
							<Text color="#FCA5A5">We couldn&apos;t load your bookings. Please refresh and try again.</Text>
						</Box>
					) : items.length === 0 ? (
						<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={10} textAlign="center">
							<Text fontSize="lg" fontWeight="semibold" mb={2}>
								{filter === "all" ? "You haven't booked anything yet" : "Nothing here"}
							</Text>
							<Text color="#9C9C9C" mb={5}>
								{filter === "all"
									? "When you book an event, your ticket will show up here."
									: "Try a different filter."}
							</Text>
							<NextLink href="/">
								<Box as="span" bg="#F79432" color="black" px={5} py={2} rounded="md" fontWeight="bold" display="inline-block">
									Discover events
								</Box>
							</NextLink>
						</Box>
					) : (
						<>
							<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="8">
								{items.map((b) => (
									<BookingCard key={b.bookingRef} booking={b} onClick={setSelected} />
								))}
							</SimpleGrid>
							<Pagination
								totalItems={pagination.total}
								perPageItems={pagination.limit}
								pageNo={pagination.page}
								onPageChange={(p) => setQuery({ page: p })}
							/>
						</>
					)}
				</Container>
			</Box>

			<BookingDetailModal
				booking={selected}
				isOpen={!!selected}
				onClose={() => setSelected(null)}
				onCancel={(b) => setCancelTarget(b)}
				isCancelling={cancelMutation.isPending}
			/>

			<CancelBookingDialog
				isOpen={!!cancelTarget}
				onClose={() => setCancelTarget(null)}
				onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.bookingRef)}
				isLoading={cancelMutation.isPending}
				eventName={cancelTarget?.event?.name}
				moneyState={(cancelTarget?.moneyState || "free") as MoneyState}
				amount={Number(cancelTarget?.moneyAmount || 0)}
			/>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	const authResult = await authorizedOnly(context)
	if ("redirect" in authResult) return authResult
	return { props: {} }
}
