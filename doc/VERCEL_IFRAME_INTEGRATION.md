# Vercel Iframe Integration Guide

Since **JetzyChat is deployed on Vercel**, here's the best approach for integration:

## ✅ Recommended: Iframe Embedding (Vercel)

### Why This Works Perfectly on Vercel:

1. **Easy URL Management**
   - Production: `https://jetzychat.vercel.app`
   - Preview: `https://jetzychat-git-branch.vercel.app`
   - Custom domain: `chat.jetzy.com` (if configured)

2. **Independent Deployments**
   - Both apps deploy separately
   - No coordination needed
   - Preview deployments work great for testing

3. **Vercel Handles CORS**
   - Automatic CORS handling
   - Just need to configure iframe headers

4. **Fast Implementation**
   - Can be done in hours
   - No code changes in JetzyChat initially

---

## 🚀 Implementation Steps

### Step 1: Get JetzyChat Vercel URL

Ask JetzyChat team:
- **Production URL**: `https://jetzychat.vercel.app` (or custom domain)
- **Preview URL format**: For testing with preview deployments

### Step 2: Configure JetzyChat for Iframe (JetzyChat Team)

**In JetzyChat's `vercel.json`:**

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

**Or in Next.js API route/Page (if using Next.js headers):**

```typescript
// In JetzyChat app: app/embed/page.tsx or pages/embed.tsx
export async function getServerSideProps() {
  return {
    props: {},
  }
}

// Or in middleware/headers
export const headers = {
  'X-Frame-Options': 'SAMEORIGIN',
}
```

### Step 3: Create Embed Route in JetzyChat

**Example: `app/embed/page.tsx` or `pages/embed.tsx`**

```typescript
// JetzyChat app - embed route
'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function EmbedPage() {
  const searchParams = useSearchParams()
  const [isReady, setIsReady] = useState(false)

  const eventId = searchParams.get('eventId')
  const userId = searchParams.get('userId')
  const userName = searchParams.get('userName')
  const userEmail = searchParams.get('userEmail')
  const token = searchParams.get('token')

  useEffect(() => {
    // Authenticate user with token/params
    // Initialize chat for eventId
    
    // Notify parent when ready
    if (window.parent) {
      window.parent.postMessage(
        { type: 'jetzychat-ready', eventId },
        '*' // In production, specify exact origin
      )
    }
    setIsReady(true)
  }, [eventId, userId, token])

  if (!isReady) {
    return <div>Loading chat...</div>
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {/* Your JetzyChat component here */}
      {/* Pass eventId, userId, etc. as props */}
    </div>
  )
}
```

### Step 4: Implement in Events App

**Create component: `src/components/events/JetzyChatIntegration.tsx`**

```typescript
"use client"

import { useEffect, useRef, useState } from "react"
import { Box, Spinner, Text } from "@chakra-ui/react"
import { useSession } from "next-auth/react"

interface JetzyChatIntegrationProps {
    eventId: string
}

export default function JetzyChatIntegration({ eventId }: JetzyChatIntegrationProps) {
    const { data: session } = useSession()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Listen for messages from iframe
        const handleMessage = (event: MessageEvent) => {
            // In production, verify origin:
            // const allowedOrigins = [
            //   process.env.NEXT_PUBLIC_JETZYCHAT_URL,
            //   'https://jetzychat.vercel.app',
            // ]
            // if (!allowedOrigins.includes(event.origin)) return
            
            if (event.data.type === 'jetzychat-ready') {
                setIsLoading(false)
                setError(null)
            }
            
            if (event.data.type === 'jetzychat-error') {
                setError(event.data.message)
                setIsLoading(false)
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // Build embed URL
    // Use Vercel URL from environment or fallback
    const jetzyChatUrl = process.env.NEXT_PUBLIC_JETZYCHAT_URL || 'https://jetzychat.vercel.app'
    
    const embedUrl = `${jetzyChatUrl}/embed?` + new URLSearchParams({
        eventId,
        userId: session?.user?.id || '',
        userName: session?.user?.name || '',
        userEmail: session?.user?.email || '',
        // Add JWT token if your auth uses it
        // token: session?.accessToken || '',
    }).toString()

    return (
        <Box 
            bg="white" 
            borderRadius="lg" 
            boxShadow="sm" 
            position="relative"
            minH="600px"
            overflow="hidden"
        >
            {isLoading && (
                <Box 
                    position="absolute" 
                    top="50%" 
                    left="50%" 
                    transform="translate(-50%, -50%)"
                    zIndex={1}
                    textAlign="center"
                >
                    <Spinner size="lg" color="blue.500" />
                    <Text mt={2} color="gray.600">Loading chat...</Text>
                </Box>
            )}
            
            {error && (
                <Box p={4} color="red.500" textAlign="center">
                    {error}
                </Box>
            )}

            <iframe
                ref={iframeRef}
                src={embedUrl}
                style={{
                    width: '100%',
                    height: '600px',
                    border: 'none',
                    borderRadius: '8px',
                }}
                allow="microphone; camera"
                onLoad={() => {
                    // Fallback: hide loading after 5 seconds if no message received
                    setTimeout(() => setIsLoading(false), 5000)
                }}
                title="JetzyChat"
            />
        </Box>
    )
}
```

