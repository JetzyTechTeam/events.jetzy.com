import { sendUpdateEventEmailLogic, EmailProps } from "@/lib/email-service"

export async function sendUpdateEventEmail(data: EmailProps) {
  return sendUpdateEventEmailLogic(data)
}