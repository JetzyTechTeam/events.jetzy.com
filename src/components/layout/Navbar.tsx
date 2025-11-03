import React from "react"
import { Box, Container, Flex, HStack, Text, IconButton } from "@chakra-ui/react"
import Link from "next/link"
import NextImage from "next/image"
import { useRouter } from "next/router"
import JetzyLogo from "@Jetzy/assets/logo/jetzy_logo.png"

const Navbar: React.FC = () => {
	const router = useRouter()
	const currentPath = router.pathname

	// Navigation items with their paths
	const navItems = [
		{ label: "Dashboard", path: "/dashboard" },
		{ label: "Events", path: "/events" },
		{ label: "Bookings", path: "/bookings" },
		{ label: "Create Event", path: "/create-event" },
	]

	// Check if a nav item is active
	const isActive = (path: string) => {
		// Handle exact match for dashboard and other pages
		if (path === "/dashboard") {
			return currentPath === path
		}
		// For events, match both /events and /events/[eventId], as well as homepage
		if (path === "/events") {
			return currentPath === path || currentPath.startsWith("/events/") || currentPath === "/"
		}
		// For bookings
		if (path === "/bookings") {
			return currentPath === path || currentPath.startsWith("/bookings")
		}
		// For create-event
		if (path === "/create-event") {
			return currentPath === path
		}
		return currentPath === path
	}

	return (
		<Box position="fixed" top={0} left={0} right={0} bg="rgba(255, 255, 255, 0.85)" backdropFilter="blur(10px)" borderBottom="1px" borderColor="gray.200" py={0} zIndex={1000}>
			<Container maxW="1200px" px={{ base: 4, md: 6 }}>
				<Flex align="center" justify="space-between">
					<HStack spacing={8}>
						<Link href="/">
							<NextImage src={JetzyLogo} alt="Jetzy" width={100} height={32} style={{ cursor: "pointer" }} />
						</Link>
						<HStack spacing={6} display={{ base: "none", md: "flex" }}>
							{navItems.map((item) => {
								const active = isActive(item.path)
								return (
									<Link key={item.path} href={item.path}>
										<Text color={active ? "purple.600" : "gray.600"} cursor="pointer" _hover={{ color: "purple.600" }} fontSize="sm" fontWeight={active ? "semibold" : "medium"}>
											{item.label}
										</Text>
									</Link>
								)
							})}
						</HStack>
					</HStack>
					<HStack spacing={3}>
						<IconButton icon={<Text fontSize="lg">🔔</Text>} aria-label="Notifications" variant="ghost" size="sm" rounded="full" />
						<IconButton icon={<Text fontSize="lg">👤</Text>} aria-label="Profile" variant="ghost" size="sm" rounded="full" />
					</HStack>
				</Flex>
			</Container>
		</Box>
	)
}

export default Navbar
