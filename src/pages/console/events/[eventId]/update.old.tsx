'use client'
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { Types } from "mongoose"
import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import DragAndDropFileUpload, { FileUploadData } from "@Jetzy/components/misc/DragAndDropUploader"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { useEdgeStore } from "@Jetzy/lib/edgestore"
import { eventValidation } from "@Jetzy/lib/validator/event"
import { getEventState, UpdateEventThunk } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { CreateEventFormData, Pages } from "@Jetzy/types"
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
import { IEvent } from "@/models/events/types"
import { EmailProps, sendUpdateEventEmail } from "@/actions/send-update-email-to-users.action"
import { Bookings } from "@/models/events/bookings"
import axios from "axios"
import { TimezoneSelect } from "../_components/timezone-select"

type Props = {
	event: string
}
export default function CreateEventPage({ event }: Props) {
	const eventDetails = React.useMemo(() => JSON.parse(event) as IEvent, [event]);
  const [eventTicketsData, setEventTicketsData] = React.useState<TicketData[]>([])
  const [uploadedImages, setUploadedImages] = React.useState<FileUploadData[]>([])

	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)

	const { edgestore } = useEdgeStore()
	const navigation = useRouter()
	const { isLoading } = useAppSelector(getEventState)
	const dispatcher = useAppDispatch()

	const [isPaid, setIsPaid] = React.useState(eventDetails.isPaid)
	const [imageUploadComponents, setImageUploadComponents] = React.useState<React.ReactNode[]>([])

	// --- Initialize images and tickets on mount ---
	React.useEffect(() => {
		if (eventDetails.images && eventDetails.images.length > 0) {
      const newUploadedImages: FileUploadData[] = eventDetails.images.map(img => ({
        id: uniqueId(10),
        file: img,
      }))
      setUploadedImages(newUploadedImages)
      
      setImageUploadComponents(
        newUploadedImages.map((img) => (
          <DragAndDropFileUpload
            customId={img.id}
            onUpload={fileUploader}
            onDelete={fileUpoaderRemoveImage}
            uploadedFiles={newUploadedImages}
            key={img.id}
          />
        ))
      )
    }

    // Handle tickets
    if (eventDetails.tickets && eventDetails.tickets.length > 0) {
      const newTickets: TicketData[] = eventDetails.tickets.map(ticket => ({
        id: ticket._id?.toString() || uniqueId(10),
        title: ticket.name,
        price: Number(ticket.price),
        description: ticket.desc,
      }))
      setEventTicketsData(newTickets)
    }
	}, [event])

	// --- Initial form values ---
	const formInitData: CreateEventFormData = {
		name: eventDetails.name,
		desc: eventDetails.desc,
		location: eventDetails.location,
		capacity: eventDetails.capacity,
		requireApproval: eventDetails.requireApproval,
		isPaid: eventDetails.isPaid,
    images: uploadedImages,
    tickets: eventTicketsData,
		privacy: eventDetails.privacy,
		startDate: new Date(eventDetails.startsOn).toISOString().slice(0, 10), // yyyy-mm-dd
		startTime: new Date(eventDetails.startsOn).toTimeString().slice(0, 5), // hh:mm
		endDate: new Date(eventDetails.endsOn).toISOString().slice(0, 10),
		endTime: new Date(eventDetails.endsOn).toTimeString().slice(0, 5),
		timezone: eventDetails?.timezone || '',
		showParticipants: eventDetails.showParticipants || false,
	}

	const sendEventUpdate = (eventData: EmailProps) => {
		return axios.post('/api/send-update-event-email', eventData)
			.then((response) => response.data)
			.catch((error) => {
				console.error('Error calling update event API:', error);
				throw error;
			});
	};

	const handleSubmit = async (values: CreateEventFormData) => {
		values.tickets = eventTicketsData
		values.images = uploadedImages
		values.isPaid = isPaid

		const nameChanged = values.name !== eventDetails.name
		const locationChanged = values.location !== eventDetails.location
		const startDateChanged = values.startDate !== new Date(eventDetails.startsOn).toISOString().slice(0, 10)
		const startTimeChanged = values.startTime !== new Date(eventDetails.startsOn).toTimeString().slice(0, 5)
		const endDateChanged = values.endDate !== new Date(eventDetails.endsOn).toISOString().slice(0, 10)
		const endTimeChanged = values.endTime !== new Date(eventDetails.endsOn).toTimeString().slice(0, 5)

		const dateTimeChanged = startDateChanged || startTimeChanged || endDateChanged || endTimeChanged

// Fetch bookings for the event
const events = await axios.post(`/api/get-bookings`, {
	eventId: eventDetails._id
})
  .then(response => response.data)
  .catch(error => {
    console.error('Error fetching bookings:', error);
    return [];
  });


		if (nameChanged || locationChanged || dateTimeChanged) {
			const updatePromises = events.map((event: any) =>
				sendEventUpdate({
					eventName: values.name,
					oldEventName: eventDetails.name,
					location: values.location,
					oldLocation: eventDetails.location,
					startDate: values.startDate,
					oldStartDate: new Date(eventDetails.startsOn).toISOString().slice(0, 10),
					endDate: values.endDate,
					oldEndDate: new Date(eventDetails.endsOn).toISOString().slice(0, 10),
					endTime: values.endTime,
					oldEndTime: new Date(eventDetails.endsOn).toTimeString().slice(0, 5),
					startTime: values.startTime,
					oldStartTime: new Date(eventDetails.startsOn).toTimeString().slice(0, 5),
					userEmail: event.customerEmail,
				}))
				Promise.all(updatePromises)
				.then((results) => {
					console.log('All event updates sent successfully:', results);
				})
				.catch((error) => {
					console.error('One or more event updates failed:', error);
				});
		}

		dispatcher(UpdateEventThunk({ data: { payload: JSON.stringify(values) }, id: eventDetails._id.toString() })).then((res: any) => {
			if (res?.payload?.status) {
				navigation.push(ROUTES.dashboard.events.index)
			}
		})
	}

	const submitForms = () => {
		if (formikRef?.current) {
			formikRef.current.submitForm()
		}
	}

	const fileUploader = async (data: FileUploadData) => {
		const imageIndex = uploadedImages.findIndex((image) => image.id === data.id)
		if (imageIndex !== -1) {
			uploadedImages[imageIndex] = data
		} else {
			uploadedImages.push(data)
		}
	}

	const fileUpoaderRemoveImage = async (data: FileUploadData) => {
		const imageIndex = uploadedImages.findIndex((image) => image.id === data.id)

		if (imageIndex !== -1) {
			const image = uploadedImages[imageIndex]
			const newImages = [...uploadedImages]
			newImages.splice(imageIndex, 1)
			setUploadedImages(newImages)

			try {
				await fetch('/api/delete-image', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: image.file }),
				});
			} catch (error: any) {
				console.error("Error deleting image", error)
				Error("Error", "Failed to delete image")
			}
		}
	}

	const handleSave = (data: TicketData) => {
		const ticketIndex = eventTicketsData.findIndex((ticket) => ticket.id === data.id)
		if (ticketIndex !== -1) {
			eventTicketsData[ticketIndex] = data
		} else {
			eventTicketsData.push(data)
		}
	}

	const handleDelete = (data: TicketData) => {
		const ticketIndex = eventTicketsData.findIndex((ticket) => ticket.id === data.id)
		if (ticketIndex !== -1) {
			eventTicketsData.splice(ticketIndex, 1)
		}
	}

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

	return (
		<ConsoleLayout page={Pages.Events}>
			<header className="py-6">
				<h1 className="text-slat-300 text-center text-2xl font-bold capitalized">Update Event</h1>
			</header>
			<section className="flex items-center justify-center p-3">
				<div className="w-full grid md:grid-cols-2 xs:grid-cols-1 gap-4">
					{/* Image Uploader */}
					<section className="bg-[#1E1E1E] space-y-6 p-3 rounded-lg">
					{uploadedImages.map((img) => (
						<div key={img.id} className="relative">
							<DragAndDropFileUpload
								customId={img.id}
								onUpload={fileUploader}
								onDelete={fileUpoaderRemoveImage}
								uploadedFiles={uploadedImages}
								defaultImage={img.file}
								key={img.id}
							/>
							<button
								type="button"
								onClick={() => fileUpoaderRemoveImage(img)}
								className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 p-1 hover:bg-red-700 transition flex justify-center items-center"
								title="Delete Image"
							>
								&#10005;
							</button>
							</div>
						))}
						<div className="flex justify-center items-center">
						<button
								type="button"
								onClick={() => {
									const id = uniqueId(10)
									setUploadedImages([
										...uploadedImages,
										{ id, file: "" }
									])
								}}
								className="flex items-center justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
							>
								<PlusIcon className="h-6 w-6 mr-2" /> Add Image
							</button>
						</div>
					</section>

					<section className="space-y-6">
						<Formik innerRef={formikRef} initialValues={formInitData} onSubmit={handleSubmit} validationSchema={eventValidation} enableReinitialize>
							{({ values, handleChange }) => (
								<Form action="#" method="POST" className="space-y-6">
									<section className="bg-[#1E1E1E] space-y-6 p-3 rounded-lg">
										<div>
											<label htmlFor="eventName" className="block text-sm font-semibold leading-6">
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
													className="bg-[#1E1E1E] block w-full h-12 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="name" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>

										<div>
											<label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6">
												Event Privacy
											</label>
											<div className="mt-2">
												<Field
													as="select"
													id="eventPrivacy"
													name="privacy"
													value={values?.privacy}
													onChange={handleChange}
													className="bg-[#1E1E1E] block w-full h-12 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												>
													<option value="public">Public</option>
													<option value="private">Private</option>
												</Field>
												<ErrorMessage name="privacy" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>

										<div className="flex items-center justify-between mt-4">
											<label htmlFor="showParticipants" className="block text-sm font-semibold leading-6">
												Show Participants
											</label>
											<div className="mt-2">
												<Switch
													checked={values.showParticipants}
													onChange={() => handleChange({ target: { name: "showParticipants", value: !values.showParticipants } })}
													className={`${values.showParticipants ? "bg-app" : "bg-app/50"}
														relative inline-flex h-[24px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
												>
													<span className="sr-only">Show Participants</span>
													<span
														aria-hidden="true"
														className={`${values.showParticipants ? "translate-x-6" : "translate-x-0"}
															pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
													/>
												</Switch>
											</div>
										</div>

										<div>
											<label className="block text-sm font-semibold leading-6">Date and Time</label>
											<div className="mt-2 grid grid-rows-2">
												<div className="grid grid-cols-3 gap-2">
													<div className="col-span-2">
														<label className="block text-xs leading-6 text-gray-500">Start Date</label>
														<DatePicker
															onChange={(date) => handleStartDateChange(date)}
															placeholder="Start Date"
															defaultDate={values.startDate}
														/>
													</div>
													<div className="col-span-1">
														<label className="block text-xs leading-6 text-gray-500">Start Time</label>
														<TimePicker
															onChange={(time) => handleStartDateChange(undefined, time)}
															placeholder="Start Time"
															defaultValue={values.startTime}
														/>
													</div>
												</div>
												<div className="grid grid-cols-3 gap-2">
													<div className="col-span-2">
														<label className="block text-xs leading-6 text-gray-500">End Date</label>
														<DatePicker
															onChange={(date) => handleEndDateChange(date)}
															placeholder="End Date"
															defaultDate={values.endDate}
														/>
													</div>
													<div className="col-span-1">
														<label className="block text-xs leading-6 text-gray-500">End Time</label>
														<TimePicker
															onChange={(time) => handleEndDateChange(undefined, time)}
															placeholder="End Time"
															defaultValue={values.endTime}
														/>
													</div>
												</div>
											</div>
										</div>

										<div>
											<TimezoneSelect />
										</div>

										<div>
											<label htmlFor="eventLocation" className="block text-sm font-semibold leading-6">
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
													className="bg-[#1E1E1E] block w-full h-12 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="location" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>

										<div>
											<label htmlFor="eventDescription" className="block text-sm font-semibold leading-6">
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
													className="bg-[#1E1E1E] block w-full h-20 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
												/>
												<ErrorMessage name="desc" component="span" className="text-red-500 block mt-1" />
											</div>
										</div>
									</section>

									<section className="bg-[#1E1E1E]  space-y-6 p-3 rounded-lg">
										<header className="grid grid-rows-2 divide-y divide-slate-400">
											<div className="flex items-center justify-between">
												<h2 className="text-slat-400 font-bold">Event Options</h2>

												<div className="flex items-center space-x-2">
													<label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6">
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
													<label htmlFor="eventCapacity" className="block text-sm font-semibold leading-6">
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
															className="bg-[#1E1E1E] block w-full h-12 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
														/>
														<ErrorMessage name="capacity" component="span" className="text-red-500 block mt-1" />
													</div>
												</div>

												{/* requires approval */}

												<div className="flex items-center justify-between">
													<label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6">
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
						{isPaid && <AddTickets onSave={handleSave} onDelete={handleDelete} initialTickets={eventTicketsData} />}

						{/* Submit Button */}
						<div>
							<button
								type="button"
								onClick={submitForms}
								className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
							>
								{isLoading ? <Spinner /> : "Update Event"}
							</button>
						</div>
					</section>
				</div>
			</section>
		</ConsoleLayout>
	)
}

type Params = {
	eventId: string
}
export const getServerSideProps: GetServerSideProps<any, Params> = async (context) => {
	// check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	const { eventId } = context.params as Params

	// using event id, fetch event tickets from the database

	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
	if (!event) {
		return {
			props: {
				event: null,
			},
		}
	}

	return {
		props: {
			event: JSON.stringify(event.toJSON()),
		},
	}
}
