import React, { useMemo } from "react";
import { eventPath } from "@/lib/event-slug";
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
  Grid,
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
  Input,
} from "@chakra-ui/react";
import { calculateDistance } from "@/utils/distance";
import { getEventStatus, getStatusRank, STATUS_LABEL, EventStatus } from "@/utils/eventSort";
import { getEventZone } from "@/utils/eventTime";
import { IEvent } from "@/models/events/types";
import Pagination from "./Pagination";
import Navbar from "./Navbar";
import { useRouter } from "next/router";
import { ROUTES } from "@/configs/routes";
import { DateTimeSVG, LocationSVG } from "@/assets/icons";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import EventListingCard from "@/components/events/EventListingCard";


dayjs.extend(utc)
dayjs.extend(timezone)
import { stripHtml } from "@/utils/text";
import PremiumBadge from "@/components/premium/PremiumBadge";

type EventListProps = {
  items: IEvent[];
  pagination: {
    total: number;
    page: number;
    showing: number;
    limit: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  search?: string;
  onSearch?: (q: string) => void;
  /** "" = All. Server-side, so the total and pager describe the filtered set. */
  status?: EventStatus | "";
  onStatusChange?: (status: EventStatus | "") => void;
};

// Chips for the public list. Deliberately different from the console, where "Upcoming" means
// live-or-future: here LIVE is its own chip, so the four statuses are mutually exclusive and
// every event falls under exactly one. Labels come from STATUS_LABEL so they can never drift
// from the badges rendered on the cards themselves.
const STATUS_FILTERS: { key: EventStatus | ""; label: string }[] = [
  { key: "", label: "All" },
  { key: "live", label: STATUS_LABEL.live },
  { key: "future", label: STATUS_LABEL.future },
  { key: "past", label: STATUS_LABEL.past },
  { key: "tbd", label: STATUS_LABEL.tbd },
];

const EventList: React.FC<EventListProps> = ({ items, pagination, onPageChange, search, onSearch, status = "", onStatusChange }) => {
  const router = useRouter();

  const [inputValue, setInputValue] = React.useState(search ?? "");

  React.useEffect(() => { setInputValue(search ?? ""); }, [search]);

  const [locationState, setLocationState] = React.useState<"ASKING" | "GRANTED" | "SKIPPED" | "LOADING" | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ lat: number, lng: number } | null>(null);

  React.useEffect(() => {
    const stored = localStorage.getItem("events_location_pref");
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
      setLocationState("SKIPPED");
    }
  }, []);

  const handleAllowLocation = () => {
    setLocationState("LOADING");
    if (!navigator.geolocation) {
      setLocationState("SKIPPED");
      localStorage.setItem("events_location_pref", "SKIPPED");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(coords);
        setLocationState("GRANTED");
        localStorage.setItem("events_location_pref", JSON.stringify(coords));
      },
      (error) => {
        setLocationState("SKIPPED");
        localStorage.setItem("events_location_pref", "SKIPPED");
      }
    );
  };

  const handleSkipLocation = () => {
    setLocationState("SKIPPED");
    localStorage.setItem("events_location_pref", "SKIPPED");
  }

  const sortedItems = useMemo(() => {
    if (locationState !== "GRANTED" || !userLocation) {
      return items;
    }
    
    const now = Date.now();

    return [...items].sort((a, b) => {
      // Primary Sort: canonical bucket order (live -> future -> tbd -> past)
      const rankA = getStatusRank(a, now);
      const rankB = getStatusRank(b, now);
      if (rankA !== rankB) return rankA - rankB;

      // Within the same bucket, prefer nearer events (distance sort).
      const aLoc = a.coordinates;
      const bLoc = b.coordinates;

      const aHasCoords = aLoc?.lat != null && aLoc?.long != null;
      const bHasCoords = bLoc?.lat != null && bLoc?.long != null;

      // Events with Location appear above Events without Location
      if (aHasCoords && !bHasCoords) return -1;
      if (!aHasCoords && bHasCoords) return 1;

      // Sort by actual distance
      if (aHasCoords && bHasCoords) {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, aLoc.lat, aLoc.long);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, bLoc.lat, bLoc.long);
        if (distA !== distB) {
            return distA - distB;
        }
      }

      // Fallback: If both lack coordinates (or same distance), sort chronologically.
      const dateA = a.startsOn ? new Date(a.startsOn).getTime() : 0;
      const dateB = b.startsOn ? new Date(b.startsOn).getTime() : 0;

      // Past events: most recently ended first. Others: soonest first.
      return rankA === 3 ? dateB - dateA : dateA - dateB;
    });
  }, [items, locationState, userLocation]);

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
        <Flex
          mt={5}
          maxW="520px"
          bg="#1e1e1e"
          border="1px solid #434343"
          borderRadius="full"
          align="center"
          px={3}
          py="5px"
          gap={2}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: "4px" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch?.(inputValue)}
            placeholder="Search events, hosts, places..."
            bg="transparent"
            border="none"
            color="white"
            _placeholder={{ color: "gray.500" }}
            _focus={{ boxShadow: "none", border: "none" }}
            p={0}
            h="34px"
            flex={1}
          />
          <Button
            onClick={() => onSearch?.(inputValue)}
            bg="#F79432"
            color="black"
            borderRadius="full"
            px={6}
            h="34px"
            fontWeight="semibold"
            _hover={{ bg: "#e58221" }}
            flexShrink={0}
            size="sm"
          >
            Search
          </Button>
        </Flex>
      </Box>

      {/* `flex-wrap` so the chips stack on a phone instead of pushing the row wide. */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map(({ key, label }) => {
          const active = status === key;
          return (
            <button
              key={key || "all"}
              type="button"
              onClick={() => onStatusChange?.(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? "bg-white text-black"
                  : "bg-[#1E1E1E] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="8" flex={1}>
        {sortedItems.length === 0 && (
          <Box>
            <Text fontSize="xl" color="gray.500">
              {search
                ? `No events found for "${search}"`
                : status
                  ? `No ${STATUS_LABEL[status].toLowerCase()} events`
                  : "No events found"}
            </Text>
          </Box>
        )}
        {sortedItems.map((event) => (
          <EventListingCard key={event._id.toString()} event={event} />
        ))}
      </SimpleGrid>

      <Pagination
        totalItems={pagination.total}
        perPageItems={pagination.limit}
        pageNo={pagination.page}
        onPageChange={(page) => onPageChange?.(page)}
      />
    </Container>
  );
};

export default EventList;

