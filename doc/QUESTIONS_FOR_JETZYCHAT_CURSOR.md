# Questions for JetzyChat Integration

**Context**: We want to integrate JetzyChat into the events-jetzy-com app. Users should be able to chat on event pages.

## Quick Questions (Copy & Paste to Cursor)

```
I need to integrate JetzyChat into another Next.js app (events-jetzy-com). 
Please answer these questions:

1. **How to integrate?**
   - Is it an NPM package? (package name?)
   - Is it a separate app URL? (what URL?)
   - Is it a script injection? (script URL and init function?)

2. **Authentication?**
   - How do users authenticate? (JWT, session, API key?)
   - What user data is needed? (id, name, email, avatar?)

3. **Event context?**
   - Can chat be scoped per-event? (one chat per event)
   - What event data is needed? (eventId, name, etc.)
   - How to pass event context?

4. **Component/API interface?**
   - If React component: What are the props?
   - If script: How to initialize?
   - If API: What endpoints?

5. **File uploads?**
   - Does it support file uploads?
   - Can it use our S3 upload endpoint?
   - What's the upload API format?

6. **Styling?**
   - Can we customize colors/theme?
   - Does it match our design system?

7. **Example code?**
   - Can you provide a complete working example?
   - Show how to use it with eventId and userId

8. **Environment variables?**
   - What env vars are needed?
   - What API keys/tokens?

Please provide code examples and exact interfaces.
```

## Detailed Questions (If Needed)

See `JETZYCHAT_INTEGRATION_REQUIREMENTS.md` for the full detailed list.

## What We'll Provide

- Event ID, name, dates, location
- User ID, name, email from NextAuth session
- Integration in event detail page
- S3 file upload implementation (if needed)

## Integration Location

- **File**: `src/components/HostedEvents.tsx`
- **Page**: `/events/[slug]` (event detail page)
- **Position**: Tab alongside DiscussionBoard component

