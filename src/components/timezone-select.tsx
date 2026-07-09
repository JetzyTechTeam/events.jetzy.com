import React from "react"
import { ErrorMessage, Field, useFormikContext } from "formik"
import moment from "moment-timezone";
import { buildTimezoneValue } from "@/utils/eventTime";

const timezones = moment.tz.names().map((tz) => ({
  value: buildTimezoneValue(tz),
}));

const TimezoneSelect: React.FC<{ className?: string }> = ({ className }) => {
  const { values, setFieldValue, handleChange } = useFormikContext<any>()

  // Default to the viewer's zone when unset, so the shown option is also the
  // stored one — never leave an empty value that silently becomes "UTC".
  React.useEffect(() => {
    if (!values?.timezone) {
      setFieldValue("timezone", buildTimezoneValue(moment.tz.guess()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Field
        as="select"
        id="timezone"
        name="timezone"
        value={values?.timezone}
        onChange={handleChange}
        className={className ?? "bg-[#1E1E1E] block w-[130px] h-10 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"}
      >
        {timezones.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.value}
          </option>
        ))}
      </Field>
      <ErrorMessage name="timezone" component="span" className="text-red-500 block mt-1" />
    </>
  )
}

export default TimezoneSelect;