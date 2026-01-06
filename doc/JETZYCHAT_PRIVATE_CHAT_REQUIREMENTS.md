# JetzyChat - Private Chat Integration (Already Implemented!)

**For**: JetzyChat Development Team  
**Status**: ✅ **Already Working** - No additional implementation needed  
**Purpose**: Understanding how private chat works in embed mode

---

## 📋 Overview

**Good News**: Private chat (1-on-1 messages) is **already fully implemented** in JetzyChat's embed route! Users can access all their private chats through the sidebar in the embed interface.

**No additional implementation needed!** ✅

---

## 🎯 What Events App Does

### 1. Private Chat Button Component

**File**: `src/components/events/PrivateChatButton.tsx`

- Displays a "Message" button/icon on user profiles
- Opens JetzyChat in a new window with private chat parameters
- Only shows for logged-in users
- Hides for self (can't message yourself)

### 2. Where It's Added

- **Discussion Posts**: Message button next to user avatars
- **Guest Lists**: Message button for each guest (can be added)
- **User Profiles**: Anywhere users are displayed

---

## 📝 Note

**The events app does NOT need to send special parameters for private chat.** The sidebar functionality is already built into JetzyChat's embed route.

Users simply:
1. Load the embed route (with eventId)
2. Toggle the sidebar
3. Access all their private chats

---

## 🔗 Optional: Direct Private Chat URL (If Needed)

If you want to support direct links to specific private chats (optional feature), the events app could send:

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `chatType` | string | Set to `"private"` to indicate private chat |
| `roomId` | string | Unique room ID (sorted combination of both user IDs: `userId1_userId2`) |
| `targetUserId` | string | The user ID of the person to chat with |
| `targetUserName` | string | Name of the target user |
| `targetUserEmail` | string | Email of the target user |
| `userId` | string | Current user's ID |
| `userEmail` | string | Current user's email |

### Optional Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `targetUserImage` | string | Profile image URL of target user |
| `userName` | string | Current user's name |
| `userImage` | string | Current user's profile image URL |

---

## 📝 Example URL

```
http://localhost:5174/embed?chatType=private&roomId=user123_user456&targetUserId=user456&targetUserName=John%20Doe&targetUserEmail=john@example.com&userId=user123&userEmail=current@example.com&userName=Current%20User
```

---

## 🎯 What JetzyChat Needs to Do

### 1. Detect Private Chat Mode

In your `/embed` route, check for `chatType=private`:

```typescript
const chatType = searchParams.get('chatType')
const isPrivateChat = chatType === 'private'

if (isPrivateChat) {
  // Handle private chat
  const roomId = searchParams.get('roomId')
  const targetUserId = searchParams.get('targetUserId')
  const targetUserName = searchParams.get('targetUserName')
  const targetUserEmail = searchParams.get('targetUserEmail')
  
  // Open/create private chat room with target user
  await openPrivateChat({
    roomId,
    targetUserId,
    targetUserName,
    targetUserEmail,
  })
} else {
  // Handle event chat (existing functionality)
  const eventId = searchParams.get('eventId')
  // ... existing event chat code
}
```

---

### 2. Create/Open Private Chat Room

**Room ID Logic**: 
- Events app creates roomId as: `[userId1, userId2].sort().join('_')`
- This ensures both users get the same roomId regardless of who initiates
- Example: User A (id: "123") and User B (id: "456") → roomId: "123_456"

**Implementation**:

```typescript
const openPrivateChat = async ({
  roomId,
  targetUserId,
  targetUserName,
  targetUserEmail,
  targetUserImage,
}) => {
  // Get or create private chat room
  let chatRoom = await findChatRoomByRoomId(roomId)
  
  if (!chatRoom) {
    // Create new private chat room
    chatRoom = await createChatRoom({
      roomId: roomId,
      type: 'private',
      participants: [currentUserId, targetUserId],
      name: targetUserName, // Display target user's name
      // ... other fields
    })
  }
  
  // Add current user to room if not already a member
  if (!chatRoom.participants.includes(currentUserId)) {
    await addUserToRoom(roomId, currentUserId)
  }
  
  // Load messages for this private chat
  const messages = await loadRoomMessages(roomId)
  
  // Set as active room and display
  setActiveRoom(roomId)
  setMessages(messages)
  
  // Notify parent window
  window.parent.postMessage({
    type: 'jetzychat-ready',
    chatType: 'private',
    roomId: roomId,
    targetUserId: targetUserId
  }, '*')
}
```

---

### 3. Display Private Chat

**UI Changes**:

- Show target user's name as chat title (instead of "Event Chat: ...")
- Display private chat messages
- Hide event chat sidebar (if applicable)
- Show message input for private chat

**Example**:

```typescript
// In your chat UI component
const chatTitle = isPrivateChat 
  ? targetUserName  // "John Doe"
  : `Event Chat: ${eventName || eventId}`  // "Event Chat: Event Name"
```

---

## 🔄 Two Chat Modes

JetzyChat should support both modes:

### Mode 1: Event Chat (Existing)
- URL has `eventId` parameter
- Shows event group chat
- All event participants can see messages

### Mode 2: Private Chat (New)
- URL has `chatType=private` and `roomId` parameters
- Shows one-on-one chat between two users
- Only the two participants can see messages

---

## 📋 Implementation Checklist

- [ ] Detect `chatType=private` parameter
- [ ] Read `roomId`, `targetUserId`, `targetUserName`, `targetUserEmail`
- [ ] Create or find private chat room using `roomId`
- [ ] Add both users as participants
- [ ] Load private chat messages
- [ ] Display target user's name as chat title
- [ ] Show private chat UI (different from event chat)
- [ ] Send `jetzychat-ready` message with `chatType: 'private'`
- [ ] Test that both users see the same room (same roomId)
- [ ] Test that messages are private (only visible to participants)

---

## 🧪 Testing

### Test 1: Open Private Chat
**URL**: 
```
http://localhost:5174/embed?chatType=private&roomId=user123_user456&targetUserId=user456&targetUserName=John%20Doe&targetUserEmail=john@example.com&userId=user123&userEmail=current@example.com
```

**Expected**: 
- Private chat opens with John Doe
- Chat title shows "John Doe" (not "Event Chat")
- Can send messages

---

### Test 2: Same Room from Both Sides
**User A opens chat with User B**:
- roomId: `userA_userB` (sorted)

**User B opens chat with User A**:
- roomId: `userA_userB` (same, because sorted)

**Expected**: Both users see the same chat room and messages

---

### Test 3: Multiple Private Chats
**User A chats with User B**: roomId `userA_userB`  
**User A chats with User C**: roomId `userA_userC`

**Expected**: Separate chat rooms, messages don't mix

---

## 💡 Key Points

1. **Room ID**: Use sorted user IDs to ensure same room for both users
2. **Chat Type**: Use `chatType=private` to distinguish from event chat
3. **Target User**: Display target user's name as chat title
4. **Privacy**: Only participants can see private chat messages
5. **Existing Feature**: JetzyChat already has private chat - just need to support embed mode with these parameters

---

## 🎯 Summary

**What to implement**:
1. Check for `chatType=private` in embed route
2. Use `roomId` to create/find private chat room
3. Display target user's name instead of event name
4. Load and display private chat messages
5. Support both event chat and private chat modes

**That's it!** JetzyChat already has private chat functionality - just need to support it in embed mode with the URL parameters. 🎉

