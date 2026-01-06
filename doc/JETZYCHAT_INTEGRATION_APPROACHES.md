# Best Integration Approaches for Separate Repo App

Since JetzyChat is built in a **separate repository** and **deployed on Vercel**, here are the recommended integration approaches, ranked by practicality:

---

## 🏆 Recommended Approach: **Iframe Embedding** (Easiest & Fastest)

### Why This Works Best (Especially on Vercel):
- ✅ **No code changes needed** in JetzyChat repo
- ✅ **Independent deployments** - Both apps deploy separately on Vercel
- ✅ **Vercel URLs** - Easy to get production/preview URLs
- ✅ **Isolation** - No dependency conflicts
- ✅ **Quick to implement** - Can be done in hours
- ✅ **Easy to maintain** - Changes to JetzyChat don't break events app
- ✅ **Preview deployments** - Test integration with Vercel preview URLs
- ✅ **CORS handled** - Vercel handles CORS automatically

### How It Works:
1. JetzyChat app exposes an embeddable route (e.g., `/embed`)
2. Events app loads JetzyChat in an iframe
3. Communication via `postMessage` API
4. Authentication via URL params or postMessage

### Implementation:

**In Events App:**
```typescript
// src/components/events/JetzyChatIntegration.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Box, Spinner } from "@chakra-ui/react"
import { useSession } from "next-auth/react"

interface JetzyChatIntegrationProps {
    eventId: string
}

export default function JetzyChatIntegration({ eventId }: JetzyChatIntegrationProps) {
    const { data: session } = useSession()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Listen for messages from iframe
        const handleMessage = (event: MessageEvent) => {
            // Verify origin for security
            if (event.origin !== process.env.NEXT_PUBLIC_JETZYCHAT_URL) return
            
            if (event.data.type === 'jetzychat-ready') {
                setIsLoading(false)
            }
            // Handle other message types
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // Build embed URL with authentication and event context
    // For Vercel: Use production URL or preview URL for testing
    const jetzyChatUrl = process.env.NEXT_PUBLIC_JETZYCHAT_URL || 'https://jetzychat.vercel.app'
    const embedUrl = `${jetzyChatUrl}/embed?` + new URLSearchParams({
        eventId,
        userId: session?.user?.id || '',
        userName: session?.user?.name || '',
        userEmail: session?.user?.email || '',
        // Add JWT token if needed
        token: session?.accessToken || '',
    }).toString()

    return (
        <Box 
            bg="white" 
            borderRadius="lg" 
            boxShadow="sm" 
            position="relative"
            minH="600px"
        >
            {isLoading && (
                <Box 
                    position="absolute" 
                    top="50%" 
                    left="50%" 
                    transform="translate(-50%, -50%)"
                    zIndex={1}
                >
                    <Spinner size="lg" />
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
                onLoad={() => setIsLoading(false)}
            />
        </Box>
    )
}
```

**What JetzyChat Needs to Provide (Vercel-specific):**
1. An `/embed` route that accepts:
   - `eventId` - to scope chat to event
   - `userId`, `userName`, `userEmail` - for authentication
   - `token` - JWT if needed
2. Handle authentication via URL params
3. **Vercel configuration**:
   - Allow iframe embedding (no `X-Frame-Options: DENY`)
   - Set proper CORS headers if needed
   - Handle Vercel preview deployments
4. Optional: `postMessage` API for communication

**Pros:**
- ✅ Fastest to implement
- ✅ No dependency management
- ✅ Complete isolation
- ✅ Easy to test

**Cons:**
- ⚠️ Limited styling customization
- ⚠️ Slight performance overhead
- ⚠️ Mobile iframe limitations (can be worked around)

---

## 🥈 Alternative Approach: **Micro-Frontend with Module Federation** (Advanced)

### When to Use:
- Need deep integration and styling control
- Both apps use compatible build tools (Webpack 5+)
- Willing to set up module federation

