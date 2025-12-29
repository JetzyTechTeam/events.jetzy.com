import { useState } from "react"
import SafeHTML from "./SafeHTML"

type ExpandTextProps = {
	content: string // The full content to display
	maxChars?: number // Maximum characters to show before "See More"
}

// Helper function to strip HTML tags and get plain text
const stripHtml = (html: string): string => {
	if (typeof window === "undefined") {
		// Server-side: use regex to strip tags (simpler but less accurate)
		return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
	}
	const tmp = document.createElement("DIV")
	tmp.innerHTML = html
	return tmp.textContent || tmp.innerText || ""
}

// Helper function to truncate HTML content
const truncateHtml = (html: string, maxChars: number): string => {
	const text = stripHtml(html)
	if (text.length <= maxChars) return html
	
	// Find a good place to cut (prefer word boundaries)
	let cutPoint = maxChars
	for (let i = maxChars; i > maxChars - 20 && i > 0; i--) {
		if (text[i] === " " || text[i] === "\n") {
			cutPoint = i
			break
		}
	}
	
	// Simple truncation - for more sophisticated HTML truncation, you'd need a library
	// This is a basic approach that preserves the HTML structure
	const truncatedText = text.substring(0, cutPoint)
	
	// If content is HTML, try to preserve some structure
	if (html.includes("<")) {
		// Create a temp element to parse and truncate
		const tmp = document.createElement("DIV")
		tmp.innerHTML = html
		const textContent = tmp.textContent || ""
		if (textContent.length > maxChars) {
			// For HTML content, we'll show a plain text preview
			return truncatedText + "..."
		}
	}
	
	return truncatedText + "..."
}

export default function ExpandText({ content, maxChars = 100 }: ExpandTextProps) {
	const [isExpanded, setIsExpanded] = useState(false)

	if (!content) return null

	const textOnly = stripHtml(content)
	const shouldTruncate = textOnly.length > maxChars

	if (!shouldTruncate) {
		// If content is short enough, just render it
		return (
			<div className="mt-4 md:text-left xs:text-center">
				{content.includes("<") ? (
					<SafeHTML html={content} />
				) : (
					<p>{content}</p>
				)}
			</div>
		)
	}

	const toggleExpand = () => setIsExpanded(!isExpanded)

	return (
		<div className="mt-4 md:text-left xs:text-center">
			{isExpanded ? (
				content.includes("<") ? (
					<SafeHTML html={content} />
				) : (
					<p>{content}</p>
				)
			) : (
				<p>{stripHtml(content).substring(0, maxChars)}...</p>
			)}
			<button onClick={toggleExpand} className="mt-2 text-blue-500 font-bold text-xs hover:underline focus:outline-none">
				{isExpanded ? "Close" : "Read more"}
			</button>
		</div>
	)
}
