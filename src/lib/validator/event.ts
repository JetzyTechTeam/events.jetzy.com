import * as yup from "yup"

export const eventValidation = yup.object().shape({
	name: yup.string().required("Event name is required."),
	location: yup.string().required("Please enter event location."),
	desc: yup.string().required("Please provide a brief description of the event."),
	// privacy: yup.string().required("Please select the event privacy."),
	// image: yup.string().required("Event image is required."),
})

export const ticketValidation = yup.object().shape({
	firstName: yup.string().required("First name is required."),
	lastName: yup.string().required("Last name is required."),
	email: yup.string().email().required("Email address is required."),
	phone: yup.string().required("Phone number is required."),
})
