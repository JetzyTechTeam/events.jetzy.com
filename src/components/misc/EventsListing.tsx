import React, { useMemo } from "react";
import {
  Box,
  Image,
  Text,
  Stack,
  SimpleGrid,
  Container,
  useColorModeValue,
  Heading,
  Button,
  Flex,
  Spacer,
  Menu,
  MenuButton,
  Avatar,
  MenuList,
  MenuItem,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { calculateDistance } from "@/utils/distance";
import { IEvent } from "@/models/events/types";
import Pagination from "./Pagination";
import { useRouter } from "next/router";
import { ROUTES } from "@/configs/routes";
import { DateTimeSVG, LocationSVG } from "@/assets/icons";
import { signOut, useSession } from "next-auth/react";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { getUserSlug } from "@/lib/utils";


dayjs.extend(utc)
dayjs.extend(timezone)
import { stripHtml } from "@/utils/text";

interface EventCardProps {
  event: IEvent;
  onClick: (event: IEvent) => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {


  const { data: totals } = useQuery({
    queryKey: ["eventTotals", event._id],
    queryFn: () => axios.get(`/api/events/${event._id}/totals`),
  });

  const { data: session } = useSession();
  // @ts-ignore
  const isAdmin = session?.user?.role === "admin";

  const totalTickets = totals?.data?.totalTickets ?? 0;
  const uniqueGuests = totals?.data?.uniqueGuests ?? 0;

  // Calculate total available tickets for percentage
  const totalAvailableTickets = event.capacity ?? 0;

  const cardBg = useColorModeValue("#1e1e1e", "gray.700");
  const borderColor = useColorModeValue("#434343", "gray.600");

  // calculate the event creation date difference from now in days to a a new badge
  const eventDate = new Date(event.createdAt.toString());
  const currentDate = new Date();
  const diffTime = Math.abs(currentDate.getTime() - eventDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const location = event.location;

  const isNew = diffDays < 2;

  const { formattedDate, formattedTime } = useMemo(() => {
    if (!event?.startsOn) return { formattedDate: '', formattedTime: '' }

    const userTimeZone = event.timezone?.split(') ')[1]
    const date = dayjs.utc(event.startsOn).tz(userTimeZone)

    const formattedDate = date.format('MMMM DD, YYYY')
    const formattedTime = date.format('hh:mm A')

    return { formattedDate, formattedTime }
  }, [event.startsOn, event.timezone])

  return (
    <Box
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      overflow="hidden"
      bg={cardBg}
      boxShadow="lg"
      height='470'
      cursor="pointer"
      _hover={{
        transform: "scale(1.03)",
        transition: "transform 0.2s ease-in-out",
      }}
      onClick={() => onClick(event)}
    >
      <Box p="2" position="relative">
        <Image
          src={event.images[0]}
          alt={stripHtml(event.name)}
          objectFit="cover"
          w="100%"
          h="200px"
          rounded="lg"
        />
        {/* Benefits Overlay */}
        {event.benefits && event.benefits.trim() !== "" && (
          <Flex
            position="absolute"
            top="4"
            left="4"
            direction="column"
            gap="1"
            maxW="80%"
            zIndex="2"
          >
            {event.benefits
              .split(",")
              .map((b) => b.trim())
              .filter((b) => b !== "")
              .slice(0, 2) // Only show first 2 on small cards
              .map((benefit, index) => (
                <Box
                  key={index}
                  bg="#F79432"
                  backdropFilter="blur(4px)"
                  px="2"
                  py="0.5"
                  rounded="md"
                  color="black"
                  fontSize="xs"
                  fontWeight="bold"
                  border="1px"
                  borderColor="whiteAlpha.300"
                >
                  {benefit}
                </Box>
              ))}
          </Flex>
        )}
      </Box>
      <Box p="2">
        <Stack spacing="3">
          <Text fontSize="xl" fontWeight="bold" wordBreak="break-word" overflowWrap="anywhere">
            {stripHtml(event.name)}
          </Text>
          <Box h="24">
            <Text
              fontSize="sm"
              color="gray.500"
              suppressHydrationWarning
              display="flex"
              gap="2"
            >
              <DateTimeSVG />
              {!event?.startsOn && !event?.endsOn && event?.datePoll?.isActive 
                ? "Date to be decided (Polling)" 
                : event?.startsOn 
                ? `${formattedDate} ${formattedTime}`
                : "Date to be decided"}
            </Text>
            <Text
              fontSize="sm"
              color="gray.500"
              suppressHydrationWarning
              display="flex"
              gap="2"
              mt="2"
              wordBreak="break-word"
              overflowWrap="anywhere"
            >
              {event.locationDisclosedAfterBooking
                ? "📍 Location will be disclosed after registration"
                : <>
                    <span><LocationSVG /></span>
                    {location}
                  </>}
            </Text>
          </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between " mt=" 2">
            {/* Show tickets sold for admin users only */}
            {isAdmin && (
              <Box fontSize="sm" color="gray.400">
                <Text>Total people: {uniqueGuests}</Text>
                <Text>Total tickets: {totalTickets}</Text>
              </Box>
            )}

            <Box
              bg="#3E3E3E"
              w="max-content"
              px="2"
              py="1"
              rounded="lg"
              display="flex"
              justifyContent="end"
            >
              <Text className="uppercase text-xs font-semibold">get tickets</Text>
            </Box>
          </Box>


        </Stack>
      </Box>
    </Box>
  );
};

type EventListProps = {
  items: IEvent[];
  pagination: {
    total: number;
    page: number;
    showing: number;
    limit: number;
    totalPages: number;
  };
};
const EventList: React.FC<EventListProps> = ({ items, pagination }) => {
  const router = useRouter();

  const [locationState, setLocationState] = React.useState<"ASKING" | "GRANTED" | "SKIPPED" | "LOADING" | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ lat: number, lng: number } | null>(null);

  React.useEffect(() => {
    const stored = sessionStorage.getItem("events_location_pref");
    if (stored === "SKIPPED") {
      setLocationState("SKIPPED");
    } else if (stored) {
      try {
        const coords = JSON.parse(stored);
        setUserLocation(coords);
        setLocationState("GRANTED");
      } catch (e) {
        setLocationState("ASKING");
      }
    } else {
      setLocationState("ASKING");
    }
  }, []);

  const handleAllowLocation = () => {
    setLocationState("LOADING");
    if (!navigator.geolocation) {
      setLocationState("SKIPPED");
      sessionStorage.setItem("events_location_pref", "SKIPPED");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(coords);
        setLocationState("GRANTED");
        sessionStorage.setItem("events_location_pref", JSON.stringify(coords));
      },
      (error) => {
        setLocationState("SKIPPED");
        sessionStorage.setItem("events_location_pref", "SKIPPED");
      }
    );
  };

  const handleSkipLocation = () => {
    setLocationState("SKIPPED");
    sessionStorage.setItem("events_location_pref", "SKIPPED");
  }

  const sortedItems = useMemo(() => {
    if (locationState !== "GRANTED" || !userLocation) {
      return items;
    }
    
    const now = new Date();

    return [...items].sort((a, b) => {
      // 1. Check if event is Live or Ended
      const isALive = a.endsOn ? new Date(a.endsOn).getTime() >= now.getTime() : true;
      const isBLive = b.endsOn ? new Date(b.endsOn).getTime() >= now.getTime() : true;

      // Primary Sort: Live Events always appear above Ended Events
      if (isALive !== isBLive) {
        return isALive ? -1 : 1;
      }

      // 2. Both are in the same bucket (both live, or both ended). Check coordinates.
      const aLoc = a.coordinates;
      const bLoc = b.coordinates;
      
      const aHasCoords = aLoc?.lat != null && aLoc?.long != null;
      const bHasCoords = bLoc?.lat != null && bLoc?.long != null;
      
      // Secondary Sort: Events with Location appear above Events without Location
      if (aHasCoords && !bHasCoords) return -1;
      if (!aHasCoords && bHasCoords) return 1;

      // Tertiary Sort: Sort by actual distance
      if (aHasCoords && bHasCoords) {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, aLoc.lat, aLoc.long);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, bLoc.lat, bLoc.long);
        if (distA !== distB) {
            return distA - distB; 
        }
      } 
      
      // Fallback: If both lack coordinates (or have the exact same distance), sort chronologically
      const dateA = a.startsOn ? new Date(a.startsOn).getTime() : 0;
      const dateB = b.startsOn ? new Date(b.startsOn).getTime() : 0;
      
      // For Live events, closest upcoming date matters (Ascending)
      // For Ended events, most recently ended matters (Descending)
      return isALive ? dateA - dateB : dateB - dateA;
    });
  }, [items, locationState, userLocation]);

  const handleEventClick = (event: IEvent): void => {
    // Replace this with navigation or modal display for event details

    router.push(ROUTES.eventDetails.replace("[slug]", event.slug));
  };

  return (
    <Container
      maxW="container.lg"
      display={"flex"}
      flexDir={"column"}
      gap={2}
      justifyContent={"flex-start"}
      py={10}
      className="min-h-screen w-full"
    >
      <Modal isOpen={locationState === "ASKING" || locationState === "LOADING"} onClose={handleSkipLocation} isCentered closeOnOverlayClick={false}>
        <ModalOverlay backdropFilter="blur(5px)" bg="blackAlpha.700" />
        <ModalContent bg="#14161B" color="white" mx="4">
           <ModalHeader>Find Events Near You</ModalHeader>
           <ModalBody>
              Would you like to share your location so we can discover the best events physically closest to you?
           </ModalBody>
           <ModalFooter>
              <Button variant="ghost" color="gray.400" _hover={{ color: "white", bg: "whiteAlpha.200" }} mr={3} onClick={handleSkipLocation} isDisabled={locationState === "LOADING"}>
                 Skip
              </Button>
              <Button bg="#F79432" color="black" _hover={{ bg: "#e58221" }} onClick={handleAllowLocation} isLoading={locationState === "LOADING"}>
                 Allow Location
              </Button>
           </ModalFooter>
        </ModalContent>
      </Modal>

      <Navbar />
      <Box mb="6">
        <Heading>Discover Events</Heading>
        <Text pt="3">
          Discover exciting events where you can enjoy activities that match
          your interests and passions!
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="8" flex={1}>
        {sortedItems.length === 0 && (
          <Box>
            <Text fontSize="xl" color="gray.500">
              No events found
            </Text>
          </Box>
        )}
        {sortedItems.map((event) => (
          <EventCard
            key={event._id.toString()}
            event={event}
            onClick={handleEventClick}
          />
        ))}
      </SimpleGrid>

      <Pagination
        totalItems={pagination.total}
        perPageItems={items.length}
        pageNo={pagination.page}
        onPageChange={(page) => console.log(page)}
      />
    </Container>
  );
};

