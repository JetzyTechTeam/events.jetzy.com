import React from "react"
import flatpickr from "flatpickr"

type Props = {
	onChange: (time: string) => void
	placeholder?: string
	defaultValue?: string
}

export default function TimePicker({ onChange, placeholder = "Select Time", defaultValue }: Props) {
	const ref = React.createRef<HTMLInputElement>()
	React.useEffect(() => {
		if (!ref.current) return

		const timepicker = flatpickr(ref.current, {
			enableTime: true,
			noCalendar: true,
			time_24hr: false,
			dateFormat: "H:i",
			onChange: (selectedDates, dateStr, instance) => {
				onChange(dateStr)
			},
		})

		return () => {
			timepicker.destroy()
		}
	}, [onChange, ref])

	return (
		<input
			ref={ref}
			type="text"
			placeholder={placeholder}
			defaultValue={defaultValue}
			className="bg-white block w-full h-10 rounded-md border border-[#E5E7EB] py-1.5 px-3 text-[#1F2937] placeholder:text-[#9CA3AF] hover:border-[#D1D5DB] focus:border-[#8B5CF6] focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] sm:text-sm sm:leading-6 transition-colors"
		/>
	)
}
