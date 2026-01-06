# JetzyChat Requirements for Events App Integration

**For**: JetzyChat Development Team  
**Purpose**: What JetzyChat needs to implement to support event-based chat rooms

---

## 📋 Current Status

✅ **What's Working:**
- `/embed` route exists and loads
- Route accepts URL parameters
- Basic authentication structure in place

❌ **What's Missing:**
- Auto-create/join chat room based on `eventId`
- Automatically display the event's chat room (currently shows "Select a chat to start messaging")
- Event-scoped chat functionality

---

## 🎯 What JetzyChat Needs to Implement

### 1. Handle `eventId` Parameter to Create/Join Chat Rooms

**Current Issue**: When `/embed` loads with `eventId`, it shows the default chat selection screen instead of automatically joining the event's chat room.

**Required Implementation:**

```typescript
// In your /embed route (EmbedPage.tsx or similar)

// 1. Read eventId from URL parameters
const eventId = searchParams.get('eventId')
const userId = searchParams.get('userId')
const userEmail = searchParams.get('userEmail')
const userName = searchParams.get('userName')

// 2. Create or find chat room based on eventId
// Option A: Use eventId as the room/channel identifier
const chatRoomId = `event-${eventId}` // or just use eventId directly

// Option B: Create a group chat room with eventId as metadata
const chatRoom = await getOrCreateChatRoom({
  roomId: eventId, // Use eventId as unique identifier
  type: 'event',   // Mark it as an event chat
  name: `Event Chat: ${eventId}`, // Optional: event name if available
})

// 3. Automatically join the user to this room
await joinUserToRoom(userId, chatRoomId)

// 4. Load and display messages for this room
const messages = await getRoomMessages(chatRoomId)

// 5. Set this room as the active/selected room in the UI
setActiveRoom(chatRoomId)
```

---

### 2. Event-Scoped Chat Room Logic

**Concept**: Each `eventId` should have its own isolated chat room.

**Implementation Options:**

#### Option A: Use `eventId` as Room Identifier (Simplest)

```typescript
// Use eventId directly as the chat room ID
const roomId = eventId // e.g., "507f1f77bcf86cd799439011"

// When user loads /embed?eventId=507f1f77bcf86cd799439011
// Automatically join room: "507f1f77bcf86cd799439011"
```

#### Option B: Create Group Chat with Event Metadata

```typescript
// Create a group chat room with eventId stored as metadata
const room = {
  id: generateRoomId(), // or use eventId
  type: 'event',
  eventId: eventId,
  name: `Event ${eventId}`,
  participants: [], // Users who join this event chat
  createdAt: new Date(),
}
```

#### Option C: Use EventId as Channel/Group Name

```typescript
// If you have channels/groups feature
const channelName = `event-${eventId}`
// Auto-join user to this channel
```

---

### 3. Auto-Join User to Event Chat Room

**Required Flow:**

1. **User loads `/embed` with parameters**
2. **Authenticate/Create user** (you already have this)
3. **Find or create chat room for eventId**
4. **Add user to room** (if not already a member)
5. **Load room messages**
6. **Display room in chat UI** (set as active room)
7. **Send `jetzychat-ready` postMessage** to parent window

**Example Implementation:**

```typescript
useEffect(() => {
  const initializeEventChat = async () => {
    // 1. Validate required parameters
    if (!eventId || !userId || !userEmail) {
      window.parent.postMessage({
        type: 'jetzychat-error',
        message: 'Missing required parameters: eventId, userId, or userEmail'
      }, '*')
      return
    }

    // 2. Authenticate/Create user (you already have this)
    const user = await getOrCreateUser({
      userId,
      email: userEmail,
      name: userName,
      image: userImage,
    })

    // 3. Get or create chat room for this event
    let chatRoom = await findChatRoomByEventId(eventId)
    
    if (!chatRoom) {
      // Create new chat room for this event
      chatRoom = await createChatRoom({
        eventId: eventId,
        name: `Event Chat: ${eventId}`, // Or fetch event name if available
        type: 'event',
        createdBy: userId,
      })
    }

    // 4. Add user to room (if not already a member)
    if (!chatRoom.members.includes(userId)) {
      await addUserToRoom(chatRoom.id, userId)
    }

    // 5. Load messages for this room
    const messages = await loadRoomMessages(chatRoom.id)

    // 6. Set this room as active in your chat UI
    setActiveRoom(chatRoom.id)
    setMessages(messages)

    // 7. Notify parent window that chat is ready
    window.parent.postMessage({
      type: 'jetzychat-ready',
      eventId: eventId,
      roomId: chatRoom.id
    }, '*')
  }

  initializeEventChat()
}, [eventId, userId, userEmail])
```

