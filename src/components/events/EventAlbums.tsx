import React, { useEffect, useRef, useState } from "react"
import { eventAlbumPath, eventAlbumUrl } from "@/lib/event-slug"
import {
	Box,
	Button,
	Flex,
	Heading,
	Text,
	Icon,
	IconButton,
	Image,
	Input,
	InputGroup,
	InputRightElement,
	Spinner,
	SimpleGrid,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	ModalCloseButton,
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Badge,
	useDisclosure,
	useToast,
} from "@chakra-ui/react"
import { FiPlus, FiShare2, FiEdit2, FiTrash2, FiImage, FiVideo, FiPlayCircle, FiSend, FiUsers, FiUserPlus, FiStar } from "react-icons/fi"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import Slider from "react-slick"
import { uploadFile } from "@/services/upload.service"
import QRCodeModal from "@/components/events/QRCodeModal"

export type MediaType = "image" | "video"
export interface AlbumMedia {
	url: string
	type: MediaType
}
export interface Album {
	_id: string
	eventId: string
	title: string
	description?: string
	media: AlbumMedia[]
	createdAt?: string
	publishedAt?: string
	publishNotifiedAt?: string
	notifiedCount?: number
}

interface AlbumTag {
	_id: string
	albumId: string
	mediaUrl: string
	personEmail: string
	personName?: string
	taggedByName?: string
}

// A staged media item inside the create/edit modal (may still be uploading).
interface StagedMedia {
	tempId: string
	type: MediaType
	url?: string
	progress: number
	uploading: boolean
	controller?: AbortController
	error?: boolean
}

interface Props {
	eventId: string
	eventSlug: string
	eventName: string
	canManage: boolean
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// Jetzy directory search in the tag panel is hidden until the search API stops requiring a
// personal access token (album users don't have one). Set to true to re-enable.
const SHOW_JETZY_SEARCH = false

// Curated interests shown in the album access dialog — captured for event planning. Emoji is
// display only; the label is what gets stored. A viewer must pick at least one (no upper
// limit); their own custom entries count too.
const ALBUM_INTERESTS: { label: string; emoji: string }[] = [
	{ label: "Wine Tastings", emoji: "🍷" },
	{ label: "Hiking", emoji: "🥾" },
	{ label: "Golf", emoji: "⛳" },
	{ label: "Networking", emoji: "🤝" },
	{ label: "Tennis", emoji: "🎾" },
	{ label: "Beach", emoji: "🏖️" },
	{ label: "Travel", emoji: "✈️" },
	{ label: "Founders", emoji: "🚀" },
	{ label: "Art", emoji: "🎨" },
	{ label: "Wellness", emoji: "🧘" },
	{ label: "Live Music", emoji: "🎵" },
	{ label: "Museum", emoji: "🏛️" },
]
const MIN_INTERESTS = 1

export default function EventAlbums({ eventId, eventSlug, eventName, canManage }: Props) {
	const { data: session, status } = useSession()
	const router = useRouter()
	const toast = useToast()
	const queryClient = useQueryClient()

	const createModal = useDisclosure()
	const shareModal = useDisclosure()
	const deleteDialog = useDisclosure()
	const cancelDeleteRef = useRef<HTMLButtonElement>(null)

	const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
	const [shareAlbum, setShareAlbum] = useState<Album | null>(null)
	const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)
	const [publishingAlbum, setPublishingAlbum] = useState<Album | null>(null)

