import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { useSession, signOut } from "next-auth/react"
import { BellIcon, UserCircleIcon } from "@heroicons/react/24/outline"
import { Menu } from "@headlessui/react"
import SignupModal from "@/components/misc/SignupModal"
import LoginModal from "@/components/misc/LoginModal"
import CreateEventModal from "@/components/events/CreateEventModal"
import { useDisclosure } from "@chakra-ui/react"

// Navigation items with authentication requirements
const navItems = [
	{ name: "Events", href: "/", requiresAuth: false },
	{ name: "Dashboard", href: "/console", requiresAuth: true, adminOnly: true },
	{ name: "Seller Board", href: "/console/seller", requiresAuth: true, nonAdminOnly: true },
	{ name: "My Events", href: "/console/events", requiresAuth: true, adminOnly: true },
	{ name: "Bookings", href: "/console/bookings", requiresAuth: true, adminOnly: true },
	{ name: "Create Event", href: "#", requiresAuth: true, isModal: true },
]

const LightNavbar: React.FC = () => {
	const router = useRouter()
	const { data: session } = useSession()
	const user = session?.user
	const [isSignupModalOpen, setIsSignupModalOpen] = useState(false)
	const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const handleEventCreated = () => {
		// Navigate to events page after creation
		router.push("/console/events")
	}

	const isActive = (href: string) => {
		if (href === "/") {
			// Highlight "Events" for home page and event detail pages ([slug])
			return router.pathname === "/" || router.pathname === "/[slug]"
		}
		// Exact match for /console to avoid matching /console/events
		if (href === "/console") {
			return router.pathname === "/console"
		}
		// Check for /console/events pages (index, create, update, manage, etc.)
		if (href === "/console/events") {
			return router.pathname.startsWith("/console/events")
		}
		return router.pathname.startsWith(href)
	}

	// @ts-ignore
	const userRole = session?.user?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	// Filter navigation items based on authentication status and role
	const visibleNavItems = navItems.filter((item: any) => {
		// Always show public items
		if (!item.requiresAuth) return true
		
		// If item requires auth, check if user is logged in
		if (!session) return false

		// If item is admin only, check if user is admin
		if (item.adminOnly && !isAdmin) return false

		// If item is non-admin only, hide it for admins
		if (item.nonAdminOnly && isAdmin) return false

		return true
	})

	return (
		<nav className="bg-white border-b border-border-light sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between items-center h-16">
					{/* Logo */}
					<Link href="/" className="flex items-center gap-2">
						<Image 
							src="/imgs/jetzy%20logo%20%282%29.png" 
							alt="Jetzy Logo" 
							width={32} 
							height={32} 
							className="object-contain"
							priority
						/>
						<span className="text-text-primary font-bold text-xl">Jetzy</span>
					</Link>

					{/* Navigation Links */}
					<div className="hidden md:flex items-center space-x-1">
						{visibleNavItems.map((item) => {
							if (item.isModal) {
								return (
									<button
										key={item.name}
										onClick={onCreateModalOpen}
										className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-background-gray"
									>
										{item.name}
									</button>
								)
							}
							return (
								<Link
									key={item.name}
									href={item.href}
									className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
										isActive(item.href) ? "text-primary-purple bg-primary-purple/10" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
									}`}
								>
									{item.name}
								</Link>
							)
						})}
					</div>

					{/* Right Section */}
					<div className="flex items-center gap-4">
						{/* Notification Icon - Only show when logged in */}
						{session && (
							<button className="p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-background-gray transition-colors" aria-label="Notifications">
								<BellIcon className="w-6 h-6" />
							</button>
						)}

						{/* User Menu */}
						{session ? (
							<Menu as="div" className="relative">
								<Menu.Button className="flex items-center gap-2 p-2 rounded-full hover:bg-background-gray transition-colors">
									{user?.image ? <img src={user.image} alt={user.name || "User"} className="w-8 h-8 rounded-full object-cover" /> : <UserCircleIcon className="w-8 h-8 text-text-secondary" />}
								</Menu.Button>

								<Menu.Items className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-border-light py-1 focus:outline-none">
									<div className="px-4 py-2 border-b border-border-light">
										<p className="text-sm font-medium text-text-primary">{user?.name}</p>
										<p className="text-xs text-text-secondary truncate">{user?.email}</p>
									</div>
									<Menu.Item>
										{({ active }) => (
											<Link href={isAdmin ? "/console" : "/console/seller"} className={`block px-4 py-2 text-sm ${active ? "bg-background-gray text-text-primary" : "text-text-secondary"}`}>
												{isAdmin ? "Admin Dashboard" : "Seller Dashboard"}
											</Link>
										)}
									</Menu.Item>
									<Menu.Item>
										{({ active }) => (
											<button
												onClick={() => signOut({ callbackUrl: "/" })}
												className={`block w-full text-left px-4 py-2 text-sm ${active ? "bg-background-gray text-text-primary" : "text-text-secondary"}`}
											>
												Logout
											</button>
										)}
									</Menu.Item>
								</Menu.Items>
							</Menu>
						) : (
							<div className="flex items-center gap-3">
								<button onClick={() => setIsLoginModalOpen(true)} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
									Login
								</button>
								<button onClick={() => setIsSignupModalOpen(true)} className="px-4 py-2 text-sm font-medium text-white bg-primary-purple hover:bg-primary-dark rounded-lg transition-colors">
									Sign Up
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Mobile Navigation */}
			<div className="md:hidden border-t border-border-light">
				<div className="px-2 pt-2 pb-3 space-y-1">
					{visibleNavItems.map((item) => {
						if (item.isModal) {
							return (
								<button
									key={item.name}
									onClick={onCreateModalOpen}
									className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-text-secondary hover:text-text-primary hover:bg-background-gray"
								>
									{item.name}
								</button>
							)
						}
						return (
							<Link
								key={item.name}
								href={item.href}
								className={`block px-3 py-2 rounded-md text-base font-medium ${
									isActive(item.href) ? "text-primary-purple bg-primary-purple/10" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
								}`}
							>
								{item.name}
							</Link>
						)
					})}
				</div>

				{/* Mobile User Section */}
				{session ? (
					<div className="border-t border-border-light pt-4 pb-3">
						<div className="flex items-center px-5">
							<div className="flex-shrink-0">
								{user?.image ? <img src={user.image} alt={user.name || "User"} className="w-10 h-10 rounded-full object-cover" /> : <UserCircleIcon className="w-10 h-10 text-text-secondary" />}
							</div>
							<div className="ml-3">
								<div className="text-base font-medium text-text-primary">{user?.name}</div>
								<div className="text-sm font-medium text-text-secondary">{user?.email}</div>
							</div>
							<button className="ml-auto flex-shrink-0 rounded-full p-1 text-text-secondary hover:text-text-primary hover:bg-background-gray transition-colors" aria-label="Notifications">
								<BellIcon className="w-6 h-6" />
							</button>
						</div>
						<div className="mt-3 space-y-1 px-2">
							<button
								onClick={() => signOut({ callbackUrl: "/" })}
								className="w-full text-left block rounded-md px-3 py-2 text-base font-medium text-text-secondary hover:bg-background-gray hover:text-text-primary transition-colors"
							>
								Logout
							</button>
						</div>
					</div>
				) : (
					<div className="border-t border-border-light pt-4 pb-3 px-2 space-y-2">
						<button
							onClick={() => setIsLoginModalOpen(true)}
							className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-text-secondary hover:text-text-primary hover:bg-background-gray"
						>
							Login
						</button>
						<button onClick={() => setIsSignupModalOpen(true)} className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-primary-purple hover:bg-primary-purple/10">
							Sign Up
						</button>
					</div>
				)}
			</div>

			{/* Login Modal */}
			<LoginModal
				isOpen={isLoginModalOpen}
				onClose={() => setIsLoginModalOpen(false)}
				onSwitchToSignup={() => {
					setIsLoginModalOpen(false)
					setIsSignupModalOpen(true)
				}}
			/>

			{/* Signup Modal */}
			<SignupModal
				isOpen={isSignupModalOpen}
				onClose={() => setIsSignupModalOpen(false)}
				onSwitchToLogin={() => {
					setIsSignupModalOpen(false)
					setIsLoginModalOpen(true)
				}}
			/>

			{/* Create Event Modal */}
			<CreateEventModal 
				isOpen={isCreateModalOpen} 
				onClose={onCreateModalClose} 
				onEventCreated={handleEventCreated}
			/>
		</nav>
	)
}

export default LightNavbar
