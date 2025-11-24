#!/usr/bin/env node
import { Connection, Model, Schema, Types } from "mongoose"
import { createProdDbConnection, closeProdDbConnection, getProdConfig, validateConfig } from "./prod-db-config"
import sendgrid from "@sendgrid/mail"
import bcrypt from "bcrypt"
import crypto from "crypto"

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name: string, defaultValue?: string): string | undefined => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split("=")[1] : defaultValue
}

const hasFlag = (name: string): boolean => {
  return args.includes(`--${name}`) || args.includes(`--${name}=true`)
}

const EVENT_ID = getArg("eventId", "68f2518e1c9eff310f587089")
const TEST_MODE = hasFlag("testMode")
const TEST_EMAILS = getArg("testEmails", "obaid.khhan55@gmail.com,raoarsalanlatif@gmail.com")?.split(",").map(e => e.trim())

console.log("=".repeat(60))
console.log("Event Interest Group Creator with Custom Email")
console.log("=".repeat(60))
console.log(`Event ID: ${EVENT_ID}`)
console.log(`Test Mode: ${TEST_MODE ? "YES" : "NO"}`)
if (TEST_MODE) {
  console.log(`Test Emails: ${TEST_EMAILS?.join(", ")}`)
}
console.log("=".repeat(60))
console.log("")

// Type definitions
interface IEvent {
  _id: Types.ObjectId
  name: string
  desc?: string
  eventGroupCreated?: boolean
  eventUsersCreated?: boolean
  save: () => Promise<any>
}

interface IBooking {
  _id: Types.ObjectId
  eventId: Types.ObjectId
  customerEmail: string
  customerName: string
  isDeleted: boolean
}

interface IWaitingList {
  _id: Types.ObjectId
  eventId: Types.ObjectId
  email: string
  firstName: string
  lastName: string
}

interface IUser {
  _id: Types.ObjectId
  email: string
  firstName: string
  lastName: string
  password: string
  role: string
}

interface IInterestV2 {
  _id: Types.ObjectId
  name: string
  type: string
  description: string
  createdBy: Types.ObjectId
  status: string
}

interface IInterestUser {
  _id: Types.ObjectId
  interestId: Types.ObjectId
  userId: Types.ObjectId
  isRequest: boolean
  status: string
  isAdmin: boolean
}

// Generate secure token for group invitation
function generateInviteToken(interestId: string, userId: string, email: string, secret: string): string {
  const data = `${interestId}:${userId}:${email}:${secret}`
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32)
}

