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
			defaultDate: defaultValue || undefined,
			onChange: (selectedDates, dateStr) => {
				onChange(dateStr)
			},
		})

		return () => {
			timepicker.destroy()
		}
	}, [onChange, defaultValue])

	return (
		<input
			ref={ref}
			type="text"
			placeholder={placeholder}
			defaultValue={defaultValue}
			className={className ?? "bg-[#1D1F24] block w-[100px] h-10 rounded-md border-0 py-1.5 shadow-sm placeholder:text-gray-400 sm:text-sm sm:leading-6 p-3"}
		/>
	)
}