### Step 5: Add to Event Page

**Modify: `src/components/HostedEvents.tsx`**

Add tabs to switch between Discussion and Chat:

```typescript
// Add imports
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react"
import JetzyChatIntegration from "@/components/events/JetzyChatIntegration"

// Add state
const [activeChatTab, setActiveChatTab] = useState<"discussion" | "chat">("discussion")

// Replace DiscussionBoard section (around line 621) with:
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
                />
            </TabPanel>
        </TabPanels>
    </Tabs>
</div>
```

### Step 6: Add Environment Variable

**In `.env.local` or Vercel environment variables:**

```env
# JetzyChat Vercel URL
NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat.vercel.app

# Or for preview deployments during testing:
# NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat-git-feature-branch.vercel.app
```

**In Vercel Dashboard:**
1. Go to your events app project
2. Settings → Environment Variables
3. Add: `NEXT_PUBLIC_JETZYCHAT_URL` = `https://jetzychat.vercel.app`

---

## 🧪 Testing with Vercel Preview Deployments

### Test Integration:

1. **Create PR in JetzyChat** → Get preview URL
2. **Set env var in Events app** to preview URL
3. **Test integration** with preview deployment
4. **Merge PR** → Use production URL

### Example Preview URL:
```
https://jetzychat-git-feature-embed.vercel.app
```

Set in events app:
```env
NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat-git-feature-embed.vercel.app
```

---

## 🔒 Security Considerations

### 1. Origin Verification (Production)

```typescript
// In events app - verify messages
const allowedOrigins = [
  process.env.NEXT_PUBLIC_JETZYCHAT_URL,
  'https://jetzychat.vercel.app',
  // Add custom domain if exists
]

const handleMessage = (event: MessageEvent) => {
  if (!allowedOrigins.includes(event.origin)) {
    console.warn('Message from unauthorized origin:', event.origin)
    return
  }
  // Handle message
}
```

### 2. Content Security Policy

In JetzyChat's `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/embed",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://events.jetzy.com https://*.vercel.app"
        }
      ]
    }
  ]
}
```

---

## 📋 Checklist

### JetzyChat Team Needs to:
- [ ] Create `/embed` route
- [ ] Accept URL params: `eventId`, `userId`, `userName`, `userEmail`, `token`
- [ ] Configure `vercel.json` to allow iframe embedding
- [ ] Handle authentication via URL params
- [ ] Send `postMessage` when ready (optional)
- [ ] Provide Vercel URL (production and preview format)

### Events App (This Repo):
- [ ] Create `JetzyChatIntegration.tsx` component
- [ ] Add tabs to `HostedEvents.tsx`
- [ ] Add `NEXT_PUBLIC_JETZYCHAT_URL` env variable
- [ ] Test with preview deployment
- [ ] Deploy to production

---

## 🎯 Next Steps

1. **Ask JetzyChat team** for:
   - Vercel URL: `https://jetzychat.vercel.app` (or custom domain)
   - Confirmation that `/embed` route will be created
   - Preview deployment URL format

2. **I'll implement** the integration component once you have the URL

3. **Test** with both apps on Vercel preview deployments

4. **Deploy** to production

---

## 💡 Benefits of Vercel Deployment

- ✅ **Preview Deployments** - Test integration before merging
- ✅ **Automatic HTTPS** - No SSL certificate issues
- ✅ **Fast CDN** - Chat loads quickly globally
- ✅ **Easy Environment Variables** - Set in Vercel dashboard
- ✅ **Independent Scaling** - Both apps scale independently

Ready to implement once you have the JetzyChat Vercel URL! 🚀

