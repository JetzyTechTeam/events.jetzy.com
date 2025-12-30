import { uniqueId } from "@/lib/utils"
import React, { useState } from "react"

export type TicketData = {
  id: string | number
  title: string
  price: number
  description: string
  disabled?: boolean
  dueDate?: string  // ISO date string
  quantityLimit?: number  // Max tickets available
  quantitySold?: number  // How many have been sold (read-only)
}

export interface TicketCardProps {
  onDelete?: (data: TicketData) => void
  onSave?: (data: TicketData) => void
  initialData?: TicketData
  isEditable?: boolean  // Allow editing after save
}

const TicketCard: React.FC<TicketCardProps> = ({ onDelete, onSave, initialData, isEditable = true }) => {
  const unquid = uniqueId(10)

  const defaultData = initialData || {
    id: unquid,
    title: "",
    price: 0,
    description: "",
    dueDate: "",
    quantityLimit: undefined,
    quantitySold: 0,
  }

  const [data, setData] = useState(defaultData)
  const [visible, setVisible] = useState(true)
  const [hasChanges, updateChanges] = useState(!initialData) // New tickets have changes by default
  const [isEditMode, setIsEditMode] = useState(!initialData) // New tickets start in edit mode

  const handleChange = (field: keyof typeof defaultData, value: string | number) => {
    setData((prev) => ({ ...prev, [field]: value }))
    updateChanges(true)
  }

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this ticket?")) {
      setVisible(false)
      if (onDelete) onDelete(data)
    }
  }

  const handleSave = () => {
    // Validation
    if (!data.title.trim()) {
      alert("Please enter a ticket title")
      return
    }

    if (data.price < 0) {
      alert("Price cannot be negative")
      return
    }

    if (data.quantityLimit && data.quantityLimit < 1) {
      alert("Quantity limit must be at least 1")
      return
    }

    if (onSave) {
      onSave(data)
    }
    updateChanges(false)
    setIsEditMode(false)
  }

  const handleEdit = () => {
    setIsEditMode(true)
    updateChanges(true)
  }

  const handleCancel = () => {
    if (initialData) {
      setData(initialData)
      setIsEditMode(false)
      updateChanges(false)
    } else {
      handleDelete()
    }
  }

  const formatPrice = (price: number) => {
    return price === 0 ? "" : price.toString()
  }

  const remainingTickets = data.quantityLimit
    ? (data.quantityLimit - (data.quantitySold || 0))
    : null

  const isExpired = data.dueDate && new Date(data.dueDate) < new Date()
  const isSoldOut = remainingTickets !== null && remainingTickets <= 0

  if (!visible) return null

  return (
    <div className={`relative max-w-sm mx-auto bg-[#272727] rounded-lg shadow-md p-6 space-y-4 ${(isExpired || isSoldOut) ? 'opacity-60' : ''}`}>
      {/* Status Badges */}
      <div className="absolute top-2 left-2 flex gap-2">
        {isExpired && (
          <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
            EXPIRED
          </span>
        )}
        {isSoldOut && !isExpired && (
          <span className="px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded">
            SOLD OUT
          </span>
        )}
        {remainingTickets !== null && remainingTickets > 0 && remainingTickets <= 10 && !isExpired && (
          <span className="px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">
            {remainingTickets} LEFT
          </span>
        )}
      </div>

      <button
        className="absolute top-2 right-2 text-2xl focus:outline-none hover:text-red-500 transition-colors"
        onClick={handleDelete}
        title="Delete ticket"
      >
        &times;
      </button>

      {/* Title */}
      <div>
        <label htmlFor={`ticket-title-${data.id}`} className="block font-bold mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id={`ticket-title-${data.id}`}
          type="text"
          value={data.title}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder="e.g., Early Bird, VIP, General Admission"
          disabled={!isEditMode}
          className={`bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
        />
      </div>

      {/* Price */}
      <div>
        <label htmlFor={`ticket-price-${data.id}`} className="block font-bold mb-1">
          Price ($) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
          <input
            id={`ticket-price-${data.id}`}
            type="number"
            min="0"
            step="0.01"
            value={formatPrice(data.price)}
            onChange={(e) => handleChange("price", e.target.value === "" ? 0 : Number(e.target.value))}
            placeholder="0.00"
            disabled={!isEditMode}
            className={`bg-[#1E1E1E] w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
          />
        </div>
        {data.price === 0 && (
          <p className="text-xs text-green-400 mt-1">Free ticket</p>
        )}
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor={`ticket-due-date-${data.id}`} className="block font-bold mb-1">
          Sales End Date (Optional)
        </label>
        <input
          id={`ticket-due-date-${data.id}`}
          type="datetime-local"
          value={data.dueDate || ""}
          onChange={(e) => handleChange("dueDate", e.target.value)}
          disabled={!isEditMode}
          className={`bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
        />
        <p className="text-xs text-gray-400 mt-1">
          When should this ticket tier stop being available?
        </p>
      </div>

      {/* Quantity Limit */}
      <div>
        <label htmlFor={`ticket-quantity-${data.id}`} className="block font-bold mb-1">
          Quantity Limit (Optional)
        </label>
        <input
          id={`ticket-quantity-${data.id}`}
          type="number"
          min="1"
          value={data.quantityLimit || ""}
          onChange={(e) => {
            const value = e.target.value === "" ? undefined : Number(e.target.value)
            if (value !== undefined) {
              handleChange("quantityLimit", value)
            } else {
              setData((prev) => ({ ...prev, quantityLimit: undefined }))
              updateChanges(true)
            }
          }}
          placeholder="Unlimited"
          disabled={!isEditMode}
          className={`bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
        />
        {data.quantityLimit && (
          <div className="mt-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Sold: {data.quantitySold || 0}</span>
              <span>Remaining: {remainingTickets}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((data.quantitySold || 0) / data.quantityLimit) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor={`ticket-description-${data.id}`} className="block font-bold mb-1">
          Description (Optional)
        </label>
        <textarea
          id={`ticket-description-${data.id}`}
          value={data.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Add details about what's included, restrictions, etc."
          disabled={!isEditMode}
          rows={3}
          className={`bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isEditMode ? (
          <>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex-1 py-2 px-4 rounded-md font-semibold focus:outline-none transition ${hasChanges ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
            >
              {initialData ? "Save Changes" : "Save Ticket"}
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2 px-4 rounded-md font-semibold bg-gray-600 hover:bg-gray-700 text-white focus:outline-none transition"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {isEditable && (
              <button
                onClick={handleEdit}
                className="flex-1 py-2 px-4 rounded-md font-semibold bg-yellow-500 hover:bg-yellow-600 text-black focus:outline-none transition"
              >
                Edit Ticket
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex-1 py-2 px-4 rounded-md font-semibold bg-red-500 hover:bg-red-600 text-white focus:outline-none transition"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default TicketCard
