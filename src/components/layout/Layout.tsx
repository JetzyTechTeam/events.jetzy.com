import KlookAffiliatePlugin from "@Jetzy/pages/plugins/KlookAffiliatePlugin"
import SendbirdChatbot from "@Jetzy/pages/plugins/SendbirdChatbot"
import { LayoutProps } from "@Jetzy/types"
import Head from "next/head"
import React from "react"

export default function Layout({ children, title }: LayoutProps) {
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
			<main className="flex xs:flex-col md:flex-row gap-4">
				<div className={` w-full   flex min-h-screen flex-col items-center justify-between md:p-24 xs:p-2  `}>
					<div className="fixed top-80 flex place-items-center before:absolute before:h-[300px] before:w-full sm:before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-3xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full sm:after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700/10 after:dark:from-sky-900 after:dark:via-[#0141ff]/40 before:lg:h-[360px]">
						{/* <Image className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70] dark:invert" src="/next.svg" alt="Next.js Logo" width={180} height={37} priority /> */}
					</div>
					<KlookAffiliatePlugin />

					{children}
				</div>
				{/* Plugins */}

				{/* <div className="xs:block md:fixed top-0 bottom-0 right-0   ">
					<div className="h-full w-full flex flex-col items-center justify-center">
						<KlookAffiliatePlugin />
					</div>
				</div> */}
			</main>

			{/* Sendbird chatbot */}
			<SendbirdChatbot />
		</>
	)
}
