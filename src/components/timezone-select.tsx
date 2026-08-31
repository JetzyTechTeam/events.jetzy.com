import React from "react"
import { ErrorMessage, Field, useFormikContext } from "formik"
import moment from "moment-timezone";
import { buildTimezoneValue } from "@/utils/eventTime";

const timezones = moment.tz.names().map((tz) => ({
  value: buildTimezoneValue(tz),
}));

const DEFAULT_CLASS =
  "bg-[#1E1E1E] block w-[130px] h-10 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"

/**
 * Controlled variant, for callers that have no Formik around them (the inline editor on the
 * public event page). Same option list, same markup — extracted so there is one definition of
 * what a valid timezone value looks like.
 */
const ControlledTimezoneSelect: React.FC<{ className?: string; value: string; onChange: (tz: string) => void }> = ({
  className,
  value,
  onChange,
}) => {
  // Same rule as the Formik path: never sit on an empty value, which would silently store UTC.
  React.useEffect(() => {
    if (!value) onChange(buildTimezoneValue(moment.tz.guess()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <select id="timezone" name="timezone" value={value} onChange={(e) => onChange(e.target.value)} className={className ?? DEFAULT_CLASS}>
      {timezones.map((tz) => (
        <option key={tz.value} value={tz.value}>
          {tz.value}
        </option>
      ))}
    </select>
  )
}

const FormikTimezoneSelect: React.FC<{ className?: string }> = ({ className }) => {
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
        className={className ?? DEFAULT_CLASS}
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

/**
 * Formik-bound by default — passing `value`/`onChange` switches to the controlled variant.
 * The split exists because this component reads `useFormikContext`, which throws outside a
 * form; the existing call sites are unchanged.
 */
const TimezoneSelect: React.FC<{ className?: string; value?: string; onChange?: (tz: string) => void }> = (props) => {
  if (props.value !== undefined && props.onChange) {
    return <ControlledTimezoneSelect className={props.className} value={props.value} onChange={props.onChange} />
  }
  return <FormikTimezoneSelect className={props.className} />
}

export default TimezoneSelect;