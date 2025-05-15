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
  Image,
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
} from "@chakra-ui/react";
import { Formik, Form, Field, FormikProps } from "formik";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { CreateEventFormData, Pages } from "@/types";
import moment from "moment-timezone";
import { usePlacesWidget } from "react-google-autocomplete";
import {
  DescriptionSVG,
  DotSVG,
  DottedLinesSVG,
  LocationSVG,
  PlusSVG,
  TicketSVG,
  UploadImageSVG,
  UserTickSVG,
} from "@/assets/icons";
import TimePicker from "@/components/form/TimePicker";
import DatePicker from "@/components/form/DatePicker";

const timezones = moment.tz.names().map((tz) => {
  const offset = moment.tz(tz).utcOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
  return {
    label: `(UTC${sign}${hours}:${minutes})`,
    value: tz,
  };
});

const initialValues = {
  eventName: "",
  startTime: "",
  startDate: "",
  endTime: "",
  endDate: "",
  location: "",
  description: "",
  requireApproval: false,
  tickets: [],
  image: "",
};

const CreateEventPage = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null);

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
  return (
    <ConsoleLayout
      page={Pages.CreateEvent}
      backBtn="/console/events"
      maxW="max-w-4xl"
    >
      <Formik
        initialValues={initialValues}
        onSubmit={(values) => {
          // handle submit
          console.log(values);
        }}
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
                  <Field
                    as={Input}
                    name="eventName"
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
                  />
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
                          onChange={(time) => console.log(time)}
                          placeholder="Start Time"
                        />
                      </FormControl>
                      <FormControl>
                        <TimePicker
                          onChange={(time) => console.log(time)}
                          placeholder="End Time"
                        />
                      </FormControl>
                    </Box>
                    <Box>
                      <FormControl mb="2">
                        <DatePicker
                          onChange={(date) => console.log(date)}
                          placeholder="Start Date"
                        />
                      </FormControl>
                      <FormControl>
                        <DatePicker
                          onChange={(date) => console.log(date)}
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
                      as={Input}
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
                      name="description"
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
                  <Flex align="center" justifyContent="space-between" mb={4}>
                    <Flex gap="3" alignItems="center">
                      <UserTickSVG />
                      <Text color="gray.400" mr={2}>
                        Require Approval
                      </Text>
                    </Flex>
                    <Switch
                      name="requireApproval"
                      isChecked={values.requireApproval}
                      onChange={() =>
                        setFieldValue(
                          "requireApproval",
                          !values.requireApproval
                        )
                      }
                    />
                  </Flex>
                  {/* <Divider orientation='horizontal' bgColor='#1B1F22' /> */}
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
                      p='0'
                    >
                      Add
                    </Button>
                  </Flex>
                </Box>
                <Button
                  type="submit"
                  mt="10"
                  bg="#F79432"
                  size="lg"
                  width="100%"
                  borderRadius="xl"
                  color="black"
                >
                  Create Event
                </Button>

                {/* Tickets Modal */}
                <Modal isOpen={isOpen} onClose={onClose} isCentered>
                  <ModalOverlay />
                  <ModalContent bg="#1E1E1E" color="white">
                    <ModalHeader>Add Ticket</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                      <FormControl mb={4}>
                        <FormLabel>Ticket Name</FormLabel>
                        <Input
                          placeholder="Enter ticket name"
                          bg="#090C10"
                          border="1px solid #444"
                        />
                      </FormControl>
                      <FormControl mb={4}>
                        <FormLabel>Description</FormLabel>
                        <Textarea
                          placeholder="Enter description"
                          bg="#090C10"
                          border="1px solid #444"
                        />
                      </FormControl>
                      <FormControl mb={4}>
                        <FormLabel>Price</FormLabel>
                        <Input
                          type="number"
                          placeholder="Enter price"
                          bg="#090C10"
                          border="1px solid #444"
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
                          onClick={onClose}
                        >
                          Add
                        </Button>
                        <Button variant="unstyled" onClick={onClose}>
                          Cancel
                        </Button>
                      </Flex>
                    </ModalFooter>
                  </ModalContent>
                </Modal>
              </Box>
              {/* Right Side: Image Upload/Preview */}
              <Box
                width="270px"
                height="133px"
                bg="#2B2B2B"
                borderRadius="lg"
                display="flex"
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                cursor="pointer"
                _hover={{ bg: "#3A3A3A" }}
              >
                <Box
                  bg="#2B2B2B"
                  borderRadius="full"
                  p={2}
                  mb={1}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                >
                  <UploadImageSVG />
                </Box>
                <Text fontSize="sm" color="gray.400">
                  Add Photo
                </Text>
              </Box>
            </Flex>
          </Form>
        )}
      </Formik>
    </ConsoleLayout>
  );
};

export default CreateEventPage;
