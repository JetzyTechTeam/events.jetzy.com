# Local Testing Guide - JetzyChat Integration

**For**: Testing JetzyChat integration with local JetzyChat instance

---

## 🚀 Quick Start

If you're running JetzyChat locally on `http://localhost:5174/`:

### 1. Set Environment Variable

Add to `.env.local` in the events app root:

```env
NEXT_PUBLIC_JETZYCHAT_URL=http://localhost:5174
```

### 2. Restart Dev Server

After adding the environment variable, restart your Next.js dev server:

```bash
# Stop the server (Ctrl+C) and restart
npm run dev
```

### 3. Test the Integration

1. **Start JetzyChat** on `http://localhost:5174`
2. **Start Events App** (usually `http://localhost:3000`)
3. **Navigate to an event page**:
   - Public event: `http://localhost:3000/[event-slug]`
   - Management page: `http://localhost:3000/console/events/[eventId]/manage`
4. **Click on the "Chat" tab**
5. **Verify**:
   - Chat iframe loads
   - You see "Loading chat..." initially
   - Chat interface appears after `jetzychat-ready` message
   - You can send messages

---

## 🔍 Debugging

### Check Browser Console

The component logs messages in development mode. Look for:

```
[JetzyChat] Message received: {type: 'jetzychat-ready', eventId: '...'} from origin: http://localhost:5174
```

### Common Issues

**1. Chat doesn't load**
- ✅ Check JetzyChat is running on `http://localhost:5174`
- ✅ Verify `NEXT_PUBLIC_JETZYCHAT_URL` is set correctly
- ✅ Check browser console for errors
- ✅ Verify you're signed in (chat requires authentication)

**2. PostMessage not working**
- ✅ Check browser console for origin warnings
- ✅ Verify JetzyChat `/embed` route is working (visit `http://localhost:5174/embed?eventId=test&userId=test&userName=Test&userEmail=test@test.com` directly)
- ✅ Check that JetzyChat is sending `jetzychat-ready` message

**3. CORS/Iframe errors**
- ✅ Make sure JetzyChat's `vercel.json` (or equivalent) allows iframe embedding from `http://localhost:3000`
- ✅ Check JetzyChat console for any errors

**4. User not authenticated**
- ✅ Make sure you're signed in to the events app
- ✅ Check that session data is available (userId, userName, userEmail)

---

## 🧪 Testing Checklist

- [ ] JetzyChat is running on `http://localhost:5174`
- [ ] Environment variable is set in `.env.local`
- [ ] Next.js dev server restarted after adding env var
- [ ] Signed in to events app
- [ ] Navigate to event page
- [ ] Chat tab is visible
- [ ] Chat iframe loads
- [ ] Loading indicator appears then disappears
- [ ] Chat interface is visible
- [ ] Can send messages
- [ ] Messages appear in chat
- [ ] Chat is scoped to eventId (messages are per-event)

---

## 📝 Test URL Format

The component builds URLs like this:

```
http://localhost:5174/embed?eventId=507f1f77bcf86cd799439011&userId=user123&userName=John%20Doe&userEmail=john@example.com&userImage=https://example.com/avatar.jpg
```

You can test this URL directly in a browser to verify JetzyChat's `/embed` route is working.

---

## 🔄 Switching Between Local and Production

To switch between local and production JetzyChat:

**Local** (`.env.local`):
```env
NEXT_PUBLIC_JETZYCHAT_URL=http://localhost:5174
```

**Production** (`.env.local`):
```env
NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat.vercel.app
```

Remember to restart the dev server after changing!

---

## 📞 Need Help?

- Check `ENV_VARIABLES.md` for environment variable details
- Check `JETZYCHAT_INTEGRATION_STATUS.md` for implementation status
- Check browser console for error messages
- Verify JetzyChat is running and accessible