### How It Works:
1. JetzyChat exposes components via Webpack Module Federation
2. Events app consumes JetzyChat components at runtime
3. Shared dependencies (React, etc.) are shared

### Implementation:

**In JetzyChat (webpack.config.js):**
```javascript
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin')

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'jetzychat',
      filename: 'remoteEntry.js',
      exposes: {
        './JetzyChat': './src/components/JetzyChat',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
}
```

**In Events App:**
```typescript
import dynamic from 'next/dynamic'

const JetzyChat = dynamic(
  () => import('jetzychat/JetzyChat'),
  { ssr: false }
)
```

**Pros:**
- ✅ Deep integration
- ✅ Full styling control
- ✅ Better performance than iframe
- ✅ Shared dependencies

**Cons:**
- ⚠️ Complex setup
- ⚠️ Requires Webpack 5+ configuration
- ⚠️ Build tool compatibility needed
- ⚠️ More maintenance overhead

---

## 🥉 Alternative Approach: **NPM Package from Monorepo** (If Possible)

### When to Use:
- Can extract JetzyChat into a shared package
- Both repos can be in a monorepo
- Want to share code directly

### How It Works:
1. Extract JetzyChat components into a shared package
2. Publish to private NPM registry or use monorepo
3. Install in events app

### Implementation:

**Structure:**
```
jetzy-monorepo/
├── packages/
│   ├── jetzychat/     # Chat components
│   └── shared/        # Shared utilities
└── apps/
    ├── events-app/
    └── chat-app/
```

**In Events App:**
```bash
npm install @jetzy/chat
```

```typescript
import { JetzyChat } from '@jetzy/chat'
```

**Pros:**
- ✅ Direct component usage
- ✅ Type safety
- ✅ Code sharing
- ✅ Easy to maintain

**Cons:**
- ⚠️ Requires restructuring repos
- ⚠️ More complex setup
- ⚠️ Deployment coordination needed

---

## 🔄 Alternative Approach: **API-Based Integration** (Custom UI)

### When to Use:
- Want complete control over UI
- JetzyChat has a well-defined API
- Willing to build UI in events app

### How It Works:
1. Events app builds custom chat UI
2. Uses JetzyChat API for backend (messages, auth, etc.)
3. WebSocket or REST API for real-time

### Implementation:

```typescript
// Use JetzyChat API endpoints
const sendMessage = async (eventId: string, message: string) => {
  await fetch(`${JETZYCHAT_API_URL}/api/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ eventId, message }),
  })
}
```

**Pros:**
- ✅ Complete UI control
- ✅ Matches events app design perfectly
- ✅ No iframe limitations

**Cons:**
- ⚠️ Need to build UI from scratch
- ⚠️ More development time
- ⚠️ Need comprehensive API documentation

---

## 📋 Comparison Table

| Approach | Setup Time | Maintenance | Styling Control | Performance | Recommended |
|----------|-----------|-------------|-----------------|-------------|------------|
| **Iframe** | ⭐⭐⭐⭐⭐ (Hours) | ⭐⭐⭐⭐⭐ (Easy) | ⭐⭐ (Limited) | ⭐⭐⭐⭐ (Good) | ✅ **Best** |
| **Module Federation** | ⭐⭐ (Days) | ⭐⭐⭐ (Medium) | ⭐⭐⭐⭐⭐ (Full) | ⭐⭐⭐⭐⭐ (Best) | For advanced needs |
| **NPM Package** | ⭐⭐⭐ (Days) | ⭐⭐⭐⭐ (Easy) | ⭐⭐⭐⭐⭐ (Full) | ⭐⭐⭐⭐⭐ (Best) | If restructuring possible |
| **API-Based** | ⭐ (Weeks) | ⭐⭐⭐ (Medium) | ⭐⭐⭐⭐⭐ (Full) | ⭐⭐⭐⭐ (Good) | If building custom UI |

---

## 🎯 **My Recommendation: Start with Iframe**

### Why:
1. **Fastest to implement** - Can be done today
2. **No changes needed** in JetzyChat repo initially
3. **Easy to test** - Just need embed URL
4. **Can upgrade later** - Can switch to Module Federation if needed

### Implementation Steps:

1. **In JetzyChat App** (minimal changes needed):
   - Create `/embed` route
   - Accept `eventId`, `userId`, etc. via URL params
   - Handle authentication
   - Optional: Add `postMessage` for communication

2. **In Events App** (this repo):
   - Create `JetzyChatIntegration.tsx` component (see code above)
   - Add to `HostedEvents.tsx` as a tab
   - Add env variable: `NEXT_PUBLIC_JETZYCHAT_URL`

3. **Deploy**:
   - Both apps deploy independently
   - No coordination needed

---

## 🚀 Quick Start: Iframe Integration (Vercel)

### Step 1: Get JetzyChat Vercel URL

**Questions for JetzyChat Team:**
1. **What is the JetzyChat Vercel URL?**
   - Production: `https://jetzychat.vercel.app` (or custom domain)
   - Preview deployments: `https://jetzychat-git-branch.vercel.app`
