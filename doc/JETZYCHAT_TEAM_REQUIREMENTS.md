# JetzyChat Integration Requirements

**For**: JetzyChat App Team  
**Purpose**: Enable JetzyChat to be embedded in the events-jetzy-com app via iframe

---

## 🎯 What We Need

We want to embed JetzyChat into our events app so users can chat on event pages. Since JetzyChat is deployed on Vercel, we'll use **iframe embedding**.

---

## ✅ What You Need to Do

### 1. Create an `/embed` Route

**Location**: Create a new route in JetzyChat app  
**Path**: `/embed` (e.g., `https://jetzychat.vercel.app/embed`)

**What it should do:**
- Accept URL query parameters:
  - `eventId` (string) - The event ID to scope chat to
  - `userId` (string) - User ID from events app
  - `userName` (string) - User's display name
  - `userEmail` (string) - User's email
  - `token` (string, optional) - JWT token if needed for auth

**Example URL:**
```
https://jetzychat.vercel.app/embed?eventId=123&userId=456&userName=John&userEmail=john@example.com
```

### 2. Handle Authentication

**How to authenticate:**
- Read user data from URL parameters
- If `token` is provided, validate it
- Authenticate the user in JetzyChat
- Create/retrieve user session

**Example implementation:**
```typescript
// In your /embed route
const searchParams = useSearchParams()
const eventId = searchParams.get('eventId')
const userId = searchParams.get('userId')
const userName = searchParams.get('userName')
const userEmail = searchParams.get('userEmail')
const token = searchParams.get('token')

// Authenticate user
await authenticateUser({ userId, userName, userEmail, token })
```

### 3. Scope Chat to Event

**Important**: Chat should be scoped to the `eventId`
- Each event should have its own chat room/channel
- Users in the same event can chat together
- Messages are isolated per event

**Example:**
```typescript
// Get or create chat room for event
const chatRoom = await getOrCreateEventChatRoom(eventId)

// Load messages for this event's chat
const messages = await getEventMessages(eventId)
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
- Allows the `/embed` route to be loaded in an iframe
- `SAMEORIGIN` allows embedding from same origin or specified origins
- CSP restricts which sites can embed (for security)

### 5. Make It Mobile Responsive

**Requirements:**
- The `/embed` route should work well on mobile devices
- Chat UI should be touch-friendly
- Should fit in iframe on mobile screens

### 6. Optional: PostMessage API (Recommended)

**What to implement:**
- Send a message to parent window when chat is ready
- This helps the events app know when chat has loaded

**Example:**
```typescript
// In your /embed route, after chat is initialized
useEffect(() => {
  if (window.parent && chatIsReady) {
    window.parent.postMessage(
      {
        type: 'jetzychat-ready',
        eventId: eventId,
      },
      '*' // In production, specify exact origin: 'https://events.jetzy.com'
    )
  }
}, [chatIsReady, eventId])
```

**Message types to send:**
- `jetzychat-ready` - When chat is loaded and ready
- `jetzychat-error` - If there's an error (with error message)
- `jetzychat-message` - When new message is received (optional)

---

## 📋 Implementation Checklist

### Required:
- [ ] Create `/embed` route/page
- [ ] Accept URL parameters: `eventId`, `userId`, `userName`, `userEmail`, `token`
- [ ] Handle user authentication from URL params
- [ ] Scope chat to `eventId` (one chat per event)
- [ ] Configure `vercel.json` to allow iframe embedding
- [ ] Make it mobile responsive
- [ ] Test that it works in an iframe

### Optional (Recommended):
- [ ] Implement `postMessage` API to notify parent window
- [ ] Handle error cases and send error messages
- [ ] Add loading states
- [ ] Optimize for iframe performance

---

## 🔧 Technical Details

### URL Parameters Format

```
/embed?eventId={eventId}&userId={userId}&userName={userName}&userEmail={userEmail}&token={token}
```

**Parameters:**
- `eventId` (required) - String, MongoDB ObjectId format
- `userId` (required) - String, user ID from events app
- `userName` (required) - String, user's display name
- `userEmail` (required) - String, user's email
- `token` (optional) - String, JWT token if your auth needs it

### Expected Behavior

1. **User visits event page** in events app
2. **Events app loads iframe** pointing to `/embed?eventId=...&userId=...`
3. **JetzyChat authenticates user** from URL params
4. **Chat loads** scoped to that event
5. **User can chat** with others in the same event

### Security Considerations

1. **Validate token** if provided
2. **Verify eventId exists** before allowing chat
3. **Sanitize user input** from URL params
4. **Use HTTPS** (Vercel provides this automatically)
5. **Restrict iframe origins** in CSP header

---

## 📝 Example Implementation (Next.js)

If JetzyChat uses Next.js, here's an example:

### Option A: App Router (`app/embed/page.tsx`)

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { JetzyChat } from '@/components/JetzyChat' // Your chat component

export default function EmbedPage() {
  const searchParams = useSearchParams()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('eventId')
  const userId = searchParams.get('userId')
  const userName = searchParams.get('userName')
  const userEmail = searchParams.get('userEmail')
  const token = searchParams.get('token')

  useEffect(() => {
    if (!eventId || !userId) {
      setError('Missing required parameters')
      return
    }

    // Authenticate user
    authenticateUser({ userId, userName, userEmail, token })
      .then(() => {
        setIsReady(true)
        
        // Notify parent window
        if (window.parent) {
          window.parent.postMessage(
            { type: 'jetzychat-ready', eventId },
            '*' // Specify exact origin in production
          )
        }
      })
      .catch((err) => {
        setError(err.message)
        if (window.parent) {
          window.parent.postMessage(
            { type: 'jetzychat-error', message: err.message },
            '*'
          )
        }
      })
  }, [eventId, userId, userName, userEmail, token])

  if (error) {
    return <div>Error: {error}</div>
  }

  if (!isReady) {
    return <div>Loading chat...</div>
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <JetzyChat 
        eventId={eventId!}
        userId={userId!}
        userName={userName!}
        userEmail={userEmail!}
      />
    </div>
  )
}
```

