import React, { Fragment } from "react"
import { Disclosure, Menu, Transition } from "@headlessui/react"
import { Bars3Icon, BellIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { classNames } from "@Jetzy/lib/utils"
import { ConsoleNavbarProps, Pages, Roles } from "@Jetzy/types"
import Logo from "@Jetzy/assets/logo/logo.png"
import Image from "next/image"
import { ROUTES } from "@Jetzy/configs/routes"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"

const navigation = [
	{ name: Pages.Dasshboard, href: ROUTES.dashboard.index },
	{ name: Pages.Events, href: ROUTES.dashboard.events.index },
	{ name: Pages.Bookings, href: ROUTES.dashboard.bookings.index },
	{ name: "Create Event", href: ROUTES.dashboard.events.create },
]

export default function ConsoleNavbar({ page }: ConsoleNavbarProps) {
	// Logout user from system
	const { data: session } = useSession()
	const logout = () => signOut({ callbackUrl: "/" })

	const user = {
		name: session?.user?.name,
		email: session?.user?.email,
		imageUrl: session?.user?.image,
	}

	// @ts-ignore
	const userRole = session?.user?.role

	const filteredNavigation = userRole === Roles.USER ? navigation.filter((item) => item.name === Pages.Dasshboard) : navigation

	return (
		<Disclosure as="nav" className="bg-white border-b border-border-light shadow-sm">
			{({ open }) => (
				<>
					<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="flex h-16 items-center justify-between">
							<div className="flex items-center">
								<div className="flex-shrink-0">
									<Image className="h-10 w-10" src={Logo} alt="Your Company" />
								</div>
								<div className="hidden md:block">
									<div className="ml-10 flex items-baseline space-x-4">
										{filteredNavigation.map((item) => (
											<Link
												key={item.name}
												href={item.href}
												className={classNames(
													item.name === page ? "bg-primary-purple text-white" : "text-text-secondary hover:bg-background-gray hover:text-text-primary",
													"rounded-md px-3 py-2 text-sm font-medium transition-colors",
												)}
												aria-current={item.name === page ? "page" : undefined}
											>
												{item.name}
											</Link>
										))}
									</div>
								</div>
							</div>
							<div className="hidden md:block">
								<div className="ml-4 flex items-center md:ml-6">
									<button
										type="button"
										className="relative rounded-full bg-background-gray p-2 text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-purple transition-colors"
									>
										<span className="absolute -inset-1.5" />
										<span className="sr-only">View notifications</span>
										<BellIcon className="h-5 w-5" aria-hidden="true" />
									</button>

									{/* Profile dropdown */}
									<Menu as="div" className="relative ml-3">
										<div>
											<Menu.Button className="relative flex max-w-xs items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-purple focus:ring-offset-2">
												<span className="absolute -inset-1.5" />
												<span className="sr-only">Open user menu</span>
												{user.imageUrl ? <img className="h-10 w-10 rounded-full" src={user.imageUrl} alt="" /> : <div className="h-10 w-10 rounded-full bg-background-gray" />}
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
											<Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-border-light">
												<Menu.Item>
													{({ active }) => (
														<div>
															<p className="text-xs text-text-primary font-medium px-4 pt-2">{user.name}</p>
															<p className="text-xs text-text-muted px-4 pb-2">{user.email}</p>
															<div className="border-t border-border-light"></div>
															<a
																onClick={logout}
																className={classNames("cursor-pointer", active ? "bg-background-gray" : "", "block px-4 py-2 text-sm text-text-primary hover:text-primary-purple transition-colors")}
															>
																Logout
															</a>
														</div>
													)}
												</Menu.Item>
											</Menu.Items>
										</Transition>
									</Menu>
								</div>
							</div>
							<div className="-mr-2 flex md:hidden">
								{/* Mobile menu button */}
								<Disclosure.Button className="relative inline-flex items-center justify-center rounded-md bg-background-gray p-2 text-text-secondary hover:bg-primary-purple hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-purple transition-colors">
									<span className="absolute -inset-0.5" />
									<span className="sr-only">Open main menu</span>
									{open ? <XMarkIcon className="block h-6 w-6" aria-hidden="true" /> : <Bars3Icon className="block h-6 w-6" aria-hidden="true" />}
								</Disclosure.Button>
							</div>
						</div>
					</div>

					<Disclosure.Panel className="md:hidden border-t border-border-light">
						<div className="space-y-1 px-2 pb-3 pt-2 sm:px-3">
							{filteredNavigation.map((item) => (
								<Disclosure.Button
									key={item.name}
									as="a"
									href={item.href}
									className={classNames(
										item.name === page ? "bg-primary-purple text-white" : "text-text-secondary hover:bg-background-gray hover:text-text-primary",
										"block rounded-md px-3 py-2 text-base font-medium transition-colors",
									)}
									aria-current={item.name === page ? "page" : undefined}
								>
									{item.name}
								</Disclosure.Button>
							))}
						</div>
						<div className="border-t border-border-light pb-3 pt-4">
							<div className="flex items-center px-5">
								<div className="flex-shrink-0">
									{user.imageUrl ? <img className="h-10 w-10 rounded-full" src={user.imageUrl} alt="" /> : <div className="h-10 w-10 rounded-full bg-background-gray" />}
								</div>
								<div className="ml-3">
									<div className="text-base font-medium leading-none text-text-primary">{user.name}</div>
									<div className="text-sm font-medium leading-none text-text-muted">{user.email}</div>
								</div>
								<button
									type="button"
									className="relative ml-auto flex-shrink-0 rounded-full bg-background-gray p-1 text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-purple transition-colors"
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
									className="w-full text-left block rounded-md px-3 py-2 text-base font-medium text-text-secondary hover:bg-background-gray hover:text-primary-purple transition-colors"
								>
									Logout
								</Disclosure.Button>
							</div>
						</div>
					</Disclosure.Panel>
				</>
			)}
		</Disclosure>
	)
}
