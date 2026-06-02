import React, { Fragment, useState } from "react"
import { Disclosure, Menu, Transition } from "@headlessui/react"
import { Bars3Icon, BellIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { classNames } from "@Jetzy/lib/utils"
import { ConsoleNavbarProps, Pages, Roles } from "@Jetzy/types"
import Logo from "@Jetzy/assets/logo/logo.png"
import Image from "next/image"
import { ROUTES } from "@Jetzy/configs/routes"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/router"
import { useAppDispatch } from "@Jetzy/redux/stores"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import { getUserSlug } from "@Jetzy/lib/utils"
import QRCodeModal from "@Jetzy/components/events/QRCodeModal"

const navigation = [
	{ name: Pages.Dasshboard, href: ROUTES.dashboard.index },
	{ name: Pages.Events, href: ROUTES.dashboard.events.index },
	{ name: Pages.Bookings, href: ROUTES.dashboard.bookings.index },
	{ name: 'Analytics', href: '/console/analytics' },
	{ name: 'Create Event', href: ROUTES.dashboard.events.create },
]

export default function ConsoleNavbar({ page }: ConsoleNavbarProps) {
	// Logout user from system
	const { data: session } = useSession()
	const dispatch = useAppDispatch()

	const logout = () => {
		// Clear Redux session storage first
		dispatch(destroySession({}))
		// Then sign out
		signOut({ callbackUrl: "/" })
	}

	const user = {
		name: session?.user?.name || (session?.user as any)?.fullName || "User",
		email: session?.user?.email,
		imageUrl: session?.user?.image,
		id: (session?.user as any)?._id || (session?.user as any)?.id,
	}

	const firstName = user.name?.split(" ")[0] || ""
	const lastName = user.name?.split(" ").slice(1).join(" ") || ""
	const slug = getUserSlug({ firstName, lastName, _id: user.id })
	const profileHref = `/profile/${slug || user.id}`

	const { pathname } = useRouter()

	// @ts-ignore
	const userRole = session?.user?.role
	const userName = session?.user?.name || (session?.user as any)?.fullName
	const isSuperAdmin =
		userRole === "super admin" ||
		userName?.toLowerCase() === "super admin"
	const [isSignupQROpen, setIsSignupQROpen] = useState(false)
	const signupQRUrl = typeof window !== "undefined" ? `${window.location.origin}/jetzyqrsignup` : "/jetzyqrsignup"

	const navigation = [
		{ name: Pages.Dasshboard, href: ROUTES.dashboard.index },
		{ name: "Share Profile", href: profileHref },
		{ name: Pages.Events, href: ROUTES.dashboard.events.index },
		{ name: "Bookings", href: ROUTES.dashboard.bookings.index },
		{ name: "Analytics", href: "/console/analytics" },
		{ name: "Jetzy User Signup", href: "/jetzyqrsignup" },
		{ name: "Create Event", href: ROUTES.dashboard.events.create },
	]

	const filteredNavigation = isSuperAdmin
		? navigation.filter((item) => item.name !== Pages.Dasshboard)
		: [{ name: "Share Profile", href: profileHref }]

	return (
		<>
		<Disclosure as="nav" className="bg-gray-800">
			{({ open }) => (
				<>
					<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="flex h-16 items-center justify-between">
							<div className="flex items-center">
								<div className="flex-shrink-0">
									<Link href="/"><Image className="h-10 w-10 cursor-pointer" src={Logo} alt="Jetzy Events" /></Link>
								</div>
								<div className="hidden md:block">
									<div className="ml-10 flex items-baseline space-x-4">
										{filteredNavigation.map((item) =>
											item.name === "Jetzy User Signup" ? (
												<button
													key={item.name}
													onClick={() => setIsSignupQROpen(true)}
													className={classNames(
														"text-gray-300 hover:bg-gray-700 hover:text-white",
														"rounded-md px-3 py-2 text-sm font-medium",
													)}
												>
													{item.name}
												</button>
											) : (
												<Link
													key={item.name}
													href={item.href}
													className={classNames(
														pathname === item.href || item.name === page ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white",
														"rounded-md px-3 py-2 text-sm font-medium",
													)}
													aria-current={pathname === item.href || item.name === page ? "page" : undefined}
												>
													{item.name}
												</Link>
											)
										)}
									</div>
								</div>
							</div>
							<div className="hidden md:block">
								<div className="ml-4 flex items-center md:ml-6">
									<button
										type="button"
										className="relative rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
									>
										<span className="absolute -inset-1.5" />
										<span className="sr-only">View notifications</span>
										<BellIcon className="h-6 w-6" aria-hidden="true" />
									</button>

									{/* Profile dropdown */}
									<Menu as="div" className="relative ml-3">
										<div>
											<Menu.Button className="relative flex max-w-xs items-center rounded-full bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
												<span className="absolute -inset-1.5" />
												<span className="sr-only">Open user menu</span>
												{user.imageUrl ? (
													<img className="h-10 w-10 rounded-full object-cover" src={user.imageUrl} alt="" />
												) : (
													<div className="h-10 w-10 rounded-full bg-app flex items-center justify-center text-black font-bold text-xs uppercase">
														{user.name
															?.split(" ")
															.map((n: string) => n[0])
															.join("")
															.substring(0, 2)}
													</div>
												)}
											</Menu.Button>
										</div>
										<Transition
											as={Fragment}
											enter="transition ease-out duration-100"
											enterFrom="transform opacity-0 scale-95"
											enterTo="transform opacity-100 scale-100"
											leave="transition ease-in duration-75"
											leaveFrom="transform opacity-100 scale-100"
											leaveTo="transform opacity-0 scale-95"
										>
											<Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
												<Menu.Item>
													{({ active }) => (
														<div className="border-b border-gray-100 pb-1">
															<p className="text-[10px] font-bold text-gray-400 px-4 pt-2 uppercase tracking-wider">Signed in as</p>
															<p className="text-xs text-black px-4 font-semibold truncate">{user.name}</p>
															<p className="text-[10px] text-gray-500 px-4 pb-2 truncate">{user.email}</p>
														</div>
													)}
												</Menu.Item>
												<Menu.Item>
													{({ active }) => (
														<Link href={profileHref} className={classNames(active ? "bg-gray-100" : "", "block px-4 py-2 text-sm text-gray-700")}>
															Share Profile
														</Link>
													)}
												</Menu.Item>
												<Menu.Item>
													{({ active }) => (
														<a
															onClick={logout}
															data-analytics-ignore=""
															className={classNames("cursor-pointer", active ? "bg-gray-100" : "", "block px-4 py-2 text-sm text-red-600 font-medium")}
														>
															Logout
														</a>
													)}
												</Menu.Item>
											</Menu.Items>
										</Transition>
									</Menu>
								</div>
							</div>
							<div className="-mr-2 flex md:hidden">
								{/* Mobile menu button */}
								<Disclosure.Button className="relative inline-flex items-center justify-center rounded-md bg-gray-800 p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
									<span className="absolute -inset-0.5" />
									<span className="sr-only">Open main menu</span>
									{open ? <XMarkIcon className="block h-6 w-6" aria-hidden="true" /> : <Bars3Icon className="block h-6 w-6" aria-hidden="true" />}
								</Disclosure.Button>
							</div>
						</div>
					</div>

					<Disclosure.Panel className="md:hidden">
						<div className="space-y-1 px-2 pb-3 pt-2 sm:px-3">
							{filteredNavigation.map((item) =>
								item.name === "Jetzy User Signup" ? (
									<Disclosure.Button
										key={item.name}
										as="button"
										onClick={() => setIsSignupQROpen(true)}
										className={classNames(
											"text-gray-300 hover:bg-gray-700 hover:text-white",
											"block w-full text-left rounded-md px-3 py-2 text-base font-medium",
										)}
									>
										{item.name}
									</Disclosure.Button>
								) : (
									<Disclosure.Button
										key={item.name}
										as={Link}
										href={item.href}
										className={classNames(
											pathname === item.href || item.name === page ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white",
											"block rounded-md px-3 py-2 text-base font-medium",
										)}
										aria-current={pathname === item.href || item.name === page ? "page" : undefined}
									>
										{item.name}
									</Disclosure.Button>
								)
							)}
						</div>
						<div className="border-t border-gray-700 pb-3 pt-4">
							<div className="flex items-center px-5">
								<div className="flex-shrink-0">
									{user.imageUrl ? (
										<img className="h-10 w-10 rounded-full object-cover" src={user.imageUrl} alt="" />
									) : (
										<div className="h-10 w-10 rounded-full bg-app flex items-center justify-center text-black font-bold text-xs uppercase">
											{user.name
												?.split(" ")
												.map((n: string) => n[0])
												.join("")
												.substring(0, 2)}
										</div>
									)}
								</div>
								<div className="ml-3">
									<div className="text-base font-medium leading-none text-white">{user.name}</div>
									<div className="text-sm font-medium leading-none text-gray-400">{user.email}</div>
								</div>
								<button
									type="button"
									className="relative ml-auto flex-shrink-0 rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
								>
									<span className="absolute -inset-1.5" />
									<span className="sr-only">View notifications</span>
									<BellIcon className="h-6 w-6" aria-hidden="true" />
								</button>
							</div>
							<div className="mt-3 space-y-1 px-2">
								<Disclosure.Button
									as="button"
									onClick={logout}
									data-analytics-ignore=""
									className="block w-full text-left rounded-md px-3 py-2 text-base font-medium text-red-400 hover:bg-gray-700 hover:text-white"
								>
									Logout
								</Disclosure.Button>
							</div>
						</div>
					</Disclosure.Panel>
				</>
			)}
		</Disclosure>
		<QRCodeModal
			isOpen={isSignupQROpen}
			onClose={() => setIsSignupQROpen(false)}
			url={signupQRUrl}
			title="Jetzy User Signup"
		/>
		</>
	)
}
