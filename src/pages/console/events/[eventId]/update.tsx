'use client'
import { authorizedOnly } from "@/lib/authSession"
import { stripHtml } from "@/utils/text";
import { Events } from "@/models/events"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"
import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { FileUploadData } from "@Jetzy/components/misc/DragAndDropUploader"
import { ROUTES } from "@/configs/routes"
import { uploadFile, deleteFile } from "@/services/upload.service"
import { CreateEventFormData, DatePollOption, Pages } from "@/types"
import { Field, Form, Formik, FormikProps, FieldArray } from "formik"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import React from "react"
import DatePicker from "@/components/form/DatePicker"
import TimePicker from "@/components/form/TimePicker"
import { TicketData } from "@/components/events/TicketCard"
import { uniqueId } from "@/lib/utils"
import { Error } from "@/lib/_toaster"
import { IEvent } from "@/models/events/types"
import { EmailProps } from "@/lib/email-service"
import axios from "axios"
import {
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	Input,
	Text,
	Textarea,
	InputGroup,
	InputLeftElement,
	useDisclosure,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	MenuList,
	MenuItem,
	Menu,
	MenuButton,
	IconButton,
	Switch,
	useToast
} from "@chakra-ui/react";
import {
	DescriptionSVG,
	DotSVG,
	DottedLinesSVG,
	LocationSVG,
	LockSVG,
	MultipleUsersSVG,
	PlusSVG,
	TicketSVG,
	UserTickSVG,
	VerticalDotsSVG,
} from "@/assets/icons";
import { usePlacesWidget } from "react-google-autocomplete";
import ImageUploadBox from "../../../../components/image-upload-box"
import VideoUploadBox from "../../../../components/video-upload-box"
import TimezoneSelect from "../../../../components/timezone-select"
import { useSession } from "next-auth/react"
import { useAppDispatch } from "@/redux/stores"
import { UpdateEventThunk } from "@/redux/reducers/eventsSlice"
import { z } from "zod"
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

type Props = {
	event: string
}

const updateEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().min(1, "Location is required"),
	desc: z.string().min(1, "Description is required"),
});

