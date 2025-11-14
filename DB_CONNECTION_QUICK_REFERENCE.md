# Database Connection Patterns - Quick Reference

## 🎯 Two Clear Patterns

| Context         | When to Use                                       | Function                | Import                   | Example                           |
| --------------- | ------------------------------------------------- | ----------------------- | ------------------------ | --------------------------------- |
| **Server-Side** | Pages with `getServerSideProps` or Server Actions | `connectDB()`           | `@/lib/connect-db`       | [See below](#server-side-example) |
| **API Routes**  | All files in `/pages/api/`                        | `withDbErrorHandling()` | `@/lib/db-error-handler` | [See below](#api-route-example)   |

---

## 📋 Server-Side Example

### Page Route

```typescript
import { connectDB } from "@/lib/connect-db"
import { User } from "@/models/userModal"

export async function getServerSideProps(context) {
	// Step 1: Initialize connection
	await connectDB()

	// Step 2: Query database
	const users = await User.find({ active: true })

	return {
		props: {
			users: JSON.parse(JSON.stringify(users)),
		},
	}
}
```

### Server Action

```typescript
"use server"

import { connectDB } from "@/lib/connect-db"
import { Event } from "@/models/events/eventModel"

export async function getEventAction(slug: string) {
	// Step 1: Initialize connection
	await connectDB()

	// Step 2: Query database
	const event = await Event.findOne({ slug })

	return event
}
```

---

## 📋 API Route Example

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { withDbErrorHandling } from "@/lib/db-error-handler"
import { sendResponse } from "@/lib/utilities"
import { ResCode } from "@/lib/responseCodes"
import { User } from "@/models/userModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		// Wrap operation with error handling
		const users = await withDbErrorHandling(async () => await User.find({ active: true }), {
			timeoutMs: 10000, // Optional: Default 15s
			ensureConnection: true, // Optional: Default true
		})

		return sendResponse(res, users, "Users fetched", true, ResCode.OK)
	} catch (error) {
		return sendResponse(res, null, "Failed to fetch users", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
```

---

## 🔍 Decision Tree

```
Need database access?
│
├─ YES → What context?
│   │
│   ├─ Page Route (getServerSideProps)
│   │   └─ Use: await connectDB()
│   │
│   ├─ Server Action ('use server')
│   │   └─ Use: await connectDB()
│   │
│   └─ API Route (/pages/api/*)
│       └─ Use: withDbErrorHandling()
│
└─ NO → No database connection needed
```

---

## ⚡ Quick Checklist

### Before You Write Database Code:

**For Pages/Actions:**

- [ ] Import `connectDB` from `@/lib/connect-db`
- [ ] Call `await connectDB()` before any query
- [ ] Use Mongoose models (not `db.collection()`)
- [ ] Handle errors with try/catch

**For API Routes:**

- [ ] Import `withDbErrorHandling` from `@/lib/db-error-handler`
- [ ] Import `sendResponse` and `ResCode`
- [ ] Wrap database operations with `withDbErrorHandling()`
- [ ] Return proper HTTP responses

---

## ❌ Common Mistakes to Avoid

| ❌ Don't Do This                   | ✅ Do This Instead                        |
| ---------------------------------- | ----------------------------------------- |
| `const db = await connectMongo()`  | `await connectDB()`                       |
| `db.collection("users").findOne()` | `await User.findOne()`                    |
| Query without `await connectDB()`  | Always call `await connectDB()` first     |
| Use `connectDB()` in API routes    | Use `withDbErrorHandling()` in API routes |
| Manual connection state checks     | Let `connectDB()` handle it               |

---

## 📊 Pattern Comparison Table

| Feature                    | Server-Side (`connectDB`) | API Route (`withDbErrorHandling`) |
| -------------------------- | ------------------------- | --------------------------------- |
| **Connection Management**  | ✅ Automatic              | ✅ Automatic                      |
| **Timeout Protection**     | ⚠️ Manual (10s config)    | ✅ Built-in (15s)                 |
| **Error Detection**        | ⚠️ Manual try/catch       | ✅ Automatic                      |
| **HTTP Response**          | ❌ N/A                    | ✅ Auto-formatted                 |
| **Logging**                | ⚠️ Manual                 | ✅ Automatic                      |
| **Network Error Handling** | ⚠️ Manual                 | ✅ Automatic                      |
| **Use Case**               | Server-side rendering     | Client API requests               |

---

## 🎓 Examples by Use Case

### 1. Fetching Events for Home Page

**Use**: Server-Side Pattern

```typescript
export async function getServerSideProps() {
	await connectDB()
	const events = await Event.find({ status: "active" })
	return { props: { events: JSON.parse(JSON.stringify(events)) } }
}
```

### 2. Creating a Booking (API)

**Use**: API Pattern

```typescript
export default async function handler(req, res) {
	const booking = await withDbErrorHandling(async () => await Booking.create(req.body), { timeoutMs: 10000 })
	return sendResponse(res, booking, "Booking created", true, ResCode.CREATED)
}
```

### 3. Server Action for User Creation

**Use**: Server-Side Pattern

```typescript
"use server"
export async function createUser(data) {
	await connectDB()
	return await User.create(data)
}
```

### 4. Fetching Event Details (Page)

**Use**: Server-Side Pattern

```typescript
export async function getServerSideProps({ params }) {
	await connectDB()
	const event = await Event.findOne({ slug: params.slug })
	return { props: { event: JSON.parse(JSON.stringify(event)) } }
}
```

---

## 🔧 Configuration Reference

### Connection Timeouts

| Component               | Timeout | Configurable      |
| ----------------------- | ------- | ----------------- |
| `connectDB()`           | 10s     | Yes (parameter)   |
| `withDbErrorHandling()` | 15s     | Yes (options)     |
| Database Config         | 10s     | Yes (config file) |

### Connection Pooling

- **Min Connections**: 2
- **Max Connections**: 10
- **Auto-managed**: Yes

---

## 📝 Code Snippets

### Import Statements

**Server-Side**:

```typescript
import { connectDB } from "@/lib/connect-db"
import { User } from "@/models/userModal"
import { Event } from "@/models/events/eventModel"
```

**API Route**:

```typescript
import { withDbErrorHandling } from "@/lib/db-error-handler"
import { sendResponse } from "@/lib/utilities"
import { ResCode } from "@/lib/responseCodes"
import { User } from "@/models/userModal"
```

---

## 🚀 Quick Start Templates

### Page Template

```typescript
import { connectDB } from "@/lib/connect-db"
import { Model } from "@/models/modelName"

export default function Page({ data }) {
	return <div>{/* Your UI */}</div>
}

export async function getServerSideProps() {
	await connectDB()
	const data = await Model.find()
	return { props: { data: JSON.parse(JSON.stringify(data)) } }
}
```

### API Template

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { withDbErrorHandling } from "@/lib/db-error-handler"
import { sendResponse } from "@/lib/utilities"
import { ResCode } from "@/lib/responseCodes"
import { Model } from "@/models/modelName"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		const data = await withDbErrorHandling(async () => await Model.find())
		return sendResponse(res, data, "Success", true, ResCode.OK)
	} catch (error) {
		return sendResponse(res, null, "Error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
```

### Action Template

```typescript
"use server"

import { connectDB } from "@/lib/connect-db"
import { Model } from "@/models/modelName"

export async function myAction(data: any) {
	try {
		await connectDB()
		const result = await Model.create(data)
		return { success: true, data: result }
	} catch (error) {
		console.error("Action error:", error)
		return { success: false, error: "Failed" }
	}
}
```

---

## 💡 Tips & Best Practices

1. **Always Call Connection First**: Before any database operation
2. **Use Appropriate Pattern**: Server-side for pages, API pattern for routes
3. **Serialize Data**: Use `JSON.parse(JSON.stringify())` for props
4. **Handle Errors**: Always have try/catch blocks
5. **Import Correctly**: Check import paths (`@/lib/...`)
6. **Use Mongoose Models**: Never use `db.collection()`
7. **Check Status Codes**: Use `ResCode` constants in APIs

---

## 🔗 Related Documentation

- **Full Guide**: `DATABASE_CONNECTION_GUIDE.md`
- **Update Summary**: `DB_CONNECTION_UPDATE_SUMMARY.md`
- **Environment Setup**: `ENVIRONMENT_SETUP.md`

---

## ✅ Summary

**Two patterns, simple rules:**

1. **Pages/Actions** → `await connectDB()` before queries
2. **API Routes** → Wrap with `withDbErrorHandling()`

**Always use Mongoose models, never native driver.**
