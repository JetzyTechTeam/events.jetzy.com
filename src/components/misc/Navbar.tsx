import React from "react";
import {
  Box,
  Heading,
  Button,
  Flex,
  Spacer,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { ROUTES } from "@/configs/routes";
import { useAppDispatch } from "@Jetzy/redux/stores";
import { destroySession } from "@Jetzy/redux/reducers/appSlice";
import { getUserSlug } from "@/lib/utils";
import { usePremiumStatus } from "@/hooks/usePremiumStatus";
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn";
import PremiumBadge from "@/components/premium/PremiumBadge";
import PremiumPaywallModal from "@/components/premium/PremiumPaywallModal";

type NavbarProps = {
  hideEventNav?: boolean;
};

const Navbar = ({ hideEventNav = false }: NavbarProps) => {
  const router = useRouter();
  const session = useSession();
  const dispatch = useAppDispatch();

  const authenticated = session.status === "authenticated";
  const user = session.data?.user;
  const userRole = (user as any)?.role;
  const isAdmin = userRole === "admin" || userRole === "super admin";
  const isUser = userRole === "user";
  const { isPremium } = usePremiumStatus();
  const [showPremiumPaywall, setShowPremiumPaywall] = React.useState(false);
  usePremiumSubscriptionReturn();

  return (
    <Box py={4} boxShadow="sm" position="sticky" top="0" zIndex="100" bg="gray.900" px={2}>
      <Flex align="center" gap={4}>
        <Heading
          size="md"
          cursor="pointer"
          onClick={() => router.push("/")}
          color="orange"
          flexShrink={0}
        >
          Jetzy Events
        </Heading>

        <Spacer />

        {authenticated ? (
          <Flex align="center" gap={3}>
            {/* Inline nav links for public user */}
            {isUser && !hideEventNav && (
              <Flex gap={1} display={{ base: "none", md: "flex" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  color="gray.300"
                  _hover={{ bg: "whiteAlpha.200", color: "white" }}
                  onClick={() => router.push(ROUTES.dashboard.events.index)}
                >
                  My Events
                </Button>
                <Button
                  size="sm"
                  bg="#F79432"
                  color="black"
                  _hover={{ bg: "#e58221" }}
                  onClick={() => router.push(ROUTES.dashboard.events.create)}
                >
                  + Create Event
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  color="gray.300"
                  _hover={{ bg: "whiteAlpha.200", color: "white" }}
                  onClick={() => router.push(ROUTES.dashboard.bookings.index)}
                >
                  Event Bookings
                </Button>
              </Flex>
            )}

            {/* Admin: Dashboard link */}
            {isAdmin && !hideEventNav && (
              <Button
                variant="ghost"
                size="sm"
                color="gray.300"
                _hover={{ bg: "whiteAlpha.200", color: "white" }}
                display={{ base: "none", md: "flex" }}
                onClick={() => router.push(ROUTES.dashboard.events.index)}
              >
                Dashboard
              </Button>
            )}

            {/* A guest's own tickets. Shown to admins too — they book events as well.
                Distinct from "Event Bookings" above, which is the host-side list. */}
            {!hideEventNav && (
              <Button
                variant="ghost"
                size="sm"
                color="gray.300"
                _hover={{ bg: "whiteAlpha.200", color: "white" }}
                display={{ base: "none", md: "flex" }}
                onClick={() => router.push(ROUTES.myBookings)}
              >
                My Bookings
              </Button>
            )}

            {/* Buy Jetzy Premium — only shown to non-members, sits right next to the profile menu */}
            {!isPremium && (
              <Button
                size="sm"
                bg="#F5C518"
                color="black"
                _hover={{ bg: "#E0B317" }}
                onClick={() => setShowPremiumPaywall(true)}
                leftIcon={<span style={{ fontSize: "13px" }}>⭐</span>}
                display={{ base: "none", sm: "flex" }}
              >
                Buy Jetzy Premium
              </Button>
            )}

            {/* User avatar menu */}
            <Menu>
              <MenuButton>
                <Flex align="center" gap={2}>
                  <Box position="relative">
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
                    {isPremium && <PremiumBadge variant="dot" />}
                  </Box>
                  <Text fontSize="sm" fontWeight="medium" color="gray.300" display={{ base: "none", md: "block" }}>
                    {user?.name || user?.email}
                  </Text>
                </Flex>
              </MenuButton>
              <MenuList bg="#1a1a1a" color="white" borderColor="gray.700">
                {/* Mobile-only nav items for public user */}
                {isUser && !hideEventNav && (
                  <>
                    <MenuItem bg="#1a1a1a" _hover={{ bg: "gray.700" }} display={{ base: "flex", md: "none" }} onClick={() => router.push(ROUTES.dashboard.events.index)}>
                      My Events
                    </MenuItem>
                    <MenuItem bg="#1a1a1a" _hover={{ bg: "gray.700" }} display={{ base: "flex", md: "none" }} onClick={() => router.push(ROUTES.dashboard.events.create)}>
                      Create Event
                    </MenuItem>
                    <MenuItem bg="#1a1a1a" _hover={{ bg: "gray.700" }} display={{ base: "flex", md: "none" }} onClick={() => router.push(ROUTES.dashboard.bookings.index)}>
                      Event Bookings
                    </MenuItem>
                  </>
                )}
                {isAdmin && !hideEventNav && (
                  <MenuItem bg="#1a1a1a" _hover={{ bg: "gray.700" }} display={{ base: "flex", md: "none" }} onClick={() => router.push(ROUTES.dashboard.events.index)}>
                    Dashboard
                  </MenuItem>
                )}
                {!hideEventNav && (
                  <MenuItem bg="#1a1a1a" _hover={{ bg: "gray.700" }} display={{ base: "flex", md: "none" }} onClick={() => router.push(ROUTES.myBookings)}>
                    My Bookings
                  </MenuItem>
                )}
                <MenuItem
                  bg="#1a1a1a"
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
                  bg="#1a1a1a"
                  _hover={{ bg: "gray.700" }}
                  color="red.400"
                  data-analytics-ignore=""
                  onClick={() => {
                    try { sessionStorage.removeItem("api_token") } catch {}
                    try { sessionStorage.removeItem("analytics_session_id") } catch {}
                    try { localStorage.removeItem("analytics_anon_id") } catch {}
                    try { localStorage.removeItem("events_location_pref") } catch {}
                    try { localStorage.removeItem("visitor_id") } catch {}
                    dispatch(destroySession({}));
                    signOut({ callbackUrl: "/" });
                  }}
                >
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
          </Flex>
        ) : (
          <Flex align="center" gap={4}>
            <Button
              bg="#F5C518"
              color="black"
              _hover={{ bg: "#E0B317" }}
              onClick={() => setShowPremiumPaywall(true)}
              leftIcon={<span style={{ fontSize: "13px" }}>⭐</span>}
              display={{ base: "none", sm: "flex" }}
            >
              Buy Jetzy Premium
            </Button>
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

      <PremiumPaywallModal
        isOpen={showPremiumPaywall}
        onClose={() => setShowPremiumPaywall(false)}
        returnTo={router.asPath}
      />
    </Box>
  );
};

export default Navbar;
