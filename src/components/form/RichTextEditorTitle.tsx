import React, { useMemo } from "react"
import dynamic from "next/dynamic"
import { Box, BoxProps } from "@chakra-ui/react"

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false })

interface RichTextEditorTitleProps extends Omit<BoxProps, "onChange"> {
	value: string
	onChange: (value: string) => void
	placeholder?: string
}

const RichTextEditorTitle: React.FC<RichTextEditorTitleProps> = ({
	value,
	onChange,
	placeholder = "Enter event name...",
	...boxProps
}) => {
	// Simplified toolbar for titles - includes links like description
	const modules = useMemo(
		() => ({
			toolbar: [
				["bold", "italic"],
				[{ size: ["small", false, "large", "huge"] }],
				["link"],
				["clean"],
			],
		}),
		[]
	)

	const formats = ["bold", "italic", "size", "link"]

	const { borderBottom, ...restBoxProps } = boxProps
	const borderBottomStyle = typeof borderBottom === "string" ? borderBottom : "2px solid #E5E7EB"

	return (
		<Box
			{...restBoxProps}
			sx={{
				"& .quill": {
					bg: "transparent",
				},
				"& .ql-container": {
					fontSize: "inherit",
					fontFamily: "inherit",
					border: "none",
					borderBottom: borderBottomStyle,
					borderRadius: 0,
					padding: 0,
				},
				"& .ql-toolbar": {
					border: "none",
					borderBottom: "1px solid #E5E7EB",
					bg: "#F9FAFB",
					padding: "4px 0",
					marginBottom: "8px",
				},
				"& .ql-editor": {
					minHeight: "auto",
					padding: 0,
					color: "#1F2937",
					fontSize: "inherit",
					fontWeight: "inherit",
					"&.ql-blank::before": {
						color: "#9CA3AF",
						fontStyle: "normal",
						fontWeight: "normal",
					},
				},
				"& .ql-stroke": {
					stroke: "#6B7280",
				},
				"& .ql-fill": {
					fill: "#6B7280",
				},
				"& .ql-picker-label": {
					color: "#6B7280",
				},
				"&:hover .ql-container": {
					borderBottomColor: "#D1D5DB",
				},
				"& .ql-container.ql-snow": {
					border: "none",
					borderBottom: borderBottomStyle,
				},
				"& .ql-toolbar.ql-snow": {
					border: "none",
					borderBottom: "1px solid #E5E7EB",
				},
				...restBoxProps.sx,
			}}
		>
			<ReactQuill
				theme="snow"
				value={value || ""}
				onChange={onChange}
				modules={modules}
				formats={formats}
				placeholder={placeholder}
			/>
		</Box>
	)
}

export default RichTextEditorTitle

