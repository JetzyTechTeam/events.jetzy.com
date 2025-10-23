# Event Check-In System Documentation

## Overview

The Event Check-In System is a real-time attendee validation and check-in management tool designed for event administrators. It provides a mobile-optimized interface for validating bookings, recording guest arrivals, and preventing over-check-in or duplicate entries.

---

## Features

### ✅ Core Functionality

1. **Booking Validation**

   - Search by email or booking reference
   - Real-time validation against booking database
   - Display comprehensive booking information
   - Show current check-in status

2. **Check-In Recording**

   - Record number of guests checking in
   - Partial check-in support (for groups)
   - Check-in history tracking
   - Timestamp and admin tracking

3. **Edge Case Handling**

   - Over-check-in prevention (cannot exceed purchased tickets)
   - Duplicate check-in tracking
   - Partial check-in support
   - Clear error messaging

4. **Statistics Dashboard**

   - Total bookings
   - Total tickets purchased
   - Guests checked in (with percentage)
   - Remaining guests
   - Real-time updates (30-second intervals)

5. **OCR Scanner (Ready for Implementation)**
   - Camera access for scanning
   - Text extraction from QR codes or printed text
   - Manual entry fallback option

---

## System Architecture

### Data Models

#### CheckIn Model (`/src/models/checkIn.ts`)

```typescript
{
  bookingId: ObjectId          // Reference to Bookings
  eventId: ObjectId            // Reference to Events
  bookingRef: string           // e.g., "JZ-ABC123"
  customerEmail: string        // For quick lookups
  customerName: string         // Display name
  totalTickets: number         // Total purchased
  checkedInCount: number       // Current check-in count
  checkInHistory: [{
    count: number              // Guests in this check-in
    timestamp: Date            // When checked in
    adminId: string            // Who checked them in
    adminName: string          // Admin display name
  }]
  firstCheckInAt: Date         // First check-in timestamp
  lastCheckInAt: Date          // Most recent check-in
  isFullyCheckedIn: boolean    // All tickets used?
}
```

**Indexes:**

- `bookingId` (unique)
- `eventId`, `customerEmail` (compound)
- `eventId`, `bookingRef` (compound)

---

## API Endpoints

### 1. Validate Booking

**Endpoint:** `POST /api/check-in/validate`

**Purpose:** Validate a booking exists and retrieve check-in status

**Request Body:**

```json
{
	"eventId": "string",
	"identifier": "email@example.com OR JZ-ABC123"
}
```

**Response (Success):**

```json
{
  "status": true,
  "message": "Booking validated successfully",
  "data": {
    "bookingId": "...",
    "bookingRef": "JZ-ABC123",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "+1234567890",
    "totalTickets": 5,
    "checkedInCount": 2,
    "remainingTickets": 3,
    "isFullyCheckedIn": false,
    "firstCheckInAt": "2025-10-20T10:00:00Z",
    "lastCheckInAt": "2025-10-20T10:00:00Z",
    "checkInHistory": [...],
    "bookingStatus": "confirmed"
  }
}
```

**Response (Not Found):**

```json
{
	"status": false,
	"message": "No booking found for this event with the provided email or booking reference",
	"code": 404
}
```

---

### 2. Record Check-In

**Endpoint:** `POST /api/check-in/record`

**Purpose:** Record guest check-in

**Request Body:**

```json
{
	"bookingId": "string",
	"eventId": "string",
	"count": 2
}
```

**Response (Success):**

```json
{
  "status": true,
  "message": "Successfully checked in 2 guests",
  "data": {
    "bookingId": "...",
    "bookingRef": "JZ-ABC123",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "totalTickets": 5,
    "checkedInCount": 4,
    "remainingTickets": 1,
    "isFullyCheckedIn": false,
    "lastCheckInAt": "2025-10-23T15:30:00Z",
    "checkInHistory": [...]
  }
}
```

**Response (Over-Check-In Error):**

```json
{
	"status": false,
	"message": "Cannot check in 3 guests. Only 1 tickets remaining.",
	"data": {
		"totalTickets": 5,
		"currentCheckedIn": 4,
		"remainingTickets": 1,
		"requestedCount": 3
	},
	"code": 400
}
```

---

### 3. Check-In Statistics

