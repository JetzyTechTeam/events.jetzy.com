import { wrapper } from "@Jetzy/redux/stores"
import { Session } from "next-auth"
import { SessionProvider } from "next-auth/react"
import type { AppProps } from "next/app"
// import { QueryClient, QueryClientProvider } from "react-query"
import { Provider as ReduxProvider } from "react-redux"
import { ToastContainer } from "react-toastify"
import "flatpickr/dist/flatpickr.min.css"
import "@Jetzy/styles/globals.scss"
import "react-toastify/dist/ReactToastify.css"
import React from "react"
import { EdgeStoreProvider } from "@Jetzy/lib/edgestore"

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps<{ session: Session }>) {
	const { store, props } = wrapper.useWrappedStore(pageProps)
	React.useEffect(() => {}, [])
	return (
		<ReduxProvider store={store}>
			<SessionProvider session={session}>
				<ToastContainer position="top-center" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="light" />
				<EdgeStoreProvider>
					<Component {...pageProps} />
				</EdgeStoreProvider>
			</SessionProvider>
		</ReduxProvider>
	)
}
