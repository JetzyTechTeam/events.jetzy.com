import React from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Switch,
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
} from "@chakra-ui/react";
import {
  Formik,
  Form,
  Field,
  FormikProps,
  FieldArray,
} from "formik";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { CreateEventFormData, Pages, Roles } from "@/types";
import { usePlacesWidget } from "react-google-autocomplete";
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
import TimePicker from "@/components/form/TimePicker";
import DatePicker from "@/components/form/DatePicker";
import { Error } from "@/lib/_toaster";
import { CreateEventThunk } from "@/redux/reducers/eventsSlice";
import { useAppDispatch } from "@/redux/stores";
import { useRouter } from "next/router";
import { TicketData } from "@/components/events/TicketCard";
import { FileUploadData } from "@/components/misc/DragAndDropUploader";
import { useEdgeStore } from "@/lib/edgestore";
import { uniqueId } from "@/lib/utils";
import ImageUploadBox  from "../../../components/image-upload-box";
import TimezoneSelect from "../../../components/timezone-select";
import { useSession } from "next-auth/react";
import { z } from "zod";

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
};

const createEventSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  location: z.string().min(1, "Location is required"),
  desc: z.string().min(1, "Description is required"),
  startDate: z.string().min(1, "Start date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endDate: z.string().min(1, "End date is required"),
  endTime: z.string().min(1, "End time is required"),
});

const CreateEventPage = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const dispatcher = useAppDispatch();
  const navigation = useRouter();
  const { edgestore } = useEdgeStore(); 
  const { data: session } = useSession();
  const router = useRouter();

  const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null);

  const [uploadedImages, setUploadedImages] = React.useState<FileUploadData[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [isUploading, setIsUploading] = React.useState(false); 
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [tempTicket, setTempTicket] = React.useState<TicketData>({
    id: "",
    title: "",
    description: "",
    price: 0,
  });

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

  const onSubmit = (values: CreateEventFormData) => {
    const validation = createEventSchema.safeParse(values);

    if (!validation.success) {
      const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0];
      Error("Validation Error", firstError || "Please fix the form errors");
      return;
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

    values.images = uploadedImages;

    if (values.tickets.length > 0) values.isPaid = true
    else values.isPaid = false

    setIsSubmitting(true);

    dispatcher(CreateEventThunk({ data: { payload: JSON.stringify({...values, privacy: values.privacy}) } })).then((res: any) => {
    	if (res?.payload?.status) {
    		navigation.push(`/console/events/${res.payload.data._id}/manage`);
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
        console.log(`Uploading file ${i + 1} of ${files.length}: ${file.name}`);

        // Upload the current file
        const res = await edgestore.publicFiles.upload({
          file,
          onProgressChange: (progress) => {
            setUploadProgress(progress);
          },
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
      await edgestore.publicFiles.delete({ url: imageUrl });
      setUploadedImages((prevImages) =>
        prevImages.filter((img) => img.file !== imageUrl)
      );
    } catch (error: any) {
      console.error("Error deleting image", error);
      Error("Error", "Failed to delete image");
    } 
  };

  // @ts-ignore 
  if (session?.user?.role === Roles.USER) router.push('/console')

  return (
    <ConsoleLayout
      page={Pages.CreateEvent}
      backBtn="/console/events"
      maxW="max-w-4xl"
    >
      <Formik
        initialValues={initialValues as CreateEventFormData}
        onSubmit={onSubmit}
        innerRef={formikRef}
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
                  <Flex alignItems="center">
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

                    <TimezoneSelect />
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
                        />
                      </FormControl>
                      <FormControl>
                        <TimePicker
                          onChange={(time) =>
                            handleEndDateChange(undefined, time)
                          }
                          placeholder="End Time"
                        />
                      </FormControl>
                    </Box>
                    <Box>
                      <FormControl mb="2">
                        <DatePicker
                          onChange={(date) => handleStartDateChange(date)}
                          placeholder="Start Date"
                        />
                      </FormControl>
                      <FormControl>
                        <DatePicker
                          onChange={(date) => handleEndDateChange(date)}
                          placeholder="End Date"
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
                      rows="1"
                      pl="10"
                    />
                  </InputGroup>
                </FormControl>
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
                      onClick={onOpen}
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
                            key={index}
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
                  Create Event
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
              </Box>
              {/* Right Side: Image Upload/Preview */}
              <Box id="images" mb={6}>
                <FormLabel>Event Image</FormLabel>
                <ImageUploadBox
                  uploadedImages={uploadedImages} 
                  onImageChange={handleImageUpload}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  handleImageDelete={handleImageDelete}
                />
              </Box>
            </Flex>
          </Form>
        )}
      </Formik>
    </ConsoleLayout>
  );
};

export default CreateEventPage;