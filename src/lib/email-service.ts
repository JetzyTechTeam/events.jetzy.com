import sgMail from "@sendgrid/mail"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY.trim())
}

// Helper function to wrap HTML content in proper tags
const wrapHtml = (html: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${html}</body></html>`;

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
  changes?: string[]
  eventLink?: string
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
  changes,
  eventLink,
}: EmailProps) {
  const changesHtml = changes && changes.length > 0 
    ? `<h3>Changes made:</h3><ul>${changes.map(c => `<li>${c}</li>`).join('')}</ul>`
    : '';

  const linkHtml = eventLink 
    ? `<p style="margin-top: 20px;"><strong><a href="${eventLink}" style="color: #F79432;">Click here to view the updated event page</a></strong></p>`
    : '';

  const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>Event Update Notification</h2>
        <p>The event you registered for has been updated. Please review the new details below:</p>
        
        ${changesHtml}

        <table style="border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 4px 8px;"><strong>Event Name:</strong></td>
            <td style="padding: 4px 8px;"><b>${eventName}</b></td>
          </tr>
          ${location ? `
          <tr>
            <td style="padding: 4px 8px;"><strong>Location:</strong></td>
            <td style="padding: 4px 8px;"><b>${location}</b></td>
          </tr>` : ''}
          <tr>
            <td style="padding: 4px 8px;"><strong>Start:</strong></td>
            <td style="padding: 4px 8px;"><b>${startDate ? `${startDate}${startTime ? ` ${startTime}` : ''}` : 'To be announced'}</b></td>
          </tr>
          ${endDate ? `
          <tr>
            <td style="padding: 4px 8px;"><strong>End:</strong></td>
            <td style="padding: 4px 8px;"><b>${endDate}${endTime ? ` ${endTime}` : ''}</b></td>
          </tr>` : ''}
        </table>
        
        ${linkHtml}
        <p>If you have any questions, please contact us.</p>
        <p>Thank you,<br/>The Jetzy Team</p>
      </div>
    `;

  const changesText = changes && changes.length > 0 ? `\nChanges made:\n- ${changes.join('\n- ')}\n` : '';
  const linkText = eventLink ? `\nView Event: ${eventLink}\n` : '';

  const locationText = location ? `Location: ${location}\n` : ''
  const startText = `Start: ${startDate ? `${startDate}${startTime ? ` ${startTime}` : ''}` : 'To be announced'}\n`
  const endText = endDate ? `End: ${endDate}${endTime ? ` ${endTime}` : ''}\n` : ''
  const textBody = `Event Update: "${oldEventName}" has been updated.\n${changesText}\nNew Details:\nEvent Name: ${eventName}\n${locationText}${startText}${endText}${linkText}\nThank you,\nThe Jetzy Team`;

  return {
    subject: `Event Update: "${oldEventName}" has changed`,
    html: wrapHtml(htmlBody),
    text: textBody
  }
}

export async function sendUpdateEventEmailLogic(data: EmailProps) {
  try {
    const { subject, html, text } = eventUpdateEmailTemplate(data)

    await sgMail.send({
      to: data.userEmail,
      from: process.env.SENDGRID_EMAIL_SENDER!.trim(),
      subject,
      html,
      text
    })

    return { success: true }
  } catch (error) {
    console.error("Email sending error:", error)
    return { success: false, error }
  }
}