export default EventList;

const Navbar = () => {
  const router = useRouter();
  const session = useSession();

  const authenticated = session.status === "authenticated";
  const user = session.data?.user;

  return (
    <Box py={4} boxShadow="sm" position="sticky" top="0" zIndex="100">
      <Flex align="center">
        <Heading
          size="md"
          cursor="pointer"
          onClick={() => router.push("/")}
          color="orange"
        >
          Jetzy Events
        </Heading>

        <Spacer />

        {authenticated ? (
          <Menu>
            <MenuButton>
              <Flex align="center" gap={2}>
                {user?.image ? (
                  <img
                    className="h-8 w-8 rounded-full object-cover border border-gray-700"
                    src={user.image}
                    alt={user.name || ""}
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-app flex items-center justify-center text-black font-bold text-[10px] uppercase">
                    {user?.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .substring(0, 2)}
                  </div>
                )}
                <Text fontSize="sm" fontWeight="medium" color="gray.300">{user?.email}</Text>
              </Flex>
            </MenuButton>
            <MenuList bg="black" color="white">
              <MenuItem
                bg="black"
                _hover={{ bg: "gray.700" }}
                onClick={() => {
                  const userData = user as any;
                  const userId = userData?.id || userData?._id;
                  const firstName = userData?.name?.split(" ")[0] || "";
                  const lastName = userData?.name?.split(" ").slice(1).join(" ") || "";
                  const slug = getUserSlug({ firstName, lastName, _id: userId });
                  router.push(`/profile/${slug || userId}`);
                }}
              >
                Share Profile
              </MenuItem>
              <MenuItem
                bg="black"
                _hover={{ bg: "gray.700" }}
                onClick={() => {
                  // Clear session storage before logout
                  sessionStorage?.clear();
                  signOut({ callbackUrl: "/" });
                }}
              >
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        ) : (
          <Flex gap={4}>
            <Button
              variant="outline"
              colorScheme="orange"
              onClick={() => router.push("/login")}
            >
              Login
            </Button>
            <Button colorScheme="orange" onClick={() => router.push("/signup")}>
              Sign Up
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  );
};
