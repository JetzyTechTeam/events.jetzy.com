import QRCode from 'qrcode'

/**
 * Generates a QR code as a base64 PNG data URI for a booking.
 * The QR encodes the bookingRef (e.g., "JZ-abc123").
 * Admin check-in portal accepts bookingRef as an identifier via /api/check-in/validate.
 */
export async function generateQRCodeForBooking(bookingRef: string): Promise<string> {
  return QRCode.toDataURL(bookingRef, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'H',
  })
}