---

### 4. Database Schema for Event Chat Rooms

**If you need to store event chat rooms, here's a suggested schema:**

```typescript
// ChatRoom model/collection
{
  _id: ObjectId,
  eventId: String,        // The event ID from events app
  roomId: String,         // Your internal room ID (can be same as eventId)
  name: String,           // "Event Chat: [Event Name]" or just eventId
  type: String,           // "event"
  members: [String],       // Array of user IDs
  messages: [ObjectId],    // References to messages (or embedded)
  createdAt: Date,
  updatedAt: Date,
}

// Or if you use eventId directly as roomId:
{
  _id: String,            // Use eventId as _id
  eventId: String,        // Same as _id
  type: "event",
  members: [String],
  messages: [...],
  createdAt: Date,
}
```

---

### 5. UI Updates Required

**Current State**: Shows "Select a chat to start messaging"

**Required State**: Automatically show the event's chat room

**Changes Needed:**

1. **Hide chat selection sidebar** (you might already have this for embed mode)
2. **Auto-select the event's chat room** when embed loads
3. **Display messages for that room immediately**
4. **Show message input for that room**

```typescript
// In your embed page component
useEffect(() => {
  if (eventId && chatRoom) {
    // Hide sidebar (you might already do this)
    setSidebarVisible(false)
    
    // Set active room
    setActiveRoom(chatRoom.id)
    
    // Load messages
    loadMessages(chatRoom.id)
  }
}, [eventId, chatRoom])
```

---

### 6. PostMessage Communication

**You already have this, but ensure it's sent after room is loaded:**

```typescript
// After successfully loading event chat room
window.parent.postMessage({
  type: 'jetzychat-ready',
  eventId: eventId,
  roomId: chatRoom.id
}, '*')

// On error
window.parent.postMessage({
  type: 'jetzychat-error',
  message: 'Failed to load event chat'
}, '*')
```

---

## 📝 Implementation Checklist for JetzyChat

- [ ] Read `eventId` from URL parameters in `/embed` route
- [ ] Create function to get or create chat room by `eventId`
- [ ] Auto-join user to the event's chat room on load
- [ ] Load and display messages for the event's chat room
- [ ] Set the event room as active/selected in UI
- [ ] Hide chat selection UI in embed mode (show only the event room)
- [ ] Ensure `jetzychat-ready` message is sent after room is loaded
- [ ] Test that multiple users joining same `eventId` see the same chat room
- [ ] Test that different `eventId` values create separate chat rooms

---

## 🔍 Testing

**Test URL Format:**
```
http://localhost:5174/embed?eventId=507f1f77bcf86cd799439011&userId=user123&userEmail=user@example.com&userName=John%20Doe
```

**Expected Behavior:**
1. ✅ Page loads without showing "Select a chat to start messaging"
2. ✅ Automatically shows chat room for that eventId
3. ✅ User can immediately see messages (if any) and send new messages
4. ✅ Multiple users with same eventId see the same chat room
5. ✅ Different eventIds show different chat rooms

---

## 💡 Key Points

1. **EventId = Chat Room**: Each unique `eventId` should have its own chat room
2. **Auto-Join**: Users should automatically join the event's chat room (no manual selection)
3. **Isolation**: Different events should have completely separate chat rooms
4. **No Event Data Needed**: JetzyChat doesn't need to know about events - just use `eventId` as a room identifier

---

## 🚀 Quick Implementation Guide

**Minimal Implementation (Simplest Approach):**

1. In `/embed` route, read `eventId` from URL
2. Use `eventId` as the chat room ID (or create room with `eventId` as identifier)
3. Auto-join user to that room
4. Display that room's messages
5. Done!

**Example (pseudo-code):**

```typescript
const eventId = searchParams.get('eventId')
const roomId = `event-${eventId}` // or just eventId

// Get or create room
let room = await db.chatRooms.findOne({ eventId })
if (!room) {
  room = await db.chatRooms.create({ eventId, roomId, type: 'event' })
}

// Join user
await db.chatRooms.updateOne(
  { eventId },
  { $addToSet: { members: userId } }
)

// Load messages
const messages = await db.messages.find({ roomId })

// Display in UI
setActiveRoom(roomId)
setMessages(messages)
```

---

**That's it!** Once JetzyChat implements this, the events app integration will work perfectly. 🎉

