import React, { useEffect, useRef, useState } from "react"
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
	useDisclosure,
	useToast,
} from "@chakra-ui/react"
import { FiPlus, FiShare2, FiEdit2, FiTrash2, FiImage, FiVideo, FiPlayCircle } from "react-icons/fi"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import Slider from "react-slick"
import { uploadFile } from "@/services/upload.service"
import { ROUTES } from "@/configs/routes"
import QRCodeModal from "@/components/events/QRCodeModal"

type MediaType = "image" | "video"
interface AlbumMedia {
	url: string
	type: MediaType
}
interface Album {
	_id: string
	eventId: string
	title: string
	description?: string
	media: AlbumMedia[]
	createdAt?: string
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

export default function EventAlbums({ eventId, eventSlug, eventName, canManage }: Props) {
	const { data: session, status } = useSession()
	const router = useRouter()
	const toast = useToast()
	const queryClient = useQueryClient()

	const createModal = useDisclosure()
	const galleryModal = useDisclosure()
	const shareModal = useDisclosure()
	const deleteDialog = useDisclosure()
	const cancelDeleteRef = useRef<HTMLButtonElement>(null)

	const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
	const [galleryAlbum, setGalleryAlbum] = useState<Album | null>(null)
	const [shareAlbum, setShareAlbum] = useState<Album | null>(null)
	const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Fetch albums (only when logged in — the endpoint requires auth)
	const {
		data: albums = [],
		isLoading,
	} = useQuery<Album[]>({
		queryKey: ["albums", eventId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/albums`)
			return res.data?.data || []
		},
		enabled: !!session,
	})

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["albums", eventId] })

	// ── Share-link deep-link: /{slug}?album=<id> ──
	// Not logged in → bounce to login (returns here, signup inherits _cb).
	useEffect(() => {
		const albumParam = router.query.album
		if (!albumParam || typeof albumParam !== "string") return
		if (status === "loading") return
		if (!session) {
			router.push(`${ROUTES?.login || "/login"}?_cb=${encodeURIComponent(router.asPath)}`)
			return
		}
		// Logged in: record access once per session (server also dedupes per user/album).
		const key = `album_access_${albumParam}`
		if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
			sessionStorage.setItem(key, "1")
			axios.post(`/api/events/${eventId}/albums/${albumParam}/access`).catch((e) => console.error("album access notify failed", e))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.album, status, session])

	// Open the shared album's gallery once albums are loaded. Guarded by a ref so it
	// auto-opens only ONCE per deep-linked id — otherwise a React Query refetch (e.g.
	// on window focus) would re-open the modal after the user closed it.
	const deepLinkOpenedRef = useRef<string | null>(null)
	useEffect(() => {
		const albumParam = router.query.album
		if (!albumParam || typeof albumParam !== "string" || !session) return
		if (deepLinkOpenedRef.current === albumParam) return
		const match = albums.find((a) => a._id === albumParam)
		if (match) {
			deepLinkOpenedRef.current = albumParam
			setGalleryAlbum(match)
			galleryModal.onOpen()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [albums, router.query.album, session])

	const openCreate = () => {
		setEditingAlbum(null)
		createModal.onOpen()
	}
	const openEdit = (album: Album) => {
		setEditingAlbum(album)
		createModal.onOpen()
	}
	const openGallery = (album: Album) => {
		setGalleryAlbum(album)
		galleryModal.onOpen()
	}
	const openShare = (album: Album) => {
		setShareAlbum(album)
		const url = `${window.location.origin}/${eventSlug}?album=${album._id}`
		navigator.clipboard?.writeText(url).catch(() => {})
		toast({ title: "Album Link Copied!", description: "Recipients must log in or sign up to view it.", status: "success", duration: 2500, isClosable: true })
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
					{status === "loading" ? (
						<Flex justify="center" py={10}><Spinner color="#F79432" /></Flex>
					) : !session ? (
						<Box p={8} textAlign="center" bg="#2b2b2b" borderRadius="lg" border="1px solid" borderColor="#434343">
							<Text fontSize="lg" fontWeight="bold" color="white" mb={2}>Login Required</Text>
							<Text color="#bbbbbb" mb={4}>Please log in or sign up to view this event&apos;s albums.</Text>
							<Button
								onClick={() => router.push(`${ROUTES?.login || "/login"}?_cb=${encodeURIComponent(router.asPath)}`)}
								bg="#F79432"
								color="black"
								_hover={{ bg: "#e58220" }}
							>
								Login
							</Button>
						</Box>
					) : isLoading ? (
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
														<video src={cover} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} muted />
														<Icon as={FiPlayCircle} color="whiteAlpha.900" boxSize={8} position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" />
													</>
												) : (
													<Image src={cover} alt={album.title} position="absolute" inset={0} width="100%" height="100%" objectFit="cover" />
												)
											) : (
												<Flex position="absolute" inset={0} align="center" justify="center"><Icon as={FiImage} color="#444" boxSize={7} /></Flex>
											)}
											<Box position="absolute" bottom={0} left={0} right={0} bgGradient="linear(to-t, blackAlpha.800, transparent)" px={2} py={2}>
												<Text color="white" fontSize="sm" fontWeight="600" noOfLines={1}>{album.title}</Text>
												<Text color="#cfcfcf" fontSize="xs">{album.media.length} item{album.media.length === 1 ? "" : "s"}</Text>
											</Box>
										</Box>
										{canManage && (
											<Flex position="absolute" top={1.5} right={1.5} gap={1} onClick={(e) => e.stopPropagation()}>
												<IconButton aria-label="Share album" icon={<FiShare2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="white" _hover={{ bg: "blackAlpha.900" }} onClick={() => openShare(album)} />
												<IconButton aria-label="Edit album" icon={<FiEdit2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="white" _hover={{ bg: "blackAlpha.900" }} onClick={() => openEdit(album)} />
												<IconButton aria-label="Delete album" icon={<FiTrash2 />} size="xs" borderRadius="full" bg="blackAlpha.700" color="#ff8080" _hover={{ bg: "blackAlpha.900" }} onClick={() => openDelete(album)} />
											</Flex>
										)}
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

			{/* Gallery modal */}
			<AlbumGalleryModal isOpen={galleryModal.isOpen} onClose={() => { galleryModal.onClose(); setGalleryAlbum(null) }} album={galleryAlbum} />

			{/* Share QR modal */}
			{shareAlbum && (
				<QRCodeModal
					isOpen={shareModal.isOpen}
					onClose={() => { shareModal.onClose(); setShareAlbum(null) }}
					url={`${typeof window !== "undefined" ? window.location.origin : ""}/${eventSlug}?album=${shareAlbum._id}`}
					title={`${eventName} — ${shareAlbum.title}`}
				/>
			)}

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

// ─────────────────────────── Gallery modal ───────────────────────────
function AlbumGalleryModal({ isOpen, onClose, album }: { isOpen: boolean; onClose: () => void; album: Album | null }) {
	const settings = {
		infinite: (album?.media.length || 0) > 1,
		speed: 400,
		slidesToShow: 1,
		slidesToScroll: 1,
		adaptiveHeight: true,
		beforeChange: () => { document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => v.pause()) },
	}
	return (
		<Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.800" />
			<ModalContent bg="#111" color="white" border="1px solid #333">
				<ModalHeader>{album?.title}</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					{album?.description ? <Text color="#bbb" fontSize="sm" mb={4}>{album.description}</Text> : null}
					{album && album.media.length > 0 ? (
						<Box className="album-gallery-slider" sx={{ ".slick-prev:before, .slick-next:before": { color: "#F79432" }, ".slick-dots li button:before": { color: "#F79432" } }}>
							<Slider {...settings}>
								{album.media.map((m, i) => (
									<Box key={i} display="flex !important" alignItems="center" justifyContent="center" bg="#000" borderRadius="lg" overflow="hidden">
										{m.type === "video" ? (
											<video src={m.url} controls style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#000" }} />
										) : (
											<img src={m.url} alt={`media-${i}`} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#000" }} />
										)}
									</Box>
								))}
							</Slider>
						</Box>
					) : (
						<Text color="#888">No media in this album.</Text>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
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

					{/* Staged media grid */}
					{staged.length > 0 && (
						<SimpleGrid columns={{ base: 3, sm: 4 }} spacing={3} mt={3}>
							{staged.map((s) => (
								<Box key={s.tempId} position="relative" width="100%" pt="100%" borderRadius="md" overflow="hidden" bg="#0f0f0f" border="1px solid #2a2a2a">
									{s.url ? (
										s.type === "video" ? (
											<video src={s.url} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} muted />
										) : (
											<img src={s.url} alt="staged" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
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
									<IconButton aria-label="Remove" icon={<FiTrash2 />} size="xs" position="absolute" top="2px" right="2px" minW="20px" h="20px" p={0} bg="blackAlpha.800" color="white" _hover={{ bg: "red.600" }} onClick={() => removeStaged(s)} />
								</Box>
							))}
						</SimpleGrid>
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
