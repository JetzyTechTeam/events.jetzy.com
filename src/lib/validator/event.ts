import * as yup from "yup"

export const eventValidation = yup.object().shape({
  name: yup.string().required("Event name is required."),
  location: yup.string().required("Please enter event location."),
  desc: yup.string().required("Please provide a brief description of the event."),
  interest: yup.string().required("Event interest is required."),
  datetime: yup.date().required("Event date and time is required."),
  privacy: yup.string().required("Please select the event privacy."),
  isPaid: yup.boolean().nullable(),
  amount: yup.number().nullable("Event amount is required."),
  image: yup.string().required("Event image is required."),
})
