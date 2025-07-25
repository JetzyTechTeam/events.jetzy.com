import { DescriptionSVG, DotSVG, DottedLinesSVG, LocationSVG } from "@/assets/icons";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { authorizedOnly } from "@/lib/authSession";
import { Events } from "@/models/events";
import { IEvent } from "@/models/events/types";
import { Box, Button, Flex, FormControl, FormLabel, Heading, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, useToast } from "@chakra-ui/react";
import axios from "axios";
import { GetServerSideProps } from "next";
import Image from "next/image";
import React from "react";
import { useRouter } from "next/router"; 
import mongoose from "mongoose";

export default function GuestsInvited({ event }: { event: string }) {
  const data = JSON.parse(event) as IEvent;
  const [isModalOpen, setIsModalOpen] = React.useState(false); 
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState(''); 
  const [guestStatus, setGuestStatus] = React.useState<string | null>(null);
  const [isStatusLoading, setIsStatusLoading] = React.useState(true); 

  const toast = useToast();
  const router = useRouter();
  const { email } = router.query;

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchGuestStatus = async () => {
    if (!data?._id || !email) {
      setIsStatusLoading(false);
      return;
    }
    setIsStatusLoading(true);
    try {
      const response = await axios.get(`/api/guests/find-by-email?eventId=${data._id}&email=${email}`);
      setGuestStatus(response.data?.status || null); 
    } catch (err) {
      console.error("Failed to fetch guest status:", err);
      setGuestStatus(null);
    } finally {
      setIsStatusLoading(false);
    }
  };

  const handleRegister = async () => { 
    setIsLoading(true);
    setError(null);
    try {
       await axios.post(`/api/guests/invite/accept?eventId=${data._id}&email=${email}`, {
        name: name,
      });
      toast({
        title: "Registration Successful",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchGuestStatus();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || "Registration failed");
      toast({
        title: "Registration Failed",
        description: err.message || "An error occurred.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`/api/guests/invite/decline?eventId=${data._id}&email=${email}`);
      toast({
        title: "Invitation Declined",
        status: "info",
        duration: 3000,
        isClosable: true,
      });

      await fetchGuestStatus();
    } catch (err: any) {
      console.error("Decline failed:", err);
      setError(err.message || "Decline failed");
      toast({
        title: "Decline Failed",
        description: err.message || "An error occurred.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchGuestStatus();
  }, [data?._id, email]);

  const isAccepted = guestStatus === 'accepted';
  const isDeclined = guestStatus === 'declined';
  const isButtonDisabled = isLoading || isStatusLoading || isAccepted || isDeclined;

  return (
    <ConsoleLayout>
      <div className="max-w-5xl mx-auto flex gap-x-5">
        <div className="w-[360px]">
          <Image
            src={data.images[0]}
            alt={data.name}
            width={360}
            height={180}
            className="w-[360px] h-[180px] rounded-xl object-cover"
          />
          <Box className="mt-5 space-y-2">
            <Text className="text-base font-semibold">Hosted by</Text>
            <Text className="text-[15px] text-[#FFFFFFA3]">Jetzy Events</Text>
          </Box>
        </div>
        <div className="w-[760px]">
          <Heading className="text-[38px] font-semibold text-[#FFFFFFC2]">
            {data.name}
          </Heading>

          <Flex
            justifyContent="space-between"
            alignItems="center"
            className="relative bg-[#FFFFFF0A] rounded-xl mt-5 p-3"
          >
            <Box>
              <Box className="absolute top-11 left-4">
                <DottedLinesSVG />
              </Box>
              <Box color="#FFFFFFA3" mb="5">
                <Flex gap="3" alignItems="center">
                  <DotSVG />

                  <Text>Start</Text>
                </Flex>
              </Box>
              <Box color="#FFFFFFA3">
                <Flex gap="3" alignItems="center">
                  <DotSVG />
                  <Text>End</Text>
                </Flex>
              </Box>
            </Box>

            <Box className="space-y-2">
              <Flex gap={5} alignItems="center">
                <Box
                  bg="#1D1F23"
                  p="2"
                  rounded="lg"
                  w="80px"
                  textAlign="center"
                >
                  <Text>
                    {new Date(data.startsOn).toTimeString().slice(0, 5)}
                  </Text>
                </Box>
                <Box bg="#1D1F23" p="2" rounded="lg" w="175px">
                  <Text>
                    {new Date(data.startsOn).toISOString().slice(0, 10)}
                  </Text>
                </Box>
              </Flex>
              <Flex gap={5}>
                <Box
                  bg="#1D1F23"
                  p="2"
                  rounded="lg"
                  w="80px"
                  textAlign="center"
                >
                  <Text>
                    {new Date(data.endsOn).toTimeString().slice(0, 5)}
                  </Text>
                </Box>
                <Box bg="#1D1F23" p="2" rounded="lg" w="175px">
                  <Text>
                    {new Date(data.endsOn).toISOString().slice(0, 10)}
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Flex>

          <Flex alignItems='center' gap='2' bg='#FFFFFF0A' rounded='lg' p='3' mt='5'>
            <LocationSVG />
            <Text className="font-medium text-[#FFFFFFA3]">
              {data.location}
            </Text>
          </Flex>

          <Flex gap='2' bg='#FFFFFF0A' rounded='lg' p='3' mt='5'>
            <Box>
            <DescriptionSVG />
            </Box>
            <Text className="font-medium text-[#FFFFFFA3]">
              {data.desc.slice(0, 200)}...
            </Text>
          </Flex>

          <Flex gap={4} mt={5}>
            <Button colorScheme="orange" color='black' w='full' onClick={handleOpenModal} disabled={isButtonDisabled}> 
              Accept
            </Button>
            <Button bg='#3E3E3E' color='white' w='full' _hover={{ bg: '#3E3E3E'}} _active={{bg: '#3E3E3E'}} onClick={handleDecline} isLoading={isLoading} disabled={isButtonDisabled}>
              Decline
            </Button>
          </Flex>
        </div>
      </div>
      {/* Registration Modal */}
      <Modal isCentered isOpen={isModalOpen} onClose={handleCloseModal}>
        <ModalOverlay />
        <ModalContent bg='#1E1E1E'>
          <ModalHeader>
            <Heading fontSize={30}>Your Info</Heading>
            <Text fontSize={15} color='#A5A5A5'>Please provide your details to register</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input required bg='#090C10' border='1px solid #444444' placeholder="Full Name" value={name} 
                onChange={(e) => setName(e.target.value)}/>
            </FormControl>

            <FormControl mt={4}>
              <FormLabel>Email</FormLabel>
              <Input type="email" placeholder="Email Address" bg='#090C10' border='1px solid #444444' value={email} />
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button w='full' color='black' colorScheme="orange" mr={3} onClick={handleRegister} isLoading={isLoading} disabled={isLoading || isAccepted || isDeclined}>
              Register
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ConsoleLayout>
  );
}

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  const eventId = context.query.eventId as string;

  if (!eventId) return { props: {} };

  const event = await Events.findOne({ _id: new mongoose.Types.ObjectId(eventId), isDeleted: false });

  if (!event) return { props: {} };

  return {
    props: {
      event: JSON?.stringify(event),
    },
  };
};
