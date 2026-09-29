import React from "react"
import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	Box,
	Flex,
	Button,
	Text,
	useDisclosure,
} from "@chakra-ui/react"

/**
 * Time picker rendered as a dialog: three snap columns (hour / minute / AM-PM) plus quick picks.
 *
 * Replaces a flatpickr `noCalendar` dropdown. Two things about that setup drove the rewrite:
 * the instance was rebuilt on every parent render (every call site passes an inline arrow to
 * `onChange`, and that was in the effect's dep array), and its stylesheet is imported globally
 * with no dark-theme overrides, so the dropdown rendered light against a dark form.
 *
 * The props contract is UNCHANGED so all nine call sites swap without edits, and in particular
 * `onChange("")` is still reachable — via Clear. That empty string is load-bearing: it is what
 * persists `hasStartTime: false`, i.e. a date-only event. A dialog whose only exit is a Done
 * button would make it unreachable and silently give every date-only event a midnight start.
 */

type Props = {
	onChange: (time: string) => void
	placeholder?: string
	/** "HH:mm" (24h), or "" for no time. Read on every render — this is the displayed value. */
	defaultValue?: string
	className?: string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MERIDIEMS: Array<"AM" | "PM"> = ["AM", "PM"]
const STEP_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const QUICK_PICKS = ["09:00", "12:00", "18:00", "19:00"]

type Parsed = { hour12: number; minute: number; meridiem: "AM" | "PM" }

const parse = (value?: string): Parsed | null => {
	const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim())
	if (!match) return null
	const hour24 = Number(match[1])
	const minute = Number(match[2])
	if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return null
	if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null
	return {
		hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
		minute,
		meridiem: hour24 >= 12 ? "PM" : "AM",
	}
}

