import React from "react"
import { useFormikContext } from "formik"
import { Flex, Text, Box } from "@chakra-ui/react"
import { Roboto } from "next/font/google"
import { CreateEventFormData } from "@/types"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error"
export interface AutosaveState {
	status: AutosaveStatus
	savedAt?: Date
}

// Merge the outside-of-Formik media arrays into the form values and normalise the
// fields the create/update APIs require. Reused by autosave AND both submit handlers
// so the autosaved payload matches exactly what a manual save would send.
export function buildEventPayload(
	values: CreateEventFormData,
	images: FileUploadData[],
	videos: FileUploadData[],
	overrides?: Partial<CreateEventFormData>,
): any {
	return {
		...values,
		images,
		videos,
		privacy: values.privacy ?? "public",
		isPaid: values.isPaid ?? ((values.tickets?.length ?? 0) > 0),
		requireApproval: values.requireApproval ?? false,
		premium: values.premium ?? false,
		// The field is a plain number input — coerce so a cleared/blank field (or any
		// out-of-range typo) never reaches the API as "", NaN, or outside 0-100.
		premiumMemberDiscountPercentage: Math.min(100, Math.max(0, Number(values.premiumMemberDiscountPercentage) || 0)),
		capacity: values.capacity ?? 0,
		tickets: values.tickets ?? [],
		// Trim so a whitespace-only entry is treated as "not set". On create that means
		// derive the URL from the event name; on update it means leave the slug alone.
		slug: values.slug?.trim() || undefined,
		...overrides,
	}
}

interface AutosaveManagerProps {
	enabled: boolean
	// Bump whenever media (images/videos) changes so image-only edits also autosave.
	mediaVersion: string | number
	// Gate a save (e.g. require a non-empty name before creating a draft).
	canSave?: (values: CreateEventFormData) => boolean
	onAutosave: (values: CreateEventFormData) => Promise<void>
	onStatusChange?: (state: AutosaveState) => void
	debounceMs?: number
}

// Lives INSIDE <Formik>; watches values + media and debounces an autosave. Keeps the
// heavy value-reading isolated in this tiny child so the parent page doesn't re-render
// on every keystroke.
export function AutosaveManager({
	enabled,
	mediaVersion,
	canSave,
	onAutosave,
	onStatusChange,
	debounceMs = 2000,
}: AutosaveManagerProps) {
	const { values, dirty } = useFormikContext<CreateEventFormData>()

	const valuesRef = React.useRef(values)
	valuesRef.current = values
	const onAutosaveRef = React.useRef(onAutosave)
	onAutosaveRef.current = onAutosave
	const onStatusRef = React.useRef(onStatusChange)
	onStatusRef.current = onStatusChange
	const canSaveRef = React.useRef(canSave)
	canSaveRef.current = canSave
	const enabledRef = React.useRef(enabled)
	enabledRef.current = enabled

	const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const firstRun = React.useRef(true)
	const inFlight = React.useRef(false)
	const pending = React.useRef(false)

	const runSave = React.useCallback(async () => {
		if (!enabledRef.current) return
		const v = valuesRef.current
		if (canSaveRef.current && !canSaveRef.current(v)) return
		if (inFlight.current) {
			pending.current = true
			return
		}
		inFlight.current = true
		onStatusRef.current?.({ status: "saving" })
		try {
			await onAutosaveRef.current(v)
			onStatusRef.current?.({ status: "saved", savedAt: new Date() })
		} catch {
			onStatusRef.current?.({ status: "error" })
		} finally {
			inFlight.current = false
			if (pending.current && enabledRef.current) {
				pending.current = false
				runSave()
			}
		}
	}, [])

	React.useEffect(() => {
		// Skip the initial mount / Formik reinitialize render — only real edits autosave.
		if (firstRun.current) {
			firstRun.current = false
			return
		}
		if (!enabled || !dirty) return
		if (canSaveRef.current && !canSaveRef.current(valuesRef.current)) return

		onStatusRef.current?.({ status: "unsaved" })
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(runSave, debounceMs)
		return () => {
			if (timer.current) clearTimeout(timer.current)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [values, mediaVersion, enabled, dirty, debounceMs, runSave])

	return null
}

// Small "Saving… / Saved 10:42 / Unsaved changes" indicator for the header.
export function AutosaveStatusPill({ state }: { state: AutosaveState }) {
	const { status, savedAt } = state
	if (status === "idle") return null

	const config: Record<Exclude<AutosaveStatus, "idle">, { label: string; color: string; dot: string }> = {
		unsaved: { label: "Unsaved changes", color: "#9C9C9C", dot: "#F79432" },
		saving: { label: "Saving…", color: "#9C9C9C", dot: "#F79432" },
		saved: {
			label: savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved",
			color: "#7BC47F",
			dot: "#7BC47F",
		},
		error: { label: "Save failed — retrying", color: "#EC5E5E", dot: "#EC5E5E" },
	}

	const { label, color, dot } = config[status]

	return (
		<Flex align="center" gap="6px" px="10px" h="32px" borderRadius="full" bg="#15181C" border="1px solid #343536" flexShrink={0}>
			<Box w="7px" h="7px" borderRadius="full" bg={dot} flexShrink={0} />
			<Text className={roboto.className} fontSize="12px" lineHeight="100%" color={color} whiteSpace="nowrap">
				{label}
			</Text>
		</Flex>
	)
}