**Endpoint:** `GET /api/check-in/stats?eventId={eventId}`

**Purpose:** Get real-time check-in statistics for an event

**Response:**

```json
{
	"status": true,
	"message": "Check-in statistics retrieved successfully",
	"data": {
		"totalBookings": 50,
		"totalTicketsBooked": 150,
		"totalGuestsCheckedIn": 120,
		"remainingGuests": 30,
		"fullyCheckedInBookings": 35,
		"partiallyCheckedInBookings": 10,
		"notCheckedInBookings": 5,
		"checkInPercentage": "80.00"
	}
}
```

---

## User Interface

### Check-In Portal Page

**Location:** `/console/events/[eventId]/check-in`

**Components:**

1. **CheckInStats** (`/src/components/CheckInStats.tsx`)

   - Real-time statistics display
   - Auto-refreshes every 30 seconds
   - 4 stat cards: Bookings, Tickets, Checked In, Remaining

2. **CheckInPortal** (`/src/components/CheckInPortal.tsx`)
   - Search input (email or booking ref)
   - Camera scan button
   - Booking information display
   - Check-in action interface
   - Check-in history

---

## User Flow

### Happy Path

1. **Admin opens check-in portal**

   - Navigate to event management
   - Click "Check-In Portal" button
   - View statistics dashboard

2. **Search for attendee**

   - Enter email or booking reference
   - Click "Validate" (or press Enter)
   - System searches database

3. **View booking details**

   - Name, email, phone displayed
   - Total tickets vs checked-in count
   - Remaining tickets highlighted
   - Check-in history visible

4. **Record check-in**

   - Select number of guests checking in
   - Click "Check In" button
   - System validates count against remaining tickets
   - Updates database atomically
   - Shows success confirmation

5. **Search next attendee**
   - Click "Search Another Booking"
   - Repeat process

---

## Edge Cases Handled

### 1. Over-Check-In Prevention

**Scenario:** Admin tries to check in more guests than tickets purchased

**Handling:**

- Validation before saving
- Clear error message with details
- Shows remaining ticket count
- Prevents database update

**Example:**

```
Purchased: 5 tickets
Already checked in: 4
Admin tries to check in: 3
Result: ERROR - "Cannot check in 3 guests. Only 1 tickets remaining."
```

---

### 2. Partial Check-Ins

**Scenario:** Group arrives in phases

**Handling:**

- Allow multiple check-ins for same booking
- Track each check-in separately in history
- Update cumulative count
- Mark as "Partially Checked In" until all guests arrive

**Example:**

```
Purchased: 10 tickets
First check-in: 5 guests (Status: Partially Checked In)
Second check-in: 3 guests (Status: Partially Checked In)
Third check-in: 2 guests (Status: Fully Checked In)
```

---

### 3. Duplicate Prevention

**Scenario:** Admin scans same booking multiple times

**Handling:**

- Shows current check-in status immediately
- Displays check-in history with timestamps
- Only allows check-in if remaining tickets > 0
- If fully checked in, shows "Fully Checked In" badge

---

### 4. Invalid Identifiers

**Scenario:** Email or booking ref doesn't exist

**Handling:**

- Clear error message: "No booking found..."
- No partial matches
- Case-insensitive search
- Trimmed whitespace

---

### 5. Unauthorized Access

**Scenario:** Non-admin user tries to access

**Handling:**

- Server-side auth check
- 401/403 response codes
- Redirect to login if not authenticated
- "Access denied" if not admin role

---

## OCR Scanner Implementation

### Current State

The UI includes camera modal with:

- Camera access request
- Video preview
- Capture button
- Canvas for image processing

### To Complete OCR Integration

**Step 1: Install Tesseract.js** (if needed)

```bash
npm install tesseract.js@2.1.4 --legacy-peer-deps
```

**Step 2: Add OCR logic to CheckInPortal.tsx**

