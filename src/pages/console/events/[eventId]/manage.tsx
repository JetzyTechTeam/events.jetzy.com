'use client'
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
} from "@chakra-ui/react";
import { DateTime } from "luxon";
import axios from "axios";

export default function Manage({ event }: any) {
  event = JSON.parse(event);

  const [shareModal, setShareModal] = useState(false);
  const [inviteGuestsModal, setInviteGuestsModal] = useState(false);

  return (
    <ConsoleLayout page={event.name}>
      <div className="flex items-center justify-between gap-x-5 mb-10">
        <div
          className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300"
          onClick={() => setInviteGuestsModal(true)}
        >
          <p className="font-bold">Invite Guests</p>
        </div>
        <div className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300">
          <p className="font-bold">Send a Blast</p>
        </div>
        <div
          className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300"
          onClick={() => setShareModal(true)}
        >
          <p className="font-bold">Share Event</p>
        </div>
      </div>

      {/* INVITE GUESTS MODAL  */}
      <InviteGuestsModal
        inviteGuestsModal={inviteGuestsModal}
        setInviteGuestsModal={setInviteGuestsModal}
        event={event}
      />

      {/* SHARE MODAL  */}
      <ShareModal
        shareModal={shareModal}
        setShareModal={setShareModal}
        eventSlug={event.slug}
      />
      <div className="flex flex-col h-full gap-y-5">
        <div className="w-full h-[30rem] object-cover object-top rounded-2xl">
          <img
            src={event.images}
            alt={event.name}
            className="w-full h-[30rem] object-cover object-top rounded-2xl"
          />
        </div>
        <div className="bg-white rounded-xl p-3 flex flex-col gap-y-3">
          <h4>When & Where</h4>
          <p className="font-semibold">
            <span className="text-gray-500">At:</span> {event.location}
          </p>
          <EventDateTime iso={event.startsOn} label="From:" />
          <EventDateTime iso={event.endsOn} label="To:" />
        </div>
      </div>
    </ConsoleLayout>
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
    <Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={step === 2 ? "2xl" : "sm"}>
      <ModalOverlay />
      <ModalContent>
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
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    isInvalid={!!emailError}
                  />
                  <Button colorScheme="blue" onClick={handleAddEmail}>
                    Add
                  </Button>
                </Flex>
                {emailError && <Text color="red.500" fontSize="sm">{emailError}</Text>}
                {emails.length > 0 && (
                  <Box mt={2}>
                    <Text fontWeight="bold">Inviting {emails.length} Emails:</Text>
                    <UnorderedList>
                      {emails.map((email) => (
                        <ListItem key={email}>
                          <Flex align="center" justify="space-between">
                            <span>{email}</span>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              ml={2}
                              onClick={() => setEmails(emails.filter(e => e !== email))}
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
                  colorScheme="blue"
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
                <Flex align="flex-start" justify="space-between" gap={6} flexWrap="wrap">
                  <Box flex="1">
                    <Heading as="h4" size="md" mb={2}>
                      Review Invited Emails
                    </Heading>
                    <Text fontWeight="bold" mb={2}>
                      Here are the emails you have entered:
                    </Text>
                    <UnorderedList pl={5}>
                      {emails.map((email) => (
                        <ListItem key={email}>{email}</ListItem>
                      ))}
                    </UnorderedList>
                  </Box>
                  <Box borderWidth="1px" borderRadius="xl" p={4} flex="1" minW="300px">
                    <Text fontWeight="bold" mb={2}>
                      Hi, Jetzy Events invite you to join {event.name}.
                    </Text>
                    <Textarea
                      rows={3}
                      placeholder="Enter a custom message here..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      mb={2}
                    />
                    <Text fontWeight="bold" mb={1}>
                      RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}
                    </Text>
                    <Text fontSize="sm">
                      We will send guests an invitation link to register for the event.
                    </Text>
                  </Box>
                </Flex>
                <Flex mt={6} justify="space-between">
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    colorScheme="blue"
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
      <ModalContent>
        <ModalHeader>Share Event</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box display="flex" flexDirection="column" gap={3}>
            <Text fontWeight="bold">Share the link:</Text>
            <Box w="100%" borderWidth="1px" bg="gray.100" rounded="xl" p={2} wordBreak="break-all">
              {sharelink}
            </Box>
            <Button onClick={onCopy} colorScheme="blue">
              {copied ? "Copied!" : "Copy"}
            </Button>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function EventDateTime({ iso, label }: { iso: string; label: string }) {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    setFormatted(
      DateTime.fromISO(iso)
        .setZone("America/New_York")
        .toLocaleString(DateTime.DATETIME_MED)
    );
  }, [iso]);
  return (
    <p className="font-semibold">
      <span className="text-gray-500">{label}</span> {formatted}
    </p>
  );
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
