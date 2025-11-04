import React from "react"
import ConsoleNavbar from "./ConsoleNavbar"
import { ConsoleDashboardProps } from "@Jetzy/types"
import Link from "next/link"
import { BackArrowSVG } from "@/assets/icons"

export default function ConsoleLayout({ page, children, component, backBtn, maxW }: ConsoleDashboardProps) {
	return (
		<div className="min-h-full bg-background-light">
			{/* Navbar */}
			<ConsoleNavbar page={page} />
			<header className="bg-white shadow-sm border-b border-border-light">
				<div className={`mx-auto px-4 pt-6 pb-6 xs:px-6 lg:px-8 flex md:flex-row xs:flex-col justify-between gap-4 ${maxW ? maxW : "max-w-7xl"}`}>
					<div className="flex flex-col">
						{backBtn && (
							<Link href={backBtn as string} className="w-max mb-5">
								<div className="flex items-center gap-2 border border-border-gray rounded-lg px-3 py-2 hover:bg-background-gray transition-colors">
									<BackArrowSVG />
									<span className="text-text-primary text-sm font-medium">Back</span>
								</div>
							</Link>
						)}
						{page && <h1 className="text-3xl font-bold tracking-tight w-full text-text-primary">{page}</h1>}
					</div>
					{component}
				</div>
			</header>
			<main>
				<div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">{children}</div>
			</main>
		</div>
	)
}
