import { GoogleAnalytics } from "@next/third-parties/google"
import { Html, Head, Main, NextScript } from "next/document"

export default function Document() {
	return (
		<Html lang="en">
			<Head>
				<meta name="description" content="Jetzy - Events" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<body className="bg-[#090C10] text-white">
      	<GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID as string} />
				<Main />
				<NextScript />
			</body>
		</Html>
	)
}
