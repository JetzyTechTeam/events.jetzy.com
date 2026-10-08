import type { SystemStyleObject } from "@chakra-ui/react"

/**
 * Phone styling for the Add / Edit ticket dialog.
 *
 * There are TWO copies of that dialog — `TicketEditorModal` (Manage Event, the public event
 * page) and an inline duplicate in `console/events/create.tsx` — and both spread these objects,
 * so the two cannot drift on layout the way two hand-styled copies would.
 *
 * Everything sits inside ONE max-width media query (below Chakra's `md`, 768px). Nothing here
 * can reach a desktop or tablet: there is no `md` value to get wrong, because there is no rule
 * at those widths at all.
 *
 * The shape it produces: the dialog is exactly one screen tall, the header and the footer stay
 * where they are, and only the fields between them scroll. Before this the whole dialog
 * scrolled as one page, so the title left the top and Add / Cancel were only reachable at the
 * very bottom of a long form.
 */
const PHONE = "@media screen and (max-width: 47.99em)"

const phone = (styles: SystemStyleObject): { sx: SystemStyleObject } => ({ sx: { [PHONE]: styles } })

/** `ModalContent` — already a flex column in Chakra; this pins it to one screen. A browser
 *  without `dvh` ignores both lines and keeps the old whole-dialog scroll. */
export const ticketModalContent = phone({ height: "100dvh", maxHeight: "100dvh" })

export const ticketModalHeader = phone({
	flex: "0 0 auto",
	fontSize: "18px",
	paddingTop: "14px",
	paddingBottom: "14px",
	paddingLeft: "16px",
	paddingRight: "56px",
	borderBottom: "1px solid #343536",
})

export const ticketModalClose = phone({ top: "9px", right: "10px", width: "40px", height: "40px" })

/** The only part that scrolls. `minHeight: 0` is what lets a flex child shrink below its content. */
export const ticketModalBody = phone({
	flex: "1 1 auto",
	minHeight: 0,
	overflowY: "auto",
	paddingTop: "16px",
	paddingBottom: "16px",
	paddingLeft: "16px",
	paddingRight: "16px",
	WebkitOverflowScrolling: "touch",
})

const footerStyles: SystemStyleObject = {
	flex: "0 0 auto",
	gap: "12px",
	paddingTop: "12px",
	paddingLeft: "16px",
	paddingRight: "16px",
	paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
	borderTop: "1px solid #343536",
	background: "#1E1E1E",
}

/** `ModalFooter` whose buttons sit in an inner wrapper (Create's copy). */
export const ticketModalFooter = phone(footerStyles)

/** `ModalFooter` holding the two buttons directly (`TicketEditorModal`): Cancel left, save right. */
export const ticketModalFooterButtons = phone({ ...footerStyles, flexDirection: "row-reverse" })

/** The inner wrapper around the two buttons, where a copy has one. */
export const ticketFooterRow = phone({ flexDirection: "row-reverse", gap: "12px" })

/** The save button: right-hand side, the wider of the two. */
export const ticketPrimaryButton = phone({ flex: "2 1 0", width: "auto", height: "48px", marginRight: 0 })

/** Cancel: left-hand side, outlined so it reads as a button rather than loose text. */
export const ticketCancelButton = phone({ flex: "1 1 0", width: "auto", height: "48px", border: "1px solid #444", borderRadius: "6px" })

/** Text / number inputs: a 48px target. Font size is already 16px, so iOS doesn't zoom. */
export const ticketField = phone({ height: "48px" })

/** Require Approval: one clear card with the switch, instead of a loose row. */
export const ticketApprovalRow = phone({
	background: "#15181C",
	border: "1px solid #343536",
	borderRadius: "10px",
	padding: "12px",
})
