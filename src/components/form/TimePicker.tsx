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
	Input,
	SimpleGrid,
	Text,
	useDisclosure,
} from "@chakra-ui/react"

/**
 * Time picker rendered as a dialog: hour and minute grids, an AM/PM pair, and quick picks.
 *
 * Replaces a flatpickr `noCalendar` dropdown. Two things about that setup drove the rewrite:
 * the instance was rebuilt on every parent render (every call site passes an inline arrow to
 * `onChange`, and that was in the effect's dep array), and its stylesheet is imported globally
 * with no dark-theme overrides, so the dropdown rendered light against a dark form.
 *
 * **Grids, not scrolling columns.** The first version of this dialog used three
 * `overflow-y: auto` columns, which on Windows Chrome paint the OS scrollbar — a light track
 * with arrow buttons at both ends. Two white strips down the middle of a dark panel, from
 * markup that never asked for them. A container that doesn't scroll has no scrollbar to
 * style on any platform, and every choice is visible at once, which is the point of a picker.
 *
 * **The chips are 5-minute steps, so an exact-minute field sits under them.** 9:03 has to be
 * reachable: `parse` accepts any minute, legacy rows and the mobile app write off-step values,
 * and an event genuinely starting at 6:47 is the host's business, not the picker's.
 *
 * The props contract is UNCHANGED so all eleven call sites swap without edits, and in
 * particular `onChange("")` is still reachable — via Clear. That empty string is load-bearing:
 * it is what persists `hasStartTime: false`, i.e. a date-only event. A dialog whose only exit
 * is a Done button would make it unreachable and silently give every date-only event a
 * midnight start.
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

// The console's own tokens — the same set the manage page and the leave dialog use. The
// previous pass invented `#090C10` for the columns, which matched nothing else on the screen.
const SURFACE = "#161616"
const BORDER = "#2A2D31"
const CHIP = "#242628"
const CHIP_HOVER = "#2E3135"
const ACCENT = "#F79432"
const ACCENT_HOVER = "#E68422"
const MUTED = "#B5B6B7"

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

/** One selectable value. Same shape for hours, minutes and AM/PM so the three read as a set. */
function TimeChip({
	children,
	isSelected,
	onClick,
	minW,
}: {
	children: React.ReactNode
	isSelected: boolean
	onClick: () => void
	minW?: string
}) {
	return (
		<Button
			type="button"
			onClick={onClick}
			aria-pressed={isSelected}
			h="38px"
			minW={minW}
			px={0}
			borderRadius="8px"
			fontSize="15px"
			fontWeight={isSelected ? 700 : 500}
			bg={isSelected ? ACCENT : CHIP}
			color={isSelected ? "black" : "white"}
			border="1px solid"
			borderColor={isSelected ? ACCENT : BORDER}
			_hover={{ bg: isSelected ? ACCENT_HOVER : CHIP_HOVER, borderColor: isSelected ? ACCENT_HOVER : "#4A4D51" }}
			_active={{ bg: isSelected ? ACCENT_HOVER : "#1E2023" }}
		>
			{children}
		</Button>
	)
}

function FieldLabel({ children }: { children: React.ReactNode }) {
	return (
		<Text fontSize="11px" fontWeight={600} letterSpacing="0.06em" textTransform="uppercase" color="#7E8083" mb={2}>
			{children}
		</Text>
	)
}

