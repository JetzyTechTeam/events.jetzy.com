# Environment Variables Setup

This document outlines the required environment variables for the Jetzy Events application.

## Required Environment Variables

### Database Configuration

```
NEXT_EVENTS_DB_URL=mongodb://localhost:27017/jetzy-events
```

### Stripe Configuration

```
NEXT_STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

### Application URLs

```
NEXT_PUBLIC_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

### NextAuth Configuration

```
NEXTAUTH_SECRET=your_nextauth_secret_here
```

### SendGrid Email Configuration

```
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

### EdgeStore Configuration (Optional - for file uploads)

```
EDGE_STORE_ACCESS_KEY=your_edgestore_access_key_here
EDGE_STORE_SECRET_KEY=your_edgestore_secret_key_here
```

### Google Analytics (Optional)

```
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```

### API Configuration

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_THIRD_PARTY_API=https://api.thirdparty.com
```

### OpenAI Configuration (Optional)

```
NEXT_PUBLIC_OPENAI_KEY=your_openai_api_key_here
NEXT_PUBLIC_OPENAI_ENDPOINT=https://api.openai.com/v1
```

## Deployment Notes

1. **Database**: Ensure `NEXT_EVENTS_DB_URL` is set correctly for your MongoDB instance
2. **Stripe**: Use test keys for development, production keys for production
3. **NODE_ENV**: Ensure there are no extra spaces in the environment variable value
4. **EdgeStore**: If using file uploads, configure EdgeStore keys properly

## Common Issues

1. **Database Connection**: Make sure `NEXT_EVENTS_DB_URL` is set and accessible
2. **Stripe Errors**: Verify Stripe keys are correct and have proper permissions
3. **EdgeStore Authentication**: Ensure EdgeStore keys are valid and properly configured
4. **NODE_ENV Formatting**: Remove any trailing spaces from environment variable values
