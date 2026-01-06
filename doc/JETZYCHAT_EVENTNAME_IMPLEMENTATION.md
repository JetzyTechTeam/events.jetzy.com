# JetzyChat - Event Name Implementation Guide

**For**: JetzyChat Development Team  
**Purpose**: Display event name instead of eventId in chat room title

---

## 📋 What's Already Done (Events App Side)

✅ Events app now passes `eventName` as a URL parameter to JetzyChat  
✅ The parameter is included in the embed URL automatically

---

## 🎯 What JetzyChat Needs to Do

### Current Behavior
Chat room displays: **"Event Chat: 6952c23e676af95f6502a320"** (eventId)

### Expected Behavior
Chat room displays: **"Event Chat: Come join this event for the end of the year festivities"** (event name)

---

## 📝 Implementation Steps

### Step 1: Read `eventName` Parameter

In your `/embed` route (likely `src/pages/EmbedPage.tsx` or similar):

```typescript
// Read eventName from URL parameters
const eventName = searchParams.get('eventName')
const eventId = searchParams.get('eventId')
```

---

### Step 2: Use Event Name for Chat Room Display

When creating or displaying the chat room, use `eventName` if available:

```typescript
// Option 1: Use eventName if available, fallback to eventId
const chatRoomName = eventName 
  ? `Event Chat: ${eventName}` 
  : `Event Chat: ${eventId}`

// Option 2: Just use eventName directly (if you want shorter name)
const chatRoomName = eventName || `Event Chat: ${eventId}`

// Option 3: Use eventName without prefix
const chatRoomName = eventName || eventId
```

---

### Step 3: Update Chat Room Title Display

Wherever you display the chat room name/title in your UI, use the `chatRoomName`:

**Example locations to update:**
- Chat room header/title
- Chat room list item
- Page title
- Anywhere the room name is displayed

**Before:**
```typescript
<h2>Event Chat: {eventId}</h2>
```

**After:**
```typescript
<h2>{chatRoomName}</h2>
// or
<h2>Event Chat: {eventName || eventId}</h2>
```

---

## 🔍 Where to Make Changes

### Location 1: EmbedPage Component

**File**: `src/pages/EmbedPage.tsx` (or wherever your embed route is)

```typescript
// Read the parameter
const eventName = searchParams.get('eventName')
const eventId = searchParams.get('eventId')

// Use it when creating/displaying chat room
const chatRoomName = eventName 
  ? `Event Chat: ${eventName}` 
  : `Event Chat: ${eventId}`

// Pass to your chat component or use directly
<ChatRoom name={chatRoomName} eventId={eventId} />
```

---

### Location 2: Chat Room Component

**File**: Wherever you display the chat room title (e.g., `ChatRoom.tsx`, `ChatHeader.tsx`)

```typescript
// If you're storing the name in state or props
const [roomName, setRoomName] = useState('')

useEffect(() => {
  const eventName = searchParams.get('eventName')
  const eventId = searchParams.get('eventId')
  
  setRoomName(
    eventName 
      ? `Event Chat: ${eventName}` 
      : `Event Chat: ${eventId}`
  )
}, [searchParams])

// Then display it
<h2>{roomName}</h2>
```

---

### Location 3: Chat Room Creation/Storage

**If you store chat room names in Firestore/database:**

```typescript
// When creating the chat room
const chatRoom = {
  id: eventId,
  eventId: eventId,
  name: eventName 
    ? `Event Chat: ${eventName}` 
    : `Event Chat: ${eventId}`,
  type: 'event',
  // ... other fields
}

// Save to database
await createChatRoom(chatRoom)
```

**Or update existing room:**
```typescript
// If room already exists, update the name
if (eventName) {
  await updateChatRoom(eventId, {
    name: `Event Chat: ${eventName}`
  })
}
```

---

## 📋 Complete Example Implementation

### Example 1: Simple Implementation