	// Fetch albums — public, so this runs for anonymous visitors too
	const {
		data: albums = [],
		isLoading,
	} = useQuery<Album[]>({
		queryKey: ["albums", eventId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/albums`)
			return res.data?.data || []
		},
		retry: false,
	})

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["albums", eventId] })

	// ── Back-compat for old share/email links: /{slug}?album=<id> ──
	// Albums now live at /{slug}/album/{id}. Links already sent out (publish emails, tag
	// notifications, copied share links) still use the query form, so redirect them.
	// tagPhoto carries through as the new `photo` param. `from=event` tells the album page
	// this view was already counted here, so it doesn't record a second one.
	const redirectedRef = useRef(false)
	useEffect(() => {
		const albumParam = router.query.album
		if (!albumParam || typeof albumParam !== "string" || redirectedRef.current) return
		redirectedRef.current = true
		const tagPhoto = typeof router.query.tagPhoto === "string" ? router.query.tagPhoto : ""
		const params = new URLSearchParams({ from: "event" })
		if (tagPhoto) params.set("photo", tagPhoto)
		router.replace(`${eventAlbumPath(eventSlug, albumParam)}?${params.toString()}`)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.album])


	const openCreate = () => {
		setEditingAlbum(null)
		createModal.onOpen()
	}
	const openEdit = (album: Album) => {
		setEditingAlbum(album)
		createModal.onOpen()
	}
	// Covers are public; the photos are not. Albums now open as a full "photo tour" page,
	// where the name+email / interests gate runs — so this is a straight navigation.
	const openGallery = (album: Album) => {
		// from=event: this page already recorded the event view, so the album page skips it.
		router.push(`${eventAlbumPath(eventSlug, album._id)}?from=event`)
	}
	const openShare = (album: Album) => {
		setShareAlbum(album)
		const url = eventAlbumUrl(window.location.origin, eventSlug, album._id)
		navigator.clipboard?.writeText(url).catch(() => {})
		toast({ title: "Album Link Copied!", description: "Recipients just enter their name and email to view it.", status: "success", duration: 2500, isClosable: true })
		shareModal.onOpen()
	}
	const openDelete = (album: Album) => {
		setDeletingAlbum(album)
		deleteDialog.onOpen()
	}

	const confirmDelete = async () => {
		if (!deletingAlbum) return
		setIsDeleting(true)
		try {
			await axios.delete(`/api/events/${eventId}/albums/${deletingAlbum._id}`)
			toast({ title: "Album deleted", status: "success", duration: 2000, isClosable: true })
			deleteDialog.onClose()
			setDeletingAlbum(null)
			refresh()
		} catch (e: any) {
			toast({ title: "Failed to delete album", description: e?.response?.data?.message || e.message, status: "error", duration: 3000, isClosable: true })
		} finally {
			setIsDeleting(false)
		}
	}

	const [isPublishing, setIsPublishing] = useState(false)
	const publishDialog = useDisclosure()
	const cancelPublishRef = useRef<HTMLButtonElement>(null)

	const openPublish = (album: Album) => {
		setPublishingAlbum(album)
		publishDialog.onOpen()
	}

	const confirmPublish = async () => {
		if (!publishingAlbum) return
		setIsPublishing(true)
		try {
			const res = await axios.post(
				`/api/events/${eventId}/albums/${publishingAlbum._id}/publish`,
				// A second publish is a deliberate re-send, so attendees can't be blasted by a stray click.
				{ resend: !!publishingAlbum.publishNotifiedAt },
			)
			toast({ title: res.data?.message || "Album published", status: "success", duration: 3500, isClosable: true })
			publishDialog.onClose()
			setPublishingAlbum(null)
			refresh()
		} catch (e: any) {
			toast({ title: "Failed to publish album", description: e?.response?.data?.message || e.message, status: "error", duration: 4000, isClosable: true })
		} finally {
			setIsPublishing(false)
		}
	}

	const coverOf = (album: Album) => album.media.find((m) => m.type === "image")?.url || album.media[0]?.url

	return (
		<div id="album-section" className="mt-8">
			<div className="bg-[#4a49491e] border border-[#434343] backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden">
				<Box p={{ base: 4, md: 6 }}>
					{/* Header */}
					<Flex justify="space-between" align="center" mb={5} flexWrap="wrap" gap={3}>
						<Box>
							<Flex align="center" gap={2}>
								<Icon as={FiImage} color="#F79432" boxSize={5} />
								<Heading size="md" color="white">Albums</Heading>
							</Flex>
							<Text color="#bbbbbb" fontSize="sm" mt={1}>Photos &amp; videos from this event.</Text>
						</Box>
						{canManage && session && (
							<Button
								leftIcon={<FiPlus />}
								bg="#F79432"
								color="black"
								_hover={{ bg: "#e58220" }}
								borderRadius="full"
								size="sm"
								onClick={openCreate}
							>
								Add Album
							</Button>
						)}
					</Flex>

					{/* Body */}
					{isLoading ? (
						<Flex justify="center" py={10}><Spinner color="#F79432" /></Flex>
					) : albums.length === 0 ? (
						<Box p={8} textAlign="center" bg="#2b2b2b" borderRadius="lg" border="1px dashed" borderColor="#434343">
							<Icon as={FiImage} color="#666" boxSize={8} mb={2} />
							<Text color="#bbbbbb">No albums yet.{canManage ? " Click “Add Album” to create one." : ""}</Text>
						</Box>
					) : (
						<SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={4}>
							{albums.map((album) => {
								const cover = coverOf(album)
								const firstIsVideo = album.media[0]?.type === "video" && !album.media.some((m) => m.type === "image")
								return (
									<Box
										key={album._id}
										position="relative"
										borderRadius="xl"
										overflow="hidden"
										bg="#1a1a1a"
										border="1px solid #2a2a2a"
										cursor="pointer"
										transition="all 0.15s"
										_hover={{ borderColor: "#F79432", transform: "translateY(-2px)" }}
										onClick={() => openGallery(album)}
									>
										<Box position="relative" width="100%" pt="72%" bg="#0f0f0f">
											{cover ? (
												firstIsVideo ? (
													<>
														{/* #t=0.1 makes the browser paint the first frame as the poster; preload="none"
														    avoids a metadata request per card on the event page */}
														<video src={`${cover}#t=0.1`} preload="none" muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
														<Icon as={FiPlayCircle} color="whiteAlpha.900" boxSize={8} position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" />
													</>
												) : (
													<Image src={cover} alt={album.title} loading="lazy" position="absolute" inset={0} width="100%" height="100%" objectFit="cover" />
												)
											) : (
												<Flex position="absolute" inset={0} align="center" justify="center"><Icon as={FiImage} color="#444" boxSize={7} /></Flex>
											)}
											<Box position="absolute" bottom={0} left={0} right={0} bgGradient="linear(to-t, blackAlpha.800, transparent)" px={2} py={2}>
												<Text color="white" fontSize="sm" fontWeight="600" noOfLines={1}>{album.title}</Text>
												<Flex align="center" gap={2}>
													<Text color="#cfcfcf" fontSize="xs">{album.media.length} item{album.media.length === 1 ? "" : "s"}</Text>
													{/* Publish state is a host-only concept — never shown to public viewers. */}
													{canManage && album.publishNotifiedAt && (
														<Badge bg="#2f7d32" color="white" fontSize="9px" borderRadius="sm" px={1}>Published</Badge>
													)}
												</Flex>
											</Box>
										</Box>
										<Flex position="absolute" top={1.5} right={1.5} gap={1} onClick={(e) => e.stopPropagation()}>
											{/* Share is available to every logged-in viewer */}
											<IconButton aria-label="Share album" icon={<FiShare2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="white" _hover={{ bg: "blackAlpha.900" }} onClick={() => openShare(album)} />
											{canManage && (
												<>
													<IconButton
														aria-label={album.publishNotifiedAt ? "Re-send album announcement" : "Publish album"}
														icon={<FiSend />}
														size="xs"
														borderRadius="full"
														bg="blackAlpha.700"
														color={album.publishNotifiedAt ? "#7ddb80" : "#F79432"}
														_hover={{ bg: "blackAlpha.900" }}
														onClick={() => openPublish(album)}
													/>
													<IconButton aria-label="Edit album" icon={<FiEdit2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="white" _hover={{ bg: "blackAlpha.900" }} onClick={() => openEdit(album)} />
													<IconButton aria-label="Delete album" icon={<FiTrash2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="#ff8080" _hover={{ bg: "blackAlpha.900" }} onClick={() => openDelete(album)} />
												</>
											)}
										</Flex>
									</Box>
								)
							})}
						</SimpleGrid>
					)}
				</Box>
			</div>

			{/* Create / Edit modal */}
			{createModal.isOpen && (
				<AlbumFormModal
					isOpen={createModal.isOpen}
					onClose={createModal.onClose}
					eventId={eventId}
					album={editingAlbum}
					onSaved={() => { createModal.onClose(); refresh() }}
				/>
			)}

			{/* Share QR modal */}
			{shareAlbum && (
				<QRCodeModal
					isOpen={shareModal.isOpen}
					onClose={() => { shareModal.onClose(); setShareAlbum(null) }}
					url={eventAlbumUrl(typeof window !== "undefined" ? window.location.origin : "", eventSlug, shareAlbum._id)}
					title={`${eventName} — ${shareAlbum.title}`}
				/>
			)}

			{/* Publish confirm */}
			<AlertDialog isOpen={publishDialog.isOpen} leastDestructiveRef={cancelPublishRef} onClose={publishDialog.onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1a1a1a" color="white" border="1px solid #333">
						<AlertDialogHeader fontSize="lg" fontWeight="bold">
							{publishingAlbum?.publishNotifiedAt ? "Re-send announcement?" : "Publish album?"}
						</AlertDialogHeader>
						<AlertDialogBody>
							{publishingAlbum?.publishNotifiedAt ? (
								<>
									&quot;{publishingAlbum?.title}&quot; was already published
									{publishingAlbum?.publishNotifiedAt ? ` on ${new Date(publishingAlbum.publishNotifiedAt).toLocaleDateString()}` : ""}
									{typeof publishingAlbum?.notifiedCount === "number" ? ` (${publishingAlbum.notifiedCount} notified)` : ""}.
									Sending again will email every attendee once more.
								</>
							) : (
								<>Everyone registered for this event will get an email that the photos from &quot;{publishingAlbum?.title}&quot; are up.</>
							)}
						</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={cancelPublishRef} onClick={publishDialog.onClose} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>Cancel</Button>
							<Button bg="#F79432" color="black" _hover={{ bg: "#e58220" }} onClick={confirmPublish} ml={3} isLoading={isPublishing}>
								{publishingAlbum?.publishNotifiedAt ? "Re-send" : "Publish & Notify"}
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>

			{/* Delete confirm */}
			<AlertDialog isOpen={deleteDialog.isOpen} leastDestructiveRef={cancelDeleteRef} onClose={deleteDialog.onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1a1a1a" color="white" border="1px solid #333">
						<AlertDialogHeader fontSize="lg" fontWeight="bold">Delete Album</AlertDialogHeader>
						<AlertDialogBody>Delete &quot;{deletingAlbum?.title}&quot;? This can&apos;t be undone.</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={cancelDeleteRef} onClick={deleteDialog.onClose} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>Cancel</Button>
							<Button colorScheme="red" onClick={confirmDelete} ml={3} isLoading={isDeleting}>Delete</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</div>
	)
}

