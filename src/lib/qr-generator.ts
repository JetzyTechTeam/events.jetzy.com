import QRCode from 'qrcode'
import crypto from 'crypto'

/**
 * Generate a unique QR code token for a booking
 */
export function generateQRCodeToken(bookingId: string, eventId: string): string {
	// Generate a secure random token
	const randomBytes = crypto.randomBytes(16).toString('hex')
	const timestamp = Date.now().toString(36)

	// Combine booking ID, event ID, timestamp, and random bytes for uniqueness
	return `${bookingId}-${eventId}-${timestamp}-${randomBytes}`
}

/**
 * Generate QR code data URL (base64 image) from a token
 */
export async function generateQRCodeDataUrl(token: string, baseUrl?: string): Promise<string> {
	try {
		// Validate token
		if (!token || token.trim() === '') {
			throw new Error('Token is required for QR code generation')
		}

		// Create a URL to the ticket details page
		// This allows scanning to directly show all ticket information
		const appUrl = baseUrl || process.env.NEXT_PUBLIC_URL

		if (!appUrl) {
			throw new Error("NEXT_PUBLIC_URL environment variable is required for QR code generation")
		}

		// Ensure URL doesn't have trailing slash
		const cleanBaseUrl = appUrl.replace(/\/$/, '')
		const ticketUrl = `${cleanBaseUrl}/ticket/${token}`

		console.log('[generateQRCodeDataUrl] Generating QR code with ticket URL:', ticketUrl)
		console.log('[generateQRCodeDataUrl] QR payload length:', ticketUrl.length)

		// Validate payload length (QR codes have size limits - typically ~3000 chars for high error correction)
		if (ticketUrl.length > 2000) {
			console.warn('[generateQRCodeDataUrl] QR payload is very long:', ticketUrl.length, 'characters')
		}

		// Use the ticket URL as the QR code payload
		const qrPayload = ticketUrl

		// Generate QR code as data URL
		// Using high error correction and optimized settings for email compatibility
		const dataUrl = await QRCode.toDataURL(qrPayload, {
			errorCorrectionLevel: 'H',
			type: 'image/png',
			margin: 1,
			width: 300,
			color: {
				dark: '#000000',
				light: '#FFFFFF',
			},
		})

		// Verify data URL was generated
		if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
			throw new Error('Invalid QR code data URL generated')
		}

		console.log('[generateQRCodeDataUrl] QR code generated successfully, length:', dataUrl.length)
		return dataUrl
	} catch (error) {
		console.error('[generateQRCodeDataUrl] Error generating QR code:', error)
		throw new Error('Failed to generate QR code')
	}
}

/**
 * Generate QR code and return both token and image URL
 */
export async function generateQRCodeForBooking(
	bookingId: string,
	eventId: string,
	baseUrl?: string
): Promise<{ token: string; imageUrl: string }> {
	console.log('[generateQRCodeForBooking] Generating QR code for booking:', bookingId, 'event:', eventId)

	const token = generateQRCodeToken(bookingId, eventId)
	console.log('[generateQRCodeForBooking] Token generated:', token.substring(0, 50) + '...')

	const imageUrl = await generateQRCodeDataUrl(token, baseUrl)
	console.log('[generateQRCodeForBooking] QR code image generated, length:', imageUrl.length)

	return { token, imageUrl }
}

/**
 * Extract token from QR code payload
 * Handles formats like:
 * - URL: "{baseUrl}/ticket/token" (e.g., "https://events.jetzy.com/ticket/token" or "http://localhost:3000/ticket/token")
 * - Direct: "JETZY:token" or just "token"
 */
export function extractTokenFromQRPayload(qrPayload: string): string | null {
	if (!qrPayload || typeof qrPayload !== 'string') {
		return null
	}

	// Handle URL format: extract token from /ticket/[token] path
	const urlMatch = qrPayload.match(/\/ticket\/([^\/\s?#]+)/i)
	if (urlMatch && urlMatch[1]) {
		const tokenFromUrl = urlMatch[1]
		// Remove "JETZY:" prefix if present in the token
		return tokenFromUrl.replace(/^JETZY:/i, '').trim()
	}

	// Handle direct token format: "JETZY:token" or just "token"
	const cleaned = qrPayload.replace(/^JETZY:/i, '').trim()

	if (!cleaned) {
		return null
	}

	return cleaned
}
