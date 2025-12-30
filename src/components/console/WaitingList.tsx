import React from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Spinner, Text, Badge, Avatar, IconButton, Menu, MenuButton, MenuList, MenuItem, useToast, Button } from "@chakra-ui/react"
import { FiMail, FiCheckCircle, FiX, FiMoreHorizontal } from "react-icons/fi"
import { DateTime } from "luxon"
import axios from "axios"

interface WaitingListProps {
	eventId: string
}

export function WaitingList({ eventId }: WaitingListProps) {
	const toast = useToast()

	const { data: waitingList = [], isLoading, refetch } = useQuery({
		queryKey: ["waiting-list", eventId],
		queryFn: async () => {
			console.log("[WaitingList] Fetching waiting list for eventId:", eventId)
			const res = await axios.get(`/api/waiting-list/${eventId}`)
			console.log("[WaitingList] API response:", {
				status: res.data?.status,
				dataLength: res.data?.data?.length || 0,
				data: res.data?.data || []
			})
			return res.data?.data || []
		},
		refetchInterval: 30000, // Refetch every 30 seconds
		refetchOnWindowFocus: true,
	})

	const approveMutation = useMutation({
		mutationFn: async (waitingListId: string) => {
			const res = await axios.post("/api/waiting-list/approve", { waitingListId })
			return res.data
		},
		onSuccess: (data: any) => {
			if (data?.data?.requiresPayment && data?.data?.paymentUrl) {
				// For paid events, show payment URL
				const paymentUrl = data.data.paymentUrl
				toast({ 
					title: "User approved - Payment required", 
					description: `Payment link sent via email. Payment URL: ${paymentUrl}`,
					status: "success", 
					duration: 10000,
					isClosable: true,
				})
				// Also log to console for easy access and copying
				console.log("Payment URL for approved user:", paymentUrl)
			} else {
				// For free events
				toast({ 
					title: "User approved", 
					description: "Confirmation email has been sent.",
					status: "success", 
					duration: 5000,
					isClosable: true
				})
			}
			// Refetch to remove approved user from waiting list
			setTimeout(() => {
				refetch()
			}, 500) // Small delay to ensure database update is complete
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || error?.message || "Failed to approve user"
			toast({ 
				title: "Failed to approve user", 
				description: errorMessage,
				status: "error",
				duration: 5000,
				isClosable: true
			})
		},
	})

	const removeMutation = useMutation({
		mutationFn: async (waitingListId: string) => {
			const res = await axios.delete("/api/waiting-list/remove", { data: { waitingListId } })
			return res.data
		},
		onSuccess: () => {
			toast({ title: "User removed", status: "success", duration: 3000 })
			refetch()
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || error?.message || "Failed to remove user"
			toast({ 
				title: "Failed to remove user", 
				description: errorMessage,
				status: "error",
				duration: 5000,
				isClosable: true
			})
		},
	})

	if (isLoading) {
		return (
			<div className="flex justify-center items-center py-12">
				<Spinner size="lg" color="primary.purple" />
			</div>
		)
	}

	if (waitingList.length === 0) {
		return (
			<div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
				<div className="text-6xl mb-4">⏳</div>
				<h3 className="text-lg font-bold text-gray-900 mb-2">Waiting List Empty</h3>
				<p className="text-gray-500 text-sm mb-4">No users are currently on the waiting list.</p>
				<Button 
					size="sm" 
					colorScheme="blue" 
					onClick={() => {
						console.log("[WaitingList] Manual refetch triggered for eventId:", eventId)
						refetch()
					}}
				>
					Refresh
				</Button>
				<p className="text-gray-400 text-xs mt-2">Event ID: {eventId}</p>
			</div>
		)
	}

	return (
		<div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
			{/* Desktop Table Header */}
			<div className="hidden md:grid grid-cols-4 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 font-semibold text-sm text-gray-500">
				<div className="col-span-2">User</div>
				<div>Joined At</div>
				<div className="text-right">Actions</div>
			</div>

			{/* Rows */}
			<div className="divide-y divide-gray-200">
				{waitingList.map((entry: any) => (
					<div key={entry._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
						<div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 items-center">
							{/* User */}
							<div className="col-span-2 flex items-center gap-3">
								<Avatar name={entry.firstName && entry.lastName ? `${entry.firstName} ${entry.lastName}` : entry.email} size="sm" />
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium text-gray-900 truncate">
										{entry.firstName && entry.lastName 
											? `${entry.firstName} ${entry.lastName}` 
											: entry.firstName || entry.email || "Unknown Name"}
									</p>
									<p className="text-sm text-gray-500 truncate">{entry.email}</p>
                                    <p className="text-xs text-gray-400">{entry.phone}</p>
								</div>
							</div>

							{/* Joined At */}
							<div className="flex items-center">
								<div>
									<p className="text-sm md:hidden text-gray-500 font-medium mb-1">Joined At</p>
									<p className="text-sm text-gray-600">{entry.createdAt ? DateTime.fromISO(entry.createdAt).toLocaleString(DateTime.DATETIME_MED) : "-"}</p>
								</div>
							</div>

							{/* Actions */}
							<div className="flex items-center justify-end gap-2">
								<Button 
                                    size="xs" 
                                    colorScheme="green" 
                                    onClick={() => approveMutation.mutate(entry._id)}
                                    isLoading={approveMutation.isPending}
                                >
                                    Approve
                                </Button>
                                <Menu>
									<MenuButton as={IconButton} size="xs" icon={<FiMoreHorizontal />} variant="ghost" />
									<MenuList>
										<MenuItem icon={<FiX />} color="red.500" onClick={() => removeMutation.mutate(entry._id)}>
											Remove
										</MenuItem>
									</MenuList>
								</Menu>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
