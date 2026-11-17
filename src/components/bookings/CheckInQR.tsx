import React from "react"
import { QRCodeCanvas } from "qrcode.react"

type Props = {
	bookingRef: string
	/** `dark` for the checkout pop-up, `light` for the white /success card. */
	variant?: "dark" | "light"
}

/**
 * The guest's check-in QR, shown on the booking success screens so they can present it at the
 * door without opening the confirmation email.
 *
 * Encodes the BARE `bookingRef` — the exact payload of the emailed QR (`src/lib/qr-generator.ts`),
 * which the check-in scanner and `/api/check-in/validate` already accept. Callers render it only
 * for a CONFIRMED booking: check-in refuses a pending request, so a QR for one would only fail at
 * the door.
 */
const CheckInQR: React.FC<Props> = ({ bookingRef, variant = "dark" }) => {
	const dark = variant === "dark"
	return (
		<div
			className={`mx-auto max-w-xs rounded-xl p-4 text-center ${
				dark ? "border border-[#434343] bg-[#1E1E1E]" : "border border-gray-200 bg-gray-50"
			}`}
		>
			<p className={`mb-3 text-sm font-semibold ${dark ? "text-white" : "text-gray-800"}`}>Show this QR at check-in</p>
			<div className="mx-auto inline-block rounded-lg bg-white p-3">
				<QRCodeCanvas value={bookingRef} size={180} level="H" includeMargin={false} />
			</div>
			<p className={`mt-3 text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
				Ref: <span className={`font-mono ${dark ? "text-white" : "text-gray-800"}`}>{bookingRef}</span>
			</p>
			<p className={`mt-1 text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
				The same code is in your confirmation email. A screenshot works too.
			</p>
		</div>
	)
}

export default CheckInQR
