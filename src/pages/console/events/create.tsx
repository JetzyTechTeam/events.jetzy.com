import React from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Switch,
  Text,
  Textarea,
  InputGroup,
  InputLeftElement,
  InputRightElement,
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
} from "@chakra-ui/react";
import {
  Formik,
  Form,
  Field,
  FormikProps,
  FieldArray,
} from "formik";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { CreateEventFormData, DatePollOption, Pages } from "@/types";
import { usePlacesWidget } from "react-google-autocomplete";
import {
  LocationSVG,
  LockSVG,
  MultipleUsersSVG,
  PlusSVG,
  TicketSVG,
  UserTickSVG,
} from "@/assets/icons";
import { ChevronDownIcon, CalendarDaysIcon, ClockIcon, DevicePhoneMobileIcon, TicketIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { MinusCircleIcon } from "@heroicons/react/24/solid";
import TimePicker from "@/components/form/TimePicker";
import DatePicker from "@/components/form/DatePicker";
import { Error } from "@/lib/_toaster";
import { CreateEventThunk, UpdateEventThunk } from "@/redux/reducers/eventsSlice";
import { CreateEventApis, UpdateEventApis } from "@/services/events/eventsapis";
import { AutosaveManager, AutosaveStatusPill, buildEventPayload, AutosaveState } from "@/components/events/AutosaveManager";
import { useAppDispatch } from "@/redux/stores";
import { useRouter } from "next/router";
import { TicketData } from "@/components/events/TicketCard";
import { FileUploadData } from "@/components/misc/DragAndDropUploader";
import { uploadFile, deleteFile } from "@/services/upload.service";
import { uniqueId } from "@/lib/utils";
import MediaUploadSection from "../../../components/media-upload-section";
import TimezoneSelect from "../../../components/timezone-select";
import { z } from "zod";
import { Roboto } from "next/font/google";
import RichTextEditor from "@/components/misc/RichTextEditor";
import InterestsSelector from "@/components/events/InterestsSelector";

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" });

// Shared dark field styling (Figma: bg #090C10, 1px #343536 border, rounded, Roboto 14px)
const fieldBase = "w-full h-12 bg-[#090C10] border border-[#343536] rounded-md text-white text-sm placeholder:text-gray-500 focus:outline-none";
const tzFieldCls = `${roboto.className} appearance-none ${fieldBase} px-3 pr-10 cursor-pointer`;
const dtFieldCls = `${roboto.className} ${fieldBase} pl-10 pr-3`;

const initialValues = {
  name: "",
  desc: "",
  startTime: "",
  startDate: "",
  endTime: "",
  endDate: "",
  location: "",
  requireApproval: false,
  tickets: [],
  images: [],
  timezone: "",
  capacity: 0,
  privacy: "public",
  status: "published" as 'draft' | 'published',
  benefits: "",
  locationDisclosedAfterBooking: false,
  showOnMobile: true,
  datePoll: {
    isActive: false,
    question: "",
    options: [] as DatePollOption[],
  },
  interests: [] as string[],
};

const createEventSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  location: z.string().optional(),
});