export default function UpdateEventPage({ event }: Props) {
	const eventDetails = React.useMemo(() => JSON.parse(event) as IEvent, [event]);

	const { isOpen, onOpen, onClose } = useDisclosure();
	const dispatcher = useAppDispatch();
	const navigation = useRouter();
	const { data: session } = useSession()
	const router = useRouter();
	const toast = useToast();

	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null);

	const [uploadedImages, setUploadedImages] = React.useState<FileUploadData[]>([]);
	const [uploadProgress, setUploadProgress] = React.useState(0)
	const [isUploading, setIsUploading] = React.useState(false);
	const [uploadedVideos, setUploadedVideos] = React.useState<FileUploadData[]>([]);
	const [videoUploadProgress, setVideoUploadProgress] = React.useState(0);
	const [isUploadingVideo, setIsUploadingVideo] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [editIndex, setEditIndex] = React.useState<number | null>(null);
	const [tempTicket, setTempTicket] = React.useState<TicketData>({
		id: "",
		title: "",
		description: "",
		price: 0,
	});
	const [tempPollOption, setTempPollOption] = React.useState<DatePollOption>({ id: "", date: "", time: "", label: "" });
	const { isOpen: isPollModalOpen, onOpen: onPollModalOpen, onClose: onPollModalClose } = useDisclosure();
	const [sendUpdateEmailCheck, setSendUpdateEmailCheck] = React.useState(false);

	// --- Initialize images, videos and tickets on mount ---
	React.useEffect(() => {
		if (eventDetails.images && eventDetails.images.length > 0) {
			const newUploadedImages: FileUploadData[] = eventDetails.images.map(img => ({
				id: uniqueId(10),
				file: img,
			}))
			setUploadedImages(newUploadedImages)
		}

		if ((eventDetails as any).videos && (eventDetails as any).videos.length > 0) {
			const newUploadedVideos: FileUploadData[] = (eventDetails as any).videos.map((v: string) => ({
				id: uniqueId(10),
				file: v,
			}))
			setUploadedVideos(newUploadedVideos)
		}

		// Handle tickets
		if (eventDetails.tickets && eventDetails.tickets.length > 0) {
			const newTickets: TicketData[] = eventDetails.tickets.map(ticket => ({
				id: ticket._id?.toString() || uniqueId(10),
				title: ticket.name,
				price: Number(ticket.price),
				description: ticket.desc,
			}))
			// Set initial tickets in Formik state
			if (formikRef.current) {
				formikRef.current.setFieldValue("tickets", newTickets);
			}
		}
	}, [eventDetails]);


	// --- Initial form values ---
	const initialValues: CreateEventFormData = React.useMemo(() => {
		const tzString = eventDetails?.timezone || '';
		// Extract timezone from string like "(UTC-05:00) America/New_York" -> "America/New_York"
		const parts = tzString.split(') ');
		const extractedTimeZone = parts.length > 1 ? parts[1] : dayjs.tz.guess();

		const start = eventDetails.startsOn ? dayjs(eventDetails.startsOn).tz(extractedTimeZone) : null;
		const end = eventDetails.endsOn ? dayjs(eventDetails.endsOn).tz(extractedTimeZone) : null;

		return {
			name: stripHtml(eventDetails.name),
			desc: stripHtml(eventDetails.desc),
			location: eventDetails.location,
			capacity: eventDetails.capacity,
			requireApproval: eventDetails.requireApproval,
			isPaid: eventDetails.isPaid,
			images: uploadedImages,
			tickets: eventDetails.tickets.map(ticket => ({
				id: ticket._id?.toString() || uniqueId(10),
				title: stripHtml(ticket.name),
				price: Number(ticket.price),
				description: stripHtml(ticket.desc),
			})),
			privacy: eventDetails.privacy,
			startDate: start ? start.format('YYYY-MM-DD') : '',
			startTime: start ? start.format('HH:mm') : '',
			endDate: end ? end.format('YYYY-MM-DD') : '',
			endTime: end ? end.format('HH:mm') : '',
			timezone: eventDetails?.timezone || '',
			showParticipants: eventDetails.showParticipants || false,
			benefits: eventDetails.benefits || "",
			locationDisclosedAfterBooking: eventDetails.locationDisclosedAfterBooking || false,
			datePoll: eventDetails.datePoll ? {
				isActive: eventDetails.datePoll.isActive || false,
				question: eventDetails.datePoll.question || '',
				options: eventDetails.datePoll.options || [],
			} : { isActive: false, question: '', options: [] as DatePollOption[] },
		}
	}, [eventDetails, uploadedImages])

	const { ref } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			if (formikRef.current) {
				formikRef.current?.setFieldValue("location", place.formatted_address);
				// Get the geometry location coordinates
				const lat = place.geometry.location.lat();
				const lng = place.geometry.location.lng();

				// Get the place id
				const placeId = place.place_id;

				// set the location coordinates and place id
				formikRef.current?.setFieldValue("latitude", lat);
				formikRef.current?.setFieldValue("longitude", lng);
				formikRef.current?.setFieldValue("placeId", placeId);
			}
		},
		options: {
			fields: [
				"formatted_address",
				"geometry",
				"place_id",
				"name",
				"address_components",
			],
			types: ["establishment"],
		},
	});

	const sendEventUpdate = (eventData: EmailProps) => {
		return axios.post('/api/send-update-event-email', eventData)
			.then((response) => response.data)
			.catch((error) => {
				console.error('Error calling update event API:', error);
				throw error;
			});
	};

	const onSubmit = async (values: CreateEventFormData) => {
		const validation = updateEventSchema.safeParse(values);

		if (!validation.success) {
			const fieldErrors = validation.error.flatten().fieldErrors;
			const errorMessages = Object.values(fieldErrors).flat().join("\n");
			Error("Validation Error", errorMessages || "Please fix the form errors");
			return;
		}

		values.images = uploadedImages;
		values.videos = uploadedVideos;

		if (values.tickets.length > 0) values.isPaid = true
		else values.isPaid = false

		setIsSubmitting(true);

		const nameChanged = values.name !== eventDetails.name
		const locationChanged = values.location !== eventDetails.location
		const startDateChanged = eventDetails.startsOn ? values.startDate !== new Date(eventDetails.startsOn).toISOString().slice(0, 10) : !!values.startDate
		const startTimeChanged = eventDetails.startsOn ? values.startTime !== new Date(eventDetails.startsOn).toTimeString().slice(0, 5) : !!values.startTime
		const endDateChanged = eventDetails.endsOn ? values.endDate !== new Date(eventDetails.endsOn).toISOString().slice(0, 10) : !!values.endDate
		const endTimeChanged = eventDetails.endsOn ? values.endTime !== new Date(eventDetails.endsOn).toTimeString().slice(0, 5) : !!values.endTime

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

		dispatcher(UpdateEventThunk({ data: { payload: JSON.stringify({ ...values, privacy: values.privacy }) }, id: eventDetails._id.toString() })).then((res: any) => {
			if (res?.payload?.status) {
				if (sendUpdateEmailCheck && events.length > 0) {
					const changes: string[] = [];
					
					const tzString = eventDetails?.timezone || '';
					const parts = tzString.split(') ');
					const extractedTimeZone = parts.length > 1 ? parts[1] : dayjs.tz.guess();
					const oldStart = eventDetails.startsOn ? dayjs(eventDetails.startsOn).tz(extractedTimeZone) : null;
					const oldEnd = eventDetails.endsOn ? dayjs(eventDetails.endsOn).tz(extractedTimeZone) : null;

					if (values.name !== eventDetails.name) changes.push(`Event Name: ${eventDetails.name} -> ${values.name}`);
					if (values.location !== eventDetails.location) changes.push(`Location: ${eventDetails.location} -> ${values.location}`);
					
					const oldStartDateStr = oldStart ? oldStart.format('YYYY-MM-DD') : '';
					const oldStartTimeStr = oldStart ? oldStart.format('HH:mm') : '';
					if (values.startDate !== oldStartDateStr || values.startTime !== oldStartTimeStr) {
						if (values.startDate && values.startTime) {
							changes.push(`Start time was updated to ${values.startDate} ${values.startTime}`);
						} else {
							changes.push(`Start time was removed`);
						}
					}

					const oldEndDateStr = oldEnd ? oldEnd.format('YYYY-MM-DD') : '';
					const oldEndTimeStr = oldEnd ? oldEnd.format('HH:mm') : '';
					if (values.endDate !== oldEndDateStr || values.endTime !== oldEndTimeStr) {
						if (values.endDate && values.endTime) {
							changes.push(`End time was updated to ${values.endDate} ${values.endTime}`);
						} else {
							changes.push(`End time was removed`);
						}
					}
					
					if (values.desc !== stripHtml(eventDetails.desc)) changes.push("Event description was updated");
					if (values.capacity !== eventDetails.capacity) changes.push(`Event capacity was changed to ${values.capacity}`);
					
					// Simple tickets change detection
					const currentTickets = JSON.stringify(values.tickets.map(t => ({ title: t.title, price: t.price })));
					const oldTickets = JSON.stringify(eventDetails.tickets.map((t: any) => ({ title: stripHtml(t.name), price: Number(t.price) })));
					if (currentTickets !== oldTickets) {
						changes.push("Ticketing options have been revised");
					}

					if (changes.length > 0) {
						// Get unique users to prevent multiple emails per user
						const uniqueUsers = Array.from(new Map(events.map((e: any) => [e.customerEmail, e])).values()) as any[];
						const origin = typeof window !== 'undefined' ? window.location.origin : '';
						const eventLink = `${origin}/${eventDetails.slug}`;

						const updatePromises = uniqueUsers.map((event: any) =>
							sendEventUpdate({
								eventName: values.name,
								oldEventName: eventDetails.name,
								location: values.location,
								oldLocation: eventDetails.location,
								startDate: values.startDate,
								oldStartDate: oldStart ? oldStart.format('YYYY-MM-DD') : '',
								endDate: values.endDate,
								oldEndDate: oldEnd ? oldEnd.format('YYYY-MM-DD') : '',
								endTime: values.endTime,
								oldEndTime: oldEnd ? oldEnd.format('HH:mm') : '',
								startTime: values.startTime,
								oldStartTime: oldStart ? oldStart.format('HH:mm') : '',
								userEmail: event.customerEmail,
								changes,
								eventLink
							}))
						Promise.all(updatePromises)
							.then((results) => {
								console.log('All event updates sent successfully:', results);
							})
							.catch((error) => {
								console.error('One or more event updates failed:', error);
							});
					}
				}
				navigation.push(ROUTES.dashboard.events.index)
			}
		}).finally(() => {
			setIsSubmitting(false);
		});
	};

	const handleStartDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("startDate", date);
			}

			if (time) {
				formikRef.current.setFieldValue("startTime", time);
			}
		}
	};

	const handleEndDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("endDate", date);
			}

			if (time) {
				formikRef.current.setFieldValue("endTime", time);
			}
		}
	};

	const handleImageUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploading) return; // Prevent multiple uploads at once

		setIsUploading(true);
		setUploadProgress(0);

		try {
			// Process each file selected
			for (let i = 0; i < files.length; i++) {
				const file = files[i];

				// Upload the current file
				const res = await uploadFile(file, {
					onProgressChange: (progress) => {
						setUploadProgress(progress);
					},
					folder: "posts"
				});

				// Add the new image data to the array
				setUploadedImages((prevImages) => [
					...prevImages,
					{ id: uniqueId(10), file: res.url },
				]);
			}
		} catch (error: any) {
			console.error("Error uploading file", error);
			Error("Error", "Failed to upload file");
		} finally {
			setIsUploading(false);
			setUploadProgress(0);
		}
	};

	const handleImageDelete = async (imageUrl: string) => {
		try {
			try { await deleteFile(imageUrl); } catch {}
			await axios.post('/api/delete-image', { url: imageUrl });
			setUploadedImages((prevImages) =>
				prevImages.filter((img) => img.file !== imageUrl)
			);
		} catch (error: any) {
			console.error("Error deleting image", error);
		}
	};

	const handleVideoUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploadingVideo) return;
		setIsUploadingVideo(true);
		setVideoUploadProgress(0);
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const res = await uploadFile(file, {
					onProgressChange: (progress) => setVideoUploadProgress(progress),
					folder: "posts",
				});
				setUploadedVideos((prev) => [...prev, { id: uniqueId(10), file: res.url }]);
			}
		} catch (error: any) {
			console.error("Error uploading video", error);
		} finally {
			setIsUploadingVideo(false);
			setVideoUploadProgress(0);
		}
	};

	const handleVideoDelete = async (videoUrl: string) => {
		try {
			try { await deleteFile(videoUrl); } catch {}
			setUploadedVideos((prev) => prev.filter((v) => v.file !== videoUrl));
		} catch (error: any) {
			console.error("Error deleting video", error);
		}
	};


	return (
		<ConsoleLayout
			page={Pages.CreateEvent}
			backBtn={`/ console / events / ${eventDetails._id}/manage`
			}
			maxW="max-w-4xl"
		>
			<Formik
				initialValues={initialValues as CreateEventFormData}
				onSubmit={onSubmit}
				innerRef={formikRef}
				enableReinitialize={true}
			>
				{({ values, setFieldValue }) => (
					<Form>
						<Flex
							direction={{ base: "column", md: "row" }}
							gap={8}
							p={8}
							borderRadius="2xl"
							maxW="900px"
							mx="auto"
							boxShadow="2xl"
						>
							{/* Left Side: Form Fields */}
							<Box flex="1">
								<FormControl mb={4}>
									<Flex alignItems="center" gap={4}>
										<Box flex="1">
											<Field
												as={Input}
												id="name"
												name="name"
												placeholder="Event Name"
												size="lg"
												color="white"
												border="none"
												h="20"
												fontSize="38"
												fontWeight="bold"
												p="0"
												_focus={{ border: "none", boxShadow: "none" }}
												_placeholder={{ color: "#FFFFFF52" }}
												value={values?.name}
											/>
										</Box>
										<Box w="130px">
											<TimezoneSelect />
										</Box>
									</Flex>
								</FormControl>
								<Flex
									gap={4}
									alignItems="center"
									justifyContent="space-between"
									mb="4"
									bg="#14161B"
									rounded="xl"
									p="2"
								>
									<Box pl="3" className="relative">
										<Box className="absolute top-5 left-4">
											<DottedLinesSVG />
										</Box>
										<FormLabel color="#FFFFFFA3" mb="5">
											<Flex gap="3" alignItems="center">
												<DotSVG />

												<Text>Start</Text>
											</Flex>
										</FormLabel>
										<FormLabel color="#FFFFFFA3">
											<Flex gap="3" alignItems="center">
												<DotSVG />
												<Text>End</Text>
											</Flex>
										</FormLabel>
									</Box>
									<Flex gap="4">
										<Box>
											<FormControl mb="2">
												<TimePicker
													onChange={(time) =>
														handleStartDateChange(undefined, time)
													}
													placeholder="Start Time"
													defaultValue={values.startTime}
												/>
											</FormControl>
											<FormControl>
												<TimePicker
													onChange={(time) =>
														handleEndDateChange(undefined, time)
													}
													placeholder="End Time"
													defaultValue={values.endTime}
												/>
											</FormControl>
										</Box>
										<Box>
											<FormControl mb="2">
												<DatePicker
													onChange={(date) => handleStartDateChange(date)}
													placeholder="Start Date"
													defaultDate={values.startDate}
												/>
											</FormControl>
											<FormControl>
												<DatePicker
													onChange={(date) => handleEndDateChange(date)}
													placeholder="End Date"
													defaultDate={values.endDate}
												/>
											</FormControl>
										</Box>
									</Flex>
								</Flex>
								<FormControl mb={4}>
									<InputGroup>
										<InputLeftElement pointerEvents="none">
											<LocationSVG />
										</InputLeftElement>
										<Field
											ref={ref}
											as={Input}
											id="location"
											name="location"
											placeholder="Choose Location"
											bg="#141619"
											color="white"
											border="none"
											pl="10"
											value={values.location}
										/>
									</InputGroup>
								</FormControl>
								<FormControl mb={4}>
									<InputGroup>
										<InputLeftElement pointerEvents="none">
											<DescriptionSVG />
										</InputLeftElement>
										<Field
											as={Textarea}
											name="desc"
											placeholder="Add Description"
											bg="#141619"
											color="white"
											border="none"
											rows="8"
											pl="10"
											value={values.desc}
										/>
									</InputGroup>
								</FormControl>
								<Text fontWeight="semibold" color="gray.400" mb={2}>
									Event Benefits (Max 23 chars)
								</Text>
								<Box bg="#141619" rounded="xl" px="4" py="3" mb={4}>
									<FormControl>
										<InputGroup>
											<InputLeftElement pointerEvents="none" h="full" display="flex" alignItems="center">
												<PlusSVG />
											</InputLeftElement>
											<Field
												as={Input}
												name="benefits"
												placeholder="e.g. Free drinks, Networking, Live Music (separate by commas)"
												bg="#1C1F24"
												color="white"
												border="none"
												fontSize="sm"
												pl="10"
												maxLength={23}
											/>
										</InputGroup>
										<Text fontSize="xs" color="gray.500" mt={1} textAlign="right">
											{values.benefits?.length || 0}/23
										</Text>
									</FormControl>
								</Box>
								<Text fontWeight="semibold" color="gray.400" mb={2}>
									Event Options
								</Text>
								<Box bg="#141619" rounded="xl" px="3" py="2">
									<Flex align="center" justifyContent="space-between" mt="2">
										<Flex gap="3" alignItems="center">
											<LockSVG />
											<Text color="gray.400" mr={2}>
												Privacy
											</Text>
										</Flex>
										<Field
											as="select"
											id="privacy"
											name="privacy"
											value={values?.privacy}
											className="bg-[#1E1E1E] block w-[100px] h-10 rounded-md border-0 py-1 shadow-sm sm:text-sm sm:leading-6 p-3"
										>
											<option value="private">Private</option>
											<option value="public">Public</option>
										</Field>
									</Flex>
									<Flex align="center" justifyContent="space-between" my={4}>
										<Flex gap="3" alignItems="center">
											<UserTickSVG />
											<Text color="gray.400" mr={2}>
												Require Approval
											</Text>
										</Flex>
										<Switch
											name="requireApproval"
											isChecked={values.requireApproval}
											colorScheme="orange"
											onChange={() =>
												setFieldValue(
													"requireApproval",
													!values.requireApproval
												)
											}
										/>
									</Flex>
									<Flex align="center" justifyContent="space-between" mb="4">
										<Flex gap="3" alignItems="center">
											<MultipleUsersSVG />
											<Text color="gray.400" mr={2}>
												Capacity
											</Text>
										</Flex>
										<Field
											as={Input}
											type="number"
											min={0}
											value={values.capacity || 0}
											name="capacity"
											bg="#1C1F24"
											color="white"
											border="none"
											w="80px"
											h="30px"
										/>
									</Flex>
									<Flex align="center" justifyContent="space-between" mb="4">
										<Flex gap="3" alignItems="center">
											<UserTickSVG />
											<Text color="gray.400" mr={2}>
												Send Update Email to Attendees
											</Text>
										</Flex>
										<Switch
											isChecked={sendUpdateEmailCheck}
											colorScheme="orange"
											onChange={(e) => setSendUpdateEmailCheck(e.target.checked)}
										/>
									</Flex>
									<Flex align="center" justifyContent="space-between" mb="4">
										<Flex gap="3" alignItems="center">
											<LocationSVG />
											<Box>
												<Text color="gray.400">Disclose Location After Booking</Text>
												<Text fontSize="xs" color="gray.600">Attendees see real location only in booking email</Text>
											</Box>
										</Flex>
										<Switch
											name="locationDisclosedAfterBooking"
											isChecked={values.locationDisclosedAfterBooking}
											colorScheme="orange"
											onChange={() => setFieldValue("locationDisclosedAfterBooking", !values.locationDisclosedAfterBooking)}
										/>
									</Flex>
									<Flex align="center" justifyContent="space-between">
										<Flex gap="3" alignItems="center">
											<TicketSVG />
											<Text color="gray.400" mr={2}>
												Tickets
											</Text>
										</Flex>
										<Button
											bg="transparent"
											color="white"
											_hover={{ bg: "transparent" }}
											_active={{ bg: "transparent" }}
											size="sm"
											onClick={() => {
												setEditIndex(null); // Reset edit index for new ticket
												setTempTicket({ id: "", title: "", description: "", price: 0 }); // Reset temp ticket
												onOpen();
											}}
											rightIcon={<PlusSVG />}
											p="0"
										>
											Add
										</Button>
									</Flex>
									<FieldArray name="tickets">
										{({ remove, replace, push }) => (
											<>
												{values.tickets.map((ticket, index) => (
													<Box
														key={ticket.id || index} // Use ticket.id if available, otherwise index
														py="2"
														px="3"
														bg="#2B2B2B"
														borderRadius="md"
														border="1px solid #464646"
														my={4}
														position="relative"
													>
														<Box>
															<Text fontWeight="bold">{ticket.title}</Text>
															<Text fontSize="sm" my="2">
																{ticket.description}
															</Text>
															<Text
																fontSize="lg"
																fontWeight="bold"
																color="#F79432"
															>
																${ticket.price}
															</Text>
														</Box>

														{/* Vertical Dots Menu */}
														<Box position="absolute" top="3" right="3">
															<Menu>
																<MenuButton
																	as={IconButton}
																	icon={<VerticalDotsSVG />}
																	variant="ghost"
																	size="sm"
																	color="white"
																	_hover={{ bg: "#333" }}
																	_active={{ bg: "#444" }}
																/>
																<MenuList
																	bg="#1D1F24"
																	border="1px solid #444"
																	color="white"
																>
																	<MenuItem
																		bg="transparent"
																		_hover={{ bg: "#333" }}
																		onClick={() => {
																			setEditIndex(index);
																			setTempTicket(ticket);
																			onOpen();
																		}}
																	>
																		Edit
																	</MenuItem>
																	<MenuItem
																		bg="transparent"
																		_hover={{ bg: "#333" }}
																		onClick={() => remove(index)}
																	>
																		Delete
																	</MenuItem>
																</MenuList>
															</Menu>
														</Box>
													</Box>
												))}
											</>
										)}
									</FieldArray>
								</Box>
								{/* Date Poll Section */}
								<Text fontWeight="semibold" color="gray.400" mb={2} mt={6}>
									Date Poll
								</Text>
								<Box bg="#141619" rounded="xl" px="3" py="3" mb={4}>
									<Flex align="center" justifyContent="space-between" mb="3">
										<Box>
											<Text color="gray.400">Enable Date Poll</Text>
											<Text fontSize="xs" color="gray.600">Let attendees vote on preferred event date</Text>
										</Box>
										<Switch
											isChecked={values.datePoll?.isActive}
											colorScheme="orange"
											onChange={() => setFieldValue("datePoll.isActive", !values.datePoll?.isActive)}
										/>
									</Flex>
									{values.datePoll?.isActive && (
										<Box>
											<FormControl mb="3">
												<Input
													placeholder="Poll question (e.g. Which date works for you?)"
													bg="#1C1F24"
													color="white"
													border="none"
													fontSize="sm"
													value={values.datePoll?.question || ""}
													onChange={(e) => setFieldValue("datePoll.question", e.target.value)}
												/>
											</FormControl>
											{(values.datePoll?.options || []).map((opt, idx) => (
												<Flex key={opt.id} align="center" justify="space-between" bg="#2B2B2B" rounded="md" px="3" py="2" mb="2" border="1px solid #464646">
													<Box>
														<Text fontSize="sm" fontWeight="bold" color="white">{opt.date} {opt.time}</Text>
														{opt.label && <Text fontSize="xs" color="gray.400">{opt.label}</Text>}
													</Box>
													<Button
														size="xs"
														variant="ghost"
														color="red.400"
														onClick={() => {
															const updated = [...(values.datePoll?.options || [])];
															updated.splice(idx, 1);
															setFieldValue("datePoll.options", updated);
														}}
													>
														Remove
													</Button>
												</Flex>
											))}
											<Button
												size="sm"
												bg="transparent"
												color="white"
												border="1px dashed #666"
												width="100%"
												mt="1"
												_hover={{ bg: "#1C1F24" }}
												onClick={() => {
													setTempPollOption({ id: "", date: "", time: "", label: "" });
													onPollModalOpen();
												}}
												leftIcon={<PlusSVG />}
											>
												Add Date Option
											</Button>
										</Box>
									)}
								</Box>
								<Button
									type="submit"
									mt="10"
									bg="#F79432"
									size="lg"
									width="100%"
									borderRadius="xl"
									color="black"
									isLoading={isSubmitting}
									isDisabled={isSubmitting || isUploading}
								>
									Update Event
								</Button>

								{/* Tickets Modal */}
								<FieldArray name="tickets">
									{({ push, replace }) => (
										<Modal isOpen={isOpen} onClose={onClose} isCentered>
											<ModalOverlay />
											<ModalContent bg="#1E1E1E" color="white">
												<ModalHeader>
													{editIndex !== null ? "Edit Ticket" : "Add Ticket"}
												</ModalHeader>
												<ModalCloseButton />
												<ModalBody>
													<FormControl mb={4}>
														<FormLabel>Ticket Name</FormLabel>
														<Input
															id="ticketTitle"
															name="ticketTitle"
															placeholder="Enter ticket name"
															bg="#090C10"
															border="1px solid #444"
															value={tempTicket.title}
															required
															onChange={(e) =>
																setTempTicket({
																	...tempTicket,
																	title: e.target.value,
																})
															}
														/>
													</FormControl>
													<FormControl mb={4}>
														<FormLabel>Description</FormLabel>
														<Textarea
															id="ticketDescription"
															name="ticketDescription"
															placeholder="Enter description"
															bg="#090C10"
															border="1px solid #444"
															value={tempTicket.description}
															required
															onChange={(e) =>
																setTempTicket({
																	...tempTicket,
																	description: e.target.value,
																})
															}
														/>
													</FormControl>
													<FormControl mb={4}>
														<FormLabel>Price</FormLabel>
														<Input
															id="ticketPrice"
															name="ticketPrice"
															type="number"
															placeholder="Enter price"
															bg="#090C10"
															border="1px solid #444"
															value={tempTicket.price}
															onChange={(e) =>
																setTempTicket({
																	...tempTicket,
																	price: parseFloat(e.target.value),
																})
															}
														/>
													</FormControl>
												</ModalBody>
												<ModalFooter>
													<Button
														bg="#F79432"
														color="black"
														mr={3}
														onClick={() => {
															if (!tempTicket.title.trim() || !tempTicket.description.trim()) {
																toast({
																	title: "Missing required fields",
																	description: "You need to provide a ticket title and description.",
																	status: "error",
																	duration: 4000,
																	isClosable: true,
																});
																return;
															}

															if (editIndex !== null) {
																// Edit existing ticket
																replace(editIndex, tempTicket);
															} else {
																// Add new ticket
																push({ ...tempTicket, id: uniqueId(10) });
															}
															onClose();
														}}
													>
														{editIndex !== null ? "Save Changes" : "Add Ticket"}
													</Button>
													<Button variant="ghost" color='white' _hover={{ color: 'black', bg: 'orange' }} onClick={onClose}>
														Cancel
													</Button>
												</ModalFooter>
											</ModalContent>
										</Modal>
									)}
								</FieldArray>

								{/* Date Poll Option Modal */}
								<Modal isOpen={isPollModalOpen} onClose={onPollModalClose} isCentered>
									<ModalOverlay />
									<ModalContent bg="#1E1E1E" color="white">
										<ModalHeader>Add Date Option</ModalHeader>
										<ModalCloseButton />
										<ModalBody>
											<FormControl mb={4}>
												<FormLabel>Date</FormLabel>
												<Input
													type="date"
													bg="#090C10"
													border="1px solid #444"
													color="white"
													value={tempPollOption.date}
													onChange={(e) => setTempPollOption({ ...tempPollOption, date: e.target.value })}
												/>
											</FormControl>
											<FormControl mb={4}>
												<FormLabel>Time</FormLabel>
												<Input
													type="time"
													bg="#090C10"
													border="1px solid #444"
													color="white"
													value={tempPollOption.time}
													onChange={(e) => setTempPollOption({ ...tempPollOption, time: e.target.value })}
												/>
											</FormControl>
											<FormControl mb={4}>
												<FormLabel>Label (optional)</FormLabel>
												<Input
													placeholder="e.g. Weekend option"
													bg="#090C10"
													border="1px solid #444"
													color="white"
													value={tempPollOption.label || ""}
													onChange={(e) => setTempPollOption({ ...tempPollOption, label: e.target.value })}
												/>
											</FormControl>
										</ModalBody>
										<ModalFooter>
											<Flex flexDirection="column" w="full" gap="3">
												<Button
													bg="#F79432"
													w="full"
													color="black"
													onClick={() => {
														if (tempPollOption.date && tempPollOption.time) {
															const newOption: DatePollOption = {
																...tempPollOption,
																id: new Date().getTime().toString(),
																votes: [],
															};
															setFieldValue("datePoll.options", [...(values.datePoll?.options || []), newOption]);
															onPollModalClose();
														}
													}}
												>
													Add
												</Button>
												<Button variant="unstyled" onClick={onPollModalClose}>Cancel</Button>
											</Flex>
										</ModalFooter>
									</ModalContent>
								</Modal>

							</Box>

							{/* Right Side: Image + Video Upload */}
							<Box id="images" mb={6}>
								<FormLabel>Event Images</FormLabel>
								<ImageUploadBox
									uploadedImages={uploadedImages}
									onImageChange={handleImageUpload}
									isUploading={isUploading}
									uploadProgress={uploadProgress}
									handleImageDelete={handleImageDelete}
								/>
								<FormLabel mt={4}>Event Videos</FormLabel>
								<VideoUploadBox
									uploadedVideos={uploadedVideos}
									onVideoChange={handleVideoUpload}
									isUploading={isUploadingVideo}
									uploadProgress={videoUploadProgress}
									handleVideoDelete={handleVideoDelete}
								/>
							</Box>
						</Flex>
					</Form>
				)}
			</Formik>
		</ConsoleLayout >
	);
}

export const getServerSideProps: GetServerSideProps<any, { eventId: string }> = async (context) => {
	await ensureDbConnected()
	// check if user is authorized
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const { eventId } = context.params as { eventId: string }

	// using event id, fetch event tickets from the database
	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
	if (!event) {
		return {
			notFound: true,
		}
	}

	return {
		props: {
			event: JSON.stringify(event.toJSON()),
		},
	}
}
