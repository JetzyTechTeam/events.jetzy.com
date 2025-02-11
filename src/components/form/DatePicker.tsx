import React from "react"
import flatpickr from "flatpickr"

type Props = {
	onChange: (date: string) => void
	placeholder?: string
}
export default function DatePicker({ onChange, placeholder = "Select a date" }: Props) {
	const ref = React.createRef<HTMLInputElement>()

	React.useEffect(() => {
		if (!ref.current) return

		const datepicker = flatpickr(ref.current, {
			enableTime: false,
			minDate: "today",
			dateFormat: "F j, Y",
			onChange: (selectedDates, dateStr, instance) => {
				onChange(dateStr)
			},
		})

		return () => {
			datepicker.destroy()
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
