import React from "react"
import flatpickr from "flatpickr"

type Props = {
  onChange: (date: string) => void
  placeholder?: string
  defaultDate?: string
}
export default function DatePicker({ onChange, defaultDate, placeholder = "Select a date" }: Props) {
  const ref = React.createRef<HTMLInputElement>()

	React.useEffect(() => {
		if (!ref.current) return;
	
    const datepicker = flatpickr(ref.current, {
      dateFormat: "Y-m-d",
      enableTime: false,
      defaultDate: defaultDate,
      disableMobile: false,
      allowInput: true,
      minDate: defaultDate && new Date(defaultDate) < new Date()
        ? defaultDate
        : "today",
      onReady: (selectedDates, dateStr, instance) => {
        if (defaultDate) {
          instance.setDate(defaultDate, false);
        }
      },
      onChange: (dates) => {
        if (dates.length > 0) {
          const selectedDate = dates[0];
          onChange(selectedDate.toISOString().split("T")[0]);
        }
      },
    });
	
		return () => {
			datepicker.destroy();
		};
	}, [onChange, defaultDate]);

  return (
    <input
      ref={ref}
      type="text"
      placeholder={placeholder}
      defaultValue={defaultDate}
      className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
    />
  )
}
