import React, { useCallback, useEffect, useMemo, useState } from "react"
import { eventAlbumPath, eventAlbumUrl, eventPath } from "@/lib/event-slug"
import Head from "next/head"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import { Types } from "mongoose"
import { Box, Flex, Text, Heading, Icon, IconButton, Button, Spinner, useToast, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from "@chakra-ui/react"
import { FiArrowLeft, FiShare2, FiDownload, FiTag, FiPlayCircle, FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi"

import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { EventAlbums as EventAlbumsModel } from "@/models/events/albums"
import { PhotoTagging, type Album, type AlbumMedia } from "@/components/events/EventAlbums"
import { useAlbumViewerGate } from "@/components/events/album/useAlbumViewerGate"
import { useTrackEventView } from "@/hooks/useTrackEventView"
import { useAnalytics } from "@/hooks/useAnalytics"

type Props = {
	album: string
	event: string
}

/** First frame as a poster: browsers paint it when a media fragment is present. */
const posterSrc = (url: string) => `${url}#t=0.1`

/**
 * Grid tile. Declared at module scope on purpose — defining it inside the page component
 * would give it a new identity on every render, remounting the whole grid (and reloading
 * every image) each time the lightbox or gate state changed.
 */
const Tile = React.memo(function Tile({
	m,
	index,
	height,
	albumTitle,
	onOpen,
}: {
	m: AlbumMedia
	index: number
	height: string
	albumTitle: string
	onOpen: (index: number) => void
}) {
	const ref = React.useRef<HTMLButtonElement>(null)
	// Videos can't use native lazy-load, and `preload="metadata"` on every tile would fire a
	// request per video on mount. So we only mount the <video> once the tile nears the
	// viewport. Images use native lazy-load and need no observer.
	const [inView, setInView] = useState(m.type !== "video")
	useEffect(() => {
		if (m.type !== "video" || inView || !ref.current) return
		const el = ref.current
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setInView(true)
					io.disconnect()
				}
			},
			{ rootMargin: "400px" },
		)
		io.observe(el)
		return () => io.disconnect()
	}, [m.type, inView])

	return (
		<Box
			ref={ref}
			as="button"
			type="button"
			onClick={() => onOpen(index)}
			position="relative"
			width="100%"
			height={height}
			borderRadius="12px"
			overflow="hidden"
			bg="#0f0f0f"
			transition="transform .15s ease"
			_hover={{ transform: "scale(1.01)" }}
		>
			{m.type === "video" ? (
				<>
					{inView && (
						<Box as="video" src={posterSrc(m.url)} preload="metadata" muted playsInline width="100%" height="100%" sx={{ objectFit: "cover" }} />
					)}
					<Icon as={FiPlayCircle} color="whiteAlpha.900" boxSize={10} position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" />
				</>
			) : (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={m.url} alt={`${albumTitle} ${index + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
			)}
		</Box>
	)
})

export default function AlbumPhotoTourPage({ album: albumJson, event: eventJson }: Props) {
	const album = useMemo(() => JSON.parse(albumJson) as Album, [albumJson])
	const event = useMemo(() => JSON.parse(eventJson) as { _id: string; name: string; slug: string; ownerId?: string }, [eventJson])

	const router = useRouter()
	const toast = useToast()
	const { data: session } = useSession()

	const { ready, hasAccess, probeSettled, recordAlbumAccess, openGate, gateUi } = useAlbumViewerGate(event._id)

	const role = (session?.user as any)?.role
	const isAdmin = role === "admin" || role === "super admin"
	const userId = (session?.user as any)?._id?.toString()
	const canManage = isAdmin || (!!userId && event.ownerId === userId)
	// Tagging emails someone in your name, so it needs a real session — the name+email
	// guest cookie is enough to view but not to tag.
	const canTag = !!session

	const media = useMemo(() => album.media || [], [album.media])

	// Publish emails and album share links open this page directly, so the event view has to
	// be recorded here too. `from=event` means the event page already counted it (card click
	// or the old ?album= redirect) — skip so it isn't double-counted.
	//
	// Frozen on the first ready render: we strip `from` from the URL below, and reading it
	// live would flip this back to "not from the event page" and fire a duplicate view.
	const cameFromEventRef = React.useRef<boolean | null>(null)
	if (cameFromEventRef.current === null && router.isReady) {
		cameFromEventRef.current = router.query.from === "event"
	}
	const trackingEnabled = router.isReady && cameFromEventRef.current === false
	useTrackEventView(event._id, { enabled: trackingEnabled })

	// Record the view once the viewer is through the gate.
	useEffect(() => {
		if (ready) recordAlbumAccess(album._id)
	}, [ready, album._id, recordAlbumAccess])

	// ── Lightbox ────────────────────────────────────────────────────────────
	const [openIndex, setOpenIndex] = useState<number | null>(null)
	const [tagOpen, setTagOpen] = useState(false)
	const current = openIndex === null ? null : media[openIndex]

	const close = useCallback(() => { setOpenIndex(null); setTagOpen(false) }, [])
	const prev = useCallback(() => setOpenIndex((i) => (i === null ? i : (i - 1 + media.length) % media.length)), [media.length])
	const next = useCallback(() => setOpenIndex((i) => (i === null ? i : (i + 1) % media.length)), [media.length])

	// Deep link to a specific photo (?photo=<url>) — used when returning from login to tag.
	useEffect(() => {
		const p = router.query.photo
		if (!ready || typeof p !== "string" || !p) return
		const idx = media.findIndex((m) => m.url === p)
		if (idx >= 0) {
			setOpenIndex(idx)
			const shouldTag = router.query.tag === "1"
			if (shouldTag) setTagOpen(true)
			const { photo: _p, tag: _t, from: _f, ...rest } = router.query
			router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready, router.query.photo])

	// No deep-linked photo, but still tidy the redirect marker out of the URL.
	useEffect(() => {
		if (!ready || router.query.from !== "event" || router.query.photo) return
		const { from: _f, ...rest } = router.query
		router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready, router.query.from])

	// Preload the neighbouring images so arrow nav is instant. Skip videos.
	useEffect(() => {
		if (openIndex === null || media.length < 2) return
		;[(openIndex + 1) % media.length, (openIndex - 1 + media.length) % media.length].forEach((i) => {
			const n = media[i]
			if (n && n.type !== "video") {
				const img = new window.Image()
				img.src = n.url
			}
		})
	}, [openIndex, media])

	// Keyboard nav
	useEffect(() => {
		if (openIndex === null) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close()
			if (e.key === "ArrowLeft") prev()
			if (e.key === "ArrowRight") next()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [openIndex, close, prev, next])

	// Swipe
	const touchX = React.useRef<number | null>(null)
	const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.changedTouches[0].clientX }
	const onTouchEnd = (e: React.TouchEvent) => {
		if (touchX.current === null) return
		const dx = e.changedTouches[0].clientX - touchX.current
		if (Math.abs(dx) > 50) (dx > 0 ? prev() : next())
		touchX.current = null
	}

	const { trackEventInteraction } = useAnalytics()

	// Copy a link, or open the native share sheet when the browser has one. We always share a
	// LINK (not the raw file) — that's what routes recipients through the access gate; a bare
	// file URL would bypass it.
	const shareLink = async (url: string) => {
		try {
			if (typeof navigator !== "undefined" && (navigator as any).share) {
				await (navigator as any).share({ title: album.title, url })
				return
			}
		} catch (e: any) {
			if (e?.name === "AbortError") return // user dismissed the sheet
			// fall through to clipboard
		}
		navigator.clipboard?.writeText(url).catch(() => {})
		toast({ title: "Link copied!", status: "success", duration: 2000, isClosable: true })
	}

	const shareAlbum = () => {
		const url = eventAlbumUrl(window.location.origin, event.slug, album._id)
		shareLink(url)
		trackEventInteraction(event._id, "share", { albumId: album._id, scope: "album" }).catch(() => {})
	}

	// Per-photo share: a link that reopens THIS item after the gate (?photo= deep link).
	const sharePhoto = (m: AlbumMedia) => {
		const url = `${eventAlbumUrl(window.location.origin, event.slug, album._id)}?photo=${encodeURIComponent(m.url)}`
		shareLink(url)
		trackEventInteraction(event._id, "share", { albumId: album._id, mediaUrl: m.url, scope: "photo" }).catch(() => {})
	}

	// Download via our same-origin proxy — the media CDN blocks cross-origin fetch, and the
	// `download` attribute is ignored for a cross-origin href, so a direct client download
	// just opens the file. The proxy streams it back with Content-Disposition: attachment.
	const downloadMedia = (m: AlbumMedia) => {
		const href = `/api/events/${event._id}/albums/${album._id}/download?url=${encodeURIComponent(m.url)}`
		const a = document.createElement("a")
		a.href = href
		a.rel = "noopener"
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}

	const requireLoginToTag = (albumId: string, mediaUrl: string) => {
		const back = `${eventAlbumPath(event.slug, albumId)}?photo=${encodeURIComponent(mediaUrl)}&tag=1`
		router.push(`/login?_cb=${encodeURIComponent(back)}`)
	}

	// Airbnb rhythm: one full-width tile, then a 2-up row, repeating.
	const rows = useMemo(() => {
		const out: AlbumMedia[][] = []
		let i = 0
		while (i < media.length) {
			out.push([media[i]])
			i += 1
			if (i < media.length) {
				out.push(media.slice(i, i + 2))
				i += 2
			}
		}
		return out
	}, [media])

	// Infinite scroll: keep the initial DOM small on large albums, reveal more rows as the
	// sentinel nears the viewport. The lightbox always indexes the full `media` array, so
	// not-yet-rendered items stay reachable once a photo is open.
	const ROW_BATCH = 8
	const [visibleRows, setVisibleRows] = useState(ROW_BATCH)
	useEffect(() => { setVisibleRows(ROW_BATCH) }, [album._id])
	const sentinelRef = React.useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!ready || visibleRows >= rows.length || !sentinelRef.current) return
		const el = sentinelRef.current
		const io = new IntersectionObserver(
			(entries) => { if (entries.some((e) => e.isIntersecting)) setVisibleRows((n) => n + ROW_BATCH) },
			{ rootMargin: "600px" },
		)
		io.observe(el)
		return () => io.disconnect()
	}, [ready, visibleRows, rows.length])

	return (
		<>
			<Head>
				<title>{album.title} — {event.name}</title>
			</Head>

			<Box minH="100vh" bg="#131313" color="white">
				{/* Top bar */}
				<Flex align="center" justify="space-between" px={{ base: 4, md: 8 }} py={4} position="sticky" top={0} zIndex={5} bg="#131313" borderBottom="1px solid #2a2a2a">
					<IconButton
						aria-label="Back to event"
						icon={<FiArrowLeft />}
						variant="ghost"
						color="white"
						_hover={{ bg: "whiteAlpha.100" }}
						onClick={() => router.push(eventPath(event.slug))}
					/>
					<Text fontWeight="700">Photo tour</Text>
					<Button leftIcon={<FiShare2 />} size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.100" }} onClick={shareAlbum}>
						Share
					</Button>
				</Flex>

				{!probeSettled ? (
					<Flex justify="center" py={20}><Spinner color="#F79432" /></Flex>
				) : !ready ? (
					<Flex direction="column" align="center" justify="center" py={24} px={6} textAlign="center" gap={4}>
						<Heading size="md">{album.title}</Heading>
						<Text color="#9a9a9a" fontSize="sm" maxW="420px">
							{hasAccess ? "One quick question before you view the photos." : "Enter your name and email to view these photos."}
						</Text>
						{/* Always available: the dialog can be dismissed, and without this the
						    page would be a dead end until reload. */}
						<Button bg="#F79432" color="black" fontWeight="bold" borderRadius="12px" _hover={{ bg: "#e58220" }} onClick={openGate}>
							Continue
						</Button>
					</Flex>
				) : (
					<Flex direction={{ base: "column", lg: "row" }} gap={{ base: 6, lg: 10 }} maxW="1180px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 6, md: 10 }} align="flex-start">
						{/* Left: sticky album info */}
						<Box width={{ base: "100%", lg: "300px" }} flexShrink={0} position={{ base: "static", lg: "sticky" }} top={{ lg: "88px" }}>
							<Heading size="xl" mb={3}>{album.title}</Heading>
							{album.description && <AlbumDescription text={album.description} />}
							<Text color="#8a8a8a" fontSize="sm" mt={3}>
								{media.length} item{media.length === 1 ? "" : "s"}
							</Text>
						</Box>

						{/* Right: photo grid */}
						<Box flex="1" width="100%">
							{media.length === 0 ? (
								<Text color="#888">No media in this album.</Text>
							) : (
								<Flex direction="column" gap={3}>
									{rows.slice(0, visibleRows).map((row, ri) => {
										const offset = rows.slice(0, ri).reduce((n, r) => n + r.length, 0)
										return (
											<Flex key={ri} gap={3} direction={{ base: "column", sm: row.length > 1 ? "row" : "column" }}>
												{row.map((m, ci) => (
													<Box key={m.url + ci} flex="1" minW={0}>
														<Tile
														m={m}
														index={offset + ci}
														height={row.length > 1 ? "220px" : "420px"}
														albumTitle={album.title}
														onOpen={setOpenIndex}
													/>
													</Box>
												))}
											</Flex>
										)
									})}
									{visibleRows < rows.length && (
										<Flex ref={sentinelRef} justify="center" py={6}>
											<Spinner size="sm" color="#F79432" />
										</Flex>
									)}
								</Flex>
							)}
						</Box>
					</Flex>
				)}
			</Box>

			{/* Access / interests dialogs */}
			{gateUi}

			{/* ── Lightbox ── */}
			{current && openIndex !== null && (
				<Box position="fixed" inset={0} zIndex={1400} bg="#131313" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
					<Flex align="center" justify="space-between" px={{ base: 3, md: 6 }} py={3}>
						<Button leftIcon={<FiX />} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.100" }} onClick={close}>
							Close
						</Button>
						<Box textAlign="center">
							<Text fontWeight="700" fontSize="sm">{album.title}</Text>
							<Text fontSize="xs" color="#9a9a9a">{openIndex + 1} of {media.length}</Text>
						</Box>
						<Flex gap={1}>
							<IconButton aria-label="Share this photo" icon={<FiShare2 />} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.100" }} onClick={() => sharePhoto(current)} />
							<IconButton aria-label="Download" icon={<FiDownload />} variant="ghost" color="white" _hover={{ bg: "whiteAlpha.100" }} onClick={() => downloadMedia(current)} />
							<IconButton
								aria-label="Tag people"
								icon={<FiTag />}
								variant="ghost"
								color="#F79432"
								_hover={{ bg: "whiteAlpha.100" }}
								onClick={() => { if (!canTag) { requireLoginToTag(album._id, current.url); return } setTagOpen(true) }}
							/>
						</Flex>
					</Flex>

					<Flex align="center" justify="center" position="relative" height="calc(100vh - 80px)" px={{ base: 2, md: 16 }}>
						{media.length > 1 && (
							<IconButton
								aria-label="Previous"
								icon={<FiChevronLeft />}
								position="absolute"
								left={{ base: 2, md: 6 }}
								borderRadius="full"
								bg="whiteAlpha.200"
								color="white"
								_hover={{ bg: "whiteAlpha.300" }}
								onClick={prev}
							/>
						)}
						{/* No autoPlay: unmuted autoplay is blocked and renders as a stalled player. */}
						{current.type === "video" ? (
							<Box as="video" src={current.url} controls maxH="100%" maxW="100%" sx={{ objectFit: "contain" }} borderRadius="12px" />
						) : (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={current.url} alt={album.title} loading="eager" decoding="async" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", borderRadius: "12px" }} />
						)}
						{media.length > 1 && (
							<IconButton
								aria-label="Next"
								icon={<FiChevronRight />}
								position="absolute"
								right={{ base: 2, md: 6 }}
								borderRadius="full"
								bg="whiteAlpha.200"
								color="white"
								_hover={{ bg: "whiteAlpha.300" }}
								onClick={next}
							/>
						)}
					</Flex>
				</Box>
			)}

			{/* Tagging — same component and rules as before, now in its own modal */}
			<Modal isOpen={tagOpen && !!current} onClose={() => setTagOpen(false)} isCentered size={{ base: "sm", md: "lg" }} scrollBehavior="inside">
				<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
				<ModalContent bg="#131313" color="white" border="1px solid #343536" borderRadius="12px">
					<ModalHeader>Tag people</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{current && (
							<PhotoTagging
								key={current.url}
								eventId={event._id}
								albumId={album._id}
								mediaUrl={current.url}
								canManage={canManage}
								canTag={canTag}
								onRequireLogin={requireLoginToTag}
								autoOpenTag
							/>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	)
}

/** Collapses a long album description behind "Show more", like the Airbnb tour. */
function AlbumDescription({ text }: { text: string }) {
	const [open, setOpen] = useState(false)
	const isLong = text.length > 160
	return (
		<Text color="#9a9a9a" fontSize="sm" lineHeight="1.5">
			{isLong && !open ? `${text.slice(0, 160)}… ` : `${text} `}
			{isLong && (
				<Text as="button" type="button" onClick={() => setOpen((v) => !v)} textDecoration="underline" color="white" fontWeight="600">
					{open ? "Show less" : "Show more"}
				</Text>
			)}
		</Text>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	try {
		await ensureDbConnected()
		const slug = context.params?.slug as string
		const albumId = context.params?.albumId as string
		if (!slug || !albumId || !Types.ObjectId.isValid(albumId)) return { notFound: true }

		// Same resolution order as the event page: exact → case-insensitive → raw → ObjectId.
		const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		let event: any =
			(await Events.findOne({ slug, isDeleted: false }).select("_id name slug ownerId").lean()) ||
			(await Events.findOne({ slug: { $regex: new RegExp(`^${escaped}$`, "i") }, isDeleted: false }).select("_id name slug ownerId").lean())

		if (!event && /^[0-9a-f]{24}$/i.test(slug)) {
			event = await Events.findOne({ _id: slug, isDeleted: false }).select("_id name slug ownerId").lean()
		}
		if (!event) return { notFound: true }

		const album: any = await EventAlbumsModel.findOne({
			_id: new Types.ObjectId(albumId),
			eventId: event._id,
			isDeleted: false,
		})
			.select("_id eventId title description media publishedAt publishNotifiedAt createdAt")
			.lean()
		if (!album) return { notFound: true }

		return {
			props: {
				album: JSON.stringify({
					_id: album._id.toString(),
					eventId: album.eventId.toString(),
					title: album.title,
					description: album.description || "",
					media: (album.media || []).map((m: any) => ({ url: m.url, type: m.type })),
				}),
				event: JSON.stringify({
					_id: event._id.toString(),
					name: event.name,
					slug: event.slug,
					ownerId: event.ownerId ? event.ownerId.toString() : null,
				}),
			},
		}
	} catch (error) {
		console.error("[album page] getServerSideProps error:", error)
		return { notFound: true }
	}
}
