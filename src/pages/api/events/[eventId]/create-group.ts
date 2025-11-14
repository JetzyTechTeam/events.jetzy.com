import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { Users } from "@/models/userModal"
import { WaitingList } from "@/models/waitingList"
import InterestV2model from "@/models/interest-v2"
import InterestUsermodel from "@/models/interest-user"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"
import { Roles } from "@/types"
import bcrypt from "bcrypt"
import sendgrid from "@sendgrid/mail"
import crypto from "crypto"
import { createGroupInvitationNotification } from "@/lib/notification-helper"

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
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[create-group] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

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
		let interestGroup: any
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
			return sendResponse(res, null, `Failed to create interest group: ${groupError.message || "Unknown error"}`, false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Get all bookings for the event
		const bookings = await Bookings.find({
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		}).lean()

		// Get all waiting list entries for the event
		const waitingListEntries = await WaitingList.find({
			eventId: new Types.ObjectId(eventId),
		}).lean()

		if ((!bookings || bookings.length === 0) && (!waitingListEntries || waitingListEntries.length === 0)) {
			console.log(`[create-group] No bookings or waiting list entries found for event ${eventId}, rolling back group creation`)
			// Rollback group creation
			try {
				await InterestV2model.findByIdAndDelete(interestGroup._id)
			} catch (deleteError) {
				console.error(`[create-group] Error deleting group during rollback:`, deleteError)
			}
			return sendResponse(
				res,
				{ created: 0, skipped: 0, fromBookings: 0, fromWaitingList: 0 },
				"No bookings or waiting list entries found for this event. Cannot create interest group.",
				false,
				ResCode.BAD_REQUEST,
			)
		}

		console.log(`[create-group] Found ${bookings?.length || 0} bookings and ${waitingListEntries?.length || 0} waiting list entries for event ${eventId}`)

		// Extract unique customer emails from bookings
		const bookingEmails = bookings.map((booking) => ({
			email: booking.customerEmail.toLowerCase().trim(),
			source: "booking" as const,
			booking,
			waitingListEntry: null as any,
		}))

		// Extract unique customer emails from waiting list
		const waitingListEmails = waitingListEntries.map((entry) => ({
			email: entry.email.toLowerCase().trim(),
			source: "waitingList" as const,
			booking: null as any,
			waitingListEntry: entry,
		}))

		// Combine and deduplicate emails (bookings take priority if email exists in both)
		const emailMap = new Map<string, { email: string; source: "booking" | "waitingList"; booking: any; waitingListEntry: any }>()

		// Add waiting list entries first
		for (const item of waitingListEmails) {
			if (!emailMap.has(item.email)) {
				emailMap.set(item.email, item)
			}
		}

		// Add bookings (will overwrite waiting list if duplicate)
		for (const item of bookingEmails) {
			emailMap.set(item.email, item)
		}

		const uniqueEmails = Array.from(emailMap.values())

		// Default password
		const defaultPassword = "123456"
		const hashedPassword = await bcrypt.hash(defaultPassword, 10)
		const userType = Roles.USER

		const createdUsers: any[] = []
		const interestUserEntries: any[] = []
		const emailErrors: any[] = []
		const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
		let fromBookingsCount = 0
		let fromWaitingListCount = 0

		// For each email, find or create user account and create InterestUser entry
		for (const item of uniqueEmails) {
			const { email, source, booking, waitingListEntry } = item

			try {
				// Find or create user account
				let user = await Users.findOne({ email: email.toLowerCase() })

				let isNewUser = false
				let isFromWaitingList = source === "waitingList"

				if (!user) {
					let firstName = "User"
					let lastName = ""

					if (booking && booking.customerName) {
						// Use booking name
						const nameParts = booking.customerName.trim().split(/\s+/)
						if (nameParts.length >= 2) {
							firstName = nameParts[0]
							lastName = nameParts.slice(1).join(" ")
						} else if (nameParts.length === 1) {
							firstName = nameParts[0]
						}
					} else if (waitingListEntry) {
						// Use waiting list name
						firstName = waitingListEntry.firstName || "User"
						lastName = waitingListEntry.lastName || ""
					} else {
						// Extract name from email if no other source
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
					if (isFromWaitingList) {
						fromWaitingListCount++
					} else {
						fromBookingsCount++
					}
					createdUsers.push({
						email,
						userId: user._id,
						isNewUser: true,
						source: isFromWaitingList ? "waitingList" : "booking",
					})
				} else {
					if (isFromWaitingList) {
						fromWaitingListCount++
					} else {
						fromBookingsCount++
					}
					createdUsers.push({
						email,
						userId: user._id,
						isNewUser: false,
						source: isFromWaitingList ? "waitingList" : "booking",
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
					const interestGroupId = interestGroup._id.toString()
					const userId = user._id.toString()
					const token = generateInviteToken(interestGroupId, userId, email)
					const acceptLink = `${baseUrl}/events/${eventId}/group/accept?token=${token}&email=${encodeURIComponent(email)}&interestId=${interestGroupId}`

					// Send different email based on source
					let emailHtml = ""
					let emailSubject = ""

					if (isFromWaitingList) {
						// Waiting list email - more engaging, community-focused
						emailSubject = `Join ${event.name} Interest Group - Connect with Others!`
						emailHtml = `
							<div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px 0;">
								<div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
									<h2 style="color: #2d3748; text-align: center; margin-bottom: 24px;">Join ${event.name} Interest Group</h2>
									<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
										Hello ${user.firstName || "there"},
									</p>
									<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
										We noticed you missed <strong>${
											event.name
										}</strong>, but that doesn't mean you have to miss out on the community! You're invited to join the interest group and connect with others who also missed this event.
									</p>
									<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
										This is a great opportunity to stay connected with like-minded people, share experiences, and be the first to know about future events!
									</p>
									${
										event.desc
											? `
										<p style="font-size: 16px; color: #4a5568; line-height: 1.6;">
											Event Details: ${event.desc.substring(0, 200)}${event.desc.length > 200 ? "..." : ""}
										</p>
									`
											: ""
									}
									${
										isNewUser
											? `
										<div style="background: #f7fafc; border-left: 4px solid #F79432; padding: 16px; margin: 24px 0; border-radius: 4px;">
											<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Your Account Credentials:</p>
											<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
												<strong>Email:</strong> ${email}<br/>
												<strong>Password:</strong> ${defaultPassword}
											</p>
										</div>
									`
											: ""
									}
									<div style="background: #fff5e6; border-left: 4px solid #F79432; padding: 16px; margin: 24px 0; border-radius: 4px;">
										<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Join the Community:</p>
										<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
											Connect with others who also missed the event and stay in the loop for future opportunities. Click the button below to accept the invitation and join the interest group!
										</p>
									</div>
									<div style="text-align: center; margin: 32px 0;">
										<a href="${acceptLink}" style="display: inline-block; background: #F79432; color: #000; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 18px; font-weight: bold;">
											Accept & Join Group
										</a>
									</div>
									<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 32px;">
										This invitation was sent because you were on the waiting list for an event on Jetzy Events.
									</p>
									<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 16px;">
										&copy; ${new Date().getFullYear()} Jetzy Events
									</p>
								</div>
							</div>
						`
					} else {
						// Booking email - original template
						emailSubject = `Join ${event.name} Interest Group`
						emailHtml = `
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
									${
										isNewUser
											? `
										<div style="background: #f7fafc; border-left: 4px solid #F79432; padding: 16px; margin: 24px 0; border-radius: 4px;">
											<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Your Account Credentials:</p>
											<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
												<strong>Email:</strong> ${email}<br/>
												<strong>Password:</strong> ${defaultPassword}
											</p>
										</div>
									`
											: ""
									}
									<div style="background: #fff5e6; border-left: 4px solid #F79432; padding: 16px; margin: 24px 0; border-radius: 4px;">
										<p style="font-size: 14px; color: #2d3748; margin: 0; font-weight: bold;">Join the Group:</p>
										<p style="font-size: 14px; color: #4a5568; margin: 8px 0 0 0;">
											Click the button below to accept the invitation and join the interest group.
										</p>
									</div>
									<div style="text-align: center; margin: 32px 0;">
										<a href="${acceptLink}" style="display: inline-block; background: #F79432; color: #000; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 18px; font-weight: bold;">
											Accept & Join Group
										</a>
									</div>
									<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 32px;">
										This invitation was sent because you registered for an event on Jetzy Events.
									</p>
									<p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 16px;">
										&copy; ${new Date().getFullYear()} Jetzy Events
									</p>
								</div>
							</div>
						`
					}

					try {
						await sendgrid.send({
							to: email,
							from: process.env.SENDGRID_EMAIL_SENDER as string,
							subject: emailSubject,
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

		const totalFromBookings = uniqueEmails.filter((item) => item.source === "booking").length
		const totalFromWaitingList = uniqueEmails.filter((item) => item.source === "waitingList").length

		console.log(
			`[create-group] Successfully created group ${interestGroup._id} with ${interestUserEntries.length} members (${fromBookingsCount} from bookings, ${fromWaitingListCount} from waiting list)`,
		)

		return sendResponse(
			res,
			{
				groupCreated: true,
				groupId: interestGroup._id,
				groupName: interestGroup.name,
				usersProcessed: interestUserEntries.length,
				usersCreated: createdUsers.filter((u) => u.isNewUser).length,
				fromBookings: fromBookingsCount,
				fromWaitingList: fromWaitingListCount,
				totalFromBookings,
				totalFromWaitingList,
				errors: emailErrors.length > 0 ? emailErrors : undefined,
			},
			`Successfully created interest group "${interestGroup.name}" and sent invitations to ${interestUserEntries.length} user${
				interestUserEntries.length !== 1 ? "s" : ""
			} (${fromBookingsCount} from bookings, ${fromWaitingListCount} from waiting list)`,
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("Error creating interest group:", error)
		return sendResponse(res, null, error.message || "Failed to create interest group", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