// ─────────────────────────── Interest selection (shared) ───────────────────────────
// Used by both the name+email gate (new visitors) and the interests-only dialog (viewers
// who are already identified, e.g. arriving logged-in from the publish email).
function useInterestSelection() {
	const toast = useToast()
	const [interests, setInterests] = useState<string[]>([])
	const [customInterests, setCustomInterests] = useState<string[]>([])
	const [customDraft, setCustomDraft] = useState("")
	// "I don't want to attend any other Jetzy event" — optional, and a valid answer on its
	// own, so ticking it satisfies the at-least-one-interest requirement.
	const [optOut, setOptOut] = useState(false)

	const interestTotal = interests.length + customInterests.length

	// Opting out and picking interests are contradictory, so they clear each other.
	const toggleOptOut = () => {
		setOptOut((prev) => {
			const next = !prev
			if (next) {
				setInterests([])
				setCustomInterests([])
				setCustomDraft("")
			}
			return next
		})
	}

	const toggleInterest = (label: string) => {
		setOptOut(false)
		setInterests((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
	}

	const addCustom = () => {
		const val = customDraft.trim()
		if (!val) return
		setOptOut(false)
		const dupe =
			customInterests.some((c) => c.toLowerCase() === val.toLowerCase()) ||
			interests.some((i) => i.toLowerCase() === val.toLowerCase())
		if (dupe) {
			toast({ title: "You've already added that", status: "warning", duration: 2000, isClosable: true })
			return
		}
		setCustomInterests((prev) => [...prev, val])
		setCustomDraft("")
	}

	const removeCustom = (val: string) => setCustomInterests((prev) => prev.filter((c) => c !== val))

	// Folds an un-added draft in so a viewer isn't blocked for forgetting to click Add.
	// Returns the values to submit, since setState wouldn't be visible synchronously.
	const resolveForSubmit = () => {
		const draft = customDraft.trim()
		let effectiveCustoms = customInterests
		if (
			draft &&
			!customInterests.some((c) => c.toLowerCase() === draft.toLowerCase()) &&
			!interests.some((i) => i.toLowerCase() === draft.toLowerCase())
		) {
			effectiveCustoms = [...customInterests, draft]
			setCustomInterests(effectiveCustoms)
			setCustomDraft("")
		}
		return { interests, customInterests: effectiveCustoms, total: interests.length + effectiveCustoms.length, optOut }
	}

	return { interests, customInterests, customDraft, setCustomDraft, optOut, toggleOptOut, interestTotal, toggleInterest, addCustom, removeCustom, resolveForSubmit }
}

type InterestSelection = ReturnType<typeof useInterestSelection>

function InterestsFields({ ix }: { ix: InterestSelection }) {
	return (
		<Box mt={5}>
			<Flex align="flex-start" justify="space-between" gap={3} mb={1}>
				<Box>
					<Flex align="center" gap={2}>
						<Icon as={FiStar} color="#F79432" boxSize={4} />
						<Text fontSize="sm" fontWeight="600" color="white">What experiences would you like to join next?</Text>
					</Flex>
					<Text fontSize="xs" color="#8a8a8a">Pick the experiences you&apos;d like — we&apos;ll notify you about events you&apos;ll actually enjoy.</Text>
				</Box>
				<Badge
					flexShrink={0}
					bg={ix.optOut ? "#4a1f1f" : ix.interestTotal >= MIN_INTERESTS ? "#2f7d32" : "#2b2b2b"}
					color={ix.optOut ? "#ffb4b4" : "white"}
					borderRadius="full"
					px={2}
					py={1}
					fontSize="10px"
					textTransform="uppercase"
					letterSpacing="0.06em"
					fontWeight="bold"
				>
					{ix.optOut ? "Opted out" : `${ix.interestTotal} selected`}
				</Badge>
			</Flex>
			<SimpleGrid columns={{ base: 2, md: 3 }} spacing={2} mt={2}>
				{ALBUM_INTERESTS.map((it) => {
					const isSel = ix.interests.includes(it.label)
					return (
						<Box
							key={it.label}
							as="button"
							type="button"
							onClick={() => ix.toggleInterest(it.label)}
							aria-pressed={isSel}
							cursor="pointer"
							position="relative"
							display="flex"
							alignItems="flex-start"
							gap={2}
							px={3}
							py={2}
							pr={isSel ? 6 : 3}
							minH="42px"
							borderRadius="12px"
							bg={isSel ? "#F79432" : "#1E1E1E"}
							color={isSel ? "black" : "white"}
							border="1px solid"
							borderColor={isSel ? "#F79432" : "#343536"}
							transition="transform .12s ease, border-color .12s ease"
							_hover={{ transform: "scale(1.02)", borderColor: isSel ? "#F79432" : "#5A5D62" }}
							textAlign="left"
						>
							<Text fontSize="md" lineHeight="1.2" mt="1px">{it.emoji}</Text>
							<Text fontSize="xs" fontWeight="600" whiteSpace="normal" lineHeight="1.2">{it.label}</Text>
							{isSel && (
								<Text position="absolute" top="4px" right="6px" fontSize="11px" fontWeight="bold" lineHeight="1" color="black">✓</Text>
							)}
						</Box>
					)
				})}
			</SimpleGrid>
			<Box mt={3}>
				<Text fontSize="xs" color="#F79432" fontWeight="600">
					Tell us your interest <Text as="span" color="#777" fontWeight="normal">(Optional)</Text>
				</Text>
				<Text fontSize="11px" color="#8a8a8a" mb={1}>Add your own — as many as you like.</Text>
				{ix.customInterests.length > 0 && (
					<Flex wrap="wrap" gap={2} mb={2}>
						{ix.customInterests.map((c) => (
							<Flex
								key={c}
								align="center"
								gap={1}
								bg="#F79432"
								color="black"
								borderRadius="full"
								pl={3}
								pr={1}
								py={1}
								transition="transform .12s ease, opacity .12s ease"
								_hover={{ transform: "scale(1.03)" }}
							>
								<Text fontSize="xs" fontWeight="600">{c}</Text>
								<Box as="button" type="button" aria-label={`Remove ${c}`} onClick={() => ix.removeCustom(c)} px={1} fontSize="sm" lineHeight="1" _hover={{ opacity: 0.6 }}>×</Box>
							</Flex>
						))}
					</Flex>
				)}
				{/* Add sits inside the field (search-style input) */}
				<InputGroup size="md">
					<Input
						value={ix.customDraft}
						onChange={(e) => ix.setCustomDraft(e.target.value)}
						onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ix.addCustom() } }}
						placeholder="Type your interest here..."
						bg="#1E1E1E"
						borderColor="#343536"
						borderRadius="10px"
						color="white"
						pr="4.5rem"
						_placeholder={{ color: "#666" }}
					/>
					<InputRightElement width="4.25rem" pr={1}>
						<Button
							size="sm"
							h="1.9rem"
							width="100%"
							onClick={ix.addCustom}
							bg="#2B2B2B"
							color="white"
							borderRadius="8px"
							_hover={{ bg: "#3A3A3A" }}
							isDisabled={!ix.customDraft.trim()}
						>
							Add
						</Button>
					</InputRightElement>
				</InputGroup>
			</Box>

			{/* Opt-out — a real, tappable control (own checkbox square, solid border, card
			    background) so it never reads as plain text. Still visually separate from the
			    mandatory Terms checkbox: its own row below a divider, neutral-to-red states
			    rather than the orange used by interest chips. */}
			<Box mt={4} pt={3} borderTop="1px solid #2a2a2a">
				<Flex
					as="button"
					type="button"
					onClick={ix.toggleOptOut}
					aria-pressed={ix.optOut}
					width="100%"
					align="center"
					gap={3}
					px={3}
					py={3}
					borderRadius="12px"
					textAlign="left"
					cursor="pointer"
					bg={ix.optOut ? "#2a1f1f" : "#1E1E1E"}
					border="1px solid"
					borderColor={ix.optOut ? "#a35a5a" : "#434343"}
					transition="transform .12s ease, border-color .12s ease, background .12s ease"
					_hover={{ transform: "scale(1.01)", borderColor: ix.optOut ? "#c06a6a" : "#5A5D62", bg: ix.optOut ? "#332525" : "#242424" }}
				>
					{/* Checkbox square */}
					<Flex
						flexShrink={0}
						align="center"
						justify="center"
						w="18px"
						h="18px"
						borderRadius="4px"
						border="2px solid"
						borderColor={ix.optOut ? "#e06a6a" : "#6a6a6a"}
						bg={ix.optOut ? "#e06a6a" : "transparent"}
					>
						{ix.optOut && <Text fontSize="11px" fontWeight="bold" lineHeight="1" color="#131313">✓</Text>}
					</Flex>
					<Text fontSize="xs" fontWeight="600" color={ix.optOut ? "#ffb4b4" : "#d5d5d5"} whiteSpace="normal">
						I don&apos;t want to attend any other Jetzy event
					</Text>
				</Flex>
			</Box>
		</Box>
	)
}

