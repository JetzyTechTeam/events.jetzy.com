import type { MembershipKey } from "@/lib/memberships"
import { uniqueId } from "@/lib/utils"
import React, { useState } from "react"
import { blurOnWheel } from "@/lib/number-input"

export type TicketData = {
  id: string | number
  title: string
  price: number
  description: string
  /** Per-ticket approval override. `undefined` inherits the event-level setting. */
  requireApproval?: boolean
  /**
   * Memberships sold with this ticket. A buyer who doesn't already hold one pays the ticket
   * price plus that membership's first period; an existing member pays for the ticket alone.
   * Resolve with `ticketMemberships()` — never read either field directly.
   *
   * A bundled ticket MAY require approval: it is held as a `mode: "payment"` authorization
   * and the subscriptions are created once the host approves.
   */
  memberships?: MembershipKey[]
  /** @deprecated Superseded by `memberships`; still the fallback for tickets saved before it. */
  includesPremium?: boolean
}

export interface TicketCardProps {
  onDelete?: (data: TicketData) => void
  onSave?: (data: TicketData) => void
  initialData?: TicketData
}

const TicketCard: React.FC<TicketCardProps> = ({ onDelete, onSave, initialData }) => {
  const unquid = uniqueId(10)

	const defaultData = initialData || {
    id: unquid,
    title: "",
    price: 0,
    description: "",
  }

  const [data, setData] = useState(defaultData)
  const [visible, setVisible] = useState(true)
  const [hasChanges, updateChanges] = useState(false)

  const handleChange = (field: keyof typeof defaultData, value: string | number) => {
    setData((prev) => ({ ...prev, [field]: value }))
    updateChanges(true)
  }

  const handleDelete = () => {
    setVisible(false)
    if (onDelete) onDelete(data)
  }

  const handleSave = () => {
    if (onSave) {
      onSave(data)
    }
    updateChanges(false)
  }

  if (!visible) return null

  return (
    <div className="relative max-w-sm mx-auto bg-[#272727] rounded-lg shadow-md p-6 space-y-4">
      <button className="absolute top-2 right-2 text-2xl focus:outline-none" onClick={handleDelete}>
        &times;
      </button>

      <div>
        <label htmlFor="ticket-title" className="block font-bold mb-1">
          Title
        </label>
        <input
          id="ticket-title"
          type="text"
          value={data.title}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder="Enter ticket title"
          className="bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="ticket-price" className="block font-bold mb-1">
          Price ($)
        </label>
        <input
          id="ticket-price"
          type="number"
          onWheel={blurOnWheel}
          value={data.price}
          onChange={(e) => handleChange("price", Number(e.target.value))}
          placeholder="Enter price"
          className="bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="ticket-description" className="block font-bold mb-1">
          Description
        </label>
        <textarea
          id="ticket-description"
          value={data.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Enter description"
          className="bg-[#1E1E1E] w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`w-full py-2 px-4 rounded-md font-semibold focus:outline-none transition ${
            hasChanges ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-jetzy text-black cursor-not-allowed"
          }`}
        >
          Save
        </button>
      </div>
    </div>
  )
}

export default TicketCard
