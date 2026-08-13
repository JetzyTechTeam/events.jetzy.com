import React from "react"
import Linkify from "linkify-react"

/**
 * A guest's answer to a custom question, with any URL in it made clickable.
 *
 * Hosts ask for LinkedIn profiles, portfolios and social links constantly, and the answer
 * arrived as plain text — so the host had to select the URL and paste it into a new tab, for
 * every guest. The same answer is shown in three places (Responses table, guest detail modal,
 * Approvals table), which is why this is a component rather than three copies of the option
 * object: they would otherwise drift into linkifying differently, or one being missed.
 *
 * Takes the ALREADY-FORMATTED string. Object-shaped answers (company/jobTitle, terms
 * signatures, social profiles) are flattened by each surface's `formatAnswer` before they get
 * here, so a URL buried in one of those is linkified too.
 */

const linkifyOptions = {
	target: "_blank",
	// Without `noopener` the opened tab can reach back through `window.opener`. These URLs are
	// supplied by guests, so they are exactly the input that shouldn't be trusted with that.
	rel: "noopener noreferrer",
	// `break-all` rather than `break-words`: a LinkedIn profile URL is one long unbroken token
	// and would otherwise force the table column wider than its max.
	className: "text-[#F79432] underline break-all",
}

export default function AnswerText({ value }: { value?: string | null }) {
	// The em dash is the "no answer" placeholder every caller uses — nothing to linkify.
	if (!value || value === "—") return <>{value || "—"}</>
	return <Linkify options={linkifyOptions}>{value}</Linkify>
}
