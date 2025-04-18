import React, { useState } from "react"
import ProgressBar from "./ProgressBar"
import { Error } from "@/lib/_toaster"
import { uniqueId } from "@/lib/utils"
import { useEdgeStore } from "@/lib/edgestore"
import EdgeStore from "@edgestore/react"

export type FileUploadData = {
	id: string
	file: string
}
interface FileUploadProps {
	onUpload?: (data: FileUploadData) => void // Callback function to handle uploaded file
	defaultImage?: string | null // Default image to show when no image is uploaded
	onDelete?: (data: FileUploadData) => void
	customId?: string
	uploadedFiles?: FileUploadData[]
}

const DragAndDropFileUpload: React.FC<FileUploadProps> = ({ onUpload, onDelete, customId, uploadedFiles, defaultImage = null }) => {
	const _customId = customId || uniqueId(10)

	const [progress, updateProgressBar] = useState(0)
	const [isVisibile, setIsVisible] = useState(true)

	const { edgestore } = useEdgeStore()

	const [dragOver, setDragOver] = useState(false)
	const [previewImage, setPreviewImage] = useState<null | string>(defaultImage)

	const handleUpload = async (file: File) => {
		try {
			let options: any

			if (uploadedFiles) {
				const uploadedFile = uploadedFiles.find((f) => f.id === _customId)
				if (uploadedFile) {
					options = {
						replaceTargetUrl: uploadedFile.file,
					}
				}
			}
			// upload the file to the server
			const res = await edgestore.publicFiles.upload({
				file,
				onProgressChange: (progress) => {
					// you can use this to show a progress bar
					updateProgressBar(progress)
				},
				options,
			})

			if (onUpload) onUpload({ id: _customId, file: res.url })
		} catch (error: unknown) {
			console.error("Error uploading file", error)

			Error("Error", "Failed to upload file")
		}
	}

	const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setDragOver(true)
	}

	const handleDragLeave = () => {
		setDragOver(false)
	}

	const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setDragOver(false)

		const droppedFile = e.dataTransfer?.files[0]

		if (!droppedFile) {
			return
		}

		if (!droppedFile.type.startsWith("image/")) {
			Error("Error", "Only image files are allowed!")
			console.error("Only image files are allowed!")
			return
		}

		const reader = new FileReader()
		reader.readAsDataURL(droppedFile)
		reader.onload = (event) => {
			if (event.target?.result) {
				setPreviewImage(event.target.result as string)
			}
		}

		handleUpload(droppedFile) // Call upload callback even before preview loads
	}

	const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0]

		if (!selectedFile) {
			return
		}

		if (!selectedFile.type.startsWith("image/")) {
			console.error("Only image files are allowed!")
			return
		}

		const reader = new FileReader()
		reader.readAsDataURL(selectedFile)
		reader.onload = (event) => {
			if (event.target?.result) {
				setPreviewImage(event.target.result as string)
			}
		}

		handleUpload(selectedFile) // Call upload callback even before preview loads
	}

	const fileInputRef = React.createRef<HTMLInputElement>()
	const toggleFileSelect = () => {
		if (fileInputRef?.current) fileInputRef.current.click()
	}

	const handleDelete = () => {
		setIsVisible(false)
		if (onDelete) onDelete({ id: _customId, file: "" })
	}

	if (!isVisibile) return null

	return (
		<section className={` relative rounded-lg border border-gray-300 p-4 h-fit cursor-pointer ${dragOver ? "bg-gray-100 hover:bg-gray-200" : "bg-white hover:bg-gray-50"}`}>
			{/* Delete (or Close) Button */}
			{defaultImage === null && <button className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-2xl focus:outline-none" onClick={handleDelete}>
				&times;
			</button>}
			<div onClick={toggleFileSelect} className={`drag-and-drop-container`} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}>
				<input ref={fileInputRef} type="file" accept="image/*" onChange={handleSelectFile} style={{ display: "none" }} />
				{previewImage ? (
					<>
						<ProgressBar progress={progress} />
						<img src={previewImage} alt="Uploaded Image Preview" className="w-full h-full object-cover rounded-lg mt-2" />
					</>
				) : dragOver ? (
					<p className="text-center text-gray-500 font-medium">Drop your image file here</p>
				) : (
					<>
						<p className="text-center text-gray-500 font-medium">Drag & Drop your image file</p>
						<p className="text-center text-gray-400 text-sm mt-2">or</p>
						<button type="button" className="text-center w-full text-app font-semibold hover:text-blue-600 focus:outline-none mt-2">
							Click to select
						</button>
					</>
				)}
			</div>
		</section>
	)
}

export default DragAndDropFileUpload