// ─────────────────────────── Interests-only dialog ───────────────────────────
// For viewers we already know (logged in, or returning with the guest cookie) but who
// haven't told us their interests for this event yet — they never see the name+email gate.
export function InterestsModal({
	isOpen,
	onClose,
	eventId,
	onSaved,
}: {
	isOpen: boolean
	onClose: () => void
	eventId: string
	onSaved: () => void
}) {
	const toast = useToast()
	const ix = useInterestSelection()
	const [submitting, setSubmitting] = useState(false)

	const submit = async (e: React.FormEvent) => {
		e.preventDefault()
		const { interests, customInterests, total, optOut } = ix.resolveForSubmit()
		if (!optOut && total < MIN_INTERESTS) {
			toast({ title: "Please select at least one interest to continue", status: "warning", duration: 2800, isClosable: true })
			return
		}
		setSubmitting(true)
		try {
			await axios.post(`/api/events/${eventId}/albums/my-interests`, { interests, customInterests, optOut })
			onSaved()
		} catch (err: any) {
			toast({ title: "Couldn't save your interests", description: err?.response?.data?.message || err.message, status: "error", duration: 3500, isClosable: true })
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: "sm", md: "lg" }} scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
			<ModalContent bg="#131313" color="white" border="1px solid #343536" borderRadius="12px">
				<ModalHeader>Before you view the photos</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Text color="#bbbbbb" fontSize="sm">Quick one — tell us what you&apos;d like to join next.</Text>
					<form id="interests-only-form" onSubmit={submit}>
						<InterestsFields ix={ix} />
					</form>
				</ModalBody>
				<ModalFooter>
					<Button type="submit" form="interests-only-form" size="lg" fontWeight="bold" borderRadius="12px" bg="#F79432" color="black" _hover={{ bg: "#e58220" }} isLoading={submitting} width="100%">
						View Album
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

// ─────────────────────────── Guest access dialog ───────────────────────────
// Deliberately minimal: name + email, no password, no signup screen. If the email already
// belongs to an account we match it; if not the server creates one silently. Opens
// automatically whenever a visitor needs it (e.g. arriving via a share link) and, on
// success, hands control back so the caller can continue straight into the album.
export function GuestAccessModal({
	isOpen,
	onClose,
	eventId,
	onGranted,
}: {
	isOpen: boolean
	onClose: () => void
	eventId: string
	onGranted: () => void
}) {
	const toast = useToast()
	const ix = useInterestSelection()
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [emailError, setEmailError] = useState("")
	const [acceptedTerms, setAcceptedTerms] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	// Advisory only — surfaced on blur so the viewer catches a typo early. Submit-time
	// validation is unchanged.
	const validateEmailOnBlur = () => {
		const v = email.trim()
		if (!v) { setEmailError(""); return }
		setEmailError(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address")
	}

	const submit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim() || !email.trim()) {
			toast({ title: "Please enter your name and email", status: "warning", duration: 2500, isClosable: true })
			return
		}
		const { interests, customInterests: effectiveCustoms, total, optOut } = ix.resolveForSubmit()
		if (!optOut && total < MIN_INTERESTS) {
			toast({ title: "Please select at least one interest to continue", status: "warning", duration: 2800, isClosable: true })
			return
		}
		// This creates a Jetzy account behind the scenes, so consent is required here just
		// as it is in ticket checkout.
		if (!acceptedTerms) {
			toast({ title: "Please agree to the Terms & Conditions to continue", status: "warning", duration: 2500, isClosable: true })
			return
		}
		setSubmitting(true)
		try {
			const res = await axios.post(`/api/events/${eventId}/albums/guest-access`, {
				name: name.trim(),
				email: email.trim(),
				interests,
				customInterests: effectiveCustoms,
				optOut,
			})
			// Remember for the access-notice call so it can report returning vs new.
			try { sessionStorage.setItem("album_is_new_account", res.data?.data?.isNewAccount ? "1" : "0") } catch {}

			// The server only issues a magic token for brand-new accounts, so this signs in
			// exactly those people (nothing to hijack). Existing accounts get album access
			// via the guest cookie instead. Never block entry if the sign-in fails.
			const magicToken = res.data?.data?.magicToken
			if (magicToken) {
				try {
					await signIn("credentials", { magicToken, redirect: false })
				} catch (signInErr) {
					console.error("album guest auto-login failed", signInErr)
				}
			}

			onGranted()
		} catch (err: any) {
			toast({
				title: "Couldn't get you in",
				description: err?.response?.data?.message || err.message,
				status: "error",
				duration: 3500,
				isClosable: true,
			})
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: "sm", md: "lg" }} scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
			<ModalContent bg="#131313" color="white" border="1px solid #343536" borderRadius="12px">
				<ModalHeader>View the photos</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Text color="#bbbbbb" fontSize="sm" mb={4}>Just your name and email — no password needed.</Text>
					<form id="guest-access-form" onSubmit={submit}>
						<Text fontSize="sm" color="#bbb" mb={1}>Name</Text>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							bg="#1E1E1E"
							borderColor="#343536"
							borderRadius="10px"
							color="white"
							mb={3}
							_placeholder={{ color: "#666" }}
							autoComplete="name"
							autoFocus
						/>
						<Text fontSize="sm" color="#bbb" mb={1}>Email</Text>
						<Input
							value={email}
							onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError("") }}
							onBlur={validateEmailOnBlur}
							placeholder="you@example.com"
							type="email"
							bg="#1E1E1E"
							borderColor={emailError ? "#a35252" : "#343536"}
							borderRadius="10px"
							color="white"
							_placeholder={{ color: "#666" }}
							autoComplete="email"
						/>
						{emailError && (
							<Text fontSize="xs" color="#ff9a9a" mt={1}>{emailError}</Text>
						)}

						{/* Interests — captured for event planning; at least one required */}
						<InterestsFields ix={ix} />

						{/* Terms & Conditions — mirrors ticket checkout, since this also creates an account */}
						<label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", marginTop: "14px" }}>
							<input
								type="checkbox"
								checked={acceptedTerms}
								onChange={(e) => setAcceptedTerms(e.target.checked)}
								style={{ marginTop: "3px" }}
							/>
							<Text fontSize="xs" color="#bbbbbb">
								I agree to the{" "}
								<a href="/terms" target="_blank" rel="noreferrer" style={{ color: "#F79432", textDecoration: "underline" }}>
									Terms &amp; Conditions
								</a>
							</Text>
						</label>
					</form>
				</ModalBody>
				<ModalFooter>
					<Button type="submit" form="guest-access-form" size="lg" fontWeight="bold" borderRadius="12px" bg="#F79432" color="black" _hover={{ bg: "#e58220" }} isLoading={submitting} width="100%">
						View Album
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

