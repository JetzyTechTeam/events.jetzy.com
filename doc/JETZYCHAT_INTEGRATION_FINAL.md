# JetzyChat Integration with Events App - Complete Guide

**For**: JetzyChat App Team / Cursor  
**Purpose**: Integrate JetzyChat into events-jetzy-com app via iframe embedding  
**Status**: Ready for Implementation

---

## 📋 Overview

The events app (events-jetzy-com) wants to embed JetzyChat on event pages so users can chat about events. Since JetzyChat is deployed on Vercel and has its own authentication system, we'll use **iframe embedding** with URL parameter passing.

**Integration Method**: Iframe Embedding  
**Deployment**: Both apps on Vercel  
**Authentication**: JetzyChat handles its own login, but we'll pass user context from events app

---

## 🎯 What Events App Will Provide

### 1. User Context (via URL Parameters)

When events app loads JetzyChat in iframe, it will pass:

```
https://jetzychat.vercel.app/embed?eventId={eventId}&userId={userId}&userName={userName}&userEmail={userEmail}&userImage={userImage}&token={token}
```

**Parameters:**
- `eventId` (string, **required**) - MongoDB ObjectId of the event
- `userId` (string, **required**) - User ID from events app (NextAuth session)
- `userName` (string, **required**) - User's display name
- `userEmail` (string, **required**) - User's email address
- `userImage` (string, optional) - User's profile image URL
- `token` (string, optional) - JWT token if needed for cross-app authentication

**Example:**
```
https://jetzychat.vercel.app/embed?eventId=507f1f77bcf86cd799439011&userId=507f191e810c19729de860ea&userName=John%20Doe&userEmail=john@example.com&userImage=https://example.com/avatar.jpg
```

### 2. Event Context

Events app will provide:
- **Event ID** - Unique identifier for each event
- **Event Name** - Can be passed if needed
- **Event Details** - Can be passed if needed

### 3. Integration Point

Events app will embed JetzyChat:
- **Location**: Event detail pages (`/events/[slug]`)
- **Format**: Iframe with 600px height
- **Responsive**: Works on mobile and desktop

---

## ✅ What JetzyChat Needs to Implement

### 1. Create `/embed` Route

**Location**: Create a new route in JetzyChat app  
**Path**: `/embed`  
**Method**: GET (handles URL parameters)

**What it should do:**
1. Read URL parameters (eventId, userId, userName, userEmail, userImage, token)
2. Handle authentication (see Authentication section below)
3. Load chat scoped to the eventId
4. Display chat interface optimized for iframe
5. (Optional) Send postMessage to parent when ready

### 2. Handle Authentication

**Important**: JetzyChat has its own login system. Here's how to handle it:

#### Option A: Auto-login if User Exists (Recommended)

```typescript
// In /embed route
const userId = searchParams.get('userId')
const userEmail = searchParams.get('userEmail')
const userName = searchParams.get('userName')
const userImage = searchParams.get('userImage')
const token = searchParams.get('token')

// Check if user exists in JetzyChat database
const existingUser = await findUserByEmail(userEmail)

if (existingUser) {
  // User exists - auto-login them
  await loginUser(existingUser.id)
  // Or create session with their existing account
} else {
  // User doesn't exist - show login/register prompt
  // OR auto-create account with provided info
  const newUser = await createUser({
    email: userEmail,
    name: userName,
    image: userImage,
    externalId: userId, // Link to events app user ID
  })
  await loginUser(newUser.id)
}
```

#### Option B: Show Login Form if Not Authenticated

```typescript
// If user is not authenticated in JetzyChat
if (!isAuthenticated) {
  // Show JetzyChat login form
  // Pre-fill email if provided: userEmail
  // After login, proceed to chat
}
```

#### Option C: Auto-create Account (Simplest)

```typescript
// Auto-create account from events app data
const user = await getOrCreateUser({
  email: userEmail,
  name: userName,
  image: userImage,
  externalId: userId, // Store events app user ID for reference
})

// Auto-login the user
await loginUser(user.id)
```

**Recommendation**: Use **Option C** (auto-create) for best UX - users don't need to login again.

### 3. Scope Chat to Event

**Critical**: Each event should have its own chat room/channel.

