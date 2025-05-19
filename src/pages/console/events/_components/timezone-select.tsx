import { ErrorMessage, Field, useFormikContext } from "formik"
import moment from "moment-timezone";

const timezones = moment.tz.names().map((tz) => {
  const offset = moment.tz(tz).utcOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return {
    label: `(UTC${sign}${hours}:${minutes})`,
    value: tz,
  };
});

export const TimezoneSelect: React.FC = () => {
  const { values, handleChange } = useFormikContext<any>()
  return (
    <>
      <Field
        as="select"
        id="timezone"
        name="timezone"
        value={values?.timezone}
        onChange={handleChange}
        className="bg-[#1E1E1E] block w-[130px] h-10 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
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