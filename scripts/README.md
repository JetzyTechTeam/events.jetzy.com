# Event Interest Group Creation Script

This script creates an interest group for a specific event and sends customized post-event emails to all attendees (bookings and waiting list) with Jetzy app download links.

## Prerequisites

1. **Environment Variables**: Ensure you have a `.env` or `.env.local` file with:

   ```env
   SENDGRID_API_KEY=your_sendgrid_api_key
   SENDGRID_EMAIL_SENDER=events@jetzyapp.com
   JWT_SECRET=your_jwt_secret
   NEXT_PUBLIC_URL=https://events.jetzyapp.com
   ```

2. **Install Dependencies**: Run `npm install` to install required packages (ts-node, dotenv, etc.)

## Usage

### Test Mode (Recommended First)

Send emails only to test addresses to verify everything works correctly:

```bash
npm run script:create-group -- --eventId=68f2518e1c9eff310f587089 --testMode
```

Or with custom test emails:

```bash
npm run script:create-group -- --eventId=68f2518e1c9eff310f587089 --testMode --testEmails=test1@example.com,test2@example.com
```

**Test Mode Features:**

- Only sends emails to specified test addresses (default: obaid.khhan55@gmail.com, raoarsalanlatif@gmail.com)
- Creates/finds the interest group but doesn't update event flags
- Only processes users whose emails match the test list
- Safe to run multiple times

### Production Mode

After verifying test emails are working, run in production mode:

```bash
npm run script:create-group -- --eventId=68f2518e1c9eff310f587089
```

Or explicitly disable test mode:

```bash
npm run script:create-group -- --eventId=68f2518e1c9eff310f587089 --testMode=false
```

**Production Mode Features:**

- Processes all bookings and waiting list entries
- Creates InterestUser entries for everyone
- Sends emails to all participants
- Updates `eventGroupCreated` flag on the event (prevents re-running)
- Creates user accounts with default password `123456` for new users

## Command Line Arguments

| Argument       | Type    | Default                                             | Description                                 |
| -------------- | ------- | --------------------------------------------------- | ------------------------------------------- |
| `--eventId`    | string  | `68f2518e1c9eff310f587089`                          | MongoDB ObjectId of the event               |
| `--testMode`   | boolean | `false`                                             | Enable test mode (only send to test emails) |
| `--testEmails` | string  | `obaid.khhan55@gmail.com,raoarsalanlatif@gmail.com` | Comma-separated test email addresses        |

## Email Content

The script sends a customized email with:

- **Subject**: "Join {EventName} Community on Jetzy!"
- **Content**:
  - Personalized greeting with attendee's first name
  - Message about joining the event community
  - Account credentials for new users (email + password: `123456`)
  - App Store and Play Store download buttons with direct links
  - "Accept & Join Group" button linking to the group invitation

### App Store Links

- **iOS**: https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379
- **Android**: https://play.google.com/store/apps/details?id=com.icreon.travelconnect

## What the Script Does

1. **Connects to Production Database**: Uses the provided MongoDB connection string
2. **Fetches Event Data**: Retrieves event details, bookings, and waiting list entries
3. **Creates Interest Group**: Sets up a new interest group (or finds existing in test mode)
4. **Processes Users**: For each unique email:
   - Finds existing user or creates new account
   - Creates InterestUser entry linking user to the group
   - Generates secure invitation token
   - Sends customized email with app links
5. **Updates Event**: Marks `eventGroupCreated = true` (production mode only)
6. **Provides Summary**: Displays statistics about processed users and emails sent

## Output

The script provides detailed logging:

```
==========================================================
Event Interest Group Creator with Custom Email
==========================================================
Event ID: 68f2518e1c9eff310f587089
Test Mode: YES
Test Emails: obaid.khhan55@gmail.com, raoarsalanlatif@gmail.com
==========================================================

[SendGrid] ✓ API configured
[Script] ✓ Connected to production database
[Models] ✓ All models initialized
[Event] ✓ Found event: Example Event Name
[Data] ✓ Found 15 bookings
[Data] ✓ Found 5 waiting list entries
[TestMode] ✓ Filtered to 2 test email(s)

[Processing] Starting to process 2 email(s)...

[1/2] Processing: obaid.khhan55@gmail.com
  → Found existing user: Obaid Khan
  → Creating InterestUser entry
  → Sending email...
  ✓ Email sent successfully

[2/2] Processing: raoarsalanlatif@gmail.com
  → Creating new user: Rao Arsalan
  → Creating InterestUser entry
  → Sending email...
  ✓ Email sent successfully

==========================================================
SUMMARY
==========================================================
Event: Example Event Name
Interest Group ID: 507f1f77bcf86cd799439012
Mode: TEST MODE

Total Processed: 2
New Users Created: 1
Existing Users: 1
Emails Sent: 2
Errors: 0
==========================================================

✓ Script completed successfully!

⚠️  TEST MODE - Event flags were NOT updated
   To run in production mode, use: --testMode=false
```

## Troubleshooting

### "SENDGRID_API_KEY environment variable is required"

- Ensure your `.env` or `.env.local` file contains the SendGrid API key
- Check that the file is in the root of the project

### "Event not found"

- Verify the event ID is correct
- Ensure you're connected to the correct database

### "Interest group has already been created for this event"

- This event has already been processed in production mode
- The `eventGroupCreated` flag is set to prevent duplicate processing
- If you need to resend emails, you can use test mode

### "No bookings or waiting list entries found"

- The event has no registered attendees or waiting list entries
- Verify the event ID is correct

### Email not received in test mode

- Check that the test email exists in the event's bookings or waiting list
- Verify the email address is spelled correctly in the `--testEmails` parameter
- Check SendGrid logs for delivery status

## Database Connection

The script connects to the production database with the following connection string:

```
mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main
```

This is hardcoded in `scripts/prod-db-config.ts` but can be overridden with the `PROD_DB_URL` environment variable.

## Security Notes

- Default password for new users is `123456` - users should change this after first login
- Invitation tokens are generated using SHA-256 hash
- Test mode prevents accidental bulk emails during testing
- Production mode updates event flags to prevent re-running

## Support

For issues or questions, contact the development team or check:

- SendGrid dashboard for email delivery logs
- MongoDB Atlas for database connectivity issues
- Application logs for detailed error messages
