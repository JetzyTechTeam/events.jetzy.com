import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"
import { Roles } from "@/types"
import bcrypt from "bcrypt"
import sendgrid from "@sendgrid/mail"

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string)

/**
 * API endpoint to create user accounts for all ticket purchasers who aren't signed up
 * POST /api/events/[eventId]/create-users
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		// @ts-ignore
		if (session.user?.role !== "admin") {
			return sendResponse(res, null, "Access denied. Admin only.", false, ResCode.FORBIDDEN)
		}

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Get the event
		const event = await Events.findById(new Types.ObjectId(eventId))

		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Check if users have already been created
		if (event.eventUsersCreated) {
			console.log(`[create-users] Users already created for event ${eventId}`)
			return sendResponse(res, null, "Users have already been created for this event", false, ResCode.BAD_REQUEST)
		}

		// Check if group has been created (mutually exclusive)
		if (event.eventGroupCreated) {
			console.log(`[create-users] Group already created for event ${eventId}, cannot create users`)
			return sendResponse(res, null, "Interest group has already been created. Cannot create users.", false, ResCode.BAD_REQUEST)
		}

		console.log(`[create-users] Fetching bookings for event ${eventId}`)
		// Get all bookings for the event (non-deleted, confirmed)
		const bookings = await Bookings.find({
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		}).lean()

		console.log(`[create-users] Found ${bookings?.length || 0} bookings`)

		if (!bookings || bookings.length === 0) {
			console.log(`[create-users] No bookings found for event ${eventId}`)
			return sendResponse(
				res,
				{ created: 0, skipped: 0 },
				"No bookings found for this event. Cannot create user accounts.",
				false,
				ResCode.BAD_REQUEST
			)
		}

		// Extract unique customer emails
		const uniqueEmails = [...new Set(bookings.map((booking) => booking.customerEmail.toLowerCase().trim()))]

		// Check which emails don't have user accounts (check both Users and EventUsers)
		const existingUsers = await Users.find({ email: { $in: uniqueEmails } }).select("email").lean()
		const existingEventUsers = await EventUsers.find({ email: { $in: uniqueEmails } }).select("email").lean()

		const existingEmails = new Set([
			...existingUsers.map((u) => u.email.toLowerCase()),
			...existingEventUsers.map((u) => u.email.toLowerCase()),
		])

		// Filter out emails that already have accounts
		const emailsToCreate = uniqueEmails.filter((email) => !existingEmails.has(email))

		if (emailsToCreate.length === 0) {
			return sendResponse(res, { created: 0, skipped: uniqueEmails.length }, "All users already have accounts", true, ResCode.OK)
		}

		// Default password
		const defaultPassword = "123456"
		const hashedPassword = await bcrypt.hash(defaultPassword, 10)

		const userType = Roles.USER
		const createdUsers: any[] = []
		const emailErrors: any[] = []

		// Create user accounts for each email
		for (const email of emailsToCreate) {
			try {
				// Find booking to get customer name
				const booking = bookings.find((b) => b.customerEmail.toLowerCase().trim() === email)
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
				} else {
					// Extract name from email if no booking name
					const emailName = email.split("@")[0]
					const nameParts = emailName.split(/[._-]/)
					if (nameParts.length >= 2) {
						firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)
						lastName = nameParts.slice(1).join(" ").charAt(0).toUpperCase() + nameParts.slice(1).join(" ").slice(1)
					} else {
						firstName = emailName.charAt(0).toUpperCase() + emailName.slice(1)
					}
				}

				// Create user account (using Users model, not EventUsers)
				const newUser = await Users.create({
					firstName,
					lastName,
					email,
					password: hashedPassword,
					role: userType,
				})

				createdUsers.push({
					email,
					userId: newUser._id,
				})

				// Send email with credentials
				const emailHtml = `
					<div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px 0;">
						<div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
							<h2 style="color: #2d3748; text-align: center; margin-bottom: 24px;">Your Jetzy Events Account</h2>
							<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
								Hello ${firstName},
							</p>
							<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
								We've created your Jetzy Events account because you joined <strong>${event.name}</strong>. 
							</p>
							<div style="background: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 24px 0; border-radius: 4px;">
								<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Your Account Credentials:</p>
								<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
									<strong>Email:</strong> ${email}<br/>
									<strong>Password:</strong> ${defaultPassword}
								</p>
							</div>
							<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
								You can login using these credentials at any time. Please keep this information safe.
							</p>
							<div style="text-align: center; margin: 32px 0;">
								<a href="${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/login" style="display: inline-block; background: #3182ce; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 18px; font-weight: bold;">
									Login to Your Account
								</a>
							</div>
							<p style="font-size: 14px; color: #a0aec0; text-align: center; margin-top: 32px;">
								This email was sent because you registered for an event on Jetzy Events.
							</p>
							<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 16px;">
								&copy; ${new Date().getFullYear()} Jetzy Events
							</p>
						</div>
					</div>
				`

				try {
					await sendgrid.send({
						to: email,
						from: process.env.SENDGRID_EMAIL_SENDER as string,
						subject: `Your Jetzy Events Account - ${event.name}`,
						html: emailHtml,
					})
				} catch (emailError) {
					console.error(`Failed to send email to ${email}:`, emailError)
					emailErrors.push({ email, error: "Failed to send email" })
				}
			} catch (userError: any) {
				console.error(`Failed to create user for ${email}:`, userError)
				emailErrors.push({ email, error: userError.message || "Failed to create user" })
			}
		}

		// Update event flag
		event.eventUsersCreated = true
		await event.save()

		return sendResponse(
			res,
			{
				created: createdUsers.length,
				skipped: uniqueEmails.length - emailsToCreate.length,
				errors: emailErrors.length > 0 ? emailErrors : undefined,
			},
			`Successfully created ${createdUsers.length} user account${createdUsers.length !== 1 ? "s" : ""}`,
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error creating users:", error)
		return sendResponse(res, null, error.message || "Failed to create users", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