// Email template function
function generateEmailTemplate(
  firstName: string,
  eventName: string,
  acceptLink: string,
  isNewUser: boolean,
  email: string,
  defaultPassword: string,
  source: "booking" | "waitingList",
  baseUrl: string
): { subject: string; html: string } {
  const subject = `Join ${eventName} Community on Jetzy!`
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        @media only screen and (max-width: 480px) {
          .app-button {
            display: block !important;
            width: 100% !important;
            max-width: 220px !important;
            margin: 10px auto !important;
          }
          .button-row {
            display: block !important;
          }
          .button-cell {
            display: block !important;
            padding: 6px 0 !important;
          }
          .hero-title {
            font-size: 24px !important;
            padding: 20px 16px !important;
          }
          .main-heading {
            font-size: 22px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
      <div style="background: #f5f5f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Hero Header with Orange Accent -->
          <div style="background: linear-gradient(135deg, #F79432 0%, #FF8C42 100%); padding: 32px 24px; text-align: center;">
            <h1 class="hero-title" style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              ${eventName}
            </h1>
          </div>
          
          <!-- Main Content -->
          <div style="padding: 40px 32px;"
            
            <!-- Greeting -->
            <p style="font-size: 18px; color: #2d3748; line-height: 1.6; margin-bottom: 20px; font-weight: 600;">
              Hi ${firstName},
            </p>
            
            <!-- Main Message -->
            <p style="font-size: 16px; color: #4a5568; line-height: 1.8; margin-bottom: 16px;">
              It was great meeting you at <strong style="color: #F79432;">${eventName}</strong>! We've set up a private group in our app so attendees can share photos and keep the conversations going. 
            </p>
            
            <p style="font-size: 16px; color: #4a5568; line-height: 1.8; margin-bottom: 32px;">
              Download the Jetzy app now to connect with other attendees, share your experiences, and stay in the loop!
            </p>

            ${isNewUser ? `
            <!-- Account Credentials Card -->
            <div style="background: linear-gradient(135deg, #FFF5EB 0%, #FFE8D6 100%); border-radius: 10px; padding: 24px; margin: 0 0 32px 0; box-shadow: 0 2px 8px rgba(247,148,50,0.1);">
              <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <div style="width: 4px; height: 40px; background: #F79432; border-radius: 2px; margin-right: 16px;"></div>
                <h3 style="font-size: 18px; color: #2d3748; margin: 0; font-weight: bold;">
                  Your Account Credentials
                </h3>
              </div>
              <div style="background: #ffffff; border-radius: 8px; padding: 16px; margin-top: 12px;">
                <p style="font-size: 15px; color: #2d3748; margin: 0 0 8px 0; line-height: 1.6;">
                  <strong style="color: #F79432;">Email:</strong> ${email}
                </p>
                <p style="font-size: 15px; color: #2d3748; margin: 0; line-height: 1.6;">
                  <strong style="color: #F79432;">Password:</strong> ${defaultPassword}
                </p>
              </div>
              <p style="font-size: 13px; color: #718096; margin: 12px 0 0 0; line-height: 1.5;">
                💡 Keep this information safe. You can change your password after logging in.
              </p>
            </div>
            ` : ""}

            <!-- Main CTA: Download App Section -->
            <div style="background: linear-gradient(135deg, #ffffff 0%, #FFF9F5 100%); border-radius: 12px; padding: 40px 32px; margin: 0 0 32px 0; text-align: center; box-shadow: 0 4px 16px rgba(247,148,50,0.12);">
              <h2 class="main-heading" style="font-size: 26px; color: #2d3748; margin: 0 0 12px 0; font-weight: bold;">
                Download Jetzy to Connect
              </h2>
              <p style="font-size: 16px; color: #4a5568; margin: 0 0 32px 0; line-height: 1.6;">
                Join ${eventName} community and start connecting with other attendees today!
              </p>
              
              <!-- App Store Buttons - Exact Same Size -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px auto;" class="button-row">
                <tr class="button-row">
                  <td style="padding: 0 8px; vertical-align: middle;" class="button-cell">
                    <a href="https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379" target="_blank" style="display: inline-block; text-decoration: none;">
                      <table cellpadding="0" cellspacing="0" border="0" style="background: #000000; border-radius: 8px; height: 54px; width: 180px;">
                        <tr>
                          <td style="width: 36px; vertical-align: middle; text-align: center;">
                            <div style="font-size: 30px; line-height: 1; color: #ffffff; font-family: Arial, sans-serif;">&#63743;</div>
                          </td>
                          <td style="vertical-align: middle; text-align: left; padding-right: 10px;">
                            <div style="font-size: 9px; line-height: 11px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;">Download on the</div>
                            <div style="font-size: 18px; font-weight: 600; line-height: 18px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;">App Store</div>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 8px; vertical-align: middle;" class="button-cell">
                    <a href="https://play.google.com/store/apps/details?id=com.icreon.travelconnect" target="_blank" style="display: inline-block; text-decoration: none;">
                      <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height: 66px; width: 220px; display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Already Have App Text -->
              <p style="font-size: 14px; color: #718096; margin: 0 0 20px 0; line-height: 1.6;">
                Already have the app? Open Jetzy to see your group invitation! 🎉
              </p>
              
              <!-- Join Group CTA Button -->
              <div style="text-align: center; margin-top: 24px;">
                <p style="font-size: 15px; color: #4a5568; margin: 0 0 16px 0; font-weight: 600;">
                  Already signed in? Join the group now!
                </p>
                <a href="https://jetzy.com/interest?interestId=69123f410fa0cd6ede9ff811" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #F79432 0%, #FF8C42 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(247, 148, 50, 0.3);">
                  Join Group →
                </a>
              </div>
            </div>

            <!-- Divider -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent); margin: 32px 0;"></div>
            
            <!-- Footer -->
            <div style="text-align: center;">
              <p style="font-size: 13px; color: #718096; margin: 0 0 12px 0; line-height: 1.6;">
                Need help? <a href="mailto:contact@jetzyapp.com" style="color: #F79432; text-decoration: none; font-weight: 600;">Contact us</a>
              </p>
              <p style="font-size: 12px; color: #a0aec0; margin: 0 0 8px 0; line-height: 1.5;">
                This invitation was sent because you ${source === "booking" ? "registered for" : "were on the waiting list for"} an event on Jetzy Events.
              </p>
              <p style="font-size: 12px; color: #a0aec0; margin: 0;">
                &copy; ${new Date().getFullYear()} Jetzy Events. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  return { subject, html }
}

// Main function
async function main() {
  let connection: Connection | null = null

  try {
    // Validate configuration
    validateConfig()
    const config = getProdConfig()

    // Initialize SendGrid
    sendgrid.setApiKey(config.sendgridApiKey)
    console.log("[SendGrid] ✓ API configured")

    // Connect to database
    connection = createProdDbConnection()
    await connection.asPromise()

    console.log("[Script] ✓ Connected to production database")
    console.log("")

    // Define models using the production connection
    const EventSchema = new Schema({}, { strict: false })
    const Events = connection.model("Event", EventSchema, "events") as any as Model<IEvent>

    const BookingSchema = new Schema({}, { strict: false })
    const Bookings = connection.model("Booking", BookingSchema, "bookings") as any as Model<IBooking>

    const WaitingListSchema = new Schema({}, { strict: false })
    const WaitingList = connection.model("WaitingList", WaitingListSchema, "waitinglists") as any as Model<IWaitingList>

    const UserSchema = new Schema({}, { strict: false })
    const Users = connection.model("User", UserSchema, "users") as any as Model<IUser>

    const InterestV2Schema = new Schema({}, { strict: false })
    const InterestV2model = connection.model("InterestV2", InterestV2Schema, "interest-v2") as any as Model<IInterestV2>

    const InterestUserSchema = new Schema({}, { strict: false })
    const InterestUsermodel = connection.model("InterestUser", InterestUserSchema, "interestusers") as any as Model<IInterestUser>

    console.log("[Models] ✓ All models initialized")
    console.log("")

    // Get the event
    console.log(`[Event] Fetching event ${EVENT_ID}...`)
    const event = await Events.findById(new Types.ObjectId(EVENT_ID))

    if (!event) {
      throw new Error(`Event not found: ${EVENT_ID}`)
    }

    console.log(`[Event] ✓ Found event: ${event.name}`)

    // Check if group has already been created (skip in test mode)
    if (!TEST_MODE && event.eventGroupCreated) {
      throw new Error("Interest group has already been created for this event")
    }

    // Check if users have been created (mutually exclusive, skip in test mode)
    if (!TEST_MODE && event.eventUsersCreated) {
      throw new Error("Users have already been created. Cannot create interest group.")
    }

    console.log("")

    // Get bookings and waiting list
    console.log("[Data] Fetching bookings and waiting list entries...")
    const bookings = await Bookings.find({
      eventId: new Types.ObjectId(EVENT_ID),
      isDeleted: false,
    }).lean()

    const waitingListEntries = await WaitingList.find({
      eventId: new Types.ObjectId(EVENT_ID),
    }).lean()

    console.log(`[Data] ✓ Found ${bookings.length} bookings`)
    console.log(`[Data] ✓ Found ${waitingListEntries.length} waiting list entries`)
    console.log("")

    if (bookings.length === 0 && waitingListEntries.length === 0) {
      throw new Error("No bookings or waiting list entries found for this event")
    }

    // Create or find interest group
    // Use hardcoded interest group ID for script processing
    const HARDCODED_GROUP_ID = "69123e237dd5c2662a6dea9c"
    console.log(`[Group] Using hardcoded interest group ID: ${HARDCODED_GROUP_ID}`)
    console.log(`[Group] Note: Email button will link to: 69123f410fa0cd6ede9ff811`)
    
    const interestGroup = await InterestV2model.findById(HARDCODED_GROUP_ID)
    
    if (!interestGroup) {
      throw new Error(`Interest group with ID ${HARDCODED_GROUP_ID} not found`)
    }
    
    console.log(`[Group] ✓ Found interest group: ${interestGroup.name}`)

    console.log("")

    // Extract emails
    const bookingEmails = bookings.map((booking) => ({
      email: booking.customerEmail.toLowerCase().trim(),
      source: "booking" as const,
      booking,
      waitingListEntry: null as any,
    }))

    const waitingListEmails = waitingListEntries.map((entry) => ({
      email: entry.email.toLowerCase().trim(),
      source: "waitingList" as const,
      booking: null as any,
      waitingListEntry: entry,
    }))

    // Combine and deduplicate (bookings take priority)
    const emailMap = new Map()
    for (const item of waitingListEmails) {
      if (!emailMap.has(item.email)) {
        emailMap.set(item.email, item)
      }
    }
    for (const item of bookingEmails) {
      emailMap.set(item.email, item)
    }

    let uniqueEmails = Array.from(emailMap.values())

    // Filter for test mode
    if (TEST_MODE) {
      console.log(`[TestMode] Filtering to test emails only: ${TEST_EMAILS?.join(", ")}`)
      uniqueEmails = uniqueEmails.filter(item => TEST_EMAILS?.includes(item.email))
      console.log(`[TestMode] ✓ Filtered to ${uniqueEmails.length} test email(s)`)
      console.log("")
    }

    if (uniqueEmails.length === 0) {
      throw new Error(TEST_MODE ? "No test emails found in bookings or waiting list" : "No unique emails found")
    }

    // Process users and send emails
    const defaultPassword = "123456"
    const hashedPassword = await bcrypt.hash(defaultPassword, 10)
    const userType = "user"

    const results = {
      processed: 0,
      newUsers: 0,
      existingUsers: 0,
      emailsSent: 0,
      errors: [] as any[],
    }

    console.log(`[Processing] Starting to process ${uniqueEmails.length} email(s)...`)
    console.log("")

    for (const item of uniqueEmails) {
      const { email, source, booking, waitingListEntry } = item

      try {
        console.log(`[${results.processed + 1}/${uniqueEmails.length}] Processing: ${email}`)

        // Find or create user
        let user = await Users.findOne({ email: email.toLowerCase() })
        let isNewUser = false

        if (!user) {
          // Extract name
          let firstName = "User"
          let lastName = ""

          if (booking && booking.customerName) {
            const nameParts = booking.customerName.trim().split(/\s+/)
            if (nameParts.length >= 2) {
              firstName = nameParts[0]
              lastName = nameParts.slice(1).join(" ")
            } else if (nameParts.length === 1) {
              firstName = nameParts[0]
            }
          } else if (waitingListEntry) {
            firstName = waitingListEntry.firstName || "User"
            lastName = waitingListEntry.lastName || ""
          } else {
            const emailName = email.split("@")[0]
            const nameParts = emailName.split(/[._-]/)
            if (nameParts.length >= 2) {
              firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)
              lastName = nameParts.slice(1).join(" ").charAt(0).toUpperCase() + nameParts.slice(1).join(" ").slice(1)
            } else {
              firstName = emailName.charAt(0).toUpperCase() + emailName.slice(1)
            }
          }

          console.log(`  → Creating new user: ${firstName} ${lastName}`)
          user = await Users.create({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password: hashedPassword,
            role: userType,
          })

          isNewUser = true
          results.newUsers++
        } else {
          console.log(`  → Found existing user: ${user.firstName} ${user.lastName}`)
          results.existingUsers++
        }

        // Check if InterestUser entry already exists
        const existingInterestUser = await InterestUsermodel.findOne({
          interestId: interestGroup._id,
          userId: user._id,
        })

        if (!existingInterestUser) {
          console.log(`  → Creating InterestUser entry`)
          await InterestUsermodel.create({
            interestId: interestGroup._id,
            userId: user._id,
            isRequest: false,
            status: "pending",
            isAdmin: false,
          })
        } else {
          console.log(`  → InterestUser entry already exists`)
        }

        // Generate acceptance link
        const token = generateInviteToken(
          interestGroup._id.toString(),
          user._id.toString(),
          email,
          config.jwtSecret
        )
        const acceptLink = `${config.baseUrl}/events/${EVENT_ID}/group/accept?token=${token}&email=${encodeURIComponent(email)}&interestId=${interestGroup._id}`

        // Generate and send email
        const emailTemplate = generateEmailTemplate(
          user.firstName || "there",
          event.name,
          acceptLink,
          isNewUser,
          email,
          defaultPassword,
          source,
          config.baseUrl
        )

        console.log(`  → Sending email...`)
        try {
          const response = await sendgrid.send({
            to: email,
            from: config.sendgridSender,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
          })
          console.log(`  ✓ Email sent successfully (Status: ${response[0].statusCode})`)
        } catch (emailError: any) {
          console.error(`  ✗ SendGrid error:`, emailError.response?.body || emailError.message)
          throw emailError
        }
        results.emailsSent++
        results.processed++
        console.log("")
      } catch (error: any) {
        console.error(`  ✗ Error processing ${email}:`, error.message)
        results.errors.push({ email, error: error.message })
        results.processed++
        console.log("")
      }
    }

    // Update event flag (skip in test mode)
    if (!TEST_MODE) {
      console.log("[Event] Updating event flag...")
      event.eventGroupCreated = true
      await event.save()
      console.log("[Event] ✓ Event flag updated")
      console.log("")
    }

    // Print summary
    console.log("=".repeat(60))
    console.log("SUMMARY")
    console.log("=".repeat(60))
    console.log(`Event: ${event.name}`)
    console.log(`Interest Group ID: ${interestGroup._id}`)
    console.log(`Mode: ${TEST_MODE ? "TEST MODE" : "PRODUCTION"}`)
    console.log("")
    console.log(`Total Processed: ${results.processed}`)
    console.log(`New Users Created: ${results.newUsers}`)
    console.log(`Existing Users: ${results.existingUsers}`)
    console.log(`Emails Sent: ${results.emailsSent}`)
    console.log(`Errors: ${results.errors.length}`)
    
    if (results.errors.length > 0) {
      console.log("")
      console.log("ERRORS:")
      results.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.email}: ${err.error}`)
      })
    }
    
    console.log("=".repeat(60))
    console.log("")
    console.log("✓ Script completed successfully!")
    
    if (TEST_MODE) {
      console.log("")
      console.log("⚠️  TEST MODE - Event flags were NOT updated")
      console.log("   To run in production mode, use: --testMode=false")
    }

  } catch (error: any) {
    console.error("")
    console.error("=".repeat(60))
    console.error("✗ SCRIPT FAILED")
    console.error("=".repeat(60))
    console.error(error.message)
    console.error("")
    if (error.stack) {
      console.error("Stack trace:")
      console.error(error.stack)
    }
    process.exit(1)
  } finally {
    if (connection) {
      await closeProdDbConnection(connection)
    }
    process.exit(0)
  }
}

// Run the script
main()

