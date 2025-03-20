// TicketQuantityInput.tsx
import { DOLLAR_SIGN } from "@Jetzy/lib/currency"
import { formatNumber } from "@Jetzy/lib/utilities"
import React, { useState } from "react"

interface TicketQuantityInputProps {
  initialValue?: number
  onChange?: (quantity: number) => void
  amount?: number
}

const TicketQuantityInput: React.FC<TicketQuantityInputProps> = ({ amount = 0, initialValue = 1, onChange }) => {
  const [quantity, setQuantity] = useState(initialValue)

  const handleIncrement = () => {
    setQuantity((prevQuantity) => Math.max(prevQuantity + 1, 1))
    onChange?.(quantity + 1)
  }

  const handleDecrement = () => {
    setQuantity((prevQuantity) => Math.max(prevQuantity - 1, 1))
    onChange?.(quantity - 1)
  }

  return (
    <>
      <div className="flex items-center justify-between w-full rounded-md border border-gray-300 px-3 py-2">
        <button type="button" className="text-gray-600 focus:outline-none hover:text-slate-400 bg-app rounded-3xl p-3 px-5 font-bold" onClick={handleDecrement}>
          -
        </button>
        <span className="text-sm font-bold text-slate-800 px-2">{quantity}</span>
        <button type="button" className="text-gray-600 focus:outline-none hover:text-slate-400 bg-app rounded-3xl p-3 px-5 font-bold" onClick={handleIncrement}>
          +
        </button>
      </div>
      <p className="text-sm text-gray-600 mt-2 font-bold text-center">
        Total: {DOLLAR_SIGN}
        {formatNumber(amount * quantity)}
      </p>
    </>
  )
}

export default TicketQuantityInput
