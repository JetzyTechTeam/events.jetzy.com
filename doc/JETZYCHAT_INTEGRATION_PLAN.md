# JetzyChat Integration Plan for Events App

This document outlines how to integrate JetzyChat into the events-jetzy-com app so users can access chat functionality from event pages.

## Current Structure

### Event Page Layout (`src/components/HostedEvents.tsx`)

The event detail page currently has:
- **Left Column (2/3 width)**: Contains:
  - About section (event description, privacy, host info)
  - **DiscussionBoard** component (line 621)
- **Right Column (1/3 width)**: Contains:
  - Location card
  - Sticky ticket card
  - Other sidebar content

### Current Discussion Feature

- **DiscussionBoard** component is already integrated
- Located at: `src/components/events/DiscussionBoard.tsx`
- Shows discussion posts, comments, and replies
- Users can create posts, react, and comment

## Integration Options

### Option 1: Add JetzyChat as a Tab/Section Toggle (Recommended)

Add a toggle or tabs to switch between Discussion Board and JetzyChat.

**Implementation:**
1. Add a tab system above the discussion area
2. Two tabs: "Discussion" and "Chat"
3. Show DiscussionBoard or JetzyChat based on selected tab

**Pros:**
- Users can choose between discussion and chat
- Both features remain available
- Clean separation of features

**Cons:**
- Takes up more vertical space
- Users might be confused about which to use

### Option 2: Replace DiscussionBoard with JetzyChat

Replace the existing DiscussionBoard with JetzyChat.

**Implementation:**
1. Remove DiscussionBoard component
2. Add JetzyChat component in its place
3. Keep the same layout structure

**Pros:**
- Simpler implementation
- One unified chat experience
- Less UI complexity

**Cons:**
- Loses existing discussion board functionality
- May need to migrate existing discussion data

### Option 3: Add JetzyChat as a Floating Widget

Add JetzyChat as a floating chat widget (like a chat bubble).

**Implementation:**
1. Add a floating button/icon
2. Opens JetzyChat in a modal or side panel
3. Can be accessed from anywhere on the event page

**Pros:**
- Doesn't interfere with existing layout
- Always accessible
- Modern chat UX pattern

**Cons:**
- May be less discoverable
- Requires modal/overlay implementation

### Option 4: Add JetzyChat Below DiscussionBoard

Add JetzyChat as a separate section below the DiscussionBoard.

**Implementation:**
1. Keep DiscussionBoard as is
2. Add JetzyChat component below it
3. Both sections visible (or collapsible)

**Pros:**
- Both features available simultaneously
- Simple to implement
- No data migration needed

**Cons:**
- Takes up more space
- May feel redundant

## Recommended Approach: Option 1 (Tab System)

Based on the current structure, **Option 1** is recommended because:
- Maintains existing discussion functionality
- Provides clear user choice
- Follows common UI patterns
- Easy to implement

## Implementation Steps

### Step 1: Create JetzyChat Component Wrapper

Create a wrapper component that loads JetzyChat:

```typescript
// src/components/events/JetzyChatIntegration.tsx
"use client"

import React, { useEffect, useRef } from "react"
import { Box, Spinner } from "@chakra-ui/react"

interface JetzyChatIntegrationProps {
    eventId: string
    userId?: string
    userName?: string
    userEmail?: string
}

export default function JetzyChatIntegration({ 
    eventId, 
    userId, 
    userName, 
    userEmail 
}: JetzyChatIntegrationProps) {
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Load JetzyChat here
        // This could be:
        // 1. An iframe to JetzyChat app
        // 2. A React component from JetzyChat package
        // 3. A script injection (like sendbird.js)
        
        // Example: If JetzyChat is a separate app
        // const chatUrl = `${process.env.NEXT_PUBLIC_JETZYCHAT_URL}/embed?eventId=${eventId}&userId=${userId}`
        
        // Example: If JetzyChat is an npm package
        // import { JetzyChat } from '@jetzy/chat'
        // <JetzyChat eventId={eventId} userId={userId} />
        
        setIsLoading(false)
    }, [eventId, userId])

    if (isLoading) {
        return (
            <Box p={8} textAlign="center">
                <Spinner size="lg" />
            </Box>
        )
    }

    return (
        <Box 
            ref={chatContainerRef}
            bg="white" 
            borderRadius="lg" 
            boxShadow="sm" 
            p={4}
            minH="500px"
        >
            {/* JetzyChat will be rendered here */}
            <div id="jetzychat-container" />
        </Box>
    )
}
```

### Step 2: Add Tab System to HostedEvents

Modify `src/components/HostedEvents.tsx` to add tabs:

```typescript
// Add these imports
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react"
import JetzyChatIntegration from "@/components/events/JetzyChatIntegration"

// Inside HostedEvents component, add state
const [activeChatTab, setActiveChatTab] = useState<"discussion" | "chat">("discussion")

// Replace the DiscussionBoard section (around line 621) with:
<div className="lg:col-span-2 space-y-4 mt-8">
    {/* ... existing About section ... */}

    {/* Chat/Discussion Tabs */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <Tabs 
            index={activeChatTab === "discussion" ? 0 : 1}
            onChange={(index) => setActiveChatTab(index === 0 ? "discussion" : "chat")}
        >
            <TabList borderBottom="1px" borderColor="gray.200" px={4} pt={4}>
                <Tab 
                    _selected={{ color: "blue.600", borderBottomColor: "blue.600" }}
                    fontWeight="medium"
                >
                    Discussion
                </Tab>
                <Tab 
                    _selected={{ color: "blue.600", borderBottomColor: "blue.600" }}
                    fontWeight="medium"
                >
                    Chat
                </Tab>
            </TabList>

            <TabPanels>
                <TabPanel px={0} py={0}>
                    <DiscussionBoard eventId={clonedEvent._id.toString()} />
                </TabPanel>
                <TabPanel px={0} py={0}>
                    <JetzyChatIntegration
                        eventId={clonedEvent._id.toString()}
                        userId={session?.user?.id}
                        userName={session?.user?.name}
                        userEmail={session?.user?.email}
                    />
                </TabPanel>
            </TabPanels>
        </Tabs>
    </div>
</div>
```

### Step 3: Configure Environment Variables

Add JetzyChat configuration to `.env`:

```env
# JetzyChat Configuration
NEXT_PUBLIC_JETZYCHAT_URL=https://chat.jetzy.com
# OR if using npm package, no URL needed
```

### Step 4: Handle Authentication

Ensure user session is passed to JetzyChat:

```typescript
// In JetzyChatIntegration component
const { data: session } = useSession()

// Pass session data to JetzyChat
// This depends on how JetzyChat expects authentication
```

## Integration Methods (Choose One)

### Method A: If JetzyChat is a Separate App (iframe)

```typescript
// In JetzyChatIntegration.tsx
useEffect(() => {
    if (chatContainerRef.current && eventId) {
        const iframe = document.createElement('iframe')
        iframe.src = `${process.env.NEXT_PUBLIC_JETZYCHAT_URL}/embed?eventId=${eventId}&userId=${userId}`
        iframe.style.width = '100%'
        iframe.style.height = '600px'
        iframe.style.border = 'none'
        chatContainerRef.current.appendChild(iframe)
        
        return () => {
            if (chatContainerRef.current) {
                chatContainerRef.current.removeChild(iframe)
            }
        }
    }
}, [eventId, userId])
```

### Method B: If JetzyChat is an NPM Package

```typescript
// Install: npm install @jetzy/chat
import { JetzyChat } from '@jetzy/chat'

// In component
<JetzyChat 
    eventId={eventId}
    userId={userId}
    userName={userName}
    userEmail={userEmail}
    config={{
        // JetzyChat configuration
    }}
/>
```

### Method C: If JetzyChat Uses Script Injection

```typescript
// Similar to sendbird.js approach
useEffect(() => {
    const script = document.createElement('script')
    script.src = `${process.env.NEXT_PUBLIC_JETZYCHAT_URL}/sdk.js`
    script.async = true
    script.onload = () => {
        // Initialize JetzyChat
        if (window.JetzyChat) {
            window.JetzyChat.init({
                eventId,
                userId,
                container: chatContainerRef.current
            })
        }
    }
    document.body.appendChild(script)
    
    return () => {
        document.body.removeChild(script)
    }
}, [eventId, userId])
```

## Required Information from JetzyChat Team

To complete the integration, you need:

1. **How is JetzyChat deployed?**
   - Separate app URL?
   - NPM package?
   - Script injection?

2. **Authentication method?**
   - JWT token?
   - Session cookie?
   - API key?

3. **Event context?**
   - How to pass eventId?
   - What event data does it need?

4. **User context?**
   - What user data is required?
   - How to identify users?

5. **Styling/Customization?**
   - Can it match events app theme?
   - Custom CSS needed?

## File Changes Summary

### Files to Create:
- `src/components/events/JetzyChatIntegration.tsx` - Wrapper component

### Files to Modify:
- `src/components/HostedEvents.tsx` - Add tabs and JetzyChat integration

### Environment Variables to Add:
- `NEXT_PUBLIC_JETZYCHAT_URL` (if using iframe/script method)

## Testing Checklist

- [ ] JetzyChat loads correctly on event page
- [ ] User authentication works
- [ ] Event context is passed correctly
- [ ] Chat messages are scoped to event
- [ ] Mobile responsive
- [ ] Tab switching works smoothly
- [ ] No conflicts with existing DiscussionBoard
- [ ] Performance is acceptable

## Next Steps

1. **Determine integration method** - Ask JetzyChat team how to integrate
2. **Create wrapper component** - Implement `JetzyChatIntegration.tsx`
3. **Add tabs to HostedEvents** - Modify the event page layout
4. **Test integration** - Verify everything works
5. **Style adjustments** - Match events app design
6. **Deploy** - Roll out to production

## Questions to Answer

Before starting implementation, clarify:

1. Is JetzyChat a separate app or a component library?
2. How should users authenticate?
3. Should chat be per-event or global?
4. Do we need to migrate existing discussion data?
5. What's the preferred integration method (iframe, npm, script)?

