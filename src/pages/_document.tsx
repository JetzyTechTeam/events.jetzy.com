import { Html, Head, Main, NextScript } from "next/document"

export default function Document() {
	return (
		<Html lang="en">
			<Head>
				<meta name="description" content="Jetzy - Events" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<body className="bg-slate-900 backdrop-blur text-white">
				<Main />
				<NextScript />
			</body>
		</Html>
	)
}
