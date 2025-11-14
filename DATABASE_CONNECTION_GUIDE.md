# Database Connection Architecture Guide

## Overview

This project uses **two distinct patterns** for database connections:

1. **Server-Side Pattern**: For page routes and server actions
2. **API Pattern**: For API routes with comprehensive error handling

---

## 1. Server-Side Pattern (Pages & Actions)

### When to Use

- **Page Routes** with `getServerSideProps`
- **Server Actions** (files with `'use server'` directive)
- Any server-side component that needs direct database access

### Implementation

#### In Page Routes (getServerSideProps)

```typescript
import { connectDB } from "@/lib/connect-db"
import { Event } from "@/models/events/eventModel"

export async function getServerSideProps(context) {
	try {
		// Step 1: Ensure database connection
		await connectDB()

		// Step 2: Execute queries using Mongoose models
		const events = await Event.find({ status: "active" })

		return {
			props: {
				events: JSON.parse(JSON.stringify(events)),
			},
		}
	} catch (error) {
		console.error("Database error:", error)
		return {
			props: { events: [] },
		}
	}
}
```

#### In Server Actions

```typescript
"use server"

import { connectDB } from "@/lib/connect-db"
import { User } from "@/models/userModal"

export async function createUserAction(userData: UserData) {
	try {
		// Step 1: Ensure database connection
		await connectDB()

		// Step 2: Execute queries using Mongoose models
		const user = await User.findOne({ email: userData.email })

		if (!user) {
			const newUser = await User.create(userData)
			return newUser
		}

		return user
	} catch (error) {
		console.error("Error creating user:", error)
		throw error
	}
}
```

### Key Points

- ✅ Always call `await connectDB()` before any database operation
- ✅ Use Mongoose models (e.g., `User`, `Event`)
- ✅ Connection is reused if already established (no overhead)
- ✅ Simple error handling with try/catch
- ❌ Don't use `connectMongo()` (deprecated)
- ❌ Don't use `db.collection()` (native MongoDB driver)

---

## 2. API Pattern (API Routes)

### When to Use

- **All API Routes** in `/pages/api/`
- Routes handling client requests with HTTP responses
- Operations that need timeout protection and structured error responses

