# Environment Variables

This document lists all environment variables used in the events-jetzy-com application.

## JetzyChat Integration

### `NEXT_PUBLIC_JETZYCHAT_URL`

**Required**: Yes (for JetzyChat integration)  
**Type**: String (URL)  
**Default**: `https://jetzychat.vercel.app`

**Description**:  
The base URL for the JetzyChat application. This is used to embed JetzyChat in event pages via iframe.

**Example Values**:
- **Local Development**: `http://localhost:5174` (when running JetzyChat locally)
- **Production**: `https://jetzychat.vercel.app`
- **Preview/Staging**: `https://jetzychat-git-feature-branch.vercel.app`
- **Custom Domain**: `https://chat.jetzy.com` (if configured)

**Where to Set**:
1. **Local Development**: Add to `.env.local`:
   ```env
   # For local JetzyChat testing:
   NEXT_PUBLIC_JETZYCHAT_URL=http://localhost:5174
   
   # Or for production JetzyChat:
   # NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat.vercel.app
   ```

2. **Vercel Deployment**: 
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add variable: `NEXT_PUBLIC_JETZYCHAT_URL`
   - Value: `https://jetzychat.vercel.app`
   - Apply to: Production, Preview, and Development environments

**Usage**:  
The integration component (`JetzyChatIntegration.tsx`) uses this variable to build the embed URL:
```
${NEXT_PUBLIC_JETZYCHAT_URL}/embed?eventId=...&userId=...
```

**Local Development Setup**:
When testing with local JetzyChat (`http://localhost:5174`):
1. Make sure JetzyChat is running on `http://localhost:5174`
2. Set `NEXT_PUBLIC_JETZYCHAT_URL=http://localhost:5174` in `.env.local`
3. Restart your Next.js dev server after adding the variable
4. The component will automatically allow localhost origins in development mode

**Security Note**:  
- Always use HTTPS in production
- Verify the origin in postMessage handlers (already implemented in `JetzyChatIntegration.tsx`)
- Localhost origins are only allowed in development mode

---

## Token Authentication

### `NEXT_PUBLIC_EXTERNAL_API_BASE_URL`

**Required**: No (falls back to `NEXT_PUBLIC_API_BASE_URL`)  
**Type**: String (URL)  
**Default**: Falls back to `NEXT_PUBLIC_API_BASE_URL` if not set

**Description**:  
The base URL for the external API used to fetch authentication tokens after NextAuth login. This is separate from `NEXT_PUBLIC_API_BASE_URL` to avoid affecting existing HTTPClient API calls.

**Why Separate?**:  
- `NEXT_PUBLIC_API_BASE_URL` is used by HTTPClient for all existing API calls in the app
- Changing it would break existing functionality
- This variable allows token fetching from a different API endpoint without affecting other calls

**Example Values**:
- **Development**: `https://test.jetzy.com`
- **Production**: `https://api.jetzy.com` or `https://jetzy.com`

**Where to Set**:
1. **Local Development**: Add to `.env.local`:
   ```env
   NEXT_PUBLIC_EXTERNAL_API_BASE_URL=https://test.jetzy.com
   ```

2. **Vercel Deployment**: 
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add variable: `NEXT_PUBLIC_EXTERNAL_API_BASE_URL`
   - Value: Your external API URL (e.g., `https://test.jetzy.com`)
   - Apply to: Production, Preview, and Development environments

**Usage**:  
After NextAuth login succeeds, the login components call:
```
${NEXT_PUBLIC_EXTERNAL_API_BASE_URL}/authorize
```
to fetch the API token and store it in `sessionStorage` for JetzyChat integration.

**Fallback Behavior**:  
If `NEXT_PUBLIC_EXTERNAL_API_BASE_URL` is not set, the code will use `NEXT_PUBLIC_API_BASE_URL` as a fallback. However, this may not work if `NEXT_PUBLIC_API_BASE_URL` points to the Next.js app itself (e.g., `http://localhost:3000/api`).

---

## Other Environment Variables

(Add other environment variables as needed)