**Implementation:**
```typescript
// Get or create chat room for this event
const chatRoom = await getOrCreateEventChatRoom(eventId)

// Load messages for this event
const messages = await getEventMessages(eventId)

// When user sends message, associate with eventId
await sendMessage({
  eventId: eventId,
  userId: currentUser.id,
  content: messageText,
})
```

**Database Schema Suggestion:**
```typescript
// Chat messages should have eventId
interface ChatMessage {
  id: string
  eventId: string  // Link to event
  userId: string
  content: string
  timestamp: Date
  // ... other fields
}

// Chat rooms per event
interface EventChatRoom {
  eventId: string
  name: string
  participants: string[]
  createdAt: Date
}
```

### 4. Configure Vercel for Iframe Embedding

**File**: `vercel.json` (in JetzyChat repo root)

**Add this configuration:**
```json
{
  "headers": [
    {
      "source": "/embed",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://events.jetzy.com https://*.vercel.app"
        }
      ]
    }
  ]
}
```

**Why this is needed:**
- Allows `/embed` route to be loaded in iframe
- `SAMEORIGIN` allows embedding from same origin or specified origins
- CSP restricts which sites can embed (security)

### 5. Make It Mobile Responsive

**Requirements:**
- Chat UI should work well in iframe on mobile
- Touch-friendly interface
- Responsive layout (fits in 600px height iframe)
- Scrollable message list

### 6. Optional: PostMessage API (Recommended)

**What to implement:**
Send messages to parent window (events app) for better integration.

```typescript
// After chat is initialized
useEffect(() => {
  if (window.parent && chatIsReady) {
    window.parent.postMessage(
      {
        type: 'jetzychat-ready',
        eventId: eventId,
      },
      'https://events.jetzy.com' // Specify exact origin in production
    )
  }
}, [chatIsReady, eventId])

// Send error if something goes wrong
if (error) {
  window.parent.postMessage(
    {
      type: 'jetzychat-error',
      message: error.message,
    },
    'https://events.jetzy.com'
  )
}
```

**Message types to send:**
- `jetzychat-ready` - When chat is loaded and ready
- `jetzychat-error` - If there's an error (with error message)
- `jetzychat-message` - When new message is received (optional)
- `jetzychat-user-joined` - When user joins chat (optional)

---

## 💻 Implementation Examples

### Next.js App Router (`app/embed/page.tsx`)

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function EmbedPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Get URL parameters
  const eventId = searchParams.get('eventId')
  const userId = searchParams.get('userId')
  const userName = searchParams.get('userName')
  const userEmail = searchParams.get('userEmail')
  const userImage = searchParams.get('userImage')
  const token = searchParams.get('token')

  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Validate required parameters
        if (!eventId || !userId || !userEmail) {
          throw new Error('Missing required parameters: eventId, userId, or userEmail')
        }

        // Handle authentication
        // Option 1: Auto-create/login user
        const user = await getOrCreateUser({
          email: userEmail,
          name: userName || 'User',
          image: userImage,
          externalId: userId, // Link to events app
        })

        // Login user in JetzyChat
        await loginUser(user.id)
        setIsAuthenticated(true)

        // Get or create chat room for event
        const chatRoom = await getOrCreateEventChatRoom(eventId)

        // Load messages for this event
        // ... your chat loading logic

        setIsLoading(false)

        // Notify parent window that chat is ready
        if (window.parent) {
          window.parent.postMessage(
            {
              type: 'jetzychat-ready',
              eventId: eventId,
            },
            '*' // In production, use: 'https://events.jetzy.com'
          )
        }
      } catch (err: any) {
        setError(err.message)
        setIsLoading(false)

        // Notify parent of error
        if (window.parent) {
          window.parent.postMessage(
            {
              type: 'jetzychat-error',
              message: err.message,
            },
            '*'
          )
        }
      }
    }

    initializeChat()
  }, [eventId, userId, userName, userEmail, userImage, token])

  if (error) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <h2>Error Loading Chat</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>Loading chat...</div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Your JetzyChat component here */}
      {/* Pass eventId to scope chat to this event */}
      <JetzyChatComponent 
        eventId={eventId!}
        userId={userId!}
      />
    </div>
  )
}
```

### Next.js Pages Router (`pages/embed.tsx`)

```typescript
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function EmbedPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { eventId, userId, userName, userEmail, userImage, token } = router.query

  useEffect(() => {
    const initializeChat = async () => {
      if (!eventId || !userId || !userEmail) {
        setError('Missing required parameters')
        setIsLoading(false)
        return
      }

      try {
        // Auto-create/login user
        const user = await getOrCreateUser({
          email: userEmail as string,
          name: (userName as string) || 'User',
          image: (userImage as string) || null,
          externalId: userId as string,
        })

        await loginUser(user.id)

        // Get chat room for event
        await getOrCreateEventChatRoom(eventId as string)

        setIsLoading(false)

        // Notify parent
        if (window.parent) {
          window.parent.postMessage(
            { type: 'jetzychat-ready', eventId },
            '*'
          )
        }
      } catch (err: any) {
        setError(err.message)
        setIsLoading(false)
      }
    }

    if (router.isReady) {
      initializeChat()
    }
  }, [router.isReady, eventId, userId, userName, userEmail, userImage, token])

  if (error) {
    return <div>Error: {error}</div>
  }

  if (isLoading) {
    return <div>Loading chat...</div>
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <JetzyChatComponent 
        eventId={eventId as string}
        userId={userId as string}
      />
    </div>
  )
}
```

### Helper Functions Needed

```typescript
// Get or create user from events app data
async function getOrCreateUser(data: {
  email: string
  name: string
  image: string | null
  externalId: string
}) {
  // Check if user exists by email
  let user = await findUserByEmail(data.email)
  
  if (!user) {
    // Create new user
    user = await createUser({
      email: data.email,
      name: data.name,
      image: data.image,
      externalId: data.externalId, // Store events app user ID
      // ... other fields
    })
  } else {
    // Update user info if needed
    await updateUser(user.id, {
      name: data.name,
      image: data.image,
      externalId: data.externalId,
    })
  }
  
  return user
}

// Get or create chat room for event
async function getOrCreateEventChatRoom(eventId: string) {
  let chatRoom = await findChatRoomByEventId(eventId)
  
  if (!chatRoom) {
    chatRoom = await createChatRoom({
      eventId: eventId,
      name: `Event Chat: ${eventId}`,
      type: 'event',
      // ... other fields
    })
  }
  
  return chatRoom
}

// Login user (your existing login function)
async function loginUser(userId: string) {
  // Your existing authentication logic
  // Create session, set cookies, etc.
}
```

---

## 🗄️ Database Schema Suggestions

### User Table (if not exists)

```typescript
interface User {
  id: string
  email: string
  name: string
  image?: string
  externalId?: string  // Link to events app user ID
  createdAt: Date
  updatedAt: Date
}
```

### Chat Room Table

```typescript
interface ChatRoom {
  id: string
  eventId: string  // Link to event from events app
  name: string
  type: 'event' | 'direct' | 'group'
  participants: string[]  // User IDs
  createdAt: Date
  updatedAt: Date
}
```

### Message Table

```typescript
interface Message {
  id: string
  chatRoomId: string
  eventId: string  // Also store eventId for easy querying
  userId: string
  content: string
  timestamp: Date
  // ... other fields (attachments, reactions, etc.)
}
```

---

## 🧪 Testing Checklist

### Before Deployment:

- [ ] `/embed` route is created and accessible
- [ ] URL parameters are read correctly
- [ ] User authentication works (auto-create/login)
- [ ] Chat is scoped to eventId (messages are per-event)
- [ ] `vercel.json` is configured for iframe
- [ ] Works in iframe (test with HTML iframe)
- [ ] Mobile responsive
- [ ] PostMessage works (if implemented)
- [ ] Error handling works
- [ ] Loading states work

### Test URL Format:

```
https://jetzychat.vercel.app/embed?eventId=507f1f77bcf86cd799439011&userId=507f191e810c19729de860ea&userName=Test%20User&userEmail=test@example.com
```

### Test in Iframe:

```html
<!DOCTYPE html>
<html>
<body>
  <iframe 
    src="https://jetzychat.vercel.app/embed?eventId=test123&userId=user456&userName=Test&userEmail=test@example.com" 
    width="100%" 
    height="600px"
    style="border: 1px solid #ccc;"
  ></iframe>
</body>
</html>
```

---

## 📋 Implementation Checklist

### Required:
- [ ] Create `/embed` route/page
- [ ] Accept URL parameters: `eventId`, `userId`, `userName`, `userEmail`, `userImage`, `token`
- [ ] Implement `getOrCreateUser()` function
- [ ] Handle user authentication (auto-login)
- [ ] Implement `getOrCreateEventChatRoom()` function
- [ ] Scope chat messages to `eventId`
- [ ] Configure `vercel.json` to allow iframe embedding
- [ ] Make it mobile responsive
- [ ] Test that it works in iframe
- [ ] Handle error cases

### Optional (Recommended):
- [ ] Implement `postMessage` API to notify parent window
- [ ] Add loading states
- [ ] Optimize for iframe performance
- [ ] Add user presence indicators
- [ ] Handle file uploads (if supported)

---

## 🔒 Security Considerations

1. **Validate URL Parameters**
   - Sanitize all input from URL params
   - Validate eventId format (MongoDB ObjectId)
   - Validate email format

2. **Authentication**
   - Verify token if provided
   - Don't trust userId alone - verify via email/token
   - Use secure session management

3. **Event Validation**
   - Verify eventId exists (optional - can query events app API)
   - Don't allow access to private events if user doesn't have permission

4. **CORS & Iframe Security**
   - Restrict iframe origins in CSP header
   - Verify postMessage origins
   - Use HTTPS (Vercel provides this)

5. **Rate Limiting**
   - Implement rate limiting on message sending
   - Prevent spam/abuse

---

## 📞 What Events App Needs From You

**Please provide:**

1. **Vercel URL**:
   - Production: `https://jetzychat.vercel.app` (or custom domain)
   - Preview format: `https://jetzychat-git-branch.vercel.app`

2. **Confirmation**:
   - [ ] `/embed` route is created and working
   - [ ] Accepts all required URL parameters
   - [ ] Handles authentication correctly
   - [ ] Chat is scoped to eventId
   - [ ] `vercel.json` is configured
   - [ ] Tested and working in iframe

3. **Any Additional Requirements**:
   - Do you need any specific format for userId?
   - Any authentication token format?
   - Any other parameters needed?
   - Any API endpoints we should call?

---

## 🚀 Timeline

**Once you provide:**
- ✅ Vercel URL
- ✅ Confirmation that `/embed` route works

**Events app will:**
- ✅ Implement iframe integration component
- ✅ Add to event pages
- ✅ Configure environment variables
- ✅ Test integration
- ✅ Deploy to production

**Estimated time**: 1-2 days after embed route is ready

---

## 📝 Summary

### What JetzyChat Needs to Do:

1. ✅ Create `/embed` route
2. ✅ Accept URL params: `eventId`, `userId`, `userName`, `userEmail`, `userImage`, `token`
3. ✅ Implement `getOrCreateUser()` - auto-create/login users from events app
4. ✅ Implement `getOrCreateEventChatRoom()` - scope chat to eventId
5. ✅ Configure `vercel.json` for iframe embedding
6. ✅ Make it mobile responsive
7. ✅ (Optional) Implement postMessage API

### What Events App Will Do:

1. ✅ Load JetzyChat in iframe on event pages
2. ✅ Pass user context via URL parameters
3. ✅ Pass eventId to scope chat
4. ✅ Handle iframe loading states
5. ✅ Listen for postMessage events (if implemented)

### What Events App Provides:

- **User Context**: userId, userName, userEmail, userImage
- **Event Context**: eventId
- **Integration Point**: Event detail pages
- **Iframe Container**: Responsive, 600px height

---

## ❓ Questions?

If you have questions about:
- URL parameter format
- Authentication approach
- Event scoping
- Database schema
- Vercel configuration
- Anything else

Please ask! We're here to help make this integration smooth.

---

## 🎯 Next Steps

1. **Review this document** - Understand requirements
2. **Implement `/embed` route** - Follow examples above
3. **Test locally** - Verify it works
4. **Deploy to Vercel** - Get production URL
5. **Test in iframe** - Verify iframe embedding works
6. **Provide Vercel URL** - Share with events app team
7. **Events app integrates** - We'll implement on our side

**Let's make this integration happen! 🚀**

---

## 📎 Additional Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Next.js Routing**: https://nextjs.org/docs/app/building-your-application/routing
- **PostMessage API**: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- **Iframe Security**: https://developer.mozilla.org/en-US/docs/Web/Security/IFrame

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Status**: Ready for Implementation

