import { uniqueId } from "@/lib/utils"
import React, { useState } from "react"

export type TicketData = {
	id: string | number
	title: string
	price: number
	description: string
}

export interface TicketCardProps {
	onDelete?: (data: TicketData) => void
	onSave?: (data: TicketData) => void
}

const TicketCard: React.FC<TicketCardProps> = ({ onDelete, onSave }) => {
	const unquid = uniqueId(10)
	// Default state values; these act as the initial values
	let defaultData = {
		id: unquid,
		title: "",
		price: 0,
		description: "",
	}

	const [data, setData] = useState(defaultData)
	const [visible, setVisible] = useState(true)

	const handleChange = (field: keyof typeof defaultData, value: string | number) => {
		setData((prev) => ({ ...prev, [field]: value }))
		updateChanges(true)
	}

	// Button is enabled if any field differs from its default value.
	const [hasChanges, updateChanges] = useState(data.title !== defaultData.title || data.price !== defaultData.price || data.description !== defaultData.description)

	const handleDelete = () => {
		setVisible(false)
		if (onDelete) onDelete(data)
	}

	const handleSave = () => {
		if (onSave) {
			onSave(data)
		}
		// Optionally, you might want to update defaultData here or clear the changes.
		updateChanges(false)
	}

	if (!visible) return null

	return (
		<div className="relative max-w-sm mx-auto bg-white rounded-lg shadow-md p-6 space-y-4">
			{/* Delete (or Close) Button */}
			<button className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-2xl focus:outline-none" onClick={handleDelete}>
				&times;
			</button>

			{/* Title Input */}
			<div>
				<label htmlFor="ticket-title" className="block text-gray-700 font-bold mb-1">
					Title
				</label>
				<input
					id="ticket-title"
					type="text"
					value={data.title}
					onChange={(e) => handleChange("title", e.target.value)}
					placeholder="Enter ticket title"
					className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			{/* Price Input */}
			<div>
				<label htmlFor="ticket-price" className="block text-gray-700 font-bold mb-1">
					Price ($)
				</label>
				<input
					id="ticket-price"
					type="number"
					defaultValue={data.price}
					onChange={(e) => handleChange("price", Number(e.target.value))}
					placeholder="Enter price"
					className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			{/* Description Input */}
			<div>
				<label htmlFor="ticket-description" className="block text-gray-700 font-bold mb-1">
					Description
				</label>
				<textarea
					id="ticket-description"
					value={data.description}
					onChange={(e) => handleChange("description", e.target.value)}
					placeholder="Enter description"
					className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			{/* Save Button */}
			<div>
				<button
					onClick={handleSave}
					disabled={!hasChanges}
					className={`w-full py-2 px-4 rounded-md font-semibold focus:outline-none transition ${
						hasChanges ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-300 text-gray-600 cursor-not-allowed"
					}`}
				>
					Save
				</button>
			</div>
		</div>
	)
}

export default TicketCard
