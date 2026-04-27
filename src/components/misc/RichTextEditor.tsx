import { useRef, useCallback, useEffect, useState, useLayoutEffect } from "react"
import { uploadFile } from "@/services/upload.service"

// ─── Custom Image blot — preserves width through Delta round-trips ────────────
function registerResizableImage(Quill: any) {
  const ImageBlot = Quill.import("formats/image")

  class ResizableImage extends ImageBlot {
    static formats(domNode: HTMLElement) {
      const f: Record<string, string> = {}
      const src = domNode.getAttribute("src")
      if (src) f.src = src
      const alt = domNode.getAttribute("alt")
      if (alt) f.alt = alt
      const w = domNode.getAttribute("width") || domNode.style.width
      if (w) f.width = w
      return f
    }
    format(name: string, value: any) {
      if (name === "width") {
        if (value) {
          this.domNode.setAttribute("width", value)
          this.domNode.style.width = value
        } else {
          this.domNode.removeAttribute("width")
          this.domNode.style.removeProperty("width")
        }
      } else {
        super.format(name, value)
      }
    }
  }
  ResizableImage.blotName = "image"
  ResizableImage.tagName  = "IMG"
  Quill.register(ResizableImage, true)
}

// Walk the Delta to find which Quill index corresponds to a given <img> node.
// Avoids editor.scroll.find() which was removed in Quill v2.
function findImageDeltaIndex(editor: any, targetImg: HTMLImageElement): number {
  const allImgs = Array.from(editor.root.querySelectorAll("img")) as HTMLImageElement[]
  const imgPos  = allImgs.indexOf(targetImg)
  if (imgPos < 0) return -1

  let index    = 0
  let imgCount = 0
  for (const op of (editor.getContents().ops as any[])) {
    const isImg = op.insert && typeof op.insert === "object" && op.insert.image !== undefined
    if (isImg) {
      if (imgCount === imgPos) return index
      imgCount++
      index += 1
    } else if (typeof op.insert === "string") {
      index += op.insert.length
    } else {
      index += 1
    }
  }
  return -1
}

// ─── Inline resize overlay ────────────────────────────────────────────────────
type HandlePos = "nw" | "ne" | "se" | "sw" | "e" | "w"
const CURSORS: Record<HandlePos, string> = {
  nw: "nw-resize", ne: "ne-resize", se: "se-resize",
  sw: "sw-resize", e: "e-resize",  w: "w-resize",
}
interface ORect { top: number; left: number; width: number; height: number }

interface OverlayProps {
  img: HTMLImageElement
  wrapperRef: React.RefObject<HTMLDivElement>
  quillRef: React.RefObject<any>
  onChange: (html: string) => void
  onDeselect: () => void
}