```typescript
import { createWorker } from "tesseract.js"

const captureImage = async () => {
	if (!videoRef.current || !canvasRef.current) return

	const canvas = canvasRef.current
	const video = videoRef.current
	const context = canvas.getContext("2d")

	if (!context) return

	canvas.width = video.videoWidth
	canvas.height = video.videoHeight
	context.drawImage(video, 0, 0, canvas.width, canvas.height)

	// Initialize Tesseract worker
	const worker = await createWorker()
	await worker.loadLanguage("eng")
	await worker.initialize("eng")

	// Recognize text
	const {
		data: { text },
	} = await worker.recognize(canvas)

	// Extract email or booking reference
	const emailRegex = /[\w.-]+@[\w.-]+\.\w+/
	const bookingRefRegex = /JZ-[A-Z0-9]+/i

	const emailMatch = text.match(emailRegex)
	const refMatch = text.match(bookingRefRegex)

	if (emailMatch) {
		setIdentifier(emailMatch[0])
	} else if (refMatch) {
		setIdentifier(refMatch[0])
	} else {
		toast({
			title: "No Match Found",
			description: "Please enter manually",
			status: "warning",
			duration: 3000,
		})
	}

	await worker.terminate()
	stopCamera()

	// Auto-validate if found
	if (emailMatch || refMatch) {
		handleValidate()
	}
}
```

---

## Security Considerations

### Authentication

- NextAuth session required
- Admin role verification on every API call
- Server-side validation (never trust client)

### Authorization

- Event-specific access control (future enhancement)
- Admin can check in for any event currently
- Consider event-specific admin roles

### Data Validation

- Input sanitization (trim, lowercase)
- Type checking (TypeScript + runtime)
- Regex validation for identifiers
- Count validation (min: 1, max: remaining tickets)

---

## Performance Optimizations

1. **Database Indexes**

   - Fast lookups by bookingId, email, bookingRef
   - Compound indexes for common queries

2. **Atomic Updates**

   - Check-in count updates are atomic
   - Prevents race conditions

3. **Client-Side Caching**

   - React Query for API calls
   - 30-second auto-refresh for stats
   - Stale-while-revalidate pattern

4. **Mobile Optimization**
   - Responsive design (Chakra UI)
   - Touch-friendly buttons
   - Fast camera access
   - Minimal dependencies

---

## Future Enhancements

### Short Term

1. ✅ Complete Tesseract.js OCR integration
2. QR code generation for bookings
3. Export check-in reports (CSV/PDF)
4. Real-time WebSocket updates

### Long Term

1. Offline mode with sync
2. Multi-language support
3. Check-in kiosk mode
4. NFC/RFID integration
5. Facial recognition check-in
6. Event-specific admin roles
7. Check-in analytics dashboard

---

## Troubleshooting

### Common Issues

**1. "Booking not found" error**

- Verify event ID is correct
- Check email/ref spelling
- Ensure booking is confirmed (not cancelled)
- Check if booking is for different event

**2. Camera not working**

- Check browser permissions
- HTTPS required for camera access
- Try different browser
- Check device camera settings

**3. Check-in not saving**

- Check network connection
- Verify admin authentication
- Check browser console for errors
- Ensure count is valid (1 to remaining)

**4. Statistics not updating**

- Wait 30 seconds for auto-refresh
- Manually refresh page
- Check API endpoint connectivity

---

## Testing Checklist

### Manual Testing

- [ ] Validate booking by email
- [ ] Validate booking by booking reference
- [ ] Check in 1 guest
- [ ] Check in multiple guests
- [ ] Try to over-check-in (should fail)
- [ ] Check in guests partially over multiple sessions
- [ ] View check-in history
- [ ] Check statistics update correctly
- [ ] Test camera access
- [ ] Test on mobile device
- [ ] Test with invalid credentials
- [ ] Test with non-admin user

### Edge Cases

- [ ] Booking with 1 ticket
- [ ] Booking with 100+ tickets
- [ ] Already fully checked-in booking
- [ ] Cancelled/deleted booking
- [ ] Special characters in email
- [ ] Very long names
- [ ] Network disconnect during check-in
- [ ] Concurrent check-ins for same booking

---

## Support

For issues or questions:

1. Check this documentation
2. Review API error messages
3. Check browser console logs
4. Contact development team

---

## Changelog

### Version 1.0.0 (October 23, 2025)

- Initial release
- Basic check-in functionality
- Statistics dashboard
- Camera/OCR UI (implementation ready)
- Mobile-responsive design
- Admin authentication
- Over-check-in prevention
- Partial check-in support
- Check-in history tracking
