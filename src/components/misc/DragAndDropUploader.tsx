import React, { useState } from "react"
import ProgressBar from "./ProgressBar"

interface FileUploadProps {
  onUpload: (file: File) => void // Callback function to handle uploaded file
  progress?: number // Progress of file upload (0-100)
}

const DragAndDropFileUpload: React.FC<FileUploadProps> = ({ onUpload, progress = 0 }) => {
  const [dragOver, setDragOver] = useState(false)
  const [previewImage, setPreviewImage] = useState<null | string>(null)

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

    onUpload(droppedFile) // Call upload callback even before preview loads
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

    onUpload(selectedFile) // Call upload callback even before preview loads
  }

  const fileInputRef = React.createRef<HTMLInputElement>()
  const toggleFileSelect = () => {
    if (fileInputRef?.current) fileInputRef.current.click()
  }

  return (
    <div className={`drag-and-drop-container relative rounded-lg border border-gray-300 p-4 cursor-pointer ${dragOver ? "bg-gray-100 hover:bg-gray-200" : "bg-white hover:bg-gray-50"}`} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleSelectFile} style={{ display: "none" }} />
      {previewImage ? (
        <>
          <ProgressBar progress={progress as number} />
          <img src={previewImage} alt="Uploaded Image Preview" className="w-full h-full object-cover rounded-lg mt-2" />
        </>
      ) : dragOver ? (
        <p className="text-center text-gray-500 font-medium">Drop your image file here</p>
      ) : (
        <>
          <p className="text-center text-gray-500 font-medium">Drag & Drop your image file</p>
          <p className="text-center text-gray-400 text-sm mt-2">or</p>
          <button onClick={toggleFileSelect} type="button" className="text-center w-full text-app font-semibold hover:text-blue-600 focus:outline-none mt-2">
            Click to select
          </button>
        </>
      )}
    </div>
  )
}

export default DragAndDropFileUpload
