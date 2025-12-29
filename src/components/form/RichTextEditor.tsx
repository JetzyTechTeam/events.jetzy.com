import React, { useMemo } from "react"
import dynamic from "next/dynamic"
import { Box, BoxProps } from "@chakra-ui/react"

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false })

interface RichTextEditorProps extends Omit<BoxProps, "onChange"> {
	value: string
	onChange: (value: string) => void
	placeholder?: string
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
	value,
	onChange,
	placeholder = "Enter description...",
	...boxProps
}) => {
	const modules = useMemo(
		() => ({
			toolbar: [
				[{ header: [1, 2, 3, false] }],
				["bold", "italic", "underline", "strike"],
				[{ list: "ordered" }, { list: "bullet" }],
				[{ indent: "-1" }, { indent: "+1" }],
				["link"],
				[{ color: [] }, { background: [] }],
				["clean"],
			],
		}),
		[]
	)

	const formats = [
		"header",
		"bold",
		"italic",
		"underline",
		"strike",
		"list",
		"bullet",
		"indent",
		"link",
		"color",
		"background",
	]

	return (
		<Box
			{...boxProps}
			sx={{
				"& .quill": {
					bg: "#FFFFFF",
				},
				"& .ql-container": {
					fontSize: "16px",
					fontFamily: "inherit",
					borderBottomLeftRadius: "8px",
					borderBottomRightRadius: "8px",
					borderColor: "#E5E7EB",
					minHeight: "150px",
				},
				"& .ql-toolbar": {
					borderTopLeftRadius: "8px",
					borderTopRightRadius: "8px",
					borderColor: "#E5E7EB",
					bg: "#F9FAFB",
					borderBottom: "1px solid #E5E7EB",
				},
				"& .ql-editor": {
					minHeight: "150px",
					color: "#1F2937",
					"&.ql-blank::before": {
						color: "#9CA3AF",
						fontStyle: "normal",
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
				"& .ql-toolbar .ql-formats": {
					marginRight: "12px",
				},
				"&:hover .ql-container": {
					borderColor: "#D1D5DB",
				},
				"& .ql-container.ql-snow": {
					border: "1px solid #E5E7EB",
					borderTop: "none",
				},
				"& .ql-toolbar.ql-snow": {
					border: "1px solid #E5E7EB",
					borderBottom: "none",
				},
				"& .ql-snow .ql-picker:not(.ql-color-picker):not(.ql-icon-picker) svg": {
					right: "8px",
				},
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

export default RichTextEditor
