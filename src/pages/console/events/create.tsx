import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import DragAndDropFileUpload, { FileUploadData } from "@Jetzy/components/misc/DragAndDropUploader"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { authorizedOnly } from "@Jetzy/lib/authSession"
import { useEdgeStore } from "@Jetzy/lib/edgestore"
import { eventValidation } from "@Jetzy/lib/validator/event"
import { CreateEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { CreateEventFormData, EventPrivacy, Pages } from "@Jetzy/types"
import { Switch } from "@headlessui/react"
import { ErrorMessage, Field, Form, Formik, FormikProps } from "formik"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import React from "react"
import DatePicker from "@/components/form/DatePicker"
import TimePicker from "@/components/form/TimePicker"
import { PlusIcon } from "@heroicons/react/24/outline"
import AddTickets from "@/components/events/AddTickets"
import { TicketData } from "@/components/events/TicketCard"
import { uniqueId } from "@/lib/utils"
import { Error } from "@/lib/_toaster"

const eventTicketsData: TicketData[] = []
const uploadedImages: FileUploadData[] = []

export default function CreateEventPage() {
	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)

	const { edgestore } = useEdgeStore()
	const navigation = useRouter()
	const { isLoading } = useAppSelector(getEventState)
	const dispatcher = useAppDispatch()

	const [isPaid, setIsPaid] = React.useState(false)

	const formInitData: CreateEventFormData = {
		name: "",
		desc: "",
		location: "",
		capacity: 0,
		requireApproval: false,
		isPaid: false,
		images: [],
		tickets: [],
		startDate: "",
		startTime: "",
		endDate: "",
		endTime: "",
	}

	const handleSubmit = (values: CreateEventFormData) => {
		// set the tickets data
		if (isPaid) {
			values.tickets = eventTicketsData
		} else {
			values.tickets = [
				{
					id: uniqueId(10),
					title: "Free Ticket",
					price: 0,
					description: "This is a free ticket",
				},
			]
		}

		// set the images data
		values.images = uploadedImages

		// set the isPaid value
		values.isPaid = isPaid

		dispatcher(CreateEventThunk({ data: { payload: JSON.stringify(values) } })).then((res: any) => {
			if (res?.payload?.status) {
				navigation.push(ROUTES.dashboard.index)
			}
		})
	}

	const submitForms = () => {
		if (formikRef?.current) {
			// submit the form
			formikRef.current.submitForm()
		}
	}

	const fileUploader = async (data: FileUploadData) => {
		// check if the image is already in the array of uploaded images using the id from data object
		const imageIndex = uploadedImages.findIndex((image) => image.id === data.id)
		if (imageIndex !== -1) {
			uploadedImages[imageIndex] = data
		} else {
			// update the image url
			uploadedImages.push(data)
		}
	}

	const fileUpoaderRemoveImage = async (data: FileUploadData) => {
		// remove the image from the array of uploaded images
		const imageIndex = uploadedImages.findIndex((image) => image.id === data.id)
		if (imageIndex !== -1) {
			// get the image to be removed
			const image = uploadedImages[imageIndex]
			uploadedImages.splice(imageIndex, 1)

			try {
				// delete the image from the server
				await edgestore.publicFiles.delete({ url: image.file })
			} catch (error: any) {
				console.error("Error deleting image", error)
				Error("Error", "Failed to delete image")
			}
		}
	}
	// ---------------------------------------------------------------------------------------------

	// handle tickets save
	const handleSave = (data: TicketData) => {
		// using the ticket id check if it already exist in the array of tickets, if it does update the ticket data otherwise add the ticket to the array
		const ticketIndex = eventTicketsData.findIndex((ticket) => ticket.id === data.id)
		if (ticketIndex !== -1) {
			// update the ticket data
			eventTicketsData[ticketIndex] = data
		} else {
			// add the ticket to the array
			eventTicketsData.push(data)
		}
	}

	const handleDelete = (data: TicketData) => {
		// remove the ticket from the array
		const ticketIndex = eventTicketsData.findIndex((ticket) => ticket.id === data.id)
		if (ticketIndex !== -1) {
			eventTicketsData.splice(ticketIndex, 1)
		}
	}
	// ---------------------------------------------------------------------------------------------

	const handleStartDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("startDate", date)
			}

			if (time) {
				formikRef.current.setFieldValue("startTime", time)
			}
		}
	}

	const handleEndDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("endDate", date)
			}

			if (time) {
				formikRef.current.setFieldValue("endTime", time)
			}
		}
	}

	const [imageUploadComponents, setImageUploadComponents] = React.useState<React.ReactNode[]>([])

	return (
		<ConsoleLayout page={Pages.Events}>
			<header className="py-6">
				<h1 className="text-slat-300 text-center text-2xl font-bold capitalized">Create New Event</h1>
			</header>
			<section className="flex items-center justify-center p-3">
				<div className="w-full grid md:grid-cols-2 xs:grid-cols-1 gap-4">
					{/* Image Uploader */}
					<section className="bg-slate-300 space-y-6 p-3 rounded-lg">
						{imageUploadComponents}

						{/* button to add new components */}
						<div className="flex justify-center items-center">
							<button
								type="button"
								onClick={() => {
									setImageUploadComponents([
										...imageUploadComponents,
										<DragAndDropFileUpload customId={uniqueId(10)} onUpload={fileUploader} onDelete={fileUpoaderRemoveImage} uploadedFiles={uploadedImages} key={uniqueId()} />,
									])
								}}
								className="flex items-center justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
							>
								<PlusIcon className="h-6 w-6 mr-2" /> Add Image
							</button>
						</div>
					</section>

					<section className="space-y-6">
						<Formik innerRef={formikRef} initialValues={formInitData} onSubmit={handleSubmit} validationSchema={eventValidation}>
							{({ values, handleChange }) => (
								<Form action="#" method="POST" className="space-y-6">
									<section className="bg-slate-300 space-y-6 p-3 rounded-lg">
										<div>
											<label htmlFor="eventName" className="block text-sm font-semibold leading-6 text-gray-900">
												Name
											</label>
											<div className="mt-2">
												<Field
													id="eventName"
													name="name"
													value={values?.name}
													onChange={handleChange}
													type="text"
													autoComplete="name"
													className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="name" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>

										<div>
											<label className="block text-sm font-semibold leading-6 text-gray-900">Date and Time</label>
											<div className="mt-2 grid grid-rows-2">
												<div className="grid grid-cols-3 gap-2">
													<div className="col-span-2">
														<label className="block text-xs leading-6 text-gray-500">Start Date</label>
														<DatePicker onChange={(date) => handleStartDateChange(date)} placeholder="Start Date" />
													</div>

													<div className="col-span-1">
														<label className="block text-xs leading-6 text-gray-500">Start Time</label>
														<TimePicker onChange={(time) => handleStartDateChange(undefined, time)} placeholder="Start Time" />
													</div>
												</div>

												<div className="grid grid-cols-3 gap-2">
													<div className="col-span-2">
														<label className="block text-xs leading-6 text-gray-500">End Date</label>
														<DatePicker onChange={(date) => handleEndDateChange(date)} placeholder="End Date" />
													</div>

													<div className="col-span-1">
														<label className="block text-xs leading-6 text-gray-500">End Time</label>
														<TimePicker onChange={(time) => handleEndDateChange(undefined, time)} placeholder="End Time" />
													</div>
												</div>
											</div>
										</div>

										<div>
											<label htmlFor="eventLocation" className="block text-sm font-semibold leading-6 text-gray-900">
												Location
											</label>
											<div className="mt-2">
												<Field
													id="eventLocation"
													name="location"
													value={values?.location}
													onChange={handleChange}
													type="text"
													placeholder="Physical addres or Virtual link"
													className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="location" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>

										<div>
											<label htmlFor="eventDescription" className="block text-sm font-semibold leading-6 text-gray-900">
												Description
											</label>
											<div className="mt-2">
												<Field
													id="eventDescription"
													as={"textarea"}
													name="desc"
													value={values?.desc}
													onChange={handleChange}
													type="text"
													autoComplete="datetime"
													className="block w-full h-20 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="desc" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>
									</section>

									<section className="bg-slate-300 space-y-6 p-3 rounded-lg">
										<header className="grid grid-rows-2 divide-y divide-slate-400">
											<div className="flex items-center justify-between">
												<h2 className="text-slat-400 font-bold">Event Options</h2>

												<div className="flex items-center space-x-2">
													<label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6 text-gray-900">
														{!isPaid ? "Free" : "Paid"}
													</label>
													<div className="mt-2">
														<Switch
															checked={isPaid}
															onChange={setIsPaid}
															className={`${isPaid ? "bg-app" : "bg-app/50"}
          relative inline-flex h-[24px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
														>
															<span className="sr-only">Use setting</span>
															<span
																aria-hidden="true"
																className={`${isPaid ? "translate-x-6" : "translate-x-0"}
            pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
															/>
														</Switch>
													</div>
												</div>
											</div>
											<div className="w-full">
												<div className="py-2 flex items-center justify-between">
													<label htmlFor="eventCapacity" className="block text-sm font-semibold leading-6 text-gray-900">
														Capacity
													</label>
													<div className="mt-2">
														<Field
															id="eventCapacity"
															name="capacity"
															value={values?.capacity}
															onChange={handleChange}
															min={0}
															type="number"
															placeholder="Enter 0 for unlimited"
															className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
														/>
														<ErrorMessage name="capacity" component="span" className="text-red-500 block mt-1" />
													</div>
												</div>

												{/* requires approval */}

												<div className="flex items-center justify-between">
													<label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6 text-gray-900">
														Require Approval
													</label>
													<div className="mt-2">
														<Switch
															checked={values.requireApproval}
															onChange={() => handleChange({ target: { name: "requireApproval", value: !values.requireApproval } })}
															className={`${values.requireApproval ? "bg-app" : "bg-app/50"}
          relative inline-flex h-[24px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
														>
															<span className="sr-only">Use setting</span>
															<span
																aria-hidden="true"
																className={`${values.requireApproval ? "translate-x-6" : "translate-x-0"}
            pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
															/>
														</Switch>
														<ErrorMessage name="requireApproval" component="span" className="text-red-500 block mt-1" />
													</div>
												</div>
											</div>
										</header>
									</section>
								</Form>
							)}
						</Formik>

						{/* Events tickets */}
						{isPaid && <AddTickets onSave={handleSave} onDelete={handleDelete} />}

						{/* Submit Button */}
						<div>
							<button
								type="button"
								onClick={submitForms}
								className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
							>
								{isLoading ? <Spinner /> : "Create Event"}
							</button>
						</div>
					</section>
				</div>
			</section>
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return authorizedOnly(context)
}
