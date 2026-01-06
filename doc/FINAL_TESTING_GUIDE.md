# Final Testing Guide - JetzyChat Integration

**Status**: ✅ Both sides complete - Ready for testing  
**Date**: December 2024

---

## ✅ Implementation Status

### JetzyChat Side
- ✅ `/embed` route implemented
- ✅ Auto-create/join event chat rooms
- ✅ Auto-display event chat (no selection screen)
- ✅ All URL parameters supported
- ✅ PostMessage API working

### Events App Side
- ✅ `JetzyChatIntegration` component created
- ✅ Chat tab added to event management page
- ✅ Chat tabs added to public event page
- ✅ Environment variable documented
- ✅ PostMessage handling implemented

---

## 🧪 Testing Steps

### Prerequisites

1. **Environment Variable Set**
   ```env
   # For local testing:
   NEXT_PUBLIC_JETZYCHAT_URL=http://localhost:5174
   
   # For production:
   # NEXT_PUBLIC_JETZYCHAT_URL=https://jetzychat.vercel.app
   ```

2. **Both Apps Running**
   - JetzyChat: `http://localhost:5174`
   - Events App: `http://localhost:3000` (or your port)

3. **User Signed In**
   - Must be signed in to events app (chat requires authentication)

---

### Test 1: Event Management Page

**Steps:**
1. Sign in to events app
2. Navigate to: `/console/events/[eventId]/manage`
3. Click on "Chat" tab
4. **Expected**: Chat iframe loads and shows event chat room

**What to Check:**
- ✅ Chat iframe loads (no 404)
- ✅ Loading indicator appears then disappears
- ✅ Event chat room is displayed (not "Select a chat" screen)
- ✅ Can see messages (if any exist)
- ✅ Can send messages
- ✅ Browser console shows: `[JetzyChat] Message received: {type: 'jetzychat-ready', ...}`

---

### Test 2: Public Event Page

**Steps:**
1. Sign in to events app
2. Navigate to: `/[event-slug]` (public event page)
3. Scroll to Discussion/Chat section
4. Click on "Chat" tab
5. **Expected**: Chat iframe loads and shows event chat room

**What to Check:**
- ✅ Chat iframe loads
- ✅ Event chat room is displayed
- ✅ Can send/receive messages
- ✅ PostMessage communication works

---

### Test 3: Multiple Users, Same Event

**Steps:**
1. Open event page in two different browsers (or incognito)
2. Sign in as different users
3. Both navigate to same event's chat
4. **Expected**: Both users see the same chat room and can message each other

**What to Check:**
- ✅ Both users see the same chat room
- ✅ Messages from one user appear for the other
- ✅ Real-time messaging works

---

### Test 4: Different Events, Different Chats

**Steps:**
1. Open chat for Event A
2. Send a message in Event A
3. Open chat for Event B (different eventId)
4. **Expected**: Event B has its own separate chat room

**What to Check:**
- ✅ Event A messages don't appear in Event B
- ✅ Event B messages don't appear in Event A
- ✅ Each event has isolated chat

---

### Test 5: Error Handling

**Steps:**
1. Sign out of events app
2. Navigate to event page
3. Click "Chat" tab
4. **Expected**: Shows "Please sign in to access the event chat"

**What to Check:**
- ✅ Proper error message shown
- ✅ No iframe loaded when not signed in

---

### Test 6: PostMessage Communication

**Steps:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate to event chat
4. **Expected**: See postMessage logs

**What to Check:**
- ✅ Console shows: `[JetzyChat] Message received: {type: 'jetzychat-ready', eventId: '...', roomId: '...'}`
- ✅ Loading indicator disappears after message received
- ✅ No origin warnings (in development)

---

### Test 7: Mobile Responsive

**Steps:**
1. Open event page on mobile device (or browser dev tools mobile view)
2. Navigate to chat
3. **Expected**: Chat is responsive and usable on mobile

**What to Check:**
- ✅ Chat iframe is responsive
- ✅ Can type messages on mobile
- ✅ UI is not cut off or broken

---

## 🔍 Debugging

### Check Browser Console

**Expected Logs (Development Mode):**
```
[JetzyChat] Message received: {type: 'jetzychat-ready', eventId: '507f1f77bcf86cd799439011', roomId: 'chat-room-id'} from origin: http://localhost:5174
```

**If you see errors:**
- Check the error message
- Verify environment variable is set
- Check that JetzyChat is running
- Verify you're signed in

### Check Network Tab

1. Open DevTools → Network tab
2. Filter by "embed"
3. **Expected**: See request to `/embed?eventId=...&userId=...&userEmail=...`
4. **Status**: Should be 200 (not 404)

### Check Iframe Source

1. Right-click on chat iframe → Inspect
2. Check `src` attribute
3. **Expected**: URL with all parameters:
   ```
   http://localhost:5174/embed?eventId=...&userId=...&userEmail=...&userName=...
   ```

---

## ✅ Success Criteria

Integration is working if:

- ✅ Chat loads without errors
- ✅ Event chat room is displayed automatically
- ✅ Can send and receive messages
- ✅ Multiple users see same chat for same event
- ✅ Different events have separate chats
- ✅ PostMessage communication works
- ✅ Mobile responsive
- ✅ Error handling works (shows message when not signed in)

---

## 🐛 Common Issues

### Issue: Chat shows "Select a chat to start messaging"
**Solution**: JetzyChat should auto-join event room. Check that JetzyChat implementation includes auto-join logic.

### Issue: 404 error
**Solution**: 
- Verify JetzyChat is running
- Check environment variable is set correctly
- Restart dev server after setting env var

### Issue: "Missing required parameters" error
**Solution**: 
- Make sure you're signed in
- Check that session has `_id` (userId) and `email` (userEmail)
- Verify component is sending all required parameters

### Issue: PostMessage not received
**Solution**:
- Check browser console for origin warnings
- Verify JetzyChat is sending postMessage
- Check that origin verification allows your JetzyChat URL

### Issue: Different events show same chat
**Solution**: JetzyChat should use `eventId` as room identifier. Verify JetzyChat is creating separate rooms per eventId.

---

## 📞 Next Steps After Testing

1. **If all tests pass**: ✅ Integration is complete!
2. **If issues found**: Document the issue and check:
   - Browser console errors
   - Network requests
   - PostMessage communication
   - JetzyChat logs

---

## 🎉 Ready to Test!

Everything is implemented on both sides. Follow the testing steps above to verify the integration works correctly.

**Good luck!** 🚀

