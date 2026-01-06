# Quick Message for JetzyChat Team

## Copy & Paste This Message:

---

**Subject**: Request: Create /embed Route for Events App Integration

Hi JetzyChat Team!

We want to integrate JetzyChat into our events app (events-jetzy-com) so users can chat on event pages. Since JetzyChat is deployed on Vercel, we'll use iframe embedding.

**What we need:**

1. **Create an `/embed` route** in JetzyChat that accepts URL parameters:
   - `eventId` (string) - to scope chat per event
   - `userId` (string) - user ID from events app
   - `userName` (string) - user's display name
   - `userEmail` (string) - user's email
   - `token` (string, optional) - JWT if needed

2. **Configure Vercel** to allow iframe embedding:
   - Add to `vercel.json`:
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

3. **What the route should do:**
   - Authenticate user from URL parameters
   - Load chat scoped to the `eventId` (one chat per event)
   - Be mobile responsive
   - Work in an iframe

4. **Provide your Vercel URL:**
   - Production: `https://jetzychat.vercel.app` (or custom domain)
   - Preview format for testing

**Example embed URL:**
```
https://jetzychat.vercel.app/embed?eventId=123&userId=456&userName=John&userEmail=john@example.com
```

**Optional (recommended):**
- Send `postMessage` to parent window when chat is ready
- This helps us know when chat has loaded

**Full requirements document:** See `JETZYCHAT_TEAM_REQUIREMENTS.md` for complete details, code examples, and implementation guide.

**Timeline:** We can implement on our side once you provide the embed route (1-2 days after).

**Questions?** Let me know if you need any clarification!

Thanks! 🚀

---

## Or Use This Shorter Version:

---

Hi! We need to integrate JetzyChat into our events app via iframe.

**Please create:**
1. `/embed` route that accepts: `eventId`, `userId`, `userName`, `userEmail`, `token` (via URL params)
2. Configure `vercel.json` to allow iframe embedding (X-Frame-Options: SAMEORIGIN)
3. Scope chat to `eventId` (one chat per event)
4. Provide your Vercel URL

**Example:** `https://jetzychat.vercel.app/embed?eventId=123&userId=456&userName=John&userEmail=john@example.com`

See `JETZYCHAT_TEAM_REQUIREMENTS.md` for full details and code examples.

Thanks!

---

## What to Share:

1. **Send the message above** (copy/paste)
2. **Attach or link to**: `JETZYCHAT_TEAM_REQUIREMENTS.md` (the detailed document)
3. **Ask for**: Vercel URL and confirmation when `/embed` route is ready

---

## After They Respond:

Once they provide:
- ✅ Vercel URL
- ✅ Confirmation that `/embed` route works

**Tell me and I'll:**
- Implement the iframe integration component
- Add it to the event pages
- Configure environment variables
- Test and deploy

Ready to go! 🎯

