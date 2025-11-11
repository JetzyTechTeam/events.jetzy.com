import { UploadImageSVG } from "@/assets/icons"
import { Box, Flex, Image, Spinner, Text, IconButton } from "@chakra-ui/react"
import React from "react"
import { FiX, FiPlus } from "react-icons/fi"

interface ImageUploadBoxProps {
	onImageChange: (files: FileList | null) => void
	isUploading: boolean
	uploadProgress: number
	handleImageDelete: (file: string) => void
	uploadedImages: {
		file: string
		id: string
	}[]
}

const ImageUploadBox: React.FC<ImageUploadBoxProps> = ({ onImageChange, isUploading, uploadProgress, uploadedImages, handleImageDelete }) => {
	const inputRef = React.useRef<HTMLInputElement>(null)
	const [placeholderCount, setPlaceholderCount] = React.useState(3) // Start with 3 placeholders

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onImageChange(e.target.files)
		e.target.value = ""
	}

	const handlePlaceholderClick = () => {
		if (!isUploading) {
			inputRef.current?.click()
		}
	}

	const handleAddPlaceholder = () => {
		setPlaceholderCount((prev) => prev + 1)
	}

	// Calculate how many empty placeholders to show
	const emptyPlaceholders = Math.max(0, placeholderCount - uploadedImages.length)

	return (
		<Flex gap={3} flexWrap="wrap" alignItems="center">
			{/* Display uploaded images */}
			{uploadedImages.map((image) => (
				<Box key={image.id} position="relative" width={{ base: "full", sm: "140px" }} height="140px" borderRadius="xl" overflow="hidden" border="1px" borderColor="#E5E7EB" bg="#FFFFFF">
					<Image src={image.file} alt="Preview" width="100%" height="100%" objectFit="cover" />
					{/* Delete button */}
					<IconButton aria-label="Delete image" icon={<FiX />} size="xs" colorScheme="red" position="absolute" top="2" right="2" borderRadius="full" onClick={() => handleImageDelete(image.file)} />
				</Box>
			))}

			{/* Show empty placeholder boxes */}
			{Array.from({ length: emptyPlaceholders }).map((_, index) => (
				<Box
					key={`placeholder-${index}`}
					width={{ base: "full", sm: "140px" }}
					height="140px"
					bg="#C4C4C4"
					borderRadius="xl"
					display="flex"
					flexDirection="column"
					justifyContent="center"
					alignItems="center"
					cursor={isUploading ? "not-allowed" : "pointer"}
					_hover={{ bg: isUploading ? "#C4C4C4" : "#B0B0B0" }}
					onClick={handlePlaceholderClick}
					transition="all 0.2s"
				>
					{isUploading && index === 0 ? (
						<Flex direction="column" alignItems="center">
							<Spinner size="lg" color="#8B5CF6" />
							<Text mt={2} fontSize="xs" color="#6B7280" fontWeight="600">
								{Math.round(uploadProgress)}%
							</Text>
						</Flex>
					) : (
						<Box display="flex" justifyContent="center" alignItems="center">
							<UploadImageSVG />
						</Box>
					)}
				</Box>
			))}

			{/* Add more button (+) - always visible */}
			<Box
				width={{ base: "full", sm: "48px" }}
				height="48px"
				bg="#FFFFFF"
				borderRadius="full"
				display="flex"
				justifyContent="center"
				alignItems="center"
				border="1px solid"
				borderColor="#D1D5DB"
				cursor="pointer"
				_hover={{ bg: "#F9FAFB", borderColor: "#8B5CF6" }}
				onClick={handleAddPlaceholder}
				transition="all 0.2s"
			>
				<FiPlus size={24} color="#8B5CF6" />
			</Box>

			{/* Hidden file input */}
			<input type="file" accept="image/png, image/jpeg, image/jpg" multiple ref={inputRef} style={{ display: "none" }} onChange={handleFileChange} />
		</Flex>
	)
}

export default ImageUploadBox
