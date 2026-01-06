# JetzyChat Integration Requirements

**Purpose**: This document contains questions that need to be answered by the JetzyChat app team to enable integration with the events-jetzy-com app.

---

## Questions for JetzyChat App Team

Please provide answers to the following questions so we can integrate JetzyChat into the events app:

### 1. **Deployment & Integration Method**

**Question**: How is JetzyChat deployed and how should it be integrated into another Next.js app?

**Options we need to know:**
- [ ] Is JetzyChat a separate deployed app with a URL?
- [ ] Is it an NPM package that can be installed?
- [ ] Is it a script that needs to be injected (like sendbird.js)?
- [ ] Is it a React component library?

**If separate app:**
- What is the base URL? (e.g., `https://chat.jetzy.com`)
- Is there an embed endpoint? (e.g., `/embed`)

**If NPM package:**
- What is the package name? (e.g., `@jetzy/chat`)
- What version should we use?

**If script injection:**
- What is the script URL?
- What is the initialization function name?

---

### 2. **Authentication & User Context**

**Question**: How does JetzyChat handle user authentication and what user data does it need?

**We need to know:**
- [ ] Does JetzyChat use JWT tokens?
- [ ] Does it use session cookies?
- [ ] Does it use API keys?
- [ ] Does it handle its own authentication?

**What user data is required?**
- User ID (required/optional)?
- User name (required/optional)?
- User email (required/optional)?
- User avatar/image (required/optional)?
- Any other user properties?

**How to pass user data:**
- Via props?
- Via initialization config?
- Via API call?
- Via URL parameters?

**Example of what we have available:**
```typescript
{
  id: string,
  name: string,
  email: string,
  image?: string,
  role?: string
}
```

---

### 3. **Event Context & Scoping**

**Question**: How should we pass event information to JetzyChat?

**We need to know:**
- [ ] Does JetzyChat support event-scoped chats? (one chat per event)
- [ ] Or is it a global chat? (all events share one chat)
- [ ] Can it handle multiple event contexts?

**What event data is required?**
- Event ID (required/optional)?
- Event name (required/optional)?
- Event description (required/optional)?
- Event start/end date (required/optional)?
- Any other event properties?

**How to pass event data:**
- Via props?
- Via initialization config?
- Via API call?
- Via URL parameters?

**Example of what we have available:**
```typescript
{
  _id: string,
  name: string,
  desc: string,
  startDate: Date,
  endDate: Date,
  location: string,
  // ... other event properties
}
```

---

### 4. **Component/API Interface**

**Question**: What is the exact interface/API for using JetzyChat?

**If React Component:**
```typescript
// Please provide the exact component signature
import { JetzyChat } from '...'

<JetzyChat 
  // What props are required?
  // What props are optional?
  // What is the exact prop interface?
/>
```

**If Script/iframe:**
```typescript
// Please provide:
// 1. Script URL
// 2. Initialization function name
// 3. Configuration object structure
// 4. Container element requirements
```

**If API-based:**
```typescript
// Please provide:
// 1. API endpoints needed
// 2. Request/response formats
// 3. Authentication headers
// 4. WebSocket connections (if any)
```

---

### 5. **Styling & Customization**

**Question**: Can JetzyChat be styled to match the events app theme?

**We need to know:**
- [ ] Can we pass custom CSS/styling?
- [ ] Does it support theme customization?
- [ ] What CSS classes/selectors can we target?
- [ ] Does it have a dark/light mode?
- [ ] Can we customize colors, fonts, spacing?