export default function TimePicker({ onChange, placeholder = "Select Time", defaultValue, className }: Props) {
	const { isOpen, onOpen, onClose } = useDisclosure()
	const parsedValue = parse(defaultValue)
	const [draft, setDraft] = React.useState<Parsed>(parsedValue ?? FALLBACK)
	// The exact-minute field keeps its own text so a half-typed "0" isn't clamped to 0 under
	// the host's fingers. `draft.minute` stays the single source of truth for the time itself.
	const [minuteText, setMinuteText] = React.useState<string>(String((parsedValue ?? FALLBACK).minute).padStart(2, "0"))

	const setMinute = (minute: number) => {
		setDraft((d) => ({ ...d, minute }))
		setMinuteText(String(minute).padStart(2, "0"))
	}

	const onMinuteTextChange = (raw: string) => {
		const digits = raw.replace(/\D/g, "").slice(0, 2)
		setMinuteText(digits)
		if (digits === "") return
		const value = Number(digits)
		if (value >= 0 && value <= 59) setDraft((d) => ({ ...d, minute: value }))
	}

	// Blur is where the field tidies itself up: pad to two digits, and put back the committed
	// minute if they left it empty or typed something out of range.
	const onMinuteBlur = () => setMinuteText(String(draft.minute).padStart(2, "0"))

	// Seed the draft from the committed value each time the dialog opens, so cancelling and
	// reopening never shows a stale selection the field doesn't actually hold.
	const openDialog = () => {
		const next = parse(defaultValue) ?? FALLBACK
		setDraft(next)
		setMinuteText(String(next.minute).padStart(2, "0"))
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
	// the grid carries the current minute as an extra chip rather than dropping the value.
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

			{/* Chakra rather than a hand-rolled portal: three of the eleven call sites open this
			    from inside an already-open Chakra Modal (the date-poll option editors), and Chakra
			    stacks nested focus locks correctly where a bare portal would be locked out by the
			    parent. `sm` so the four quick picks fit one row — at `xs` the fourth wrapped alone. */}
			<Modal isOpen={isOpen} onClose={onClose} isCentered size="sm" motionPreset="slideInBottom">
				<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(2px)" />
				<ModalContent bg={SURFACE} color="white" border="1px solid" borderColor={BORDER} borderRadius="16px" mx={4}>
					<ModalHeader pt={5} px={5} pb={0} fontSize="15px" fontWeight={600} color={MUTED}>
						{placeholder}
					</ModalHeader>
					<ModalCloseButton top={4} right={4} color="#7E8083" _hover={{ bg: CHIP, color: "white" }} />

					<ModalBody px={5} pt={2} pb={4}>
						{/* Tabular figures so the headline doesn't jiggle as the digits change width. */}
						<Text fontSize="32px" fontWeight={700} lineHeight="1.2" mb={5} sx={{ fontVariantNumeric: "tabular-nums" }}>
							{label(draft)}
						</Text>

						<FieldLabel>Hour</FieldLabel>
						<SimpleGrid columns={6} spacing={2} mb={4}>
							{HOURS.map((hour12) => (
								<TimeChip key={hour12} isSelected={hour12 === draft.hour12} onClick={() => setDraft((d) => ({ ...d, hour12 }))}>
									{hour12}
								</TimeChip>
							))}
						</SimpleGrid>

						<FieldLabel>Minute</FieldLabel>
						<SimpleGrid columns={6} spacing={2} mb={3}>
							{minutes.map((minute) => (
								<TimeChip key={minute} isSelected={minute === draft.minute} onClick={() => setMinute(minute)}>
									{String(minute).padStart(2, "0")}
								</TimeChip>
							))}
						</SimpleGrid>

						{/* The chips are every fifth minute; this is how the other 48 are reached. A
						    typed value also appears as its own chip, because `minutes` carries any
						    off-step minute — so the grid confirms the selection rather than contradicting it. */}
						<Flex align="center" gap={3} mb={4}>
							<Text fontSize="13px" color={MUTED} flexShrink={0}>
								Exact minute
							</Text>
							<Input
								value={minuteText}
								onChange={(e) => onMinuteTextChange(e.target.value)}
								onBlur={onMinuteBlur}
								inputMode="numeric"
								maxLength={2}
								aria-label="Exact minute, 0 to 59"
								w="64px"
								h="38px"
								textAlign="center"
								fontSize="15px"
								fontWeight={600}
								bg={CHIP}
								border="1px solid"
								borderColor={BORDER}
								borderRadius="8px"
								_hover={{ borderColor: "#4A4D51" }}
								_focusVisible={{ borderColor: ACCENT, boxShadow: "none" }}
							/>
							<Text fontSize="12px" color="#7E8083">
								0&ndash;59
							</Text>
						</Flex>

						<Flex gap={2} mb={4}>
							{MERIDIEMS.map((meridiem) => (
								<TimeChip
									key={meridiem}
									minW="72px"
									isSelected={meridiem === draft.meridiem}
									onClick={() => setDraft((d) => ({ ...d, meridiem }))}
								>
									{meridiem}
								</TimeChip>
							))}
						</Flex>

						<FieldLabel>Quick picks</FieldLabel>
						<Flex gap={2} wrap="wrap">
							{QUICK_PICKS.map((pick) => {
								const parsed = parse(pick)
								if (!parsed) return null
								return (
									<Button
										key={pick}
										h="32px"
										px={3}
										borderRadius="8px"
										fontSize="13px"
										fontWeight={600}
										bg="transparent"
										color={MUTED}
										border="1px solid"
										borderColor={BORDER}
										_hover={{ bg: CHIP, color: "white", borderColor: "#4A4D51" }}
										onClick={() => commit(parsed)}
									>
										{label(parsed)}
									</Button>
								)
							})}
						</Flex>
					</ModalBody>

					<ModalFooter px={5} pt={0} pb={5} gap={2}>
						{/* Clear is the only route back to "no time" — see the note at the top of the file. */}
						<Button variant="ghost" color={MUTED} fontWeight={600} _hover={{ bg: CHIP, color: "white" }} onClick={clear}>
							Clear
						</Button>
						<Button bg={ACCENT} color="black" fontWeight="bold" _hover={{ bg: ACCENT_HOVER }} _active={{ bg: "#D97913" }} onClick={() => commit(draft)}>
							Done
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}
