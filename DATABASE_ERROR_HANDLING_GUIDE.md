# Database Error Handling Implementation Guide

## Overview

This guide provides instructions for implementing proper database error handling across all API endpoints to handle slow networks, timeouts, and connection issues gracefully.

## What Was Changed

### 1. Database Configuration (`src/configs/database.ts`)

- **Changed `bufferCommands: false`** - Disables buffering to fail fast instead of timing out after 10 seconds
- **Reduced timeouts** - Set to 10s to fail fast and provide immediate feedback
- **Added `maxIdleTimeMS`** - Close idle connections after 30s
- **Added `autoIndex: false`** - Disable auto-indexing in production for better performance

### 2. New Error Handler (`src/lib/db-error-handler.ts`)

Created centralized error handling utilities:

#### Functions:

- **`isTimeoutError(error)`** - Detects MongoDB timeout errors
- **`isNetworkError(error)`** - Detects network-related errors
- **`ensureDbConnection(timeoutMs)`** - Ensures DB is connected before queries
- **`handleDbError(res, error, customMessage)`** - Returns appropriate error response
- **`withDbErrorHandling(operation, options)`** - Wraps DB operations with timeout handling

### 4. Response Codes (`src/lib/responseCodes.ts`)

Added new status codes:

- **`REQUEST_TIMEOUT: 408`** - For timeout errors
- **`CONFLICT: 409`** - For duplicate key errors (already existed)
- **`SERVICE_UNAVAILABLE: 503`** - For network errors

## How to Update Your Code

### For API Routes (in src/pages/api/)

Follow the template in the main guide above using `withDbErrorHandling`.

### For Pages with getServerSideProps

Pages that use `getServerSideProps` need to call `connectDB()` before any database operations:

#### Before:

```typescript
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"

export const getServerSideProps: GetServerSideProps = async (context) => {
	const events = await Events.find({ isDeleted: false })
	return { props: { events: JSON.stringify(events) } }
}
```

#### After:

```typescript
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import { connectDB } from "@/lib/connect-db"

export const getServerSideProps: GetServerSideProps = async (context) => {
	try {
		await connectDB() // Add this line
		const events = await Events.find({ isDeleted: false })
		return { props: { events: JSON.stringify(events) } }
	} catch (error) {
		console.error("Error fetching events:", error)
		return { props: { events: null } }
	}
}
```

### Pages That Need connectDB() Added

Run grep to find all pages with getServerSideProps:

```bash
grep -r "getServerSideProps" src/pages --include="*.tsx"
```

Priority pages to update:

- [ ] `src/pages/index.tsx` - Home page
- [ ] `src/pages/[slug].tsx` - Event detail page
- [ ] `src/pages/console/events/index.tsx` - Console events listing
- [ ] `src/pages/console/bookings/index.tsx` - Console bookings
- [ ] `src/pages/console/events/[eventId]/manage.tsx` - Event management
- [ ] All other pages with database queries in getServerSideProps

### Template for API Updates

