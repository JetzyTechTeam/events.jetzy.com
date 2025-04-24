'use server';

import sgMail from "@sendgrid/mail"

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export interface EmailProps {
    eventName: string
    oldEventName: string
    location: string
    oldLocation: string
    startDate: string
    oldStartDate: string
    startTime: string
    oldStartTime: string
    endDate: string
    oldEndDate: string
    endTime: string
    oldEndTime: string
    userEmail?: string
}


export async function sendUpdateEventEmail(data: EmailProps) {
  try {

    const { subject, html } = eventUpdateEmailTemplate({
      eventName: data.eventName,
      oldEventName: data.oldEventName,
      location: data.location,
      oldLocation: data.oldLocation,
      startDate: data.startDate,
      oldStartDate: data.oldStartDate,
      startTime: data.startTime,
      oldStartTime: data.oldStartTime,
      endDate: data.endDate,
      oldEndDate: data.oldEndDate,
      endTime: data.endTime,
      oldEndTime: data.oldEndTime,
    })
    
    await sgMail.send({
      to: data.userEmail,
      from: process.env.SENDGRID_EMAIL_SENDER!,
      subject,
      html
    })

		return { success: true }
  } catch (error) {
    console.error("Email sending error:", error)
		return { success: false, error }
  }
}

export function eventUpdateEmailTemplate({
  eventName,
  oldEventName,
  location,
  oldLocation,
  startDate,
  oldStartDate,
  startTime,
  oldStartTime,
  endDate,
  oldEndDate,
  endTime,
  oldEndTime,
}: EmailProps) {
  return {
    subject: `Event Update: "${oldEventName}" has changed`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>Event Update Notification</h2>
        <p>The event you registered for has been updated. Please review the new details below:</p>
        <table style="border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 8px;"><strong>Event Name:</strong></td>
            <td style="padding: 4px 8px;">${oldEventName} &rarr; <b>${eventName}</b></td>
          </tr>
          <tr>
            <td style="padding: 4px 8px;"><strong>Location:</strong></td>
            <td style="padding: 4px 8px;">${oldLocation} &rarr; <b>${location}</b></td>
          </tr>
          <tr>
            <td style="padding: 4px 8px;"><strong>Start:</strong></td>
            <td style="padding: 4px 8px;">${oldStartDate} ${oldStartTime} &rarr; <b>${startDate} ${startTime}</b></td>
          </tr>
          <tr>
            <td style="padding: 4px 8px;"><strong>End:</strong></td>
            <td style="padding: 4px 8px;">${oldEndDate} ${oldEndTime} &rarr; <b>${endDate} ${endTime}</b></td>
          </tr>
        </table>
        <p>If you have any questions, please contact us.</p>
        <p>Thank you,<br/>The Jetzy Team</p>
      </div>
    `
  }
}