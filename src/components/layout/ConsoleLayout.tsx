import React from "react"
import ConsoleNavbar from "./ConsoleNavbar"
import { ConsoleDashboardProps } from "@Jetzy/types"

export default function ConsoleLayout({ page, children, component }: ConsoleDashboardProps) {
	return (
		<div className="min-h-full">
			{/* Navbar */}
			<ConsoleNavbar page={page} />
			<header className="bg-white shadow">
				<div className="mx-auto max-w-7xl px-4 py-6 xs:px-6 lg:px-8 flex md:flex-row xs:flex-col justify-between gap-4">
					<h1 className="text-3xl font-bold tracking-tight text-gray-900 w-full">{page}</h1>
					{component}
				</div>
			</header>
			<main>
				<div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8 ">{children}</div>
			</main>
		</div>
	)
}
