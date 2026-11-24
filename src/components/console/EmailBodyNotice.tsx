import React from "react"
import { Text } from "@chakra-ui/react"
import { bodyHasPastedImages } from "@/lib/email-body"

/**
 * Under a blast-style editor: warns when the body holds a PASTED picture (a `data:` image), which
 * `emailBodyHtml` drops from the email — Gmail would show it as a broken box, and it would ride
 * in every copy of the message. Renders nothing otherwise.
 */
export default function EmailBodyNotice({ html }: { html: string }) {
	if (!bodyHasPastedImages(html)) return null
	return (
		<Text fontSize="xs" color="#F6AD55" mt={-1} mb={3}>
			A pasted picture can&apos;t be emailed this way and will be left out. Use Add file to attach it instead.
		</Text>
	)
}