### Option B: Pages Router (`pages/embed.tsx`)

```typescript
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { JetzyChat } from '@/components/JetzyChat'

export default function EmbedPage() {
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  const { eventId, userId, userName, userEmail, token } = router.query

  useEffect(() => {
    if (eventId && userId) {
      // Authenticate and initialize
      authenticateUser({ userId, userName, userEmail, token })
        .then(() => {
          setIsReady(true)
          // Notify parent
          if (window.parent) {
            window.parent.postMessage(
              { type: 'jetzychat-ready', eventId },
              '*'
            )
          }
        })
    }
  }, [eventId, userId, userName, userEmail, token])

  if (!isReady) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <JetzyChat 
        eventId={eventId as string}
        userId={userId as string}
        userName={userName as string}
        userEmail={userEmail as string}
      />
    </div>
  )
}
```

---

## 🧪 Testing

### How to Test:

1. **Deploy JetzyChat** to Vercel (or use preview deployment)
2. **Get the URL**: `https://jetzychat.vercel.app` (or preview URL)
3. **Test the embed route**:
   ```
   https://jetzychat.vercel.app/embed?eventId=test123&userId=user456&userName=Test&userEmail=test@example.com
   ```
4. **Verify it works** in an iframe:
   ```html
   <iframe src="https://jetzychat.vercel.app/embed?eventId=test123&userId=user456&userName=Test&userEmail=test@example.com" width="100%" height="600px"></iframe>
   ```
5. **Check console** for any errors
6. **Test on mobile** device

### What to Verify:

- ✅ `/embed` route loads correctly
- ✅ URL parameters are read correctly
- ✅ User authentication works
- ✅ Chat is scoped to eventId
- ✅ Works in iframe (no X-Frame-Options errors)
- ✅ Mobile responsive
- ✅ PostMessage works (if implemented)

---

## 📞 What We Need From You

**Please provide:**

1. **Vercel URL**:
   - Production: `https://jetzychat.vercel.app` (or custom domain)
   - Preview format: `https://jetzychat-git-branch.vercel.app`

2. **Confirmation**:
   - [ ] `/embed` route is created
   - [ ] Accepts required URL parameters
   - [ ] Handles authentication
   - [ ] Scopes chat to eventId
   - [ ] `vercel.json` is configured
   - [ ] Tested and working

3. **Any additional requirements**:
   - Do you need any specific format for userId?
   - Any authentication token format?
   - Any other parameters needed?

---

## 🚀 Timeline

**Once you provide:**
- Vercel URL
- Confirmation that `/embed` route works

**We will:**
- Implement iframe integration in events app
- Test the integration
- Deploy to production

**Estimated time**: 1-2 days after you provide the embed route

---

## ❓ Questions?

If you have questions about:
- URL parameter format
- Authentication requirements
- Event scoping
- Vercel configuration
- Anything else

Please ask! We're happy to clarify.

---

## 📋 Summary

**What you need to do:**
1. ✅ Create `/embed` route
2. ✅ Accept URL params (eventId, userId, userName, userEmail, token)
3. ✅ Authenticate user from params
4. ✅ Scope chat to eventId
5. ✅ Configure `vercel.json` for iframe
6. ✅ Make it mobile responsive
7. ✅ (Optional) Implement postMessage API

**What we'll do:**
- Implement iframe integration
- Handle authentication
- Add to event pages
- Test and deploy

**What we need from you:**
- Vercel URL
- Confirmation that embed route works

Let's make this integration happen! 🚀

