import { useState } from "react"

type ExpandTextProps = {
	content: string // The full content to display
	maxChars?: number // Maximum characters to show before "See More"
}

export default function ExpandText({ content, maxChars = 100 }: ExpandTextProps) {
	const [isExpanded, setIsExpanded] = useState(false)

	const toggleExpand = () => setIsExpanded(!isExpanded)

	return (
		<div className="mt-4 md:text-left xs:text-center">
			<p>{isExpanded ? content : `${content.slice(0, maxChars)}...`}</p>
			<button onClick={toggleExpand} className="mt-2 text-blue-500 font-bold text-xs hover:underline focus:outline-none">
				{isExpanded ? "Close" : "Read more"}
			</button>
		</div>
	)
}