const CreateEventPage = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const dispatcher = useAppDispatch();
  const navigation = useRouter();

  const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null);

  const [uploadedImages, setUploadedImages] = React.useState<FileUploadData[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadedVideos, setUploadedVideos] = React.useState<FileUploadData[]>([]);
  const [videoUploadProgress, setVideoUploadProgress] = React.useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [benefitInput, setBenefitInput] = React.useState("");
  const [tempTicket, setTempTicket] = React.useState<TicketData>({
    id: "",
    title: "",
    description: "",
    price: 0,
  });
  const [tempPollOption, setTempPollOption] = React.useState<DatePollOption>({ id: "", date: "", time: "", label: "" });
  const [pollDate, setPollDate] = React.useState("")
  const [pollTime, setPollTime] = React.useState("")
  const { isOpen: isPollModalOpen, onOpen: onPollModalOpen, onClose: onPollModalClose } = useDisclosure();
  const { isOpen: isSuccessOpen, onOpen: onSuccessOpen, onClose: onSuccessClose } = useDisclosure();
  const [createdEventId, setCreatedEventId] = React.useState<string | null>(null);

  // Autosave: the first save creates ONE draft record; all later saves update it. The
  // event stays a draft (hidden from the public list) until the organizer publishes.
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>({ status: 'idle' });
  const autosaveIdRef = React.useRef<string | null>(null);
  const creatingRef = React.useRef(false);
  // A manual submit always wins over autosave. Once submit reaches dispatch we LOCK autosave
  // for the rest of this page's life (unlock only if the save fails and we stay on the page),
  // so a debounced autosave can't reschedule and revert the just-published event to draft.
  const [autosaveLocked, setAutosaveLocked] = React.useState(false);
  const autosaveLockedRef = React.useRef(false);
  const autosaveInFlightRef = React.useRef<Promise<any> | null>(null);
  const mediaVersion = React.useMemo(
    () => JSON.stringify([uploadedImages.map((i) => i.file), uploadedVideos.map((v) => v.file)]),
    [uploadedImages, uploadedVideos]
  );

  const handleAutosave = async (values: CreateEventFormData) => {
    if (autosaveLockedRef.current) return;
    const payload = buildEventPayload(values, uploadedImages, uploadedVideos, { status: 'draft' });
    const existingId = autosaveIdRef.current;
    let p: Promise<any>;
    if (existingId) {
      p = UpdateEventApis({ id: existingId, data: { payload: JSON.stringify(payload) } });
    } else {
      // Only the first autosave creates the record; guard against concurrent creates.
      if (creatingRef.current) return;
      creatingRef.current = true;
      p = CreateEventApis({ data: { payload: JSON.stringify(payload) } })
        .then((res: any) => {
          const newId = res?.data?._id;
          if (newId) autosaveIdRef.current = newId;
        })
        .finally(() => { creatingRef.current = false; });
    }
    autosaveInFlightRef.current = p;
    try {
      await p;
    } finally {
      if (autosaveInFlightRef.current === p) autosaveInFlightRef.current = null;
    }
  };

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

  const onSubmit = async (values: CreateEventFormData) => {
    const isDraft = values.status === 'draft'

    values.images = uploadedImages;
    values.videos = uploadedVideos;

    // A date poll and fixed start/end dates are mutually exclusive — force the user to resolve a conflict
    const pollActive = !!(values.datePoll?.isActive && values.datePoll?.options?.length)
    const hasDates = !!(values.startDate || values.endDate)
    if (pollActive && hasDates) {
      Error("Validation Error", "Remove either the date poll or the start/end dates before saving.");
      return;
    }

    if (isDraft) {
      if (!values.name?.trim()) {
        Error("Validation Error", "Event name is required to save as draft");
        return;
      }
    } else {
      const validation = createEventSchema.safeParse(values);
      if (!validation.success) {
        const fieldErrors = validation.error.flatten().fieldErrors;
        const errorMessages = Object.values(fieldErrors).flat().join("\n");
        Error("Validation Error", errorMessages || "Please fix the form errors");
        return;
      }
    }

    if (values.tickets.length === 0) {
      values.tickets = [
        {
          id: uniqueId(10),
          title: "Free Ticket",
          price: 0,
          description: "This is a free ticket",
        },
      ]
    }

    if (values.tickets.length > 0) values.isPaid = true
    else values.isPaid = false

    // Attempt geocoding if coordinates missing, but don't block submission on failure
    if (!values.latitude || !values.longitude) {
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
        if (apiKey && values.location) {
          const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(values.location)}&key=${apiKey}`);
          const data = await res.json();
          if (data.status === "OK" && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            values.latitude = loc.lat;
            values.longitude = loc.lng;
            values.placeId = data.results[0].place_id;
          }
        }
      } catch (_) {
        // Geocoding failed, proceed without coordinates
      }
    }

    setIsSubmitting(true);

    // Lock autosave (stays locked on success so it can't reschedule and revert the published
    // event to draft), then let any in-flight autosave settle so we don't duplicate the create.
    autosaveLockedRef.current = true;
    setAutosaveLocked(true);
    if (autosaveInFlightRef.current) {
      try { await autosaveInFlightRef.current } catch { /* fall back to fresh create */ }
    }

    const wasDraft = values.status === 'draft'
    const payloadStr = JSON.stringify({ ...values, privacy: values.privacy })
    // If autosave already created a draft record, promote/save THAT record instead of
    // creating a duplicate. Otherwise fall back to a fresh create.
    const existingId = autosaveIdRef.current
    const request = existingId
      ? dispatcher(UpdateEventThunk({ data: { payload: payloadStr }, id: existingId }))
      : dispatcher(CreateEventThunk({ data: { payload: payloadStr } }))

    let succeeded = false
    request.then((res: any) => {
      if (res?.payload?.status) {
        succeeded = true
        if (wasDraft) {
          navigation.push('/console/events')
        } else {
          setCreatedEventId(existingId ?? res.payload.data._id);
          onSuccessOpen();
        }
      }
    }).finally(() => {
      setIsSubmitting(false);
      // Keep autosave locked on success (navigated away, or published + success modal — in
      // both cases further autosave would be wrong); only unlock if it failed.
      if (!succeeded) {
        autosaveLockedRef.current = false;
        setAutosaveLocked(false);
      }
    });
  };

  const clearDatePoll = () => {
    formikRef.current?.setFieldValue("datePoll", { isActive: false, question: "", options: [] });
  };

  const handleStartDateChange = (date?: string, time?: string) => {
    if (formikRef?.current) {
      if (date !== undefined) {
        formikRef.current.setFieldValue("startDate", date);
        if (date) clearDatePoll(); // setting a fixed date disables the poll (mutually exclusive)
      }

      if (time !== undefined) {
        formikRef.current.setFieldValue("startTime", time);
      }
    }
  };
  const handleEndDateChange = (date?: string, time?: string) => {
    if (formikRef?.current) {
      if (date !== undefined) {
        formikRef.current.setFieldValue("endDate", date);
        if (date) clearDatePoll(); // setting a fixed date disables the poll (mutually exclusive)
      }

      if (time !== undefined) {
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
          folder: "posts" // Using posts as verified by test
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
      await deleteFile(imageUrl);
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
      await deleteFile(videoUrl);
      setUploadedVideos((prev) => prev.filter((v) => v.file !== videoUrl));
    } catch (error: any) {
      console.error("Error deleting video", error);
    }
  };

  return (
    <ConsoleLayout
      page={Pages.CreateEvent}
      backBtn="/console/events"
      maxW="max-w-7xl"
    >
      <Formik
        initialValues={initialValues as CreateEventFormData}
        onSubmit={onSubmit}
        innerRef={formikRef}
      >
        {({ values, setFieldValue }) => (
          <Form>
            <AutosaveManager
              enabled={!autosaveLocked}
              mediaVersion={mediaVersion}
              canSave={(v) => !!v.name?.trim()}
              onAutosave={handleAutosave}
              onStatusChange={setAutosaveState}
            />
            {autosaveState.status !== 'idle' && (
              <Flex justify="flex-end" mb={3}>
                <AutosaveStatusPill state={autosaveState} />
              </Flex>
            )}
            {/* ---- Status (top; mirrors the one at the bottom, same `status` field) ---- */}
            <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }} mb={6}>
              <Flex align="center" justifyContent="space-between">
                <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Status</Text>
                <Field as="select" name="status" value={values?.status} className="bg-[#090C10] block w-[130px] h-10 rounded-md border border-[#343536] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </Field>
              </Flex>
            </Box>
            <Flex direction={{ base: "column", lg: "row" }} gap={6} align="flex-start">
              {/* ===================== MAIN COLUMN ===================== */}
              <Flex direction="column" gap={6} flex={{ base: "1", lg: "2" }} w="full" minW={0}>
                {/* ---- Basic Information ---- */}
                <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <Heading size="md" color="white" mb={5}>Basic Information</Heading>

                  <FormControl mb={4}>
                    <FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Event title <Text as="span" color="#F79432">*</Text></FormLabel>
                    <InputGroup>
                      <Field
                        as={Input}
                        name="name"
                        placeholder="Event title"
                        className={roboto.className}
                        bg="#090C10"
                        color="white"
                        fontSize="14px"
                        h="48px"
                        border="1px solid #343536"
                        _focus={{ borderColor: "#343536", boxShadow: "none" }}
                        maxLength={100}
                        pr="60px"
                        value={values?.name}
                      />
                      <InputLeftElement h="48px" w="auto" right="3" left="auto" pointerEvents="none" color="gray.500" fontSize="xs">
                        {values.name?.length || 0}/100
                      </InputLeftElement>
                    </InputGroup>
                  </FormControl>

                  <FormControl mb={4}>
                    <FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Time zone</FormLabel>
                    <Box position="relative">
                      <TimezoneSelect className={tzFieldCls} />
                      <ChevronDownIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </Box>
                  </FormControl>

                  {/* Conflict: both a poll and fixed dates are set — keep both editable so the user can resolve it */}
                  {!!((values.startDate || values.endDate) && (values.datePoll?.isActive)) && (
                    <Box mb={3} p={3} rounded="lg" bg="#3A2A12" border="1px solid #7A5A20">
                      <Text fontSize="sm" color="orange.300">This event has both a date poll and fixed dates. Remove one to continue.</Text>
                    </Box>
                  )}

                  {/* Start / End date + time with dotted connector */}
                  <Flex
                    gap={4}
                    alignItems="stretch"
                    flexWrap={{ base: "wrap", sm: "nowrap" }}
                    mb={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? 1 : 4}
                    bg="#14161B"
                    rounded="xl"
                    p="3"
                    opacity={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? 0.4 : 1}
                    pointerEvents={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? "none" : "auto"}
                  >
                    {/* Left: Start/End markers + dashed connector */}
                    <Flex direction="column" gap="3" position="relative" pr="1" flexShrink={0}>
                      <Box position="absolute" left="5px" top="6" bottom="6" borderLeft="1px dashed #5A5D62" />
                      <Flex h="48px" align="center" gap="3">
                        <Box w="11px" h="11px" rounded="full" bg="#F79432" zIndex={1} />
                        <Text className={roboto.className} color="#FFFFFFCC" fontSize="14px">Start</Text>
                      </Flex>
                      <Flex h="48px" align="center" gap="3">
                        <Box w="11px" h="11px" rounded="full" bg="#3B82F6" zIndex={1} />
                        <Text className={roboto.className} color="#FFFFFFCC" fontSize="14px">End</Text>
                      </Flex>
                    </Flex>
                    {/* Right: two rows of date + time */}
                    <Flex direction="column" gap="3" flex="1" minW={0}>
                      <Flex gap="3" flexWrap={{ base: "wrap", md: "nowrap" }}>
                        <Box position="relative" flex="1" minW="140px">
                          <CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                          <DatePicker className={dtFieldCls} onChange={(date) => handleStartDateChange(date)} placeholder="Start Date" defaultDate={values.startDate} />
                        </Box>
                        <Box position="relative" flex="1" minW="120px">
                          <ClockIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                          <TimePicker className={dtFieldCls} onChange={(time) => handleStartDateChange(undefined, time)} placeholder="Start Time" defaultValue={values.startTime} />
                        </Box>
                      </Flex>
                      <Flex gap="3" flexWrap={{ base: "wrap", md: "nowrap" }}>
                        <Box position="relative" flex="1" minW="140px">
                          <CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                          <DatePicker className={dtFieldCls} onChange={(date) => handleEndDateChange(date)} placeholder="End Date" defaultDate={values.endDate} />
                        </Box>
                        <Box position="relative" flex="1" minW="120px">
                          <ClockIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                          <TimePicker className={dtFieldCls} onChange={(time) => handleEndDateChange(undefined, time)} placeholder="End Time" defaultValue={values.endTime} />
                        </Box>
                      </Flex>
                    </Flex>
                  </Flex>
                  {!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) && (
                    <Text fontSize="xs" color="orange.400" mb={3}>Remove date poll to set a fixed start/end date</Text>
                  )}

                  {/* ---- Date Poll (mutually exclusive with fixed dates) ---- */}
                  <Box
                    mb={4}
                    opacity={!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) ? 0.4 : 1}
                    pointerEvents={!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) ? "none" : "auto"}
                  >
                    <Heading size="md" color="white" mb={1}>Date Poll <Text as="span" fontSize="sm" color="gray.500" fontWeight="normal">(optional)</Text></Heading>
                    {!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) && (
                      <Text fontSize="xs" color="orange.400" mb={2}>Remove start/end date to enable date poll</Text>
                    )}
                    <Flex align="center" justifyContent="space-between" mt={3} mb="3">
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Enable Date Poll</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Let attendees vote on preferred event date</Text>
                      </Box>
                      <Switch isChecked={values.datePoll?.isActive} colorScheme="orange" onChange={() => {
                        const next = !values.datePoll?.isActive
                        setFieldValue("datePoll.isActive", next)
                        if (next) { // enabling the poll clears any fixed dates (mutually exclusive)
                          setFieldValue("startDate", ""); setFieldValue("startTime", "")
                          setFieldValue("endDate", ""); setFieldValue("endTime", "")
                        }
                      }} />
                    </Flex>
                    {values.datePoll?.isActive && (
                      <Box>
                        {(values.datePoll?.options || []).map((opt, idx) => (
                          <Flex key={opt.id} align="center" justify="space-between" bg="#2B2B2B" rounded="md" px="3" py="2" mb="2" border="1px solid #464646">
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" color="white">{opt.date} {opt.time}</Text>
                              {opt.label && <Text fontSize="xs" color="gray.400">{opt.label}</Text>}
                            </Box>
                            <Button size="xs" variant="ghost" color="red.400" onClick={() => {
                              const updated = [...(values.datePoll?.options || [])]
                              updated.splice(idx, 1)
                              setFieldValue("datePoll.options", updated)
                            }}>Remove</Button>
                          </Flex>
                        ))}
                        <Button size="sm" bg="transparent" color="white" border="1px dashed #666" width="100%" mt="1" _hover={{ bg: "#1C1F24" }} onClick={() => { setTempPollOption({ id: "", date: "", time: "", label: "" }); onPollModalOpen() }} leftIcon={<PlusSVG />}>
                          Add Date Option
                        </Button>
                      </Box>
                    )}
                  </Box>

                  <FormControl mb={4}>
                    <FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Location</FormLabel>
                    <InputGroup>
                      <InputLeftElement h="48px" pointerEvents="none"><LocationSVG /></InputLeftElement>
                      <Field name="location">
                        {({ field }: any) => (
                          <Input {...field} ref={ref} id="location" placeholder="Choose Location" className={roboto.className} bg="#090C10" color="white" fontSize="14px" h="48px" border="1px solid #343536" _focus={{ borderColor: "#343536", boxShadow: "none" }} pl="10" />
                        )}
                      </Field>
                    </InputGroup>
                  </FormControl>

                  <FormControl>
                    <FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Description</FormLabel>
                    <RichTextEditor value={values.desc} onChange={(val) => setFieldValue("desc", val)} placeholder="Add Description" />
                    <Text fontSize="xs" color="gray.500" mt={1} textAlign="right">{(values.desc || "").replace(/<[^>]*>/g, "").length}/500</Text>
                  </FormControl>
                </Box>

                {/* ---- Interests ---- */}
                <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <InterestsSelector bare selected={values.interests ?? []} onChange={(ids) => setFieldValue("interests", ids)} />
                </Box>

                {/* ---- Event Benefits ---- */}
                <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <Flex align="baseline" gap={2} mb={4}>
                    <Heading size="md" color="white">Event Benefits</Heading>
                    <Text className={roboto.className} fontSize="sm" color="#9C9C9C">(Max 23 chars)</Text>
                  </Flex>
                  {(() => {
                    const addBenefit = () => {
                      const v = benefitInput.trim()
                      if (!v) return
                      const list = (values.benefits || "").split(",").map((b: string) => b.trim()).filter(Boolean)
                      setFieldValue("benefits", [...list, v].join(","))
                      setBenefitInput("")
                    }
                    return (
                      <InputGroup mb={4}>
                        <Input
                          placeholder="e.g free food, free drinks etc"
                          className={roboto.className}
                          bg="#090C10"
                          color="white"
                          fontSize="sm"
                          h="48px"
                          border="1px solid #343536"
                          _focus={{ borderColor: "#343536", boxShadow: "none" }}
                          pr="70px"
                          maxLength={23}
                          value={benefitInput}
                          onChange={(e) => setBenefitInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addBenefit() }
                          }}
                        />
                        <InputRightElement w="auto" right="4" h="48px">
                          <Button size="sm" variant="ghost" color="#F79432" _hover={{ bg: "transparent" }} _active={{ bg: "transparent" }} p="0" onClick={addBenefit}>
                            + Add
                          </Button>
                        </InputRightElement>
                      </InputGroup>
                    )
                  })()}
                  <Flex gap={3} flexWrap="wrap">
                    {(values.benefits || "").split(",").map((b: string) => b.trim()).filter(Boolean).map((b: string, idx: number) => (
                      <Flex key={`${b}-${idx}`} align="center" gap={2} bg="#090C10" border="1px solid #343536" rounded="md" px="4" py="2">
                        <Text className={roboto.className} fontSize="sm" color="white">{b}</Text>
                        <Box
                          as="button"
                          type="button"
                          display="flex"
                          alignItems="center"
                          onClick={() => {
                            const list = (values.benefits || "").split(",").map((x: string) => x.trim()).filter(Boolean)
                            list.splice(idx, 1)
                            setFieldValue("benefits", list.join(","))
                          }}
                        >
                          <MinusCircleIcon className="w-5 h-5 text-[#EC5E5E]" />
                        </Box>
                      </Flex>
                    ))}
                  </Flex>
                </Box>

                {/* ---- Event Options ---- */}
                <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <Heading size="md" color="white" mb={4}>Event Options</Heading>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <LockSVG />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Privacy</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Who can view and join this event</Text>
                      </Box>
                    </Flex>
                    <Field as="select" id="privacy" name="privacy" value={values?.privacy} className="bg-[#090C10] block w-[110px] h-10 rounded-md border border-[#343536] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </Field>
                  </Flex>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <UserTickSVG />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Require Approval</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>
                          {((values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0)) ? "Available for events with a free ticket" : "Approval applies to free-ticket registrations"}
                        </Text>
                      </Box>
                    </Flex>
                    <Switch name="requireApproval" isDisabled={(values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0)} isChecked={values.requireApproval && !((values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0))} colorScheme="orange" onChange={() => setFieldValue("requireApproval", !values.requireApproval)} />
                  </Flex>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <MultipleUsersSVG />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Capacity</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Maximum number of attendees</Text>
                      </Box>
                    </Flex>
                    <Field as={Input} type="number" min={0} value={values.capacity ?? ""} placeholder="0" name="capacity" bg="#090C10" color="white" border="1px solid #343536" w="90px" h="36px" />
                  </Flex>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <LocationSVG />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Disclose Location After Booking</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Attendees see location only in booking email</Text>
                      </Box>
                    </Flex>
                    <Switch name="locationDisclosedAfterBooking" isChecked={values.locationDisclosedAfterBooking} colorScheme="orange" onChange={() => setFieldValue("locationDisclosedAfterBooking", !values.locationDisclosedAfterBooking)} />
                  </Flex>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <DevicePhoneMobileIcon className="text-[#B5B6B7]" />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Show on Mobile</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Display this event in the Jetzy mobile app</Text>
                      </Box>
                    </Flex>
                    <Switch name="showOnMobile" isChecked={values.showOnMobile} colorScheme="orange" onChange={() => setFieldValue("showOnMobile", !values.showOnMobile)} />
                  </Flex>
                  <Flex align="center" justifyContent="space-between">
                    <Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
                      <TicketSVG />
                      <Box>
                        <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Tickets</Text>
                        <Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686" mt={1}>Manage ticket types and pricing</Text>
                      </Box>
                    </Flex>
                    <Button bg="transparent" color="#F79432" _hover={{ bg: "transparent" }} _active={{ bg: "transparent" }} size="sm" fontSize="16px" onClick={() => { setEditIndex(null); setTempTicket({ id: "", title: "", description: "", price: 0 }); onOpen() }} leftIcon={<TicketIcon className="w-5 h-5" />} p="0">
                      Add Tickets
                    </Button>
                  </Flex>
                  <FieldArray name="tickets">
                    {({ remove }) => (
                      <>
                        {values.tickets.map((ticket, index) => (
                          <Box key={ticket.id || index} p="5" bg="#1E1E1E" borderRadius="10px" border="1px solid #343536" mt={4} position="relative">
                            <Text className={roboto.className} fontWeight="bold" fontSize="lg" color="white">{ticket.title}</Text>
                            <Text className={roboto.className} fontSize="sm" my="1" color="#868686" pr="6">{ticket.description}</Text>
                            <Text fontWeight="bold" fontSize="2xl" color="#F79432" mt="2">${ticket.price}</Text>
                            <Box position="absolute" top="4" right="4">
                              <Menu>
                                <MenuButton as={IconButton} icon={<EllipsisHorizontalIcon className="w-6 h-6" />} variant="ghost" size="sm" color="white" _hover={{ bg: "#333" }} _active={{ bg: "#444" }} />
                                <MenuList bg="#1D1F24" border="1px solid #444" color="white">
                                  <MenuItem bg="transparent" _hover={{ bg: "#333" }} onClick={() => { setEditIndex(index); setTempTicket(ticket); onOpen() }}>Edit</MenuItem>
                                  <MenuItem bg="transparent" _hover={{ bg: "#333" }} onClick={() => remove(index)}>Delete</MenuItem>
                                </MenuList>
                              </Menu>
                            </Box>
                          </Box>
                        ))}
                      </>
                    )}
                  </FieldArray>
                </Box>

                {/* ---- Status + Submit ---- */}
                <Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Status</Text>
                    <Field as="select" name="status" value={values?.status} className="bg-[#090C10] block w-[130px] h-10 rounded-md border border-[#343536] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </Field>
                  </Flex>
                  <Flex justify="flex-end" mb={3}>
                    <AutosaveStatusPill state={autosaveState} />
                  </Flex>
                  <Button
                    type="submit"
                    bg="#F79432"
                    size="lg"
                    width="100%"
                    borderRadius="xl"
                    color="black"
                    isLoading={isSubmitting}
                    isDisabled={isSubmitting || isUploading}
                  >
                    {values.status === 'draft' ? 'Save as Draft' : 'Create Event'}
                  </Button>
                </Box>
              </Flex>

              {/* ===================== SIDEBAR ===================== */}
              <Flex direction="column" gap={6} flex="1" w="full" maxW={{ lg: "360px" }} minW={0}>
                {/* ---- Event Media ---- */}
                <Box id="images" bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
                  <Heading size="md" color="white" mb={4}>Event Media</Heading>
                  <MediaUploadSection
                    uploadedImages={uploadedImages}
                    uploadedVideos={uploadedVideos}
                    onImageChange={handleImageUpload}
                    onVideoChange={handleVideoUpload}
                    isUploadingImage={isUploading}
                    isUploadingVideo={isUploadingVideo}
                    imageUploadProgress={uploadProgress}
                    videoUploadProgress={videoUploadProgress}
                    handleImageDelete={handleImageDelete}
                    handleVideoDelete={handleVideoDelete}
                  />
                </Box>
              </Flex>
            </Flex>

            {/* Date Poll Option Modal */}
            <Modal isOpen={isPollModalOpen} onClose={onPollModalClose} isCentered>
              <ModalOverlay />
              <ModalContent bg="#1E1E1E" color="white">
                <ModalHeader>Add Date Option</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <FormControl mb={4}>
                    <FormLabel>Date</FormLabel>
                    <DatePicker
                      key={`poll-date-${isPollModalOpen}`}
                      onChange={(d) => setPollDate(d)}
                      placeholder="Select date"
                    />
                  </FormControl>
                  <FormControl mb={4}>
                    <FormLabel>Time</FormLabel>
                    <TimePicker
                      key={`poll-time-${isPollModalOpen}`}
                      className="bg-[#090C10] block w-full h-10 rounded-md border border-[#444] py-1.5 px-3 text-white sm:text-sm sm:leading-6"
                      onChange={(t) => setPollTime(t)}
                      placeholder="Select time"
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
                      type="button"
                      onClick={() => {
                        const label = tempPollOption.label || ""
                        if (pollDate) {
                          const newOption: DatePollOption = {
                            id: Date.now().toString(),
                            date: pollDate,
                            time: pollTime,
                            label,
                            votes: [],
                          };
                          setFieldValue("datePoll.options", [...(values.datePoll?.options || []), newOption]);
                          setTempPollOption({ id: "", date: "", time: "", label: "" });
                          setPollDate("")
                          setPollTime("")
                          onPollModalClose();
                        }
                      }}
                    >
                      Add
                    </Button>
                    <Button variant="unstyled" onClick={() => { setPollDate(""); setPollTime(""); onPollModalClose(); }}>Cancel</Button>
                  </Flex>
                </ModalFooter>
              </ModalContent>
            </Modal>

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
                      <Flex flexDirection="column" w="full" gap="3">
                        <Button
                          bg="#F79432"
                          w="full"
                          color="black"
                          mr={3}
                          onClick={() => {
                            if (
                              editIndex === null &&
                              tempTicket.title &&
                              tempTicket.price
                            ) {
                              push({
                                ...tempTicket,
                                id: new Date().getTime().toString(),
                              });
                              setTempTicket({
                                id: "",
                                title: "",
                                description: "",
                                price: 0,
                              });
                            } else if (editIndex !== null) {
                              replace(editIndex, tempTicket);
                            }
                            onClose();
                          }}
                        >
                          {editIndex !== null ? "Update" : "Add"}
                        </Button>
                        <Button
                          variant="unstyled"
                          onClick={() => {
                            setTempTicket({
                              id: "",
                              title: "",
                              description: "",
                              price: 0,
                            });
                            onClose();
                          }}
                        >
                          Cancel
                        </Button>
                      </Flex>
                    </ModalFooter>
                  </ModalContent>
                </Modal>
              )}
            </FieldArray>
          </Form>
        )}
      </Formik>

      {/* Post-creation invite prompt */}
      <Modal isOpen={isSuccessOpen} onClose={() => { onSuccessClose(); navigation.push(`/console/events/${createdEventId}/manage`); }} isCentered size="md">
        <ModalOverlay />
        <ModalContent bg="#1E1E1E" color="white">
          <ModalHeader>🎉 Event Created!</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={2}>
            <Text mb={2}>Your event is live. Would you like to invite friends or Jetzy users now?</Text>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              variant="ghost"
              color="gray.400"
              _hover={{ bg: "#2a2a2a" }}
              onClick={() => { onSuccessClose(); navigation.push(`/console/events/${createdEventId}/manage`); }}
            >
              Go to Manage
            </Button>
            <Button
              bg="#F79432"
              color="black"
              _hover={{ bg: "#f78c22" }}
              _active={{ bg: "#e67a10" }}
              onClick={() => { onSuccessClose(); navigation.push(`/console/events/${createdEventId}/manage?invite=true`); }}
            >
              Invite Friends
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ConsoleLayout>
  );
};

export default CreateEventPage;
