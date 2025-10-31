import React from "react"
import { Box, Container, Flex, HStack } from "@chakra-ui/react"
import Link from "next/link"
import NextImage from "next/image"
import JetzyLogo from "@Jetzy/assets/logo/jetzy_logo.png"
import FacebookIcon from "@Jetzy/assets/socials/Facebook.png"
import InstagramIcon from "@Jetzy/assets/socials/Instagram.png"
import TikTokIcon from "@Jetzy/assets/socials/TikTok.png"
import XIcon from "@Jetzy/assets/socials/X.png"

const Footer: React.FC = () => {
	return (
		<Box bg="white" borderTop="1px" borderColor="gray.200" py={{ base: 4, md: 6 }} mt={8}>
			<Container maxW="1200px" px={{ base: 4, md: 6 }}>
				<Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "start", md: "center" }} gap={{ base: 6, md: 0 }}>
					<Flex direction={{ base: "column", md: "row" }} align={{ base: "start", md: "center" }} gap={{ base: 4, md: 6 }} flex={1}>
						<NextImage src={JetzyLogo} alt="Jetzy" width={80} height={24} />
						<HStack
							spacing={{ base: 3, md: 4 }}
							fontSize={{ base: "xs", md: "sm" }}
							color="gray.600"
							display={{ base: "grid", md: "flex" }}
							gridTemplateColumns={{ base: "1fr 1fr", md: "auto" }}
							gap={{ base: 2, md: 4 }}
						>
							<Link href="/dashboard">Dashboard</Link>
							<Link href="/events">Events</Link>
							<Link href="/about">About</Link>
							<Link href="/contact">Contact</Link>
						</HStack>
					</Flex>
					<HStack spacing={{ base: 2, md: 3 }} display={{ base: "none", md: "flex" }}>
						<Link href="https://facebook.com/jetzy" target="_blank">
							<NextImage src={FacebookIcon} alt="Facebook" width={20} height={20} />
						</Link>
						<Link href="https://x.com/jetzy" target="_blank">
							<NextImage src={XIcon} alt="X (Twitter)" width={20} height={20} />
						</Link>
						<Link href="https://instagram.com/jetzy" target="_blank">
							<NextImage src={InstagramIcon} alt="Instagram" width={20} height={20} />
						</Link>
						<Link href="https://tiktok.com/@jetzy" target="_blank">
							<NextImage src={TikTokIcon} alt="TikTok" width={20} height={20} />
						</Link>
					</HStack>
				</Flex>
			</Container>
		</Box>
	)
}

export default Footer
