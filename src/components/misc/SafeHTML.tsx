import React, { useEffect, useState } from "react"
import { Box, BoxProps } from "@chakra-ui/react"

interface SafeHTMLProps extends Omit<BoxProps, "dangerouslySetInnerHTML"> {
	html: string
	as?: keyof JSX.IntrinsicElements
}

const SafeHTML: React.FC<SafeHTMLProps> = ({ html, as = "div", ...boxProps }) => {
	const [sanitizedHTML, setSanitizedHTML] = useState<string>(html)

	useEffect(() => {
		if (typeof window !== "undefined" && html) {
			// Dynamically import DOMPurify only on client side
			import("dompurify")
				.then((DOMPurify) => {
					const clean = DOMPurify.default.sanitize(html, {
						ALLOWED_TAGS: [
							"p",
							"br",
							"strong",
							"em",
							"u",
							"s",
							"h1",
							"h2",
							"h3",
							"ul",
							"ol",
							"li",
							"a",
							"span",
							"div",
							"blockquote",
						],
						ALLOWED_ATTR: ["href", "target", "rel", "style", "class"],
						ALLOW_DATA_ATTR: false,
					})
					setSanitizedHTML(clean)
				})
				.catch(() => {
					// Fallback: basic script tag removal
					setSanitizedHTML(html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ""))
				})
		}
	}, [html])

	if (!html) return null

	// Basic sanitization for SSR (remove scripts)
	const ssrSafeHTML = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
	const contentToRender = typeof window !== "undefined" ? sanitizedHTML : ssrSafeHTML

	return (
		<Box
			as={as === "span" ? "span" : undefined}
			{...boxProps}
			sx={{
				wordWrap: "break-word",
				overflowWrap: "anywhere",
				"& p": {
					marginBottom: "0.75rem",
					lineHeight: "1.6",
				},
				"& p:last-child": {
					marginBottom: 0,
				},
				"& h1, & h2, & h3": {
					fontWeight: "bold",
					marginTop: "1rem",
					marginBottom: "0.5rem",
				},
				"& h1": { fontSize: "1.5rem" },
				"& h2": { fontSize: "1.25rem" },
				"& h3": { fontSize: "1.125rem" },
				"& ul, & ol": {
					marginLeft: "1.5rem",
					marginBottom: "0.75rem",
				},
				"& li": {
					marginBottom: "0.25rem",
				},
				"& a": {
					color: "#2563eb",
					textDecoration: "underline",
				},
				"& a:hover": {
					color: "#1d4ed8",
				},
				"& strong": {
					fontWeight: "bold",
				},
				"& em": {
					fontStyle: "italic",
				},
				"& blockquote": {
					borderLeft: "4px solid #e5e7eb",
					paddingLeft: "1rem",
					marginLeft: 0,
					fontStyle: "italic",
					color: "#6b7280",
				},
				...boxProps.sx,
			}}
			dangerouslySetInnerHTML={{ __html: contentToRender }}
		/>
	)
}

export default SafeHTML
