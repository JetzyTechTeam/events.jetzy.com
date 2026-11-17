import React, { useEffect, useState } from "react"
import {
	Box,
	Button,
	Card,
	CardBody,
	Heading,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalOverlay,
	Stack,
	Text,
	useDisclosure,
	useToast,
} from "@chakra-ui/react"
import { QRCodeCanvas } from "qrcode.react"
import { eventUrl } from "@/lib/event-slug"

const PHONE = "@media screen and (max-width: 47.99em)"

type Props = {
	slug: string
	eventName?: string
	/** False when guests can't buy right now (pending review, draft, ended) — shows a note instead. */
	salesOpen: boolean
}

/**
 * "No ticket? Scan to buy" — the walk-in QR under the check-in portal.
 *
 * Encodes `<event url>?buy=1`. The EVENT PAGE decides what that means when the guest scans
 * (`EventTicketsComponent`): one ticket → its checkout opens, several → they pick one. Deciding
 * here instead would go stale the moment a host adds or sells out a ticket while the door
 * screen is open.
 *
 * Built from `window.location.origin` so staging and prod each encode their own domain.
 */
const WalkInTicketQR: React.FC<Props> = ({ slug, eventName, salesOpen }) => {
	const toast = useToast()
	const fullScreen = useDisclosure()
	const [url, setUrl] = useState("")

	useEffect(() => {
		if (!slug) return
		setUrl(`${eventUrl(window.location.origin, slug)}?buy=1`)
	}, [slug])

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(url)
			toast({ title: "Link copied", status: "success", duration: 2000, isClosable: true })
		} catch {
			toast({ title: "Could not copy link", status: "error", duration: 2000, isClosable: true })
		}
	}

	return (
		<Box maxW="600px" mx="auto" p={4} mt={2} sx={{ [PHONE]: { padding: 0, marginTop: "16px" } }}>
			<Card bg="#1E1E1E" border="1px solid #434343">
				<CardBody>
					<Heading size="md" color="white" mb={1}>
						No ticket? Scan to buy
					</Heading>
					{!salesOpen ? (
						<Text fontSize="sm" color="#9C9C9C">
							Ticket sales aren&apos;t open for this event, so there is no buy link to show.
						</Text>
					) : (
						<>
							<Text fontSize="sm" color="#9C9C9C" mb={4}>
								Let the guest scan this with their phone camera. It opens checkout for the ticket; if the event has
								more than one ticket, they pick one first.
							</Text>
							<Stack direction={{ base: "column", md: "row" }} spacing={5} align="center">
								<Box p={3} bg="white" borderRadius="xl" flexShrink={0}>
									{url ? <QRCodeCanvas value={url} size={200} level="H" includeMargin={false} /> : <Box w="200px" h="200px" />}
								</Box>
								<Stack spacing={3} w={{ base: "100%", md: "auto" }} flex={1}>
									<Button
										bg="#F79432"
										color="black"
										_hover={{ bg: "#e58220" }}
										onClick={fullScreen.onOpen}
										isDisabled={!url}
										w="100%"
									>
										Show full screen
									</Button>
									<Button
										variant="outline"
										borderColor="#434343"
										color="white"
										_hover={{ bg: "whiteAlpha.100" }}
										onClick={copyLink}
										isDisabled={!url}
										w="100%"
									>
										Copy link
									</Button>
								</Stack>
							</Stack>
						</>
					)}
				</CardBody>
			</Card>

			{/* Big enough to scan from arm's length when the host turns the screen to the guest. */}
			<Modal isOpen={fullScreen.isOpen} onClose={fullScreen.onClose} size="full">
				<ModalOverlay />
				<ModalContent bg="#0A0B0F" color="white">
					<ModalCloseButton size="lg" />
					<ModalBody display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={6} py={10}>
						<Heading size="lg" textAlign="center">
							Scan to buy a ticket
						</Heading>
						{eventName && (
							<Text color="#bbbbbb" textAlign="center" maxW="480px">
								{eventName}
							</Text>
						)}
						<Box p={4} bg="white" borderRadius="2xl" w="min(80vw, 60vh, 420px)" sx={{ "& canvas": { width: "100% !important", height: "auto !important" } }}>
							{url && <QRCodeCanvas value={url} size={420} level="H" includeMargin={false} />}
						</Box>
						<Button variant="outline" borderColor="#434343" color="white" _hover={{ bg: "whiteAlpha.100" }} onClick={fullScreen.onClose}>
							Done
						</Button>
					</ModalBody>
				</ModalContent>
			</Modal>
		</Box>
	)
}

export default WalkInTicketQR