const toValue = ({ hour12, minute, meridiem }: Parsed): string => {
	const hour24 = meridiem === "PM" ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12
	return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

const label = (parsed: Parsed): string => `${parsed.hour12}:${String(parsed.minute).padStart(2, "0")} ${parsed.meridiem}`

const FALLBACK: Parsed = { hour12: 9, minute: 0, meridiem: "AM" }

export default function TimePicker({ onChange, placeholder = "Select Time", defaultValue, className }: Props) {
	const { isOpen, onOpen, onClose } = useDisclosure()
	const parsedValue = parse(defaultValue)
	const [draft, setDraft] = React.useState<Parsed>(parsedValue ?? FALLBACK)

	// Seed the draft from the committed value each time the dialog opens, so cancelling and
	// reopening never shows a stale selection the field doesn't actually hold.
	const openDialog = () => {
		setDraft(parse(defaultValue) ?? FALLBACK)
		onOpen()
	}

	const commit = (next: Parsed) => {
		onChange(toValue(next))
		onClose()
	}

	const clear = () => {
		onChange("")
		onClose()
	}

	// A stored time need not sit on a 5-minute boundary (legacy events, or the mobile app), so
	// the column carries the current minute as an extra entry rather than dropping the value.
	const minutes = React.useMemo(() => {
		const list = [...STEP_MINUTES]
		if (!list.includes(draft.minute)) list.push(draft.minute)
		return list.sort((a, b) => a - b)
	}, [draft.minute])

	return (
		<>
			<Box position="relative" width="100%">
				<button
					type="button"
					onClick={openDialog}
					aria-haspopup="dialog"
					aria-label={placeholder}
					className={className ?? "bg-[#1D1F24] block w-full h-10 rounded-md border-0 py-1.5 shadow-sm sm:text-sm sm:leading-6 p-3"}
					style={{ textAlign: "left", color: parsedValue ? undefined : "#6B7280" }}
				>
					{parsedValue ? label(parsedValue) : placeholder}
				</button>
				{parsedValue && (
					<button
						type="button"
						onClick={() => onChange("")}
						aria-label="Clear time"
						title="Clear time"
						style={{
							position: "absolute",
							right: "8px",
							top: "50%",
							transform: "translateY(-50%)",
							color: "#9CA3AF",
							fontSize: "18px",
							lineHeight: 1,
							cursor: "pointer",
							zIndex: 20,
						}}
					>
						&times;
					</button>
				)}
			</Box>

			{/* Chakra rather than a hand-rolled portal: three of the nine call sites open this from
			    inside an already-open Chakra Modal (the date-poll option editors), and Chakra stacks
			    nested focus locks correctly where a bare portal would be locked out by the parent. */}
			<Modal isOpen={isOpen} onClose={onClose} isCentered size="xs">
				<ModalOverlay bg="rgba(0,0,0,0.6)" />
				<ModalContent bg="#15181C" color="white" border="1px solid #343536" borderRadius="12px">
					<ModalHeader fontSize="16px" fontWeight={600} pb={2}>
						{placeholder}
					</ModalHeader>
					<ModalCloseButton color="#9CA3AF" />
					<ModalBody pb={2}>
						<Text fontSize="28px" fontWeight={700} textAlign="center" mb={3}>
							{label(draft)}
						</Text>

						<Flex gap={2} justify="center">
							<TimeColumn
								heading="Hour"
								options={HOURS.map((h) => ({ value: h, text: String(h) }))}
								selected={draft.hour12}
								onSelect={(hour12) => setDraft((d) => ({ ...d, hour12 }))}
								isOpen={isOpen}
							/>
							<TimeColumn
								heading="Min"
								options={minutes.map((m) => ({ value: m, text: String(m).padStart(2, "0") }))}
								selected={draft.minute}
								onSelect={(minute) => setDraft((d) => ({ ...d, minute }))}
								isOpen={isOpen}
							/>
							<TimeColumn
								heading=""
								options={MERIDIEMS.map((m) => ({ value: m, text: m }))}
								selected={draft.meridiem}
								onSelect={(meridiem) => setDraft((d) => ({ ...d, meridiem }))}
								isOpen={isOpen}
							/>
						</Flex>

						<Flex gap={2} mt={4} wrap="wrap" justify="center">
							{QUICK_PICKS.map((pick) => {
								const parsed = parse(pick)
								if (!parsed) return null
								return (
									<Button
										key={pick}
										size="xs"
										variant="outline"
										borderColor="#343536"
										color="#D1D5DB"
										fontWeight={500}
										_hover={{ bg: "#23262B" }}
										onClick={() => commit(parsed)}
									>
										{label(parsed)}
									</Button>
								)
							})}
						</Flex>
					</ModalBody>
					<ModalFooter gap={2}>
						{/* Clear is the only route back to "no time" — see the note at the top of the file. */}
						<Button variant="ghost" color="#9CA3AF" _hover={{ bg: "#23262B" }} onClick={clear}>
							Clear
						</Button>
						<Button bg="#F79432" color="white" _hover={{ bg: "#e0862b" }} onClick={() => commit(draft)}>
							Done
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}

function TimeColumn<T extends string | number>({
	heading,
	options,
	selected,
	onSelect,
	isOpen,
}: {
	heading: string
	options: Array<{ value: T; text: string }>
	selected: T
	onSelect: (value: T) => void
	isOpen: boolean
}) {
	const selectedRef = React.useRef<HTMLButtonElement>(null)

	// Scroll the committed value into view when the dialog opens; without this a 9 PM event
	// opens on a column showing 1-4 and reads as though nothing is selected.
	React.useEffect(() => {
		if (!isOpen) return
		const id = window.setTimeout(() => {
			selectedRef.current?.scrollIntoView({ block: "center" })
		}, 0)
		return () => window.clearTimeout(id)
	}, [isOpen])

	return (
		<Box>
			<Text fontSize="11px" color="#6B7280" textAlign="center" mb={1} h="14px">
				{heading}
			</Text>
			<Box maxH="180px" overflowY="auto" borderRadius="8px" bg="#090C10" border="1px solid #343536" px={1} py={1}>
				{options.map((option) => {
					const isSelected = option.value === selected
					return (
						<Button
							key={String(option.value)}
							ref={isSelected ? selectedRef : undefined}
							type="button"
							onClick={() => onSelect(option.value)}
							w="60px"
							h="36px"
							my="2px"
							borderRadius="6px"
							fontSize="15px"
							fontWeight={isSelected ? 700 : 500}
							bg={isSelected ? "#F79432" : "transparent"}
							color={isSelected ? "white" : "#D1D5DB"}
							_hover={{ bg: isSelected ? "#e0862b" : "#23262B" }}
							aria-pressed={isSelected}
						>
							{option.text}
						</Button>
					)
				})}
			</Box>
		</Box>
	)
}
