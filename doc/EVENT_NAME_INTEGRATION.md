# Event Name Integration - JetzyChat

## ✅ What Was Updated

The events app now passes the event name to JetzyChat so it can display a friendly chat room name instead of just the eventId.

---

## 📝 Changes Made

### 1. Updated `JetzyChatIntegration` Component

**File**: `src/components/events/JetzyChatIntegration.tsx`

- Added optional `eventName` prop
- Passes `eventName` as URL parameter to JetzyChat

**Changes**:
```typescript
interface JetzyChatIntegrationProps {
  eventId: string
  eventName?: string // New: Optional event name
}

// In URL building:
if (eventName) {
  embedUrl.searchParams.set('eventName', eventName)
}
```

---

### 2. Updated Event Management Page

**File**: `src/pages/console/events/[eventId]/manage.tsx`

- Now passes `eventName={eventData.name}` to the component

---

### 3. Updated Public Event Page

**File**: `src/components/HostedEvents.tsx`

- Now passes `eventName={clonedEvent.name}` to the component

---

## 🔗 URL Parameter

JetzyChat will now receive:
- `eventId` - The event ID (required)
- `eventName` - The event name (optional, but recommended)

**Example URL**:
```
http://localhost:5174/embed?eventId=6952c23e676af95f6502a320&userId=...&userEmail=...&eventName=Come%20join%20this%20event%20for%20the%20end%20of%20the%20year%20festivities
```

---

## 🎯 What JetzyChat Needs to Do

JetzyChat should use the `eventName` parameter to display a friendly chat room name:

**Current**: "Event Chat: 6952c23e676af95f6502a320"  
**Expected**: "Event Chat: Come join this event for the end of the year festivities"

**Implementation in JetzyChat**:

```typescript
// In EmbedPage.tsx
const eventName = searchParams.get('eventName')
const eventId = searchParams.get('eventId')

// Use eventName if available, otherwise fallback to eventId
const chatRoomName = eventName 
  ? `Event Chat: ${eventName}` 
  : `Event Chat: ${eventId}`
```

---

## ✅ Status

- ✅ Events app passes `eventName` parameter
- ⚠️ JetzyChat needs to use `eventName` to display friendly chat room name

---

## 🧪 Testing

After JetzyChat implements the eventName usage:

1. Open an event page
2. Click "Chat" tab
3. **Expected**: Chat room name shows event name instead of eventId
4. **Example**: "Event Chat: Come join this event..." instead of "Event Chat: 6952c23e676af95f6502a320"

---

**The events app is ready!** JetzyChat just needs to read and use the `eventName` parameter. 🎉

