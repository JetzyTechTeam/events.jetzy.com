import React from "react"
import flatpickr from "flatpickr"

type Props = {
	onChange: (time: string) => void
	placeholder?: string
	defaultValue?: string
	className?: string
}

export default function TimePicker({ onChange, placeholder = "Select Time", defaultValue, className }: Props) {
	const ref = React.useRef<HTMLInputElement>(null)
	const fpRef = React.useRef<flatpickr.Instance | null>(null)
	const [hasValue, setHasValue] = React.useState(!!defaultValue)

	React.useEffect(() => {
		if (!ref.current) return

		const timepicker = flatpickr(ref.current, {
			enableTime: true,
			noCalendar: true,
			time_24hr: false,
			// Store 24h (H:i) so saved value stays "HH:mm"; display 12h with AM/PM via altInput
			dateFormat: "H:i",
			altInput: true,
			altFormat: "h:i K",
			allowInput: true,
			defaultDate: defaultValue || undefined,
			onChange: (selectedDates, dateStr) => {
				setHasValue(!!dateStr)
				onChange(dateStr)
			},
			// Clearing the input (empty) must propagate — flatpickr time mode won't do it on its own
			onClose: (selectedDates, dateStr) => {
				if (!dateStr) {
					setHasValue(false)
					onChange("")
				}
			},
		}) as flatpickr.Instance

		fpRef.current = timepicker

		return () => {
			timepicker.destroy()
			fpRef.current = null
		}
	}, [onChange, defaultValue])

	React.useEffect(() => {
		setHasValue(!!defaultValue)
	}, [defaultValue])

	const handleClear = () => {
		fpRef.current?.clear()
		setHasValue(false)
		onChange("")
	}

	return (
		<div style={{ position: "relative", width: "100%" }}>
			<input
				ref={ref}
				type="text"
				placeholder={placeholder}
				defaultValue={defaultValue}
				className={className ?? "bg-[#1D1F24] block w-[100px] h-10 rounded-md border-0 py-1.5 shadow-sm placeholder:text-gray-400 sm:text-sm sm:leading-6 p-3"}
			/>
			{hasValue && (
				<button
					type="button"
					onClick={handleClear}
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
					×
				</button>
			)}
		</div>
	)
}
