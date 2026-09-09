import React, { useEffect, useMemo, useState } from "react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { Box, Container, Flex, Heading, Text, Textarea, Input, useToast } from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import axios from "axios"
import Navbar from "@/components/misc/Navbar"
import { authorizedOnly } from "@/lib/authSession"
import { SUPPORT_CATEGORIES, SupportCategoryKey } from "@/lib/support"

/**
 * Any logged-in user can reach this to email us. The Event category's picker only ever lists
 * PUBLIC events (`privacy=public`, enforced again server-side in api/support/submit.ts) — a
 * private event never appears here, even for an admin. Someone asking about a private event
 * just describes it in the message instead.
 */

type EventOption = { _id: string; name: string; slug?: string }

const SEARCH_DEBOUNCE_MS = 300

export default function SupportPage() {
	const { data: session } = useSession()
	const toast = useToast({ position: "top" })

	const [name, setName] = useState("")
	const [category, setCategory] = useState<SupportCategoryKey>("general")
	const [message, setMessage] = useState("")
	const [eventQuery, setEventQuery] = useState("")
	const [eventOptions, setEventOptions] = useState<EventOption[]>([])
	const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null)
	const [searchingEvents, setSearchingEvents] = useState(false)
	const [submitted, setSubmitted] = useState(false)

	const email = (session?.user as any)?.email || ""

	useEffect(() => {
		const sessionName = (session?.user as any)?.name || (session?.user as any)?.fullName
		if (sessionName) setName((prev) => prev || sessionName)
	}, [session])

	useEffect(() => {
		if (category !== "event" || !eventQuery.trim()) {
			setEventOptions([])
			return
		}
		let cancelled = false
		setSearchingEvents(true)
		const timer = setTimeout(async () => {
			try {
				const res = await axios.get("/api/events", { params: { search: eventQuery.trim(), privacy: "public", limit: 20 } })
				if (!cancelled) setEventOptions(res.data?.data || [])
			} catch {
				if (!cancelled) setEventOptions([])
			} finally {
				if (!cancelled) setSearchingEvents(false)
			}
		}, SEARCH_DEBOUNCE_MS)
		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [eventQuery, category])

	const submitMutation = useMutation({
		mutationFn: async () => {
			const res = await axios.post("/api/support/submit", {
				name: name.trim(),
				category,
				eventId: category === "event" ? selectedEvent?._id : undefined,
				message: message.trim(),
			})
			return res.data
		},
		onSuccess: (res) => {
			if (res?.status === false) {
				toast({ title: res?.message || "Could not submit your request", status: "error" })
				return
			}
			setSubmitted(true)
		},
		onError: (err: any) => {
			toast({ title: err?.response?.data?.message || "Could not submit your request", status: "error" })
		},
	})

	const canSubmit = useMemo(
		() => name.trim().length > 0 && message.trim().length > 0 && !submitMutation.isPending,
		[name, message, submitMutation.isPending],
	)

	const resetForCategoryChange = (next: SupportCategoryKey) => {
		setCategory(next)
		if (next !== "event") {
			setSelectedEvent(null)
			setEventQuery("")
			setEventOptions([])
		}
	}

	return (
		<>
			<Head><title>Support | Jetzy Events</title></Head>
			<Box className="min-h-screen w-full" bg="#0B0B0B" color="white">
				<Navbar />
				<Container maxW="container.sm" py={10}>
					<Heading size="lg" mb={2}>Support</Heading>
					<Text color="#9C9C9C" mb={8}>
						Have a question about an event, Jetzy Premium, or anything else? Send us a message and we&apos;ll reply by email.
					</Text>

					{submitted ? (
						<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={8} textAlign="center">
							<Text fontSize="lg" fontWeight="semibold" mb={2}>Request sent</Text>
							<Text color="#9C9C9C">
								We received your request and will reply to <strong>{email}</strong> soon.
							</Text>
						</Box>
					) : (
						<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={{ base: 5, md: 8 }}>
							<Box mb={5}>
								<Text mb={2} fontSize="sm" color="#9C9C9C">Your name</Text>
								<Input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Your name"
									bg="#0B0B0B"
									borderColor="#444"
									maxLength={100}
								/>
							</Box>

							<Box mb={5}>
								<Text mb={2} fontSize="sm" color="#9C9C9C">Your email</Text>
								<Input value={email} isReadOnly bg="#141414" borderColor="#444" color="#9C9C9C" cursor="not-allowed" />
							</Box>

							<Box mb={5}>
								<Text mb={2} fontSize="sm" color="#9C9C9C">What&apos;s this about?</Text>
								<Flex gap={2} wrap="wrap">
									{SUPPORT_CATEGORIES.map(({ key, label }) => {
										const active = key === category
										return (
											<button
												key={key}
												type="button"
												onClick={() => resetForCategoryChange(key)}
												className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${active
													? "bg-white text-black"
													: "bg-[#0B0B0B] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
													}`}
											>
												{label}
											</button>
										)
									})}
								</Flex>
							</Box>

							{category === "event" && (
								<Box mb={5}>
									<Text mb={2} fontSize="sm" color="#9C9C9C">Which event?</Text>
									{selectedEvent ? (
										<Flex align="center" justify="space-between" bg="#0B0B0B" border="1px solid #444" rounded="md" px={4} py={2}>
											<Text noOfLines={1}>{selectedEvent.name}</Text>
											<button
												type="button"
												className="text-[#9C9C9C] hover:text-white text-sm ml-3 shrink-0"
												onClick={() => setSelectedEvent(null)}
											>
												Change
											</button>
										</Flex>
									) : (
										<>
											<Input
												value={eventQuery}
												onChange={(e) => setEventQuery(e.target.value)}
												placeholder="Search events by name"
												bg="#0B0B0B"
												borderColor="#444"
											/>
											{eventQuery.trim() && (
												<Box mt={2} bg="#0B0B0B" border="1px solid #444" rounded="md" maxH="220px" overflowY="auto">
													{searchingEvents ? (
														<Text px={4} py={3} color="#9C9C9C" fontSize="sm">Searching…</Text>
													) : eventOptions.length === 0 ? (
														<Text px={4} py={3} color="#9C9C9C" fontSize="sm">No public events found.</Text>
													) : (
														eventOptions.map((ev) => (
															<Box
																key={ev._id}
																px={4}
																py={2}
																cursor="pointer"
																_hover={{ bg: "#1E1E1E" }}
																onClick={() => {
																	setSelectedEvent(ev)
																	setEventQuery("")
																	setEventOptions([])
																}}
															>
																<Text noOfLines={1}>{ev.name}</Text>
															</Box>
														))
													)}
												</Box>
											)}
										</>
									)}
									<Text mt={2} fontSize="xs" color="#777">
										Don&apos;t see your event? It may be private — just describe it in your message below.
									</Text>
								</Box>
							)}

							<Box mb={6}>
								<Text mb={2} fontSize="sm" color="#9C9C9C">Message</Text>
								<Textarea
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									placeholder="Tell us what's going on"
									bg="#0B0B0B"
									borderColor="#444"
									rows={6}
									maxLength={3000}
								/>
							</Box>

							<button
								type="button"
								disabled={!canSubmit}
								onClick={() => submitMutation.mutate()}
								className={`w-full py-3 rounded-md font-bold transition-colors ${canSubmit ? "bg-[#F79432] text-black hover:opacity-90" : "bg-[#333] text-[#777] cursor-not-allowed"
									}`}
							>
								{submitMutation.isPending ? "Sending…" : "Send request"}
							</button>
						</Box>
					)}
				</Container>
			</Box>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	const authResult = await authorizedOnly(context)
	if ("redirect" in authResult) return authResult
	return { props: {} }
}
