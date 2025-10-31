import React from "react"
import { Box } from "@chakra-ui/react"

interface LayoutProps {
	children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
	return (
		<Box minH="100vh" bg="gray.50">
			{children}
		</Box>
	)
}

export default Layout
