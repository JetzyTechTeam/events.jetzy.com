"use server"

import { IEvent } from "@/models/events/types"
import { sendTicketConfirmation } from "@Jetzy/lib/send-grid"

type EmailData = {
	event: IEvent
	firstName: string
	lastName: string
	email: string
	phone: string
	tickets: any
	orderNumber: string
}

export async function sendEmailAction(data: EmailData) {
	try {
		await sendTicketConfirmation(data)
		return { success: true }
	} catch (error) {
		console.error("Email sending error:", error)
		return { success: false, error }
	}
}
