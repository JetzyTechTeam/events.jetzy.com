"use client";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { authorizedOnly } from "@/lib/authSession";
import { Events } from "@/models/events";
import { GetServerSideProps } from "next";
import React, { useEffect, useState } from "react";
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Input,
  Text,
  Textarea,
  useToast,
  Box,
  UnorderedList,
  ListItem,
  Flex,
  Heading,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Select,
} from "@chakra-ui/react";
import { DateTime } from "luxon";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  DateTimeSVG,
  LocationSVG,
  MessageSVG,
  UserPlusSVG,
} from "@/assets/icons";
import { ShareIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/router";

export default function Manage({ event }: any) {
  event = JSON.parse(event);

  const [shareModal, setShareModal] = useState(false);
  const [inviteGuestsModal, setInviteGuestsModal] = useState(false);
  const [sendBlastModal, setSendBlastModal] = useState(false);
  const router = useRouter();

  return (
    <>
      <ConsoleLayout
        page={event.name}
        component={
          <div>
            <Button
              bg="#3E3E3E"
              color="white"
              _hover={{ bg: "#323232" }}
              _active={{ bg: "#323232" }}
              onClick={() => router.push(`/console/events/${event._id}/update`)}
            >
              Edit Event
            </Button>
          </div>
        }
      >
        {/* INVITE GUESTS MODAL  */}
        <InviteGuestsModal
          inviteGuestsModal={inviteGuestsModal}
          setInviteGuestsModal={setInviteGuestsModal}
          event={event}
        />

        {/* SEND BLAST MODAL  */}
        <SendBlastModal
          sendBlastModal={sendBlastModal}
          setSendBlastModal={setSendBlastModal}
          event={event}
        />

        {/* SHARE MODAL  */}
        <ShareModal
          shareModal={shareModal}
          setShareModal={setShareModal}
          eventSlug={event.slug}
        />
        <Tabs variant="line">
          <TabList borderBottom="2px solid #9C9C9C">
            <Tab
              fontWeight="bold"
              color="#9C9C9C"
              _selected={{
                color: "#F79432",
                borderBottom: "2px solid #F79432",
              }}
            >
              Overview
            </Tab>
            <Tab
              fontWeight="bold"
              color="#9C9C9C"
              _selected={{
                color: "#F79432",
                borderBottom: "2px solid #F79432",
              }}
            >
              Guests
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <div className="flex items-center justify-between gap-x-5 mb-10">
                <div
                  className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
                  onClick={() => setInviteGuestsModal(true)}
                >
                  <UserPlusSVG />
                  <p className="font-bold text-[#9C9C9C]">Invite Guests</p>
                </div>
                <div
                  className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
                  onClick={() => setSendBlastModal(true)}
                >
                  <MessageSVG />
                  <p className="font-bold text-[#9C9C9C]">Send a Blast</p>
                </div>
                <div
                  className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
                  onClick={() => setShareModal(true)}
                >
                  <ShareIcon className="w-6 h-6 text-[#949494]" />
                  <p className="font-bold text-[#9C9C9C]">Share Event</p>
                </div>
              </div>
              <div className="flex h-full gap-x-5">
                <div className="w-[250px] h-[200px] object-cover object-top rounded-2xl">
                  <img
                    src={event.images[0]}
                    alt={event.name}
                    className="w-full h-full object-cover object-top rounded-2xl"
                  />
                </div>
                <div className="w-full">
                  <div className="p-3 flex flex-col gap-y-3 border-b border-[#585858] pb-10">
                    <h4 className="font-bold">When</h4>
                    <p className="font-semibold flex gap-x-2 items-center">
                      <DateTimeSVG stroke="#fff" />
                      {DateTime.fromISO(event.startsOn).toLocal().toFormat('EEE LLL dd yyyy hh:mm:ss a')} {event.timezone}
                     </p>
                  </div>
                  <div className="py-10 px-3 flex flex-col gap-y-3 border-b border-[#585858]">
                    <h4 className="font-bold">Where</h4>
                    <p className="font-semibold flex gap-x-2 items-center">
                      <LocationSVG stroke="#fff" />
                      {event.location}
                    </p>
                  </div>
                  <div className="p-3 flex flex-col gap-y-3">
                    <h4 className="font-bold">Description</h4>
                    <p className="font-semibold text-[#B5B6B7]">{event.desc}</p>
                  </div>
                </div>
              </div>
            </TabPanel>
            <TabPanel>
              {/* Guests list content goes here */}
              <div className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3">
                <GuestsList eventId={event._id} />
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </ConsoleLayout>
    </>
  );
}

function SendBlastModal({
  sendBlastModal,
  setSendBlastModal,
  event,
}: {
  sendBlastModal: boolean;
  setSendBlastModal: (sendBlastModal: boolean) => void;
  event: any;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toast = useToast();

  const onSendBlast = async () => {
    if (!status || !subject.trim() || !message.trim()) {
      setError("All fields are required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await axios.post("/api/send-blast", {
        event,
        message,
        subject,
        status,
        eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
      });

      toast({
        title: "Blast sent!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Failed to send blast.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
    setLoading(false);
    setSendBlastModal(false);
  };

  return (
    <Modal
      isOpen={sendBlastModal}
      onClose={() => setSendBlastModal(false)}
      isCentered
      size="xl"
    >
      <ModalOverlay />
      <ModalContent bg="#1E1E1E" color="white">
        <ModalHeader>Send a Blast</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box display="flex" flexDirection="column" gap={4}>
            <Text fontWeight="bold">Status</Text>
            <Select
              mb={4}
              placeholder="Select a Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              isRequired
              bg="#090C10"
              borderColor="#444444"
              color="white"
              _placeholder={{ color: "gray.400" }}
            >
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </Select>
            <h3 className="font-bold">Subject</h3>
            <Input
              type="text"
              placeholder="Enter a Subject here..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              mb={2}
              isRequired
              bg="#090C10"
              borderColor="#444444"
              color="white"
              _placeholder={{ color: "gray.400" }}
            />

            <h3 className="font-bold">Body</h3>
            <Textarea
              rows={5}
              placeholder="Enter your blast message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              mb={2}
              isRequired
              bg="#090C10"
              borderColor="#444444"
              color="white"
              _placeholder={{ color: "gray.400" }}
            />
            {error && <Text color="red.500">{error}</Text>}

            <Button
              size="lg"
              bg="#F79432"
              color="black"
              _hover={{ bg: "#f78c22" }}
              _active={{ bg: "#e67a10" }}
              isLoading={loading}
              onClick={onSendBlast}
            >
              Send Blast
            </Button>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function GuestsList({ eventId }: { eventId: string }) {
  const fetchGuests = async () => {
    const res = await axios.get("/api/guests-list", { params: { eventId } });
    return res.data || [];
  };

  const {
    data: guests = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["guests-list", eventId],
    queryFn: fetchGuests,
  });

  if (isLoading) {
    return <Text>Loading guests...</Text>;
  }
  if (isError) {
    return <Text color="red.500">Failed to load guests.</Text>;
  }
  if (!guests.length) {
    return <Text>No guests found.</Text>;
  }
  return (
    <Box className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3">
      <Flex fontWeight="bold" mb={2}>
        <Box flex="1">Email</Box>
        <Box flex="1">Status</Box>
        <Box flex="1">Invited At</Box>
      </Flex>
      {guests.map(
        (guest: { email: string; status: string; invitedAt: string }) => (
          <Flex key={guest.email} borderBottom="1px solid #4B4B4B" py={2}>
            <Box flex="1">{guest.email}</Box>
            <Box flex="1">{guest.status}</Box>
            <Box flex="1">
              {guest.invitedAt
                ? DateTime.fromISO(guest.invitedAt).toLocaleString(
                    DateTime.DATETIME_MED
                  )
                : "-"}
            </Box>
          </Flex>
        )
      )}
    </Box>
  );
}

function InviteGuestsModal({
  inviteGuestsModal,
  setInviteGuestsModal,
  event,
}: {
  inviteGuestsModal: boolean;
  setInviteGuestsModal: (inviteGuestsModal: boolean) => void;
  event: any;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const toast = useToast();

  const handleAddEmail = () => {
    const email = emailInput.trim();
    if (!email) {
      setEmailError("Please enter an email");
      return;
    }
    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email");
      return;
    }
    if (emails.includes(email)) {
      setEmailError("Email already added");
      return;
    }
    setEmails([...emails, email]);
    setEmailInput("");
    setEmailError("");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);

  const onSendInvitation = async () => {
    setLoading(true);
    try {
      await axios.post("/api/send-invites", {
        emails,
        message,
        subject: `Hi, Jetzy Events invite you to join ${event.name}!`,
        eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
        eventId: event._id,
      });
      setLoading(false);
      setStep(1);
      setEmails([]);
      setMessage("");
      setInviteGuestsModal(false);
      toast({
        title: "Invitations sent!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      setLoading(false);
      toast({
        title: "Failed to send invitations.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    if (!inviteGuestsModal) {
      setStep(1);
      setEmails([]);
      setMessage("");
      setEmailInput("");
      setEmailError("");
    }
  }, [inviteGuestsModal]);

  return (
    <Modal
      isOpen={inviteGuestsModal}
      onClose={() => setInviteGuestsModal(false)}
      isCentered
      size={step === 2 ? "4xl" : "2xl"}
    >
      <ModalOverlay />
      <ModalContent bg="#1E1E1E" color="white">
        <ModalHeader>
          {step === 1 ? "Invite Guests" : "Review Invited Emails"}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box display="flex" flexDirection="column" gap={4}>
            {step === 1 && (
              <>
                <Text fontWeight="bold">Invite your guests by email:</Text>
                <Flex gap={2}>
                  <Input
                    type="email"
                    placeholder="Enter your guest's email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    isInvalid={!!emailError}
                  />
                  <Button
                    bg="#F79432"
                    color="black"
                    _hover={{ bg: "#f78c22" }}
                    _active={{ bg: "#e67a10" }}
                    onClick={handleAddEmail}
                  >
                    Add
                  </Button>
                </Flex>
                {emailError && (
                  <Text color="red.500" fontSize="sm">
                    {emailError}
                  </Text>
                )}
                {emails.length > 0 && (
                  <Box mt={2}>
                    <Text fontWeight="bold">
                      Inviting {emails.length} Emails:
                    </Text>
                    <UnorderedList listStyleType="none" m="0" pt='2'>
                      {emails.map((email) => (
                        <ListItem
                          key={email}
                          className="bg-[#383838] p-2 rounded-lg"
                          my='2'
                        >
                          <Flex align="center" justify="space-between">
                            <span>{email}</span>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              ml={2}
                              onClick={() =>
                                setEmails(emails.filter((e) => e !== email))
                              }
                            >
                              x
                            </Button>
                          </Flex>
                        </ListItem>
                      ))}
                    </UnorderedList>
                  </Box>
                )}
                <Button
                  size="lg"
                  bg="#F79432"
                  color="black"
                  _hover={{ bg: "#f78c22" }}
                  _active={{ bg: "#e67a10" }}
                  mt={4}
                  isDisabled={emails.length === 0}
                  onClick={handleNext}
                  width="full"
                >
                  Next
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Flex
                  align="flex-start"
                  justify="space-between"
                  gap={6}
                  flexWrap="wrap"
                >
                  <Box flex="1">
                    <Text mb={2}>Here are the emails you have entered:</Text>
                    <UnorderedList pl={5}>
                      {emails.map((email) => (
                        <ListItem key={email}>{email}</ListItem>
                      ))}
                    </UnorderedList>
                  </Box>
                  <Box
                    borderWidth="1px"
                    borderRadius="xl"
                    p={4}
                    flex="1"
                    minW="300px"
                  >
                    <Text fontWeight="bold" mb={2}>
                      Hi, Jetzy Events invites you to join {event.name}.
                    </Text>
                    <Textarea
                      rows={3}
                      placeholder="Enter a custom message here..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      mb={2}
                    />
                    <Text fontWeight="bold" mb={1}>
                      RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}
                    </Text>
                    <Text fontSize="sm">
                      We will send guests an invitation link to register for the
                      event.
                    </Text>
                  </Box>
                </Flex>
                <Flex mt={4} mb={4} justify="space-between">
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    bg="#F79432"
                    color="black"
                    _hover={{ bg: "#f78c22" }}
                    _active={{ bg: "#e67a10" }}
                    isLoading={loading}
                    onClick={onSendInvitation}
                  >
                    Send Invitations
                  </Button>
                </Flex>
              </>
            )}
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function ShareModal({
  shareModal,
  setShareModal,
  eventSlug,
}: {
  shareModal: boolean;
  setShareModal: (shareModal: boolean) => void;
  eventSlug: string;
}) {
  const [copied, setCopied] = useState(false);

  const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`;

  const onCopy = () => {
    navigator.clipboard.writeText(sharelink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Modal isOpen={shareModal} onClose={() => setShareModal(false)} isCentered>
      <ModalOverlay />
      <ModalContent bg="#1E1E1E" color="white">
        <ModalHeader>Share Event</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box display="flex" flexDirection="column" gap={3}>
            <Text fontWeight="bold">Share the link:</Text>
            <Box
              w="100%"
              borderWidth="1px"
              bg="#090C10"
              borderColor="#444444"
              color="white"
              _placeholder={{ color: "gray.400" }}
              rounded="xl"
              p={2}
              wordBreak="break-all"
            >
              {sharelink}
            </Box>
            <Button
              onClick={onCopy}
              bg="#F79432"
              color="black"
              _hover={{ bg: "#f78c22" }}
              _active={{ bg: "#e67a10" }}
              size="lg"
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function EventDateTime({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    setFormatted(
      DateTime.fromISO(iso)
        .setZone("America/New_York")
        .toLocaleString(DateTime.DATETIME_MED)
    );
  }, [iso]);
  return <p className="font-semibold">{formatted}</p>;
}

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  const session = await authorizedOnly(context);
  if (!session) return session;

  const eventId = context.query.eventId as string;
  if (!eventId) return { props: {} };

  const event = await Events.findOne({ _id: eventId, isDeleted: false });

  if (!event) return { props: {} };

  return {
    props: {
      event: JSON?.stringify(event),
    },
  };
};
