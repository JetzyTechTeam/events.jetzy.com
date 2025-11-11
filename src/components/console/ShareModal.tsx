import { useState } from "react"
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from "@chakra-ui/react"
import { FiShare2, FiCopy } from "react-icons/fi"

interface ShareModalProps {
	shareModal: boolean
	setShareModal: (shareModal: boolean) => void
	eventSlug: string
}

export function ShareModal({ shareModal, setShareModal, eventSlug }: ShareModalProps) {
	const [copied, setCopied] = useState(false)

	const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`

	const onCopy = () => {
		navigator.clipboard.writeText(sharelink).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<Modal isOpen={shareModal} onClose={() => setShareModal(false)} isCentered>
			<ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
			<ModalContent bg="white" color="#1F2937" mx={{ base: 4, md: 0 }} borderRadius="2xl" border="1px solid #E5E7EB" boxShadow="xl">
				<ModalHeader fontSize={{ base: "lg", md: "xl" }} borderBottom="1px solid #E5E7EB" pb={4}>
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
							<FiShare2 className="text-white text-lg" />
						</div>
						<span>Share Event</span>
					</div>
				</ModalHeader>
				<ModalCloseButton color="#6B7280" _hover={{ bg: "#F3F4F6" }} />
				<ModalBody pb={6} pt={6}>
					<div className="flex flex-col gap-4">
						<p className="font-semibold text-sm md:text-base text-gray-700">Share the link:</p>
						<div className="w-full bg-gradient-to-r from-green-50 to-green-100/50 border border-green-200 rounded-xl p-4 break-all text-xs md:text-sm text-gray-700 font-mono">{sharelink}</div>
						<button
							onClick={onCopy}
							className={`w-full py-3 rounded-xl font-semibold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
								copied
									? "bg-gradient-to-r from-green-500 to-green-600 text-white"
									: "bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg shadow-green-500/30"
							}`}
						>
							<FiCopy className="text-lg" />
							{copied ? "Copied!" : "Copy"}
						</button>
					</div>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}
