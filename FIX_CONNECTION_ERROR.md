# Quick Fix for "Cannot call before initial connection" Error

## The Problem

With `bufferCommands: false`, Mongoose won't queue operations and requires an active connection before any query.

## The Solution

We changed to `bufferCommands: true` which allows Mongoose to queue operations while connecting.

## What You Need to Do

### 1. For Pages (getServerSideProps)

Add `await connectDB()` before any database query:

```typescript
import { connectDB } from "@/lib/connect-db"

export const getServerSideProps = async (context) => {
	await connectDB() // ← Add this line
	const events = await Events.find()
	return { props: { events } }
}
```

### 2. For API Routes

Already handled - APIs use `withDbErrorHandling` which calls `ensureDbConnection` automatically.

## Files Already Fixed

- ✅ `src/configs/database.ts` - Changed to `bufferCommands: true`
- ✅ `src/lib/connect-db.ts` - Updated connection helper
- ✅ `src/lib/db-error-handler.ts` - Improved error handling
- ✅ API routes with `withDbErrorHandling` - Already protected

## Files That Need `connectDB()` Added

### High Priority Pages:

```
src/pages/index.tsx
src/pages/[slug].tsx
src/pages/console/events/index.tsx
src/pages/console/bookings/index.tsx
src/pages/console/events/[eventId]/manage.tsx
src/pages/console/events/[eventId]/update.tsx
src/pages/console/events/[eventId]/check-in.tsx
src/pages/console/events/[eventId]/tickets.tsx
src/pages/console/bookings/[eventId].tsx
src/pages/events/[eventId]/guests/invite.tsx
src/pages/events/[eventId]/group/accept.tsx
```

## How to Find Pages That Need Updates

Run this command:

```bash
# Find all pages with getServerSideProps
grep -r "getServerSideProps" src/pages --include="*.tsx" -l

# Find pages that query Events model
grep -r "await Events\." src/pages --include="*.tsx" -l
```

## Testing

After adding `connectDB()` to a page:

1. Restart your dev server
2. Navigate to the page
3. Should load without "Cannot call before initial connection" error

## Why This Works

- **Before**: `bufferCommands: false` → Operations fail immediately if not connected
- **After**: `bufferCommands: true` → Operations queue until connection ready
- **Plus**: `connectDB()` explicitly waits for connection in pages
- **Plus**: `withDbErrorHandling` waits for connection in API routes

The combination ensures connection is ready before any database operation.
