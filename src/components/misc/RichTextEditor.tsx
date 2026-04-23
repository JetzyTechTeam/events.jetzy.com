import dynamic from "next/dynamic"
import "react-quill/dist/quill.snow.css"

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false })

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "link"],
    ["clean"],
  ],
}

const formats = [
  "header",
  "bold", "italic", "underline", "strike",
  "list", "bullet",
  "blockquote", "link",
]

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  return (
    <div className="rich-text-editor-wrapper">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || "Add Description"}
      />
      <style>{`
        .rich-text-editor-wrapper .ql-toolbar {
          background: #1e2124;
          border: 1px solid #3a3d42 !important;
          border-bottom: none !important;
          border-radius: 8px 8px 0 0;
        }
        .rich-text-editor-wrapper .ql-toolbar .ql-stroke {
          stroke: #a0aec0;
        }
        .rich-text-editor-wrapper .ql-toolbar .ql-fill {
          fill: #a0aec0;
        }
        .rich-text-editor-wrapper .ql-toolbar .ql-picker {
          color: #a0aec0;
        }
        .rich-text-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .rich-text-editor-wrapper .ql-toolbar .ql-active .ql-stroke {
          stroke: #ffffff;
        }
        .rich-text-editor-wrapper .ql-toolbar button:hover .ql-fill,
        .rich-text-editor-wrapper .ql-toolbar .ql-active .ql-fill {
          fill: #ffffff;
        }
        .rich-text-editor-wrapper .ql-toolbar .ql-picker-label:hover,
        .rich-text-editor-wrapper .ql-toolbar .ql-picker-item:hover {
          color: #ffffff;
        }
        .rich-text-editor-wrapper .ql-container {
          background: #141619;
          border: 1px solid #3a3d42 !important;
          border-radius: 0 0 8px 8px;
          min-height: 400px;
          font-size: 15px;
        }
        .rich-text-editor-wrapper .ql-editor {
          color: #ffffff;
          min-height: 400px;
          line-height: 1.7;
          padding: 16px 20px;
        }
        .rich-text-editor-wrapper .ql-editor.ql-blank::before {
          color: #6b7280;
          font-style: normal;
        }
        .rich-text-editor-wrapper .ql-editor h1,
        .rich-text-editor-wrapper .ql-editor h2,
        .rich-text-editor-wrapper .ql-editor h3 {
          color: #ffffff;
        }
        .rich-text-editor-wrapper .ql-editor a {
          color: #F79432;
        }
        .rich-text-editor-wrapper .ql-editor blockquote {
          border-left: 3px solid #F79432;
          color: #9ca3af;
        }
        .rich-text-editor-wrapper .ql-editor ol,
        .rich-text-editor-wrapper .ql-editor ul {
          padding-left: 1.5em;
        }
        .rich-text-editor-wrapper .ql-picker-options {
          background: #1e2124 !important;
          border: 1px solid #3a3d42 !important;
        }
        .rich-text-editor-wrapper .ql-picker-item {
          color: #a0aec0 !important;
        }
      `}</style>
    </div>
  )
}