2. **Can you create an `/embed` route?** (e.g., `https://jetzychat.vercel.app/embed`)
   - Accepts: `eventId`, `userId`, `userName`, `userEmail`, `token`
3. **Vercel Configuration:**
   - Allow iframe embedding (check `vercel.json` or headers)
   - Set CORS if needed
4. **Authentication:** How to pass user auth? (URL params, JWT, session?)

### Vercel-Specific Considerations:

**1. Iframe Headers:**
JetzyChat needs to allow iframe embedding. In `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/embed",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        }
      ]
    }
  ]
}
```

**2. Preview Deployments:**
- Use preview URLs for testing: `https://jetzychat-git-feature.vercel.app`
- Set env var: `NEXT_PUBLIC_JETZYCHAT_URL` to preview URL for testing

**3. Custom Domain:**
- If JetzyChat has custom domain (e.g., `chat.jetzy.com`), use that
- Otherwise use Vercel URL: `https://jetzychat.vercel.app`

### Step 2: Implement in Events App

I'll create the integration component once you have the embed URL.

### Step 3: Test & Deploy

- Test locally with both apps running
- Deploy independently
- Monitor for any issues

---

## 📝 What to Tell JetzyChat Team (Vercel-Specific)

**Copy this message:**

```
Hi! We want to integrate JetzyChat (deployed on Vercel) into our events app via iframe embedding.

We need:
1. **Vercel URL**: What's the JetzyChat Vercel URL?
   - Production: https://jetzychat.vercel.app (or custom domain)
   - Preview: For testing with preview deployments

2. **Embed Route**: Can you create an `/embed` route that accepts:
   - eventId: string (to scope chat to specific event)
   - userId: string (from NextAuth session)
   - userName: string
   - userEmail: string
   - token: string (optional JWT if needed)

3. **Vercel Configuration**:
   - Allow iframe embedding (set X-Frame-Options: SAMEORIGIN in vercel.json)
   - The route should:
     - Handle authentication via URL params
     - Display chat scoped to the eventId
     - Be mobile-responsive
     - Work in an iframe

4. **Optional**: postMessage API for:
   - Notifying when chat is ready
   - Sending messages from parent
   - Receiving events (new messages, etc.)

What's the Vercel URL for JetzyChat?
Can you create this embed route?
```

### Vercel Configuration Example for JetzyChat:

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

---

## 🔄 Future Upgrade Path

If you start with iframe and later want better integration:

1. **Phase 1**: Iframe (now) - Get it working quickly
2. **Phase 2**: Add postMessage API - Better communication
3. **Phase 3**: Consider Module Federation - If you need deeper integration
4. **Phase 4**: Extract to NPM package - If you want to share code

---

## ✅ Next Steps

1. **Ask JetzyChat team** for embed URL and requirements
2. **I'll implement** the iframe integration component
3. **Test** with both apps running locally
4. **Deploy** independently

Ready to proceed once you have the embed URL from JetzyChat team!

