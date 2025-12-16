import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import sgMail from "@sendgrid/mail"
import type { NextApiRequest, NextApiResponse } from "next"

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		const { email } = req.query

		if (!email) {
			return sendResponse(res, null, "Email parameter required (?email=test@example.com)", false, ResCode.BAD_REQUEST)
		}

		await sgMail.send({
			to: email as string,
			from: process.env.SENDGRID_EMAIL_SENDER as string,
			subject: "Test Email from Jetzy Events",
			html: `
				<div style="font-family: Arial, sans-serif; padding: 20px;">
					<h1>✅ SendGrid is Working!</h1>
					<p>If you received this email, your SendGrid configuration is correct.</p>
					<p><strong>Sender:</strong> ${process.env.SENDGRID_EMAIL_SENDER}</p>
					<p><strong>Time:</strong> ${new Date().toISOString()}</p>
				</div>
			`,
		})

		return sendResponse(res, { email, sender: process.env.SENDGRID_EMAIL_SENDER }, "Test email sent successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.error("SendGrid error:", error.response?.body || error.message)
		return sendResponse(
			res,
			{ error: error.response?.body || error.message },
			"Failed to send test email",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}
