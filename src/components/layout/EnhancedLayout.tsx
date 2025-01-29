import { LayoutProps } from "@Jetzy/types"
import Head from "next/head"
import React from "react"

export default function EnhancedLayout({ children, title }: LayoutProps) {
	return (
		<>
			<Head>
				<title>{title ?? "Home"} | Jetzy - Events</title>
				<meta name="description" content="Jetzy - Events" />
				<link rel="icon" href="/favicon.ico" />
				<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
				{/* og image tags */}
				<meta property="og:image" content={`${process.env.NEXT_PUBLIC_URL}/imgs/logo.png`} />
				{/* og title  */}
				<meta property="og:title" content="Jetzy - Events" />
				{/* og description  */}
				<meta property="og:description" content="Jetzy - Events" />
				{/* og url  */}
				<meta property="og:url" content={process.env.NEXT_PUBLIC_URL} />
				{/* twitter card  */}
				<meta name="twitter:card" content="summary_large_image" />
				{/* twitter title  */}
				<meta name="twitter:title" content="Jetzy - Events" />
				{/* twitter description  */}
				<meta name="twitter:description" content="Jetzy - Events" />
				{/* twitter image  */}
				<meta name="twitter:image" content={`${process.env.NEXT_PUBLIC_URL}/imgs/logo.png`} />
			</Head>

			{/* Main Content */}
			<main className="w-full h-full">{children}</main>
		</>
	)
}
