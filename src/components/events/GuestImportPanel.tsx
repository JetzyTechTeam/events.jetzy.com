import { useRef, useState } from "react"
import axios from "axios"
import { Badge, Box, Button, Checkbox, Collapse, Flex, Text } from "@chakra-ui/react"
import {
	GUEST_IMPORT_TEMPLATE_CSV,
	guestEmailKey,
	parseGuestRows,
	type GuestImportProblem,
	type ImportedGuest,
} from "@/lib/guest-import"

/**
 * "Import from Excel / CSV" for the email invite. Shared by Manage Event's Invite Guests dialog
 * and the Invite dialog on the event page, so both read a file the same way.
 *
 * The file is parsed in the host's browser — only the resulting names and addresses are posted.
 * SheetJS is imported on file pick, never up front, so it stays out of the event page's bundle.
 *
 * Guests already invited to this event are listed but UNTICKED: re-sending is the host's call.
 */

type PreviewRow = ImportedGuest & { alreadyInvited: boolean; checked: boolean }

const MAX_FILE_BYTES = 5 * 1024 * 1024

export default function GuestImportPanel({
	eventId,
	onAdd,
}: {
	/**
	 * The event being invited to — used to flag (and untick) people already invited. Optional: the
	 * admin Email Attendees page imports a list that belongs to no single event, and skips the check.
	 */
	eventId?: string
	onAdd: (guests: ImportedGuest[]) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [reading, setReading] = useState(false)
	const [error, setError] = useState("")
	const [fileName, setFileName] = useState("")
	// Which sheet was read, when the workbook has more than one — only one is imported.
	const [sheetNote, setSheetNote] = useState("")
	const [rows, setRows] = useState<PreviewRow[] | null>(null)
	const [problems, setProblems] = useState<GuestImportProblem[]>([])
	const [showProblems, setShowProblems] = useState(false)

	const reset = () => {
		setRows(null)
		setProblems([])
		setShowProblems(false)
		setFileName("")
		setError("")
		setSheetNote("")
	}

	const downloadTemplate = () => {
		const url = URL.createObjectURL(new Blob([GUEST_IMPORT_TEMPLATE_CSV], { type: "text/csv" }))
		const a = document.createElement("a")
		a.href = url
		a.download = "guest-list-template.csv"
		a.click()
		URL.revokeObjectURL(url)
	}

	/** Addresses already invited to this event. A failed lookup flags nobody rather than blocking the import. */
	const loadInvited = async (): Promise<Set<string>> => {
		if (!eventId) return new Set()
		try {
			const res = await axios.get("/api/guests-list", { params: { eventId } })
			const list: any[] = Array.isArray(res.data) ? res.data : []
			return new Set(list.map((i) => guestEmailKey(String(i?.email || ""))).filter(Boolean))
		} catch {
			return new Set()
		}
	}

	const handleFile = async (file: File) => {
		reset()
		// Each failure gets its OWN sentence (QA, 2026-11-23): an empty file, a .txt and a broken
		// workbook all used to say "couldn't find an email column", which sent people hunting for a
		// column that was never the problem.
		const ext = (file.name.split(".").pop() || "").toLowerCase()
		if (!["xlsx", "xls", "csv"].includes(ext)) {
			setError(`${ext ? `A .${ext} file` : "That file"} can't be imported. Use an Excel file (.xlsx or .xls) or a .csv file.`)
			return
		}
		if (file.size === 0) {
			setError("That file is empty.")
			return
		}
		if (file.size > MAX_FILE_BYTES) {
			setError("That file is over 5MB. A guest list should be far smaller — check it's the right file.")
			return
		}
		setReading(true)
		setFileName(file.name)
		try {
			const bytes = new Uint8Array(await file.arrayBuffer())
			// A real .xlsx is a zip ("PK"). SheetJS will happily read anything else as text and find no
			// email column, so a renamed or damaged file is called what it is. (.xls is NOT checked:
			// systems export HTML/XML tables named .xls, and SheetJS reads those fine.)
			const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
			if (ext === "xlsx" && !isZip) {
				setError("That Excel file looks damaged, or isn't really an Excel file. Open it in Excel, save it again as .xlsx, and retry.")
				return
			}
			const [XLSX, invited] = await Promise.all([import("xlsx"), loadInvited()])
			const workbook = XLSX.read(bytes, { type: "array" })
			const toRows = (name: string) =>
				XLSX.utils
					.sheet_to_json<any[]>(workbook.Sheets[name], { header: 1, raw: false, defval: "" })
					.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []))
			const hasData = (rows: string[][]) => rows.some((r) => r.some((c) => c.trim()))
			// The first sheet that holds anything — a workbook whose first tab is a cover page still imports.
			const sheetName = workbook.SheetNames.find((n) => hasData(toRows(n)))
			if (!sheetName) {
				setError(workbook.SheetNames.length ? "That file has no data in it." : "That file has no sheets in it.")
				return
			}
			if (workbook.SheetNames.length > 1) {
				setSheetNote(`Read the sheet "${sheetName}". This file has ${workbook.SheetNames.length} sheets — only one is imported.`)
			}
			const result = parseGuestRows(toRows(sheetName))
			if (!result.ok) {
				setError(result.error)
				return
			}
			setRows(
				result.guests.map((g) => {
					const alreadyInvited = invited.has(guestEmailKey(g.email))
					return { ...g, alreadyInvited, checked: !alreadyInvited }
				}),
			)
			setProblems(result.problems)
		} catch {
			setError("We couldn't read that file — it may be damaged. Save it again as .xlsx or .csv and try again.")
		} finally {
			setReading(false)
		}
	}

	const toggle = (email: string) =>
		setRows((prev) => prev?.map((r) => (r.email === email ? { ...r, checked: !r.checked } : r)) ?? null)

	const setAll = (checked: boolean) => setRows((prev) => prev?.map((r) => ({ ...r, checked })) ?? null)

	const ticked = rows?.filter((r) => r.checked) ?? []
	const alreadyCount = rows?.filter((r) => r.alreadyInvited).length ?? 0

	return (
		<Box border="1px dashed #555" rounded="lg" p={3}>
			<input
				ref={inputRef}
				type="file"
				accept=".xlsx,.xls,.csv"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0]
					e.target.value = ""
					if (file) handleFile(file)
				}}
			/>

			{!rows && (
				<Flex align={{ base: "stretch", md: "center" }} justify="space-between" gap={2} direction={{ base: "column", md: "row" }}>
					<Box>
						<Text fontSize="sm" fontWeight="semibold">Have a guest list?</Text>
						<Text fontSize="xs" color="gray.400">
							Import an Excel or CSV file with a <strong>Name</strong> and an <strong>Email</strong> column
							(First Name + Last Name columns work too).
						</Text>
					</Box>
					<Flex gap={2} flexShrink={0}>
						<Button type="button" size="sm" variant="ghost" color="gray.300" _hover={{ bg: "#333" }} onClick={downloadTemplate}>
							Download template
						</Button>
						<Button
							type="button"
							size="sm"
							bg="#383838"
							color="white"
							_hover={{ bg: "#444" }}
							isLoading={reading}
							loadingText="Reading"
							onClick={() => inputRef.current?.click()}
						>
							Import from Excel / CSV
						</Button>
					</Flex>
				</Flex>
			)}

			{error && (
				<Text color="red.400" fontSize="sm" mt={2}>
					{error}
				</Text>
			)}

			{rows && (
				<Box>
					<Flex justify="space-between" align="center" gap={2} wrap="wrap" mb={2}>
						<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
							{fileName}
						</Text>
						<Text fontSize="xs" color="gray.400">
							{rows.length} found
							{alreadyCount > 0 && ` · ${alreadyCount} already invited`}
							{problems.length > 0 && ` · ${problems.length} skipped`}
						</Text>
					</Flex>
					{sheetNote && (
						<Text fontSize="xs" color="gray.400" mb={2}>
							{sheetNote}
						</Text>
					)}

					{alreadyCount > 0 && (
						<Text fontSize="xs" color="orange.300" mb={2}>
							People already invited to this event are unticked. Tick them to send the invitation again.
						</Text>
					)}

					{rows.length > 0 && (
						<>
							<Flex gap={3} mb={1}>
								<Button type="button" size="xs" variant="link" color="gray.300" onClick={() => setAll(true)}>Select all</Button>
								<Button type="button" size="xs" variant="link" color="gray.300" onClick={() => setAll(false)}>Select none</Button>
							</Flex>
							<Box maxH="240px" overflowY="auto" bg="#151515" rounded="md" border="1px solid #333">
								{rows.map((r) => (
									<Flex
										key={r.email}
										onClick={() => toggle(r.email)}
										align="center"
										gap={3}
										px={3}
										py={2}
										borderBottom="1px solid #2a2a2a"
										cursor="pointer"
										_hover={{ bg: "#1f1f1f" }}
									>
										{/* The whole row is the mouse target, so the box ignores the pointer (a Chakra Checkbox is its own
										    label — taking the click too would toggle twice). Its onChange still serves the keyboard. */}
										<Checkbox isChecked={r.checked} onChange={() => toggle(r.email)} pointerEvents="none" colorScheme="orange" aria-label={`Invite ${r.email}`} />

										<Box flex="1" minW={0}>
											<Text fontSize="sm" noOfLines={1}>{r.name || <Text as="span" color="gray.500">No name</Text>}</Text>
											<Text fontSize="xs" color="gray.400" noOfLines={1}>{r.email}</Text>
										</Box>
										{r.alreadyInvited && (
											<Badge colorScheme="orange" variant="subtle" fontSize="2xs" flexShrink={0}>Already invited</Badge>
										)}
									</Flex>
								))}
							</Box>
						</>
					)}

					{problems.length > 0 && (
						<Box mt={2}>
							<Button type="button" size="xs" variant="link" color="red.300" onClick={() => setShowProblems((v) => !v)}>
								{showProblems ? "Hide" : "Show"} {problems.length} row{problems.length === 1 ? "" : "s"} we couldn&apos;t use
							</Button>
							<Collapse in={showProblems} animateOpacity>
								<Box maxH="160px" overflowY="auto" mt={1} fontSize="xs" color="gray.400">
									{problems.map((p) => (
										<Text key={`${p.row}-${p.value}`}>
											Row {p.row}{p.value ? ` (${p.value})` : ""}: {p.reason}
										</Text>
									))}
								</Box>
							</Collapse>
						</Box>
					)}

					<Flex justify="flex-end" gap={2} mt={3}>
						<Button type="button" size="sm" variant="ghost" color="gray.300" _hover={{ bg: "#333" }} onClick={reset}>
							Cancel
						</Button>
						<Button
							type="button"
							size="sm"
							bg="#F79432"
							color="black"
							_hover={{ bg: "#f78c22" }}
							isDisabled={ticked.length === 0}
							onClick={() => {
								onAdd(ticked.map(({ name, email }) => ({ name, email })))
								reset()
							}}
						>
							Add {ticked.length} guest{ticked.length === 1 ? "" : "s"}
						</Button>
					</Flex>
				</Box>
			)}
		</Box>
	)
}
