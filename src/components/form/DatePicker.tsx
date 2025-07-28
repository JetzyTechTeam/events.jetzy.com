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
          const year = selectedDate.getFullYear();
          const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
          const day = String(selectedDate.getDate()).padStart(2, "0");

          const formatted = `${year}-${month}-${day}`;
          onChange(formatted); 
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
      className="bg-[#1D1F24] block w-full h-10 rounded-md border-0 py-1.5 shadow-sm placeholder:text-gray-400 sm:text-sm sm:leading-6 p-3"
    />
  )
}