### Implementation

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { withDbErrorHandling } from "@/lib/db-error-handler"
import { sendResponse } from "@/lib/utilities"
import { ResCode } from "@/lib/responseCodes"
import { Event } from "@/models/events/eventModel"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		// Wrap database operation with error handling
		const events = await withDbErrorHandling(async () => await Event.find({ status: "active" }), {
			timeoutMs: 10000, // Optional: Default 15s
			ensureConnection: true, // Optional: Default true
		})

		return sendResponse(res, events, "Events fetched successfully", true, ResCode.OK)
	} catch (error) {
		// Error is already logged by withDbErrorHandling
		return sendResponse(res, null, "Failed to fetch events", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
```

### Key Points

- ✅ Wrap database operations with `withDbErrorHandling()`
- ✅ Automatic connection management
- ✅ Timeout protection (default 15s)
- ✅ Network error detection
- ✅ Structured error responses
- ✅ Automatic logging of errors
- ❌ Don't manually call `connectDB()` in API routes (handled automatically)

---

## 3. Connection Helper Details

### `connectDB()` - Server-Side Helper

**Location**: `src/lib/connect-db.ts`

**What it does**:

- Checks if Mongoose connection is already established
- Waits for connection if currently connecting
- Establishes new connection if disconnected
- Returns immediately if already connected

**Connection States**:

- `0` = Disconnected → Will connect
- `1` = Connected → Returns immediately
- `2` = Connecting → Waits for connection
- `3` = Disconnecting → Throws error

**Usage**:

```typescript
import { connectDB } from "@/lib/connect-db"

await connectDB() // Safe to call multiple times
```

### `withDbErrorHandling()` - API Helper

**Location**: `src/lib/db-error-handler.ts`

**What it does**:

- Ensures database connection (calls `connectDB()` internally)
- Wraps operation with timeout race
- Detects timeout errors
- Detects network errors
- Returns appropriate HTTP status codes

**Options**:

```typescript
{
  timeoutMs: 15000,        // Operation timeout (default: 15s)
  ensureConnection: true   // Check connection first (default: true)
}
```

**Error Types Handled**:

- **Timeout Errors**: Returns 408 (REQUEST_TIMEOUT)
- **Network Errors**: Returns 503 (SERVICE_UNAVAILABLE)
- **Validation Errors**: Returns 400 (BAD_REQUEST)
- **Duplicate Key**: Returns 409 (CONFLICT)
- **General Errors**: Returns 500 (INTERNAL_SERVER_ERROR)

---

## 4. Database Configuration

**Location**: `src/configs/database.ts`

```typescript
export const dbconn = createConnection(process.env.NEXT_EVENTS_DB_URL, {
	bufferCommands: true, // Allow buffering (queries wait for connection)
	serverSelectionTimeoutMS: 10000, // Wait 10s to find server
	connectTimeoutMS: 10000, // Wait 10s to establish connection
	maxPoolSize: 10, // Max 10 connections in pool
	minPoolSize: 2, // Min 2 connections always ready
})
```

### Key Settings

- `bufferCommands: true` - Queries wait for connection instead of failing immediately
- Connection pooling - Reuses connections for better performance
- Timeouts - Prevents hanging on network issues

---

## 5. Migration Guide

### Migrating Actions from Old Pattern

**Old Pattern** (❌ Don't use):

```typescript
import connectMongo from "@/lib/connect-db"

const db = await connectMongo()
const user = await db.collection("users").findOne({ email })
```

**New Pattern** (✅ Use this):

```typescript
import { connectDB } from "@/lib/connect-db"
import { User } from "@/models/userModal"

await connectDB()
const user = await User.findOne({ email })
```

### Migrating Pages

**Before**:

```typescript
export async function getServerSideProps() {
	const events = await Event.find() // ❌ Might fail on cold start
	return { props: { events } }
}
```

**After**:

```typescript
export async function getServerSideProps() {
	await connectDB() // ✅ Ensures connection first
	const events = await Event.find()
	return { props: { events } }
}
```

---

## 6. Best Practices

### ✅ DO

1. **Always initialize connection before queries**

   ```typescript
   await connectDB()
   const data = await Model.find()
   ```

2. **Use appropriate pattern for context**

   - Server-side: `connectDB()`
   - API routes: `withDbErrorHandling()`

3. **Use Mongoose models, not native driver**

   ```typescript
   await User.findOne({ email }) // ✅
   await db.collection("users").findOne({ email }) // ❌
   ```

4. **Handle errors appropriately**

   - Server-side: Try/catch with fallback
   - API routes: Return proper HTTP status codes

5. **Serialize data for client**
   ```typescript
   props: {
   	data: JSON.parse(JSON.stringify(data))
   }
   ```

### ❌ DON'T

1. **Don't mix patterns**

   ```typescript
   // ❌ Don't use connectDB() in API routes
   export default async function handler(req, res) {
   	await connectDB() // Use withDbErrorHandling instead
   }
   ```

2. **Don't use native MongoDB driver**

   ```typescript
   const db = await connectMongo() // ❌ Deprecated
   ```

3. **Don't skip connection initialization**

   ```typescript
   // ❌ Might fail on cold start
   export async function getServerSideProps() {
   	const events = await Event.find()
   }
   ```

4. **Don't ignore errors**
   ```typescript
   // ❌ No error handling
   const user = await User.create(data)
   ```

---

## 7. Troubleshooting

### "buffering timed out after 10000ms"

**Cause**: Query executed before connection established  
**Solution**: Call `await connectDB()` before the query

### "Cannot call Model.find() before initial connection"

**Cause**: Same as above  
**Solution**: Call `await connectDB()` before the query

### Request timeouts in API routes

**Cause**: Operation taking too long  
**Solution**: Already handled by `withDbErrorHandling()` with 15s timeout

### Connection pool exhausted

**Cause**: Too many simultaneous operations  
**Solution**: Connection pool auto-manages (2-10 connections)

---

## 8. File Reference

### Updated Files (Using New Pattern)

- ✅ `src/pages/index.tsx` - Page route with `connectDB()`
- ✅ `src/actions/create-user-action.ts` - Server action
- ✅ `src/actions/event-participants.ts` - Server action
- ✅ All API routes in `src/pages/api/` - Using `withDbErrorHandling()`

### Core Files

- `src/configs/database.ts` - Mongoose connection configuration
- `src/lib/connect-db.ts` - `connectDB()` helper for server-side
- `src/lib/db-error-handler.ts` - `withDbErrorHandling()` for APIs
- `src/lib/responseCodes.ts` - HTTP status codes

### Deprecated

- ❌ `connectMongo()` - Old MongoDB native driver (don't use)

---

## 9. Quick Reference

| Context       | Pattern     | Function                | Timeout            |
| ------------- | ----------- | ----------------------- | ------------------ |
| Page Route    | Server-Side | `await connectDB()`     | 10s (configurable) |
| Server Action | Server-Side | `await connectDB()`     | 10s (configurable) |
| API Route     | API         | `withDbErrorHandling()` | 15s (configurable) |

---

## 10. Examples

### Example 1: Creating a User (Server Action)

```typescript
"use server"

import { connectDB } from "@/lib/connect-db"
import { User } from "@/models/userModal"

export async function createUserAction(email: string, name: string) {
	try {
		await connectDB()

		const existingUser = await User.findOne({ email })
		if (existingUser) {
			return { success: false, error: "User already exists" }
		}

		const newUser = await User.create({ email, name })
		return { success: true, user: newUser }
	} catch (error) {
		console.error("Error creating user:", error)
		return { success: false, error: "Failed to create user" }
	}
}
```

### Example 2: Fetching Events (Page Route)

```typescript
import { connectDB } from "@/lib/connect-db"
import { Event } from "@/models/events/eventModel"

export async function getServerSideProps() {
	try {
		await connectDB()

		const events = await Event.find({ status: "active" }).sort({ startDate: 1 }).limit(10)

		return {
			props: {
				events: JSON.parse(JSON.stringify(events)),
			},
		}
	} catch (error) {
		console.error("Error fetching events:", error)
		return {
			props: { events: [] },
		}
	}
}
```

### Example 3: API Route with Error Handling

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { withDbErrorHandling } from "@/lib/db-error-handler"
import { sendResponse } from "@/lib/utilities"
import { ResCode } from "@/lib/responseCodes"
import { User } from "@/models/userModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { email, name } = req.body

		const user = await withDbErrorHandling(
			async () => {
				const existingUser = await User.findOne({ email })
				if (existingUser) {
					throw new Error("User already exists")
				}
				return await User.create({ email, name })
			},
			{ timeoutMs: 10000 },
		)

		return sendResponse(res, user, "User created successfully", true, ResCode.CREATED)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to create user"
		return sendResponse(res, null, message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
```

---

## Summary

**Two patterns, one goal**: Reliable database connections

- **Server-Side**: Simple, direct access with `connectDB()`
- **API Routes**: Robust, timeout-protected with `withDbErrorHandling()`

Both patterns ensure your database queries never fail due to connection issues.