**Our app theme:**
- Primary color: Blue (#2563EB, #1E40AF)
- Background: White/Gray (#F0F2F5)
- Text: Dark gray (#1C1E21, #65676B)
- Uses Chakra UI components
- Uses Tailwind CSS

---

### 6. **File Upload Integration**

**Question**: Does JetzyChat support file uploads and how does it handle them?

**We need to know:**
- [ ] Does JetzyChat support file/image uploads?
- [ ] Does it use the same S3 upload endpoint we use?
- [ ] What is the upload API endpoint?
- [ ] What file types are supported?
- [ ] What is the max file size?

**Our current upload setup:**
- Endpoint: `https://prod-api.jetzy.com/api/v1/uploader/multiple`
- Uses FormData with `upload_file` field
- Returns: `{ data: [{ fileUrl: string }] }`
- S3 bucket: `jetzy-media-prod.s3.us-east-1.amazonaws.com`

**Can JetzyChat use the same upload endpoint?**

---

### 7. **Real-time Features**

**Question**: What real-time features does JetzyChat support?

**We need to know:**
- [ ] Real-time message delivery?
- [ ] Typing indicators?
- [ ] Online/offline status?
- [ ] Read receipts?
- [ ] Push notifications?
- [ ] WebSocket or polling?

---

### 8. **Mobile Responsiveness**

**Question**: Is JetzyChat mobile-responsive?

**We need to know:**
- [ ] Does it work well on mobile devices?
- [ ] Does it have a mobile-optimized UI?
- [ ] Any special mobile considerations?

---

### 9. **Error Handling**

**Question**: How should we handle errors and edge cases?

**We need to know:**
- [ ] What errors can occur?
- [ ] How are errors communicated?
- [ ] What happens if user is not authenticated?
- [ ] What happens if event doesn't exist?
- [ ] How to handle network failures?

---

### 10. **Configuration & Environment Variables**

**Question**: What configuration is needed?

**We need to know:**
- [ ] What environment variables are required?
- [ ] What API keys/tokens are needed?
- [ ] What URLs/endpoints need to be configured?
- [ ] Any feature flags or settings?

**Example format:**
```env
JETZYCHAT_API_URL=https://...
JETZYCHAT_API_KEY=...
JETZYCHAT_APP_ID=...
```

---

### 11. **Dependencies & Requirements**

**Question**: What are the technical requirements?

**We need to know:**
- [ ] What npm packages are required?
- [ ] What React version is needed?
- [ ] What Node.js version is needed?
- [ ] Any browser compatibility requirements?
- [ ] Any other dependencies?

---

### 12. **Example Code**

**Question**: Can you provide a complete working example?

**We need:**
- [ ] Minimal example of how to integrate JetzyChat
- [ ] Example with authentication
- [ ] Example with event context
- [ ] Example with error handling

**Example format we'd like:**
```typescript
// Complete working example
import { JetzyChat } from '@jetzy/chat'

function EventPage({ eventId, userId }) {
  return (
    <JetzyChat
      eventId={eventId}
      userId={userId}
      // ... other props
    />
  )
}
```

---

## What We'll Provide

Once we have the answers, we'll provide:

1. **Event context** - Event ID, name, dates, location, etc.
2. **User context** - User ID, name, email, avatar from NextAuth session
3. **Integration point** - We'll add it to the event detail page (`/events/[slug]`)
4. **Styling** - We'll match it to our app's design system
5. **File upload** - We can share our S3 upload implementation if needed

---

## Integration Location

**Where JetzyChat will be integrated:**
- **File**: `src/components/HostedEvents.tsx`
- **Page**: Event detail page (`/events/[slug]`)
- **Layout**: Will be added as a tab alongside the existing DiscussionBoard
- **Position**: Left column, below the "About" section

**Current structure:**
```
Event Page
├── Header (event banner, title, etc.)
├── Main Content (2-column layout)
│   ├── Left Column (2/3 width)
│   │   ├── About Section
│   │   ├── DiscussionBoard (existing)
│   │   └── JetzyChat (to be added here)
│   └── Right Column (1/3 width)
│       ├── Location Card
│       └── Ticket Card
```

---

## Priority Questions

**Most important to answer first:**
1. Integration method (NPM, iframe, script, API)
2. Authentication method
3. Event scoping (per-event or global)
4. Component/API interface

---

## Contact

Once you have answers to these questions, please provide them and we'll implement the integration.

**Format for responses:**
- Use the same numbering (1-12)
- Provide code examples where applicable
- Include any relevant documentation links
- Specify required vs optional features

