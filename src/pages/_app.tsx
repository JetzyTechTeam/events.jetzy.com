import { wrapper } from "@Jetzy/redux/stores";
import { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import type { AppProps } from "next/app";
import { Provider as ReduxProvider } from "react-redux";
import { ToastContainer } from "react-toastify";
import "flatpickr/dist/flatpickr.min.css";
import "@Jetzy/styles/globals.scss";
import "react-toastify/dist/ReactToastify.css";
import React from "react";
import { EdgeStoreProvider } from "@Jetzy/lib/edgestore";
import { Analytics } from "@vercel/analytics/react";

import { ChakraProvider } from "@chakra-ui/react";
import ReactQueryProvider from "@/lib/react-query-provider";
import { GoogleAnalytics } from '@next/third-parties/google'

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps<{ session: Session }>) {
  const { store, props } = wrapper.useWrappedStore(pageProps);
  return (
    <ReactQueryProvider>
      <GoogleAnalytics gaId={process.env.GOOGLE_ANALYTICS_ID as string} />
      <ReduxProvider store={store}>
        <Analytics />
        <SessionProvider session={session}>
          <ToastContainer
            position="top-center"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
          <EdgeStoreProvider>
            <ChakraProvider>
              <Component {...pageProps} />
            </ChakraProvider>
          </EdgeStoreProvider>
        </SessionProvider>
      </ReduxProvider>
    </ReactQueryProvider>
  );
}