function ImageResizeOverlay({ img, wrapperRef, quillRef, onChange, onDeselect }: OverlayProps) {
  const [rect, setRect] = useState<ORect>({ top: 0, left: 0, width: 0, height: 0 })

  const measure = useCallback(() => {
    if (!wrapperRef.current) return
    const wr = wrapperRef.current.getBoundingClientRect()
    const ir = img.getBoundingClientRect()
    setRect({ top: ir.top - wr.top, left: ir.left - wr.left, width: ir.width, height: ir.height })
  }, [img, wrapperRef])

  useLayoutEffect(() => { measure() }, [measure])

  useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  // Click outside → deselect
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t !== img && !t.closest?.(".rte-img-overlay")) onDeselect()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [img, onDeselect])

  const startDrag = useCallback((e: React.MouseEvent, handle: HandlePos) => {
    e.preventDefault()
    e.stopPropagation()

    const startX  = e.clientX
    const startW  = img.offsetWidth          // actual rendered px width at drag start
    const isRight = handle === "e" || handle === "ne" || handle === "se"
    const isLeft  = handle === "w" || handle === "nw" || handle === "sw"

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      let nw = isRight ? startW + dx : isLeft ? startW - dx : startW
      nw = Math.max(40, Math.round(nw))
      // Set directly for live visual; Quill MutationObserver may fire but we
      // commit authoritatively via the Quill API on mouseup
      img.style.width = `${nw}px`
      img.setAttribute("width", String(nw))
      measure()
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)

      const finalW = `${img.offsetWidth}px`
      const editor = quillRef.current?.getEditor()
      if (editor) {
        const index = findImageDeltaIndex(editor, img)
        if (index >= 0) {
          editor.formatText(index, 1, "width", finalW, "user")
        } else {
          onChange(editor.root.innerHTML)
        }
      }
      measure()
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [img, measure, quillRef, onChange])

  const H = 10
  const handles: { pos: HandlePos; style: React.CSSProperties }[] = [
    { pos: "nw", style: { top: -H/2, left: -H/2 } },
    { pos: "ne", style: { top: -H/2, right: -H/2 } },
    { pos: "se", style: { bottom: -H/2, right: -H/2 } },
    { pos: "sw", style: { bottom: -H/2, left: -H/2 } },
    { pos: "e",  style: { top: "50%", right: -H/2, transform: "translateY(-50%)" } },
    { pos: "w",  style: { top: "50%", left: -H/2,  transform: "translateY(-50%)" } },
  ]

  return (
    <div className="rte-img-overlay" style={{
      position: "absolute",
      top: rect.top, left: rect.left,
      width: rect.width, height: rect.height,
      outline: "2px solid #F79432",
      pointerEvents: "none",
      zIndex: 50,
      boxSizing: "border-box",
    }}>
      {handles.map(({ pos, style }) => (
        <div key={pos} onMouseDown={(e) => startDrag(e, pos)} style={{
          position: "absolute", width: H, height: H,
          background: "#F79432", border: "1px solid #000",
          borderRadius: 2, cursor: CURSORS[pos],
          pointerEvents: "all", zIndex: 51, ...style,
        }} />
      ))}
      <div style={{
        position: "absolute", bottom: -24, left: "50%",
        transform: "translateX(-50%)",
        background: "#F79432", color: "#000",
        fontSize: 11, fontWeight: 700,
        padding: "2px 7px", borderRadius: 4,
        whiteSpace: "nowrap", pointerEvents: "none",
      }}>
        {Math.round(rect.width)}px
      </div>
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────
const formats = [
  "header", "bold", "italic", "underline", "strike",
  "list", "bullet", "blockquote", "link", "image", "width",
]

const modules = {
  toolbar: {
    container: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["blockquote", "link", "image"],
      ["clean"],
    ],
  },
  clipboard: { matchVisual: false },
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const [QuillComp, setQuillComp]   = useState<any>(null)
  const quillRef                     = useRef<any>(null)
  const wrapperRef                   = useRef<HTMLDivElement>(null)
  const fileInputRef                 = useRef<HTMLInputElement>(null)
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null)

  // Client-only load: register custom blot first, then expose component
  useEffect(() => {
    import("react-quill").then((mod) => {
      const Quill = (mod.default as any).Quill
      registerResizableImage(Quill)
      setQuillComp(() => mod.default)
    })
  }, [])

  // Setup clipboard IMG matcher + image click selection
  useEffect(() => {
    if (!QuillComp) return
    const trySetup = () => {
      const editor = quillRef.current?.getEditor()
      if (!editor) { setTimeout(trySetup, 200); return }

      // Emoji <img> (twemoji / CDN) → Unicode text on paste
      editor.clipboard.addMatcher("IMG", (node: HTMLImageElement, delta: any) => {
        const alt = node.getAttribute("alt") || ""
        const src = node.getAttribute("src") || ""
        const isEmoji =
          src.includes("twemoji") || src.includes("emoji") ||
          (alt.length > 0 && alt.length <= 4)
        if (isEmoji && alt) {
          const Quill = (QuillComp as any).Quill
          if (Quill) return new (Quill.import("delta"))().insert(alt)
        }
        return delta
      })

      editor.root.addEventListener("click", (e: MouseEvent) => {
        const t = e.target as HTMLElement
        setSelectedImg(t.tagName === "IMG" ? (t as HTMLImageElement) : null)
      })

      const handleClipboard = () => {
        const y = window.scrollY
        setTimeout(() => requestAnimationFrame(() => window.scrollTo(0, y)), 50)
      }
      editor.root.addEventListener("copy", handleClipboard)
      editor.root.addEventListener("paste", handleClipboard)
      editor.root.addEventListener("cut", handleClipboard)
    }
    trySetup()
  }, [QuillComp])

  // Wire image toolbar button to file input
  useEffect(() => {
    if (!QuillComp) return
    const trySetup = () => {
      const editor = quillRef.current?.getEditor()
      if (!editor) { setTimeout(trySetup, 200); return }
      editor.getModule("toolbar").addHandler("image", () => fileInputRef.current?.click())
    }
    trySetup()
  }, [QuillComp])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { url } = await uploadFile(file, { folder: "events" })
      const editor = quillRef.current?.getEditor()
      if (editor) {
        const range = editor.getSelection(true)
        editor.insertEmbed(range.index, "image", url)
        editor.setSelection(range.index + 1)
      }
    } catch { /* silent */ }
    e.target.value = ""
  }, [])

  if (!QuillComp) {
    return (
      <div style={{
        background: "#141619", border: "1px solid #3a3d42", borderRadius: "8px",
        minHeight: "400px", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#6b7280", fontSize: "14px",
      }}>
        Loading editor…
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="rich-text-editor-wrapper" style={{ position: "relative" }}>
      <input ref={fileInputRef} type="file" accept="image/*"
        style={{ display: "none" }} onChange={handleFileChange} />

      <QuillComp
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || "Add Description"}
      />

      {selectedImg && wrapperRef.current && (
        <ImageResizeOverlay
          img={selectedImg}
          wrapperRef={wrapperRef}
          quillRef={quillRef}
          onChange={onChange}
          onDeselect={() => setSelectedImg(null)}
        />
      )}

      <style>{`
        .rich-text-editor-wrapper .ql-toolbar {
          background: #1e2124;
          border: 1px solid #3a3d42 !important;
          border-bottom: none !important;
          border-radius: 8px 8px 0 0;
        }
        .rich-text-editor-wrapper .ql-toolbar .ql-stroke { stroke: #a0aec0; }
        .rich-text-editor-wrapper .ql-toolbar .ql-fill  { fill:   #a0aec0; }
        .rich-text-editor-wrapper .ql-toolbar .ql-picker { color: #a0aec0; }
        .rich-text-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .rich-text-editor-wrapper .ql-toolbar .ql-active .ql-stroke { stroke: #ffffff; }
        .rich-text-editor-wrapper .ql-toolbar button:hover .ql-fill,
        .rich-text-editor-wrapper .ql-toolbar .ql-active .ql-fill  { fill:   #ffffff; }
        .rich-text-editor-wrapper .ql-toolbar .ql-picker-label:hover,
        .rich-text-editor-wrapper .ql-toolbar .ql-picker-item:hover { color: #ffffff; }
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
          color: #6b7280; font-style: normal;
        }
        .rich-text-editor-wrapper .ql-editor h1,
        .rich-text-editor-wrapper .ql-editor h2,
        .rich-text-editor-wrapper .ql-editor h3 { color: #ffffff; }
        .rich-text-editor-wrapper .ql-editor a { color: #F79432; }
        .rich-text-editor-wrapper .ql-editor blockquote {
          border-left: 3px solid #F79432; color: #9ca3af;
        }
        .rich-text-editor-wrapper .ql-editor ol,
        .rich-text-editor-wrapper .ql-editor ul { padding-left: 1.5em; }
        .rich-text-editor-wrapper .ql-editor img {
          display: inline-block;
          max-width: 100%;
          border-radius: 6px;
          margin: 2px 4px;
          vertical-align: middle;
          cursor: pointer;
        }
        .rich-text-editor-wrapper .ql-picker-options {
          background: #1e2124 !important; border: 1px solid #3a3d42 !important;
        }
        .rich-text-editor-wrapper .ql-picker-item { color: #a0aec0 !important; }
      `}</style>
    </div>
  )
}