```typescript
// In EmbedPage.tsx
import { useSearchParams } from 'next/navigation' // or your router

export default function EmbedPage() {
  const searchParams = useSearchParams()
  
  const eventId = searchParams.get('eventId')
  const eventName = searchParams.get('eventName')
  const userId = searchParams.get('userId')
  const userEmail = searchParams.get('userEmail')
  
  // Create friendly chat room name
  const chatRoomName = eventName 
    ? `Event Chat: ${eventName}` 
    : `Event Chat: ${eventId}`
  
  // Use it in your chat component
  return (
    <ChatInterface 
      roomId={eventId}
      roomName={chatRoomName}
      // ... other props
    />
  )
}
```

---

### Example 2: With State Management

```typescript
// In EmbedPage.tsx
const [chatRoomName, setChatRoomName] = useState('')

useEffect(() => {
  const eventName = searchParams.get('eventName')
  const eventId = searchParams.get('eventId')
  
  if (eventName) {
    setChatRoomName(`Event Chat: ${eventName}`)
  } else {
    setChatRoomName(`Event Chat: ${eventId}`)
  }
}, [searchParams])

// Display in UI
<div className="chat-header">
  <h2>{chatRoomName}</h2>
</div>
```

---

### Example 3: When Creating Chat Room

```typescript
// When creating/retrieving chat room
const getOrCreateEventChatRoom = async (eventId, eventName) => {
  // Check if room exists
  let room = await findChatRoomByEventId(eventId)
  
  if (!room) {
    // Create new room with event name
    room = await createChatRoom({
      eventId: eventId,
      name: eventName 
        ? `Event Chat: ${eventName}` 
        : `Event Chat: ${eventId}`,
      type: 'event',
      // ... other fields
    })
  } else if (eventName && room.name !== `Event Chat: ${eventName}`) {
    // Update room name if eventName is provided and different
    room = await updateChatRoom(eventId, {
      name: `Event Chat: ${eventName}`
    })
  }
  
  return room
}
```

---

## ✅ Testing

### Test 1: With Event Name
**URL**: `http://localhost:5174/embed?eventId=123&eventName=Test%20Event&userId=...&userEmail=...`

**Expected**: Chat room shows "Event Chat: Test Event"

---

### Test 2: Without Event Name (Fallback)
**URL**: `http://localhost:5174/embed?eventId=123&userId=...&userEmail=...`

**Expected**: Chat room shows "Event Chat: 123" (fallback to eventId)

---

### Test 3: URL Encoding
**URL**: `http://localhost:5174/embed?eventId=123&eventName=Come%20join%20this%20event&userId=...`

**Expected**: Chat room shows "Event Chat: Come join this event" (properly decoded)

---

## 🔍 URL Parameter Details

**Parameter Name**: `eventName`  
**Type**: String (URL-encoded)  
**Required**: No (optional, but recommended)  
**Example**: `eventName=Come%20join%20this%20event`

**Note**: The parameter is already URL-encoded by the events app, so you may need to decode it:

```typescript
// JavaScript automatically decodes URL parameters, but if needed:
const eventName = decodeURIComponent(searchParams.get('eventName') || '')
```

---

## 📝 Checklist

- [ ] Read `eventName` parameter from URL
- [ ] Use `eventName` to create friendly chat room name
- [ ] Fallback to `eventId` if `eventName` is not provided
- [ ] Update chat room title/header display
- [ ] Test with event name provided
- [ ] Test without event name (fallback)
- [ ] Test with special characters in event name
- [ ] Verify URL decoding works correctly

---

## 🎯 Summary

**What to change**: Use `eventName` parameter (if available) instead of `eventId` when displaying the chat room name.

**Where to change**: 
1. Where you read URL parameters (EmbedPage)
2. Where you display the chat room name (ChatHeader/Title)
3. Where you create/store chat room data (optional, for persistence)

**Result**: Chat room will show "Event Chat: [Event Name]" instead of "Event Chat: [EventId]"

---

**That's it!** Simple change that makes the chat much more user-friendly. 🎉