#### Before:

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { Model } from "@/models/model"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // ... validation code ...

        const result = await Model.find({ ... })

        return sendResponse(res, result, "Success", true, ResCode.OK)
    } catch (error: any) {
        console.error("[API Error]:", error)
        return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
```

#### After:

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { Model } from "@/models/model"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { withDbErrorHandling, handleDbError } from "@/lib/db-error-handler"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // ... validation code ...

        const result = await withDbErrorHandling(
            async () => {
                return await Model.find({ ... }).exec()
            },
            { timeoutMs: 10000, ensureConnection: true }
        )

        return sendResponse(res, result, "Success", true, ResCode.OK)
    } catch (error: any) {
        return handleDbError(res, error, "Failed to fetch data")
    }
}
```

### Step-by-Step Instructions

1. **Add imports** at the top of the file:

```typescript
import { withDbErrorHandling, handleDbError } from "@/lib/db-error-handler"
```

2. **Remove database connection checks** (no longer needed):

```typescript
// DELETE THESE LINES:
if (dbconn.readyState !== 1) {
	await dbconn.asPromise()
}
```

3. **Wrap database queries** with `withDbErrorHandling`:

```typescript
// Single query:
const data = await withDbErrorHandling(
	async () => {
		return await Model.find(query).exec()
	},
	{ timeoutMs: 10000, ensureConnection: true },
)

// Multiple queries (use Promise.all):
const { data1, data2 } = await withDbErrorHandling(
	async () => {
		const [result1, result2] = await Promise.all([Model1.find(query1).exec(), Model2.find(query2).exec()])
		return { data1: result1, data2: result2 }
	},
	{ timeoutMs: 10000, ensureConnection: true },
)
```

4. **Replace error handling** in catch block:

```typescript
// REPLACE THIS:
catch (error: any) {
    console.error("[API Error]:", error)
    return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
}

// WITH THIS:
catch (error: any) {
    return handleDbError(res, error, "Custom error message for this endpoint")
}
```

5. **Always add `.exec()`** to mongoose queries for better error handling:

```typescript
// DO THIS:
await Model.find(query).exec()
await Model.findOne(query).exec()
await Model.findByIdAndUpdate(id, update).exec()

// NOT THIS:
await Model.find(query)
await Model.findOne(query)
await Model.findByIdAndUpdate(id, update)
```

## Configuration Options

### Timeout Options

```typescript
{
    timeoutMs: 10000,        // Max time to wait (default: 10s)
    ensureConnection: true   // Check connection first (default: true)
}
```

### Recommended Timeouts by Operation

- **Read operations**: 10000ms (10s)
- **Write operations**: 5000ms (5s)
- **Bulk operations**: 15000ms (15s)
- **Complex aggregations**: 20000ms (20s)

## Error Response Examples

### Timeout Error (408)

```json
{
	"data": null,
	"message": "Database operation timed out. Please check your internet connection and try again.",
	"success": false,
	"statusCode": 408
}
```

### Network Error (503)

```json
{
	"data": null,
	"message": "Network error occurred. Please check your internet connection and try again.",
	"success": false,
	"statusCode": 503
}
```

### Validation Error (400)

```json
{
	"data": null,
	"message": "Invalid email: not a valid email",
	"success": false,
	"statusCode": 400
}
```

### Duplicate Key Error (409)

```json
{
	"data": null,
	"message": "Duplicate entry for email",
	"success": false,
	"statusCode": 409
}
```

## APIs Already Updated

- ✅ `src/pages/api/notifications/index.ts`
- ✅ `src/pages/api/notifications/mark-read.ts`
- ✅ `src/pages/api/notifications/mark-all-read.ts`
- ✅ `src/pages/api/waiting-list/add.ts`

## APIs That Need Updates

Run this command to find all API files:

```bash
dir /s /b src\pages\api\*.ts
```

Priority APIs to update:

- [ ] `src/pages/api/checkout/*.ts` - Critical payment flows
- [ ] `src/pages/api/events/create.ts` - Event creation
- [ ] `src/pages/api/events/[eventId]/update.ts` - Event updates
- [ ] `src/pages/api/bookings/*.ts` - Booking operations
- [ ] `src/pages/api/waiting-list/*.ts` - Remaining waiting list APIs
- [ ] `src/pages/api/check-in/*.ts` - Check-in operations
- [ ] `src/pages/api/events/comments/*.ts` - Comment operations

## Testing

### Test Timeout Handling

1. Temporarily set very low timeout: `{ timeoutMs: 100 }`
2. Make API request
3. Should receive 408 error with clear message

### Test Network Error Handling

1. Disconnect from MongoDB (invalid connection string)
2. Make API request
3. Should receive 503 error with clear message

### Test Normal Operation

1. With normal network and timeouts
2. All operations should work as before
3. Logs should show proper error details

## Benefits

1. **User-Friendly Messages**: Clear error messages instead of cryptic MongoDB errors
2. **Fail Fast**: 10s timeout instead of indefinite waiting or 30s+ timeouts
3. **Better Logging**: Structured error logging for debugging
4. **Proper Status Codes**: HTTP status codes that match the error type
5. **No App Crashes**: Graceful error handling prevents uncaught exceptions
6. **Network Resilience**: Handles slow networks and connection issues properly

## Common Issues

### Issue: "bufferCommands" error

**Solution**: Make sure `bufferCommands: false` is set in `database.ts`

### Issue: Still seeing 10s buffering timeout

**Solution**: Add `.exec()` to all mongoose queries and wrap with `withDbErrorHandling`

### Issue: API times out too quickly

**Solution**: Increase `timeoutMs` for that specific operation based on complexity

### Issue: Connection not ready

**Solution**: Set `ensureConnection: true` in options to wait for connection

## Notes

- The app will **NOT crash** on timeout - it will return a proper 408 error
- Users will see clear messages about network/connection issues
- All database errors are logged with structured information
- Timeouts are configurable per endpoint based on operation complexity
