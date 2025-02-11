import React from "react"
import flatpickr from "flatpickr"

type Props = {
	onChange: (time: string) => void
	placeholder?: string
}

export default function TimePicker({ onChange, placeholder = "Select Time" }: Props) {
	const ref = React.createRef<HTMLInputElement>()
	React.useEffect(() => {
		if (!ref.current) return

		const timepicker = flatpickr(ref.current, {
			enableTime: true,
			noCalendar: true,
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
			className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
		/>
	)
}
