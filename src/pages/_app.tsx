import { wrapper } from "@Jetzy/redux/stores"
import { Session } from "next-auth"
import { SessionProvider } from "next-auth/react"
import type { AppProps } from "next/app"
// import { QueryClient, QueryClientProvider } from "react-query"
import { Provider } from "react-redux"
import { ToastContainer } from "react-toastify"

import "@Jetzy/styles/globals.scss"
import "react-toastify/dist/ReactToastify.css"
import React from "react"
import { databaseConfig } from "@Jetzy/configs/databaseConfig"
import { EdgeStoreProvider } from "@Jetzy/lib/edgestore"

databaseConfig().catch((error) => console.error("Error connecting to the database: ", error))

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps<{ session: Session }>) {
	const { store, props } = wrapper.useWrappedStore(pageProps)
	React.useEffect(() => {}, [])
	return (
		<Provider store={store}>
			<SessionProvider session={session}>
				{/* <QueryClientProvider client={queryClient}> */}
				<ToastContainer position="top-center" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="light" />
				<EdgeStoreProvider>
					<Component {...pageProps} />
				</EdgeStoreProvider>
				{/* </QueryClientProvider> */}
			</SessionProvider>
		</Provider>
	)
}
