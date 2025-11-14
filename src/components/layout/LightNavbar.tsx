import React, { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { useSession, signOut } from "next-auth/react"
import JetzyLogo from "@/assets/logo/jetzy_logo.png"
import { BellIcon, UserCircleIcon } from "@heroicons/react/24/outline"
import { Menu } from "@headlessui/react"
import SignupModal from "@/components/misc/SignupModal"
import LoginModal from "@/components/misc/LoginModal"
import axios from "axios"
import { NotificationType } from "@/models/notification"

// Navigation items with authentication requirements
const navItems = [
	{ name: "Events", href: "/", requiresAuth: false },
	{ name: "Dashboard", href: "/console", requiresAuth: true },
	{ name: "My Events", href: "/console/events", requiresAuth: true },
	{ name: "Bookings", href: "/console/bookings", requiresAuth: true },
	{ name: "Create Event", href: "/console/events/create", requiresAuth: true },
]

const LightNavbar: React.FC = () => {
	const router = useRouter()
	const { data: session } = useSession()
	const user = session?.user
	const [isSignupModalOpen, setIsSignupModalOpen] = useState(false)
	const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
	const [notifications, setNotifications] = useState<any[]>([])
	const [unreadCount, setUnreadCount] = useState(0)
	const [isLoadingNotifications, setIsLoadingNotifications] = useState(false)

	// Fetch notifications on mount and when session changes
	useEffect(() => {
		if (session?.user) {
			fetchNotifications()
		}
	}, [session])

	// Fetch notifications from API
	const fetchNotifications = async () => {
		setIsLoadingNotifications(true)
		try {
			const response = await axios.get("/api/notifications")
			if (response.data.status) {
				setNotifications(response.data.data.notifications)
				setUnreadCount(response.data.data.unreadCount)
			}
		} catch (error) {
			console.error("Error fetching notifications:", error)
		} finally {
			setIsLoadingNotifications(false)
		}
	}

	// Get notification route based on type
	const getNotificationRoute = (notification: any): string => {
		const type = notification.type as NotificationType
		const resourceId = notification.resourceId

		switch (type) {
			case "event_invitation":
			case "event_update":
			case "event_reminder":
				return resourceId ? `/${resourceId}` : "/"
			case "waiting_list_approved":
			case "booking_confirmation":
				return "/console/bookings"
			case "group_invitation":
				return resourceId ? `/events/${resourceId}/group/accept` : "/console"
			case "event_comment":
				return resourceId ? `/${resourceId}#comments` : "/"
			case "admin_alert":
				return "/console"
			default:
				return "/"
		}
	}

	// Handle notification click
	const handleNotificationClick = async (notification: any) => {
		try {
			// Mark as read
			if (!notification.isRead) {
				await axios.post("/api/notifications/mark-read", {
					notificationId: notification._id,
				})
				// Update local state
				setNotifications((prev) => prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n)))
				setUnreadCount((prev) => Math.max(0, prev - 1))
			}
			// Navigate to the appropriate page
			const route = getNotificationRoute(notification)
			router.push(route)
		} catch (error) {
			console.error("Error marking notification as read:", error)
			// Navigate anyway
			const route = getNotificationRoute(notification)
			router.push(route)
		}
	}

	// Format time ago
	const formatTimeAgo = (date: string): string => {
		const now = new Date()
		const notificationDate = new Date(date)
		const diffInMs = now.getTime() - notificationDate.getTime()
		const diffInMinutes = Math.floor(diffInMs / 60000)

		if (diffInMinutes < 1) return "Just now"
		if (diffInMinutes < 60) return `${diffInMinutes}m`
		if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`
		if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d`
		return `${Math.floor(diffInMinutes / 10080)}w`
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

	// Filter navigation items based on authentication status
	const visibleNavItems = navItems.filter((item) => !item.requiresAuth || session)

	return (
		<nav className="bg-white border-b border-border-light sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between items-center h-16">
					{/* Logo */}
					<Link href="/" className="flex items-center gap-2">
						<Image src={JetzyLogo} alt="Jetzy" width={32} height={32} className="object-contain" />
						<span className="text-text-primary font-bold text-xl">Jetzy</span>
					</Link>

					{/* Navigation Links */}
					<div className="hidden md:flex items-center space-x-1">
						{visibleNavItems.map((item) => (
							<Link
								key={item.name}
								href={item.href}
								className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
									isActive(item.href) ? "text-primary-purple bg-primary-purple/10" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
								}`}
							>
								{item.name}
							</Link>
						))}
					</div>

					{/* Right Section */}
					<div className="flex items-center gap-4">
						{/* Notification Icon - Only show when logged in */}
						{session && (
							<Menu as="div" className="relative">
								<Menu.Button className="relative p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-background-gray transition-colors" aria-label="Notifications">
									<BellIcon className="w-6 h-6" />
									{unreadCount > 0 && (
										<span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">{unreadCount > 9 ? "9+" : unreadCount}</span>
									)}
								</Menu.Button>

								<Menu.Items className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-border-light focus:outline-none overflow-hidden z-50">
									{/* Header */}
									<div className="px-4 py-3 border-b border-border-light flex items-center justify-between">
										<h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
										{unreadCount > 0 && (
											<button
												onClick={async () => {
													try {
														await axios.post("/api/notifications/mark-all-read")
														setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
														setUnreadCount(0)
													} catch (error) {
														console.error("Error marking all as read:", error)
													}
												}}
												className="text-xs text-primary-purple hover:text-primary-dark font-medium"
											>
												Mark all read
											</button>
										)}
									</div>

									{/* Scrollable Notifications List */}
									<div className="max-h-96 overflow-y-auto">
										{isLoadingNotifications ? (
											<div className="px-4 py-8 text-center text-text-muted text-sm">Loading notifications...</div>
										) : notifications.length === 0 ? (
											<div className="px-4 py-8 text-center text-text-muted text-sm">No notifications yet</div>
										) : (
											notifications.map((notification) => (
												<Menu.Item key={notification._id}>
													{({ active }) => (
														<div
															onClick={() => handleNotificationClick(notification)}
															className={`px-4 py-3 border-b border-border-light last:border-b-0 cursor-pointer transition-colors ${active ? "bg-background-gray" : ""} ${
																!notification.isRead ? "bg-primary-purple/5" : ""
															}`}
														>
															<div className="flex gap-3">
																<div className="flex-shrink-0">
																	<div className="w-8 h-8 rounded-full bg-primary-purple/10 flex items-center justify-center">
																		<BellIcon className="w-4 h-4 text-primary-purple" />
																	</div>
																</div>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium text-text-primary mb-1">{notification.title}</p>
																	<p className="text-xs text-text-secondary line-clamp-2">{notification.message}</p>
																	<div className="flex items-center gap-2 mt-1">
																		<p className="text-xs text-text-muted">{formatTimeAgo(notification.createdAt)}</p>
																		{!notification.isRead && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
																	</div>
																</div>
															</div>
														</div>
													)}
												</Menu.Item>
											))
										)}
									</div>

									{/* Footer */}
									{notifications.length > 0 && (
										<div className="px-4 py-3 border-t border-border-light text-center">
											<Link href="/console/notifications" className="text-sm font-medium text-primary-purple hover:text-primary-dark">
												View all notifications
											</Link>
										</div>
									)}
								</Menu.Items>
							</Menu>
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
											<Link href="/console" className={`block px-4 py-2 text-sm ${active ? "bg-background-gray text-text-primary" : "text-text-secondary"}`}>
												Dashboard
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
					{visibleNavItems.map((item) => (
						<Link
							key={item.name}
							href={item.href}
							className={`block px-3 py-2 rounded-md text-base font-medium ${
								isActive(item.href) ? "text-primary-purple bg-primary-purple/10" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
							}`}
						>
							{item.name}
						</Link>
					))}
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
							<Menu as="div" className="relative ml-auto">
								<Menu.Button className="relative flex-shrink-0 rounded-full p-1 text-text-secondary hover:text-text-primary hover:bg-background-gray transition-colors" aria-label="Notifications">
									<BellIcon className="w-6 h-6" />
									{unreadCount > 0 && (
										<span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">{unreadCount > 9 ? "9+" : unreadCount}</span>
									)}
								</Menu.Button>

								<Menu.Items className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-border-light focus:outline-none overflow-hidden z-50">
									{/* Header */}
									<div className="px-4 py-3 border-b border-border-light flex items-center justify-between">
										<h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
										{unreadCount > 0 && (
											<button
												onClick={async () => {
													try {
														await axios.post("/api/notifications/mark-all-read")
														setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
														setUnreadCount(0)
													} catch (error) {
														console.error("Error marking all as read:", error)
													}
												}}
												className="text-xs text-primary-purple hover:text-primary-dark font-medium"
											>
												Mark all read
											</button>
										)}
									</div>

									{/* Scrollable Notifications List */}
									<div className="max-h-96 overflow-y-auto">
										{isLoadingNotifications ? (
											<div className="px-4 py-8 text-center text-text-muted text-sm">Loading notifications...</div>
										) : notifications.length === 0 ? (
											<div className="px-4 py-8 text-center text-text-muted text-sm">No notifications yet</div>
										) : (
											notifications.map((notification) => (
												<Menu.Item key={notification._id}>
													{({ active }) => (
														<div
															onClick={() => handleNotificationClick(notification)}
															className={`px-4 py-3 border-b border-border-light last:border-b-0 cursor-pointer transition-colors ${active ? "bg-background-gray" : ""} ${
																!notification.isRead ? "bg-primary-purple/5" : ""
															}`}
														>
															<div className="flex gap-3">
																<div className="flex-shrink-0">
																	<div className="w-8 h-8 rounded-full bg-primary-purple/10 flex items-center justify-center">
																		<BellIcon className="w-4 h-4 text-primary-purple" />
																	</div>
																</div>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium text-text-primary mb-1">{notification.title}</p>
																	<p className="text-xs text-text-secondary line-clamp-2">{notification.message}</p>
																	<div className="flex items-center gap-2 mt-1">
																		<p className="text-xs text-text-muted">{formatTimeAgo(notification.createdAt)}</p>
																		{!notification.isRead && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
																	</div>
																</div>
															</div>
														</div>
													)}
												</Menu.Item>
											))
										)}
									</div>

									{/* Footer */}
									{notifications.length > 0 && (
										<div className="px-4 py-3 border-t border-border-light text-center">
											<Link href="/console/notifications" className="text-sm font-medium text-primary-purple hover:text-primary-dark">
												View all notifications
											</Link>
										</div>
									)}
								</Menu.Items>
							</Menu>
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
		</nav>
	)
}

export default LightNavbar
