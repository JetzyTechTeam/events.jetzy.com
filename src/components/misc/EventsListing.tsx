import React, { useMemo } from "react";
import {
  Box,
  Image,
  Text,
  Stack,
  SimpleGrid,
  Container,
  useColorModeValue,
  Badge,
  Heading,
  Button,
  Flex,
  Spacer,
  Menu,
  MenuButton,
  Avatar,
  MenuList,
  MenuItem,
} from "@chakra-ui/react";
import { IEvent } from "@/models/events/types";
import Pagination from "./Pagination";
import { useRouter } from "next/router";
import { ROUTES } from "@/configs/routes";
import { DateTimeSVG, LocationSVG } from "@/assets/icons";
import { signOut, useSession } from "next-auth/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

type EventType = {
  id: number;
  name: string;
  date: string;
  image: string;
  details: string;
};

interface EventCardProps {
  event: IEvent;
  onClick: (event: IEvent) => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
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
  const date = new Date(event.startsOn);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);

  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);

  return { formattedDate, formattedTime };
}, [event.startsOn]);

  return (
    <Box
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      overflow="hidden"
      bg={cardBg}
      boxShadow="lg"
      cursor="pointer"
      _hover={{
        transform: "scale(1.03)",
        transition: "transform 0.2s ease-in-out",
      }}
      onClick={() => onClick(event)}
    >
      <Box p="2">
        <Image
          src={event.images[0]}
          alt={event.name}
          objectFit="cover"
          w="100%"
          h="200px"
          rounded="lg"
        />
      </Box>
      <Box p="2">
        <Stack spacing="3">
          <Text fontSize="xl" fontWeight="bold">
            {event.name}
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
              {formattedDate} {formattedTime}
            </Text>
            <Text
              fontSize="sm"
              color="gray.500"
              suppressHydrationWarning
              display="flex"
              gap="2"
              mt="2"
            >
              <span>
                <LocationSVG />
              </span>
              {location}
            </Text>
          </Box>
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
      <Navbar />
      <Box mb="6">
        <Heading>Discover Events</Heading>
        <Text pt="3">
          Discover exciting events where you can enjoy activities that match
          your interests and passions!
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="8" flex={1}>
        {items.length === 0 && (
          <Box>
            <Text fontSize="xl" color="gray.500">
              No events found
            </Text>
          </Box>
        )}
        {items.map((event) => (
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
                <Avatar
                  name={user?.name || "User"}
                  src={user?.image || ""}
                  size="sm"
                />
                {/* @ts-ignore */}
                <Text>{user?.email}</Text>
              </Flex>
            </MenuButton>
            <MenuList bg="black" color="white">
              <MenuItem
                bg="black"
                _hover={{ bg: "gray.700" }}
                onClick={() => router.push("/console")}
              >
                Dashboard
              </MenuItem>
              <MenuItem
                bg="black"
                _hover={{ bg: "gray.700" }}
                onClick={() => signOut({ callbackUrl: "/" })}
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
