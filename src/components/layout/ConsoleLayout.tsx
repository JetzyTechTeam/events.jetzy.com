import React from "react"
import LightNavbar from "./LightNavbar"
import { ConsoleDashboardProps } from "@Jetzy/types"
import Link from "next/link"
import { BackArrowSVG } from "@/assets/icons"

export default function ConsoleLayout({ page, children, component, backBtn, maxW }: ConsoleDashboardProps) {
	return (
		<div className="min-h-full bg-background-light">
			{/* Navbar */}
			<LightNavbar />

			{/* Enhanced Header with Gradient Background */}
			<header className="relative bg-gradient-to-br from-white via-[#FAFAFF] to-[#F5F3FF] border-b border-border-light">
				{/* Subtle decorative elements */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div className="absolute top-0 right-0 w-96 h-96 bg-primary-purple/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
					<div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-light/10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
				</div>

				<div className={`relative mx-auto px-4 py-8 xs:px-6 lg:px-8 ${maxW ? maxW : "max-w-7xl"}`}>
					<div className="flex md:flex-row xs:flex-col justify-between items-start md:items-center gap-6">
						{/* Left Section: Back Button and Title */}
						<div className="flex flex-col gap-4 flex-1">
							{backBtn && (
								<Link href={backBtn as string} className="w-max group">
									<div className="flex items-center gap-2.5 border border-border-gray bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 hover:bg-white hover:border-primary-purple/30 hover:shadow-md transition-all duration-300">
										<div className="group-hover:-translate-x-1 transition-transform duration-300">
											<BackArrowSVG />
										</div>
										<span className="text-text-primary text-sm font-medium">Back</span>
									</div>
								</Link>
							)}

							{page && (
								<div className="flex items-center gap-3">
									{/* Decorative accent bar */}
									<div className="hidden sm:block w-1 h-12 bg-gradient-to-b from-primary-purple to-primary-light rounded-full"></div>

									<div className="flex flex-col">
										<h1 className="text-4xl font-bold tracking-tight text-text-primary bg-clip-text bg-gradient-to-r from-text-primary to-primary-dark">{page}</h1>
										<div className="h-1 w-16 bg-gradient-to-r from-primary-purple to-primary-light rounded-full mt-2"></div>
									</div>
								</div>
							)}
						</div>

						{/* Right Section: Action Components */}
						{component && <div className="flex items-center">{component}</div>}
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main>
				<div className={`mx-auto py-8 sm:px-6 lg:px-8 ${maxW ? maxW : "max-w-7xl"}`}>{children}</div>
			</main>
		</div>
	)
}
