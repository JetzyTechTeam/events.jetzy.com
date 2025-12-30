import { ErrorMessage, Field, useFormikContext } from "formik"
import moment from "moment-timezone"

const timezones = moment.tz.names().map((tz) => {
	const offset = moment.tz(tz).utcOffset()
	const sign = offset >= 0 ? "+" : "-"
	const hours = Math.floor(Math.abs(offset) / 60)
		.toString()
		.padStart(2, "0")
	const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0")
	// Format: "America/New_York (UTC-05:00)" - more intuitive
	const cityName = tz.split('/').pop()?.replace(/_/g, ' ') || tz
	return {
		label: `${cityName} (UTC${sign}${hours}:${minutes})`,
		value: tz,
	}
})

const TimezoneSelect: React.FC = () => {
	const { values, handleChange } = useFormikContext<any>()
	return (
		<>
			<Field
				as="select"
				id="timezone"
				name="timezone"
				value={values?.timezone}
				onChange={handleChange}
				className="bg-white block w-full h-10 rounded-md border border-[#E5E7EB] py-1.5 px-3 text-[#1F2937] hover:border-[#D1D5DB] focus:border-[#8B5CF6] focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] sm:text-sm sm:leading-6 transition-colors"
			>
				{timezones.map((tz) => (
					<option key={`${tz.label} ${tz.value}`} value={`${tz.label} ${tz.value}`}>
						{tz.label} {tz.value}
					</option>
				))}
			</Field>
			<ErrorMessage name="timezone" component="span" className="text-red-500 block mt-1" />
		</>
	)
}

export default TimezoneSelect