// ─────────────────────────── Tagging for the visible photo ───────────────────────────
export function PhotoTagging({
	eventId,
	albumId,
	mediaUrl,
	canManage,
	canTag,
	onRequireLogin,
	autoOpenTag,
}: {
	eventId: string
	albumId: string
	mediaUrl: string
	canManage: boolean
	canTag: boolean
	onRequireLogin: (albumId: string, mediaUrl: string) => void
	autoOpenTag?: boolean
}) {
	const toast = useToast()
	const queryClient = useQueryClient()
	const [tagName, setTagName] = useState("")
	const [tagEmail, setTagEmail] = useState("")
	const [isTagging, setIsTagging] = useState(false)
	const [showForm, setShowForm] = useState(false)
	const [showManualEntry, setShowManualEntry] = useState(false)

	// Returned from login to tag this exact photo → open the form straight away. Mount-only:
	// PhotoTagging is keyed by media URL, so it mounts fresh on the target slide.
	useEffect(() => {
		if (autoOpenTag && canTag) setShowForm(true)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	const [mentionInput, setMentionInput] = useState("")
	// Jetzy directory search — available to any logged-in tagger (needs the session's
	// external accessToken, which guests don't have). Debounced so we don't hit the
	// upstream API on every keystroke.
	const [jetzyQuery, setJetzyQuery] = useState("")
	const [jetzyDebounced, setJetzyDebounced] = useState("")
	const tagEmailRef = useRef<HTMLInputElement>(null)
	// People queued up but NOT yet tagged — nothing is sent until the confirm dialog.
	// Keyed by a generated id, not email: the same person may legitimately appear twice.
	const [pendingTags, setPendingTags] = useState<{ id: string; email: string; name: string }[]>([])
	const confirmDialog = useDisclosure()
	const cancelConfirmRef = useRef<HTMLButtonElement>(null)

	const { data: tags = [] } = useQuery<AlbumTag[]>({
		queryKey: ["album-tags", albumId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/albums/${albumId}/tags`)
			return res.data?.data || []
		},
	})

	// Attendee suggestions are host-only (the API withholds the list from other viewers,
	// so guests just type a name + email instead).
	const { data: suggestions = [] } = useQuery<{ email: string; name: string }[]>({
		queryKey: ["album-participants", eventId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/albums/participants`)
			return res.data?.data || []
		},
		enabled: canManage,
	})

	// Debounce the Jetzy search box.
	useEffect(() => {
		const t = setTimeout(() => setJetzyDebounced(jetzyQuery.trim()), 300)
		return () => clearTimeout(t)
	}, [jetzyQuery])

	// Search the Jetzy user directory (reuses the same proxy the invite-members flow uses).
	const { data: jetzyResults = [], isFetching: jetzySearching } = useQuery<any[]>({
		queryKey: ["album-jetzy-search", eventId, jetzyDebounced],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/search-users`, { params: { query: jetzyDebounced, page: 1, perPage: 20 } })
			const d = res.data
			return d?.data?.docs || d?.data?.users || d?.data?.data || d?.docs || d?.users || []
		},
		enabled: SHOW_JETZY_SEARCH && canTag && jetzyDebounced.length >= 2,
		retry: false,
	})

	// A Jetzy result we can tag directly (has an email) vs. one we must ask an email for.
	const jetzyEmailOf = (u: any): string => (u?.email || u?.emailAddress || "").trim().toLowerCase()
	const jetzyNameOf = (u: any): string => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.name || u?.userName || ""

	// Picking a Jetzy user: stage straight away if they have an email; otherwise drop their
	// name into the manual form and ask the tagger to supply one.
	const pickJetzyUser = (u: any) => {
		const email = jetzyEmailOf(u)
		const name = jetzyNameOf(u)
		if (email) {
			stageTag(email, name)
			setJetzyQuery("")
			setJetzyDebounced("")
			return
		}
		setShowManualEntry(true)
		setTagName(name)
		setTagEmail("")
		setJetzyQuery("")
		setJetzyDebounced("")
		setTimeout(() => tagEmailRef.current?.focus(), 50)
	}

	const tagsForPhoto = tags.filter((t) => t.mediaUrl === mediaUrl)
	const refreshTags = () => queryClient.invalidateQueries({ queryKey: ["album-tags", albumId] })

	// ── Stage ──────────────────────────────────────────────────────────────
	// Queues someone locally. No request, no email — that only happens on confirm.
	// Deliberately unrestricted: the same person can be added again (and re-emailed).
	const stageTag = (email: string, name: string) => {
		const clean = email.trim().toLowerCase()
		if (!clean) {
			toast({ title: "An email is required to tag someone", status: "warning", duration: 2500, isClosable: true })
			return
		}
		setPendingTags((prev) => [...prev, { id: uid(), email: clean, name: name.trim() }])
		setMentionInput("")
		setTagName("")
		setTagEmail("")
	}

	const unstageTag = (id: string) => setPendingTags((prev) => prev.filter((p) => p.id !== id))

	// ── Send ───────────────────────────────────────────────────────────────
	const confirmTags = async () => {
		if (pendingTags.length === 0) return
		setIsTagging(true)
		try {
			const results = await Promise.all(
				pendingTags.map(async (p) => {
					try {
						await axios.post(`/api/events/${eventId}/albums/${albumId}/tags`, {
							mediaUrl,
							personEmail: p.email,
							personName: p.name || undefined,
						})
						return true
					} catch {
						return false
					}
				}),
			)

			const tagged = results.filter(Boolean).length
			const failed = results.length - tagged

			toast({
				title: failed
					? `${tagged} tagged · ${failed} failed`
					: `${tagged} ${tagged === 1 ? "person" : "people"} tagged & emailed`,
				status: failed ? "warning" : "success",
				duration: 3000,
				isClosable: true,
			})

			// Keep the tag box open so several people can be tagged in one continuous flow.
			setPendingTags([])
			setShowManualEntry(false)
			confirmDialog.onClose()
			refreshTags()
		} catch (e: any) {
			toast({ title: "Couldn't tag those people", description: e?.response?.data?.message || e.message, status: "error", duration: 3500, isClosable: true })
		} finally {
			setIsTagging(false)
		}
	}

	const removeTag = async (tagId: string) => {
		try {
			await axios.delete(`/api/events/${eventId}/albums/${albumId}/tags/${tagId}`)
			refreshTags()
		} catch (e: any) {
			// Surfaces the API's actual reason (e.g. "You can only remove tags you added,
			// or tags of yourself.") rather than a generic failure.
			toast({
				title: "Couldn't remove tag",
				description: e?.response?.data?.message || e.message,
				status: "error",
				duration: 3500,
				isClosable: true,
			})
		}
	}

	// `@`-mention: everything after the last "@" is the search query, filtered against
	// registered event participants (admin/owner only — the participants API withholds
	// the list from everyone else, so guests get the manual fields instead).
	// Nobody is hidden: already-tagged people stay selectable so they can be tagged again.
	const mentionAtIndex = mentionInput.lastIndexOf("@")
	const mentionQuery = mentionAtIndex >= 0 ? mentionInput.slice(mentionAtIndex + 1).trim().toLowerCase() : ""
	const mentionMatches =
		canManage && mentionAtIndex >= 0
			? suggestions.filter((s) => !mentionQuery || s.name?.toLowerCase().includes(mentionQuery) || s.email.toLowerCase().includes(mentionQuery)).slice(0, 8)
			: []
	// Admin typed something but never used "@" — tell them, instead of doing nothing.
	const showMentionHint = canManage && mentionInput.trim().length > 0 && mentionAtIndex < 0

	return (
		<Box mt={4} pt={4} borderTop="1px solid #2a2a2a">
			<Flex align="center" justify="space-between" mb={3} flexWrap="wrap" gap={2}>
				<Flex align="center" gap={2} flexWrap="wrap">
					<Icon as={FiUsers} color="#F79432" boxSize={4} />
					<Text fontSize="sm" fontWeight="600" color="white">
						{tagsForPhoto.length > 0 ? `Tagged in this photo (${tagsForPhoto.length})` : "No one tagged yet"}
					</Text>
				</Flex>
				<Button
					size="sm"
					leftIcon={showForm ? undefined : <FiUserPlus />}
					bg={showForm ? "transparent" : "#F79432"}
					color={showForm ? "white" : "black"}
					border={showForm ? "1px solid #434343" : undefined}
					_hover={{ bg: showForm ? "whiteAlpha.100" : "#e58220" }}
					borderRadius="full"
					px={5}
					onClick={() => {
						// Tagging emails someone in your name, so it needs a real login — the
						// name+email guest cookie is enough to view but not to tag. Carry the
						// album + photo so login returns them right here, ready to tag.
						if (!canTag) {
							onRequireLogin(albumId, mediaUrl)
							return
						}
						setShowForm((v) => !v)
						setPendingTags([])
						setMentionInput("")
					}}
				>
					{showForm ? "Done" : "Tag People"}
				</Button>
			</Flex>

			{tagsForPhoto.length > 0 && (
				<Flex gap={2} flexWrap="wrap" mb={3}>
					{tagsForPhoto.map((t) => (
						<Flex key={t._id} align="center" gap={1} bg="#1f1f1f" border="1px solid #333" borderRadius="full" pl={3} pr={1} py={1}>
							<Text fontSize="xs" color="white">{t.personName || t.personEmail}</Text>
							<Box
								as="button"
								type="button"
								aria-label={`Remove tag for ${t.personName || t.personEmail}`}
								title="Remove tag"
								onClick={() => removeTag(t._id)}
								color="#888"
								_hover={{ color: "#ff8080", bg: "whiteAlpha.100" }}
								fontSize="sm"
								lineHeight="1"
								borderRadius="full"
								px={2}
								py={1}
							>
								×
							</Box>
						</Flex>
					))}
				</Flex>
			)}

			{showForm && (
				<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
						{/* Search the Jetzy directory — any logged-in tagger.
						    Temporarily hidden: the search proxy still requires a personal token that
						    album users don't have. Flip SHOW_JETZY_SEARCH back on once the backend
						    drops the token requirement from the search API. */}
						{SHOW_JETZY_SEARCH && canTag && (
							<Box mb={4}>
								<Text fontSize="xs" fontWeight="bold" color="#bbb" mb={2} textTransform="uppercase" letterSpacing="0.04em">
									Search Jetzy members
								</Text>
								<Box position="relative">
									<Input
										size="md"
										value={jetzyQuery}
										onChange={(e) => setJetzyQuery(e.target.value)}
										placeholder="Search by name or username"
										bg="#1E1E1E"
										borderColor="#343536"
										color="white"
										_placeholder={{ color: "#666" }}
									/>
									{jetzyDebounced.length >= 2 && (
										<Box
											position="absolute"
											top="calc(100% + 4px)"
											left={0}
											right={0}
											zIndex={10}
											bg="#1a1a1a"
											border="1px solid #333"
											borderRadius="md"
											boxShadow="lg"
											maxH="240px"
											overflowY="auto"
										>
											{jetzySearching ? (
												<Flex justify="center" py={3}><Spinner size="sm" color="#F79432" /></Flex>
											) : jetzyResults.length === 0 ? (
												<Text fontSize="xs" color="#888" px={3} py={3}>No Jetzy members found. Use manual entry below.</Text>
											) : (
												jetzyResults.map((u: any, i: number) => {
													const jEmail = jetzyEmailOf(u)
													const jName = jetzyNameOf(u)
													return (
														<Box
															key={u._id || u.id || `${jName}-${i}`}
															as="button"
															type="button"
															width="100%"
															textAlign="left"
															px={3}
															py={2}
															_hover={{ bg: "whiteAlpha.100" }}
															onClick={() => pickJetzyUser(u)}
														>
															<Text fontSize="sm" color="white">{jName || jEmail || "Jetzy member"}</Text>
															<Text fontSize="xs" color="#888">{jEmail || "No email on file — you'll add one"}</Text>
														</Box>
													)
												})
											)}
										</Box>
									)}
								</Box>
							</Box>
						)}

					{/* Route 1 — registered attendees (@ search), host view only */}
					{canManage && (
						<Box mb={4}>
							<Text fontSize="xs" fontWeight="bold" color="#bbb" mb={2} textTransform="uppercase" letterSpacing="0.04em">
								Registered guests
							</Text>
							<Box position="relative">
								<Input
									size="md"
									value={mentionInput}
									onChange={(e) => setMentionInput(e.target.value)}
									placeholder="Type @ to search registered guests"
									bg="#1E1E1E"
									borderColor="#343536"
									color="white"
									_placeholder={{ color: "#666" }}
								/>
								{mentionMatches.length > 0 && (
									<Box
										position="absolute"
										top="calc(100% + 4px)"
										left={0}
										right={0}
										zIndex={10}
										bg="#1a1a1a"
										border="1px solid #333"
										borderRadius="md"
										boxShadow="lg"
										maxH="200px"
										overflowY="auto"
									>
										{mentionMatches.map((s) => (
											<Box
												key={s.email}
												as="button"
												type="button"
												width="100%"
												textAlign="left"
												px={3}
												py={2}
												_hover={{ bg: "whiteAlpha.100" }}
												onClick={() => stageTag(s.email, s.name)}
											>
												<Text fontSize="sm" color="white">{s.name || s.email}</Text>
												{s.name && <Text fontSize="xs" color="#888">{s.email}</Text>}
											</Box>
										))}
									</Box>
								)}
							</Box>
							<Text fontSize="xs" color={showMentionHint ? "#F79432" : "#777"} mt={2}>
								{showMentionHint
									? "Use @ to search, or use “Tag someone not registered” below."
									: "Start with @ to search people who registered for this event."}
							</Text>
						</Box>
					)}

					{/* Route 2 — anyone else, by name + email */}
					{canManage ? (
						<Button
							size="sm"
							variant="outline"
							leftIcon={<FiUserPlus />}
							borderColor="#434343"
							color="white"
							_hover={{ bg: "whiteAlpha.100", borderColor: "#F79432" }}
							borderRadius="full"
							onClick={() => setShowManualEntry((v) => !v)}
						>
							{showManualEntry ? "Hide manual entry" : "Tag someone not registered"}
						</Button>
					) : (
						<Text fontSize="xs" fontWeight="bold" color="#bbb" mb={2} textTransform="uppercase" letterSpacing="0.04em">
							Tag someone
						</Text>
					)}

					{(showManualEntry || !canManage) && (
						<Box mt={canManage ? 3 : 0}>
							<Flex direction={{ base: "column", sm: "row" }} gap={3} align={{ base: "stretch", sm: "flex-end" }}>
								<Box flex="1">
									<Text fontSize="xs" color="#bbb" mb={1}>
										Full name <Text as="span" color="#777">(optional)</Text>
									</Text>
									<Input size="md" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="e.g. Sarah Khan" bg="#1E1E1E" borderColor="#343536" color="white" _placeholder={{ color: "#666" }} />
								</Box>
								<Box flex="1">
									<Text fontSize="xs" color="#bbb" mb={1}>
										Email address <Text as="span" color="#F79432">*</Text>
									</Text>
									<Input
										ref={tagEmailRef}
										size="md"
										value={tagEmail}
										onChange={(e) => setTagEmail(e.target.value)}
										onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); stageTag(tagEmail, tagName) } }}
										placeholder="their@email.com"
										type="email"
										bg="#1E1E1E"
										borderColor="#343536"
										color="white"
										_placeholder={{ color: "#666" }}
									/>
								</Box>
								<Button size="md" bg="#2B2B2B" color="white" _hover={{ bg: "#3A3A3A" }} onClick={() => stageTag(tagEmail, tagName)} flexShrink={0}>
									Add to list
								</Button>
							</Flex>
						</Box>
					)}

					{/* Queued people — still nothing sent */}
					{pendingTags.length > 0 && (
						<Box mt={5} pt={4} borderTop="1px solid #2a2a2a">
							<Flex align="center" justify="space-between" mb={2}>
								<Text fontSize="xs" fontWeight="bold" color="#bbb" textTransform="uppercase" letterSpacing="0.04em">
									Ready to tag ({pendingTags.length})
								</Text>
								<Button size="xs" variant="ghost" color="#888" _hover={{ color: "white", bg: "whiteAlpha.100" }} onClick={() => setPendingTags([])}>
									Clear all
								</Button>
							</Flex>
							<Flex gap={2} flexWrap="wrap" mb={4}>
								{pendingTags.map((p) => (
									<Flex key={p.id} align="center" gap={1} bg="#1f1f1f" border="1px dashed #F79432" borderRadius="full" pl={3} pr={1} py={1}>
										<Text fontSize="xs" color="white">{p.name || p.email}</Text>
										<Box
											as="button"
											type="button"
											aria-label={`Remove ${p.name || p.email} from the list`}
											title="Remove"
											onClick={() => unstageTag(p.id)}
											color="#888"
											_hover={{ color: "#ff8080", bg: "whiteAlpha.100" }}
											fontSize="sm"
											lineHeight="1"
											borderRadius="full"
											px={2}
											py={1}
										>
											×
										</Box>
									</Flex>
								))}
							</Flex>
							<Button width="100%" size="md" bg="#F79432" color="black" _hover={{ bg: "#e58220" }} onClick={confirmDialog.onOpen}>
								Tag &amp; Notify ({pendingTags.length})
							</Button>
						</Box>
					)}
				</Box>
			)}

			{/* Confirm before anything is sent */}
			<AlertDialog isOpen={confirmDialog.isOpen} leastDestructiveRef={cancelConfirmRef} onClose={confirmDialog.onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1a1a1a" color="white" border="1px solid #333">
						<AlertDialogHeader fontSize="lg" fontWeight="bold">
							Tag {pendingTags.length} {pendingTags.length === 1 ? "person" : "people"}?
						</AlertDialogHeader>
						<AlertDialogBody>
							<Text mb={3}>They&apos;ll each get an email letting them know they were tagged in this photo.</Text>
							<Flex direction="column" gap={1}>
								{pendingTags.map((p) => (
									<Text key={p.id} fontSize="sm" color="#bbb">
										{p.name ? `${p.name} — ` : ""}{p.email}
									</Text>
								))}
							</Flex>
						</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={cancelConfirmRef} onClick={confirmDialog.onClose} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>Cancel</Button>
							<Button bg="#F79432" color="black" _hover={{ bg: "#e58220" }} onClick={confirmTags} ml={3} isLoading={isTagging}>
								Tag &amp; Notify
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</Box>
	)
}

// ─────────────────────────── Create / Edit modal ───────────────────────────
function AlbumFormModal({
	isOpen,
	onClose,
	eventId,
	album,
	onSaved,
}: {
	isOpen: boolean
	onClose: () => void
	eventId: string
	album: Album | null
	onSaved: () => void
}) {
	const toast = useToast()
	const imageInputRef = useRef<HTMLInputElement>(null)
	const videoInputRef = useRef<HTMLInputElement>(null)
	const [title, setTitle] = useState(album?.title || "")
	const [description, setDescription] = useState(album?.description || "")
	const [staged, setStaged] = useState<StagedMedia[]>(
		(album?.media || []).map((m) => ({ tempId: uid(), type: m.type, url: m.url, progress: 100, uploading: false })),
	)
	const [isSaving, setIsSaving] = useState(false)

	const anyUploading = staged.some((s) => s.uploading)
	// Cover = first uploaded image in order (matches coverOf on the card). Badge marks it.
	const coverTempId = staged.find((s) => s.type === "image" && s.url && !s.error)?.tempId

	// Native HTML5 drag-and-drop reorder (framer-motion Reorder can't handle a wrapping
	// 2D grid — single-axis only — so tiles flew out of layout). Live-swaps on drag-enter.
	// Ref holds the source index (no side effects inside state updaters); state mirrors it
	// purely for the dragged tile's opacity.
	const dragFromRef = useRef<number | null>(null)
	const [dragIndex, setDragIndex] = useState<number | null>(null)
	const startDrag = (idx: number) => {
		dragFromRef.current = idx
		setDragIndex(idx)
	}
	const endDrag = () => {
		dragFromRef.current = null
		setDragIndex(null)
	}
	const handleDragEnterTile = (idx: number) => {
		const from = dragFromRef.current
		if (from === null || from === idx) return
		setStaged((prev) => {
			const arr = [...prev]
			const [moved] = arr.splice(from, 1)
			arr.splice(idx, 0, moved)
			return arr
		})
		dragFromRef.current = idx
		setDragIndex(idx)
	}

	const handleFiles = (files: FileList | null, type: MediaType) => {
		if (!files || files.length === 0) return
		Array.from(files).forEach((file) => {
			const controller = new AbortController()
			const item: StagedMedia = { tempId: uid(), type, progress: 0, uploading: true, controller }
			setStaged((prev) => [...prev, item])
			uploadFile(file, {
				folder: "posts",
				signal: controller.signal,
				onProgressChange: (p) => setStaged((prev) => prev.map((s) => (s.tempId === item.tempId ? { ...s, progress: p } : s))),
			})
				.then(({ url }) => setStaged((prev) => prev.map((s) => (s.tempId === item.tempId ? { ...s, url, uploading: false, progress: 100 } : s))))
				.catch((err) => {
					if (axios.isCancel(err) || err?.name === "CanceledError" || err?.name === "AbortError") {
						// aborted — remove the staged item silently
						setStaged((prev) => prev.filter((s) => s.tempId !== item.tempId))
						return
					}
					setStaged((prev) => prev.map((s) => (s.tempId === item.tempId ? { ...s, uploading: false, error: true } : s)))
					toast({ title: "Upload failed", description: file.name, status: "error", duration: 3000, isClosable: true })
				})
		})
	}

	const removeStaged = (item: StagedMedia) => {
		if (item.uploading && item.controller) item.controller.abort()
		setStaged((prev) => prev.filter((s) => s.tempId !== item.tempId))
	}

	// Cancel: abort every in-flight upload and discard everything.
	const handleCancel = () => {
		staged.forEach((s) => { if (s.uploading && s.controller) s.controller.abort() })
		setStaged([])
		onClose()
	}

	const handleSave = async () => {
		if (!title.trim()) {
			toast({ title: "Title is required", status: "warning", duration: 2500, isClosable: true })
			return
		}
		const media = staged.filter((s) => !s.uploading && !s.error && s.url).map((s) => ({ url: s.url as string, type: s.type }))
		if (media.length === 0) {
			toast({ title: "Add at least one photo or video", status: "warning", duration: 2500, isClosable: true })
			return
		}
		setIsSaving(true)
		try {
			const payload = { title: title.trim(), description: description.trim(), media }
			if (album) {
				await axios.put(`/api/events/${eventId}/albums/${album._id}`, payload)
				toast({ title: "Album updated", status: "success", duration: 2000, isClosable: true })
			} else {
				await axios.post(`/api/events/${eventId}/albums`, payload)
				toast({ title: "Album created", status: "success", duration: 2000, isClosable: true })
			}
			onSaved()
		} catch (e: any) {
			toast({ title: "Failed to save album", description: e?.response?.data?.message || e.message, status: "error", duration: 3000, isClosable: true })
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={handleCancel} size="xl" isCentered scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.800" />
			<ModalContent bg="#15181C" color="white" border="1px solid #343536">
				<ModalHeader>{album ? "Edit Album" : "New Album"}</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Text fontSize="sm" color="#bbb" mb={1}>Title</Text>
					<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Album title" bg="#1E1E1E" borderColor="#343536" color="white" mb={4} _placeholder={{ color: "#666" }} />

					<Text fontSize="sm" color="#bbb" mb={1}>Description (optional)</Text>
					<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" bg="#1E1E1E" borderColor="#343536" color="white" mb={4} _placeholder={{ color: "#666" }} />

					{/* Upload buttons */}
					<Flex gap={3} mb={3}>
						<Box as="button" type="button" onClick={() => imageInputRef.current?.click()} display="flex" flexDir="column" alignItems="center" justifyContent="center" gap={1} bg="#2B2B2B" borderRadius="xl" px={5} py={3} border="1px dashed #444" _hover={{ bg: "#3A3A3A" }}>
							<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple ref={imageInputRef} style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files, "image"); e.target.value = "" }} />
							<Icon as={FiImage} color="#9CA3AF" boxSize={5} />
							<Text fontSize="xs" color="gray.400">Add Photos</Text>
						</Box>
						<Box as="button" type="button" onClick={() => videoInputRef.current?.click()} display="flex" flexDir="column" alignItems="center" justifyContent="center" gap={1} bg="#2B2B2B" borderRadius="xl" px={5} py={3} border="1px dashed #444" _hover={{ bg: "#3A3A3A" }}>
							<input type="file" accept="video/*" multiple ref={videoInputRef} style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files, "video"); e.target.value = "" }} />
							<Icon as={FiVideo} color="#9CA3AF" boxSize={5} />
							<Text fontSize="xs" color="gray.400">Add Videos</Text>
						</Box>
					</Flex>

					{/* Staged media grid — drag to reorder; first photo is the album cover */}
					{staged.length > 0 && (
						<>
							<Text fontSize="xs" color="#8a8a8a" mt={4} mb={2}>Drag to reorder — the first photo is the album cover.</Text>
							<SimpleGrid columns={{ base: 3, sm: 4 }} spacing={3}>
								{staged.map((s, idx) => (
									<Box
										key={s.tempId}
										position="relative"
										width="100%"
										pt="100%"
										borderRadius="md"
										overflow="hidden"
										bg="#0f0f0f"
										border={coverTempId === s.tempId ? "2px solid #F79432" : "1px solid #2a2a2a"}
										opacity={dragIndex === idx ? 0.4 : 1}
										cursor={s.uploading ? "default" : "grab"}
										draggable={!s.uploading}
										onDragStart={(e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; startDrag(idx) }}
										onDragEnter={() => handleDragEnterTile(idx)}
										onDragOver={(e: React.DragEvent) => e.preventDefault()}
										onDragEnd={endDrag}
										onDrop={(e: React.DragEvent) => { e.preventDefault(); endDrag() }}
									>
										{s.url ? (
											s.type === "video" ? (
												<video src={s.url} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} muted />
											) : (
												<img src={s.url} alt="staged" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
											)
										) : (
											<Flex position="absolute" inset={0} direction="column" align="center" justify="center" gap={1}>
												<Spinner size="sm" color="#F79432" />
												<Text fontSize="10px" color="gray.400">{s.progress}%</Text>
											</Flex>
										)}
										{s.error && (
											<Flex position="absolute" inset={0} align="center" justify="center" bg="blackAlpha.700"><Text fontSize="10px" color="#ff8080">Failed</Text></Flex>
										)}
										{coverTempId === s.tempId && (
											<Badge position="absolute" bottom="2px" left="2px" bg="#F79432" color="black" fontSize="9px" borderRadius="sm" px={1}>Cover</Badge>
										)}
										<IconButton aria-label="Remove" icon={<FiTrash2 />} size="xs" position="absolute" top="2px" right="2px" minW="20px" h="20px" p={0} bg="blackAlpha.800" color="white" _hover={{ bg: "red.600" }} draggable={false} onClick={() => removeStaged(s)} />
									</Box>
								))}
							</SimpleGrid>
						</>
					)}
				</ModalBody>
				<ModalFooter>
					<Button variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }} mr={3} onClick={handleCancel}>Cancel</Button>
					<Button bg="#F79432" color="black" _hover={{ bg: "#e58220" }} onClick={handleSave} isLoading={isSaving} isDisabled={anyUploading}>
						{anyUploading ? "Uploading…" : album ? "Save Changes" : "Create Album"}
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}
