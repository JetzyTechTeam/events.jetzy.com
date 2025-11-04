import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { Users } from "@/models/userModal"
import InterestV2model from "@/models/interest-v2"
import InterestUsermodel from "@/models/interest-user"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"
import { Roles } from "@/types"
import bcrypt from "bcrypt"
import sendgrid from "@sendgrid/mail"
import crypto from "crypto"

sendgrid.setApiKey(process.env.SENDGRID_API_KEY as string)

/**
 * Generate a secure token for group invitation
 */
function generateInviteToken(interestId: string, userId: string, email: string): string {
	const secret = process.env.JWT_SECRET || "default-secret-key"
	const data = `${interestId}:${userId}:${email}:${secret}`
	return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32)
}

/**
 * API endpoint to create interest group for event
 * POST /api/events/[eventId]/create-group
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

		// Check if group has already been created
		if (event.eventGroupCreated) {
			return sendResponse(res, null, "Interest group has already been created for this event", false, ResCode.BAD_REQUEST)
		}

		// Check if users have been created (mutually exclusive)
		if (event.eventUsersCreated) {
			return sendResponse(res, null, "Users have already been created. Cannot create interest group.", false, ResCode.BAD_REQUEST)
		}

		// Check if group already exists with this event name
		const existingGroup = await InterestV2model.findOne({
			name: event.name,
			status: { $ne: "deleted" },
		})

		if (existingGroup) {
			return sendResponse(res, null, "An interest group with this name already exists", false, ResCode.BAD_REQUEST)
		}

		// @ts-ignore
		const adminUserId = session.user._id

		console.log(`[create-group] Creating interest group for event ${eventId}`)

		// Create InterestV2 group
		let interestGroup
		try {
			interestGroup = await InterestV2model.create({
				name: event.name,
				type: "public",
				description: event.desc || "",
				createdBy: new Types.ObjectId(adminUserId),
				status: "active",
			})
			console.log(`[create-group] Interest group created: ${interestGroup._id}`)
		} catch (groupError: any) {
			console.error(`[create-group] Error creating interest group:`, groupError)
			return sendResponse(
				res,
				null,
				`Failed to create interest group: ${groupError.message || "Unknown error"}`,
				false,
				ResCode.INTERNAL_SERVER_ERROR
			)
		}

		// Get all bookings for the event
		const bookings = await Bookings.find({
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		}).lean()

		if (!bookings || bookings.length === 0) {
			console.log(`[create-group] No bookings found for event ${eventId}, rolling back group creation`)
			// Rollback group creation
			try {
				await InterestV2model.findByIdAndDelete(interestGroup._id)
			} catch (deleteError) {
				console.error(`[create-group] Error deleting group during rollback:`, deleteError)
			}
			return sendResponse(
				res,
				{ created: 0, skipped: 0 },
				"No bookings found for this event. Cannot create interest group.",
				false,
				ResCode.BAD_REQUEST
			)
		}

		console.log(`[create-group] Found ${bookings.length} bookings for event ${eventId}`)

		// Extract unique customer emails
		const uniqueEmails = [...new Set(bookings.map((booking) => booking.customerEmail.toLowerCase().trim()))]

		// Default password
		const defaultPassword = "123456"
		const hashedPassword = await bcrypt.hash(defaultPassword, 10)
		const userType = Roles.USER

		const createdUsers: any[] = []
		const interestUserEntries: any[] = []
		const emailErrors: any[] = []
		const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"

		// For each booking email, find or create user account and create InterestUser entry
		for (const email of uniqueEmails) {
			try {
				// Find or create user account
				let user = await Users.findOne({ email: email.toLowerCase() })

				let isNewUser = false
				if (!user) {
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

					// Create user account
					user = await Users.create({
						firstName,
						lastName,
						email: email.toLowerCase(),
						password: hashedPassword,
						role: userType,
					})

					isNewUser = true
					createdUsers.push({
						email,
						userId: user._id,
						isNewUser: true,
					})
				} else {
					createdUsers.push({
						email,
						userId: user._id,
						isNewUser: false,
					})
				}

				// Check if InterestUser entry already exists
				const existingInterestUser = await InterestUsermodel.findOne({
					interestId: interestGroup._id,
					userId: user._id,
				})

				if (!existingInterestUser) {
					// Create InterestUser entry with status "pending"
					let interestUser
					try {
						interestUser = await InterestUsermodel.create({
							interestId: interestGroup._id,
							userId: user._id,
							isRequest: false,
							status: "pending",
							isAdmin: false,
						})
						interestUserEntries.push(interestUser)
					} catch (interestUserError: any) {
						console.error(`[create-group] Error creating InterestUser for ${email}:`, interestUserError)
						emailErrors.push({ email, error: `Failed to create interest user entry: ${interestUserError.message}` })
						continue // Skip to next email
					}

					// Generate acceptance link with token
					const token = generateInviteToken(interestGroup._id.toString(), user._id.toString(), email)
					const acceptLink = `${baseUrl}/events/${eventId}/group/accept?token=${token}&email=${encodeURIComponent(email)}&interestId=${interestGroup._id.toString()}`

					// Send email with credentials and acceptance link
					const emailHtml = `
						<div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px 0;">
							<div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
								<h2 style="color: #2d3748; text-align: center; margin-bottom: 24px;">Join ${event.name} Interest Group</h2>
								<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
									Hello ${user.firstName || "there"},
								</p>
								<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
									You're invited to join the interest group for <strong>${event.name}</strong>!
								</p>
								<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
									${event.desc ? `Event Details: ${event.desc.substring(0, 200)}${event.desc.length > 200 ? "..." : ""}` : ""}
								</p>
								${isNewUser ? `
									<div style="background: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 24px 0; border-radius: 4px;">
										<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Your Account Credentials:</p>
										<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
											<strong>Email:</strong> ${email}<br/>
											<strong>Password:</strong> ${defaultPassword}
										</p>
									</div>
								` : ""}
								<div style="background: #e6f7ff; border-left: 4px solid #1890ff; padding: 16px; margin: 24px 0; border-radius: 4px;">
									<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Join the Group:</p>
									<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
										Click the button below to accept the invitation and join the interest group.
									</p>
								</div>
								<div style="text-align: center; margin: 32px 0;">
									<a href="${acceptLink}" style="display: inline-block; background: #3182ce; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 18px; font-weight: bold;">
										Accept & Join Group
									</a>
								</div>
								<p style="font-size: 14px; color: #a0aec0; text-align: center;">
									If the button above does not work, copy and paste this link into your browser:<br/>
									<a href="${acceptLink}" style="color: #3182ce;">${acceptLink}</a>
								</p>
								<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 32px;">
									This invitation was sent because you registered for an event on Jetzy Events.
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
							subject: `Join ${event.name} Interest Group`,
							html: emailHtml,
						})
					} catch (emailError) {
						console.error(`Failed to send email to ${email}:`, emailError)
						emailErrors.push({ email, error: "Failed to send email" })
					}
				}
			} catch (userError: any) {
				console.error(`Failed to process user for ${email}:`, userError)
				emailErrors.push({ email, error: userError.message || "Failed to process user" })
			}
		}

		// Update event flag
		try {
			event.eventGroupCreated = true
			await event.save()
			console.log(`[create-group] Event flag updated for event ${eventId}`)
		} catch (saveError: any) {
			console.error(`[create-group] Error updating event flag:`, saveError)
			// Don't fail the whole request if flag update fails, but log it
		}

		console.log(`[create-group] Successfully created group ${interestGroup._id} with ${interestUserEntries.length} members`)

		return sendResponse(
			res,
			{
				groupCreated: true,
				groupId: interestGroup._id,
				groupName: interestGroup.name,
				usersProcessed: interestUserEntries.length,
				usersCreated: createdUsers.filter((u) => u.isNewUser).length,
				errors: emailErrors.length > 0 ? emailErrors : undefined,
			},
			`Successfully created interest group "${interestGroup.name}" and sent invitations to ${interestUserEntries.length} user${interestUserEntries.length !== 1 ? "s" : ""}`,
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error creating interest group:", error)
		return sendResponse(res, null, error.message || "Failed to create interest group", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

