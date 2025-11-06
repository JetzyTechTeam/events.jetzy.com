# Timezone Implementation Guide

## Overview

This document explains how timezone handling is implemented across the entire event lifecycle - from creation to display.

## Architecture

### Date Storage Strategy

- **Database Storage**: All dates are stored in **UTC** format
- **Timezone Field**: Each event has a `timezone` field storing the user's selected timezone (e.g., "(UTC-05:00) America/New_York")
- **Display**: Dates are converted from UTC back to the user's timezone for display

### Libraries Used

```typescript
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)
```

## Implementation Details

### 1. Database Schema (`src/models/events/index.ts`)

```typescript
timezone: {
  type: String,
  required: true
}
```

### 2. Event Creation API (`src/pages/api/events/create.ts`)

**How it works:**

1. Receives timezone string like "(UTC-05:00) America/New_York"
2. Extracts the timezone name: `timezone?.split(') ')[1]` → "America/New_York"
3. Creates date in user's timezone then converts to UTC:

```typescript
const extractedTimeZone = timezone?.split(") ")[1]
const start = dayjs.tz(`${startDate} ${startTime}`, "YYYY-MM-DD HH:mm", extractedTimeZone).utc().toDate()
const end = dayjs.tz(`${endDate} ${endTime}`, "YYYY-MM-DD HH:mm", extractedTimeZone).utc().toDate()
```

4. Saves both UTC dates and timezone string to database

### 3. Display Components

All display components follow this pattern:

```typescript
// Extract timezone from stored string
const userTimeZone = event.timezone?.split(") ")[1] || event.timezone || "UTC"

// Convert UTC date to user timezone
const date = dayjs.utc(event.startsOn).tz(userTimeZone)

// Format for display
const formattedDate = date.format("MMM D, YYYY")
const formattedTime = date.format("h:mm A")
```

#### Components Updated:

**a) EventsListing (`src/components/misc/EventsListing.tsx`)**

- Public events listing page
- Shows event cards with date/time in correct timezone
- Uses `useMemo` for performance optimization

**b) HostedEvents (`src/components/HostedEvents.tsx`)**

- Event detail page (slug route)
- Displays full event information with timezone
- Shows formatted date: "January 15, 2025, 7:00 PM"

**c) CardGroup (`src/components/misc/CardGroup.tsx`)**

- Dashboard event cards (console)
- Now includes date/time display with timezone conversion
- Shows: Date icon + "Dec 25, 2025 • 7:00 PM"
- Shows: Location icon + location name

**d) EventsTableComponent (`src/components/events/EventsTableComponent.tsx`)**

- Console events table
- Modal shows event details with timezone
- Displays: "MMM D, YYYY h:mm A (timezone)"

**e) BookingEventsTable (`src/components/bookings/BookingEventsTable.tsx`)**

- Bookings listing table
- Shows start and end dates with timezone conversion

## Code Pattern

### Helper Function Pattern (Used in CardGroup)

```typescript
const getFormattedDateTime = (item: EventInterface) => {
	if (!item?.startsOn) return { formattedDate: "", formattedTime: "" }

	try {
		const userTimeZone = item?.timezone?.split(") ")[1] || item?.timezone || "UTC"
		const date = dayjs.utc(item.startsOn).tz(userTimeZone)

		const formattedDate = date.format("MMM D, YYYY")
		const formattedTime = date.format("h:mm A")

		return { formattedDate, formattedTime }
	} catch (error) {
		console.error("Error formatting date:", error)
		return { formattedDate: "", formattedTime: "" }
	}
}
```

### Inline Pattern (Used in EventsTableComponent)

```typescript
{
	;(() => {
		try {
			const userTimeZone = event.timezone?.split(") ")[1] || event.timezone || "UTC"
			const date = dayjs.utc(event.startsOn).tz(userTimeZone)
			return date.format("MMM D, YYYY h:mm A")
		} catch (error) {
			return new Date(event.startsOn?.toString())?.toLocaleString()
		}
	})()
}
```

### useMemo Pattern (Used in EventsListing, HostedEvents)

```typescript
const { formattedDate, formattedTime } = useMemo(() => {
	if (!event?.startsOn) return { formattedDate: "", formattedTime: "" }

	try {
		const userTimeZone = event?.timezone?.split(") ")[1] || event?.timezone || "UTC"
		const date = dayjs.utc(event.startsOn).tz(userTimeZone)

		const formattedDate = date.format("MMMM DD, YYYY")
		const formattedTime = date.format("hh:mm A")

		return { formattedDate, formattedTime }
	} catch (error) {
		console.error("Error formatting date:", error)
		return { formattedDate: "", formattedTime: "" }
	}
}, [event?.startsOn, event?.timezone])
```

## Error Handling

All timezone conversions include try-catch blocks:

- **Success**: Display formatted date in user's timezone
- **Error**: Fallback to browser's default `toLocaleString()`
- Logs errors to console for debugging

## Complete Flow

1. **User Creates Event**:

   - Selects timezone from TimezoneSelect component
   - Picks date from DatePicker
   - Picks time from TimePicker

2. **Form Submission**:

   - Data sent to `/api/events/create`
   - API extracts timezone name from string
   - Converts date/time from user timezone to UTC
   - Stores UTC dates + timezone string in MongoDB

3. **Display Anywhere**:
   - Component fetches event from database (UTC dates + timezone)
   - Extracts timezone name from string
   - Converts UTC back to user timezone
   - Formats for display
   - User sees event time in their original timezone

## Benefits

1. **Consistent Storage**: All dates in UTC eliminates timezone confusion in database
2. **User Preference**: Events display in the timezone they were created in
3. **Internationalization Ready**: Easy to add support for viewing in different timezones
4. **No Data Loss**: Original timezone preserved for accurate display

## Testing Checklist

- [ ] Create event in EST timezone - verify displays correctly
- [ ] Create event in PST timezone - verify displays correctly
- [ ] Check event details page shows correct time
- [ ] Check events listing shows correct time
- [ ] Check console dashboard cards show date/time
- [ ] Check console events table shows correct time
- [ ] Check bookings table shows correct time
- [ ] Verify all components handle missing timezone gracefully

## Future Enhancements

1. **User Timezone Preference**: Allow users to view events in their preferred timezone
2. **Multiple Timezone Display**: Show event time in both original and user's timezone
3. **Timezone Conversion Tool**: Help users see event time in different timezones
4. **Calendar Export**: Generate .ics files with correct timezone data
