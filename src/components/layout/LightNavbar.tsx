import React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { useSession, signOut } from "next-auth/react"
import JetzyLogo from "@/assets/logo/jetzy_logo.png"
import { BellIcon, UserCircleIcon } from "@heroicons/react/24/outline"
import { Menu } from "@headlessui/react"

const navItems = [
	{ name: "Dashboard", href: "/console" },
	{ name: "Events", href: "/" },
	{ name: "Bookings", href: "/console/bookings" },
	{ name: "Create Event", href: "/console/events/create" },
]

const LightNavbar: React.FC = () => {
	const router = useRouter()
	const { data: session } = useSession()
	const user = session?.user

	const isActive = (href: string) => {
		if (href === "/") {
			return router.pathname === "/"
		}
		return router.pathname.startsWith(href)
	}

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
						{navItems.map((item) => (
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
						{/* Notification Icon */}
						<button className="p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-background-gray transition-colors" aria-label="Notifications">
							<BellIcon className="w-6 h-6" />
						</button>

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
								<Link href="/login" className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
									Login
								</Link>
								<Link href="/signup" className="px-4 py-2 text-sm font-medium text-white bg-primary-purple hover:bg-primary-dark rounded-lg transition-colors">
									Sign Up
								</Link>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Mobile Navigation */}
			<div className="md:hidden border-t border-border-light">
				<div className="px-2 pt-2 pb-3 space-y-1">
					{navItems.map((item) => (
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
			</div>
		</nav>
	)
}

export default LightNavbar
