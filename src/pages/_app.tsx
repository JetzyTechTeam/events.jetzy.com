import { wrapper } from "@Jetzy/redux/stores";
import { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import type { AppProps } from "next/app";
import { Provider as ReduxProvider } from "react-redux";
import { ToastContainer } from "react-toastify";
import "flatpickr/dist/flatpickr.min.css";
import "@Jetzy/styles/globals.scss";
import "react-toastify/dist/ReactToastify.css"
import "react-quill/dist/quill.snow.css";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import React from "react";
import { Analytics } from "@vercel/analytics/react";

import { ChakraProvider } from "@chakra-ui/react";
import ReactQueryProvider from "@/lib/react-query-provider";
import { GoogleAnalytics } from "@next/third-parties/google";
import SessionSync from "@Jetzy/components/auth/SessionSync";
import { AnalyticsProvider } from "@/contexts/AnalyticsContext";
import { useInAppNavigationTracking } from "@/lib/navigation";
import { useAppOriginTracking } from "@/lib/app-return";

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps<{ session: Session }>) {
  const { store, props } = wrapper.useWrappedStore(pageProps);
  // Counts client-side navigations so a Back button can tell "you came from somewhere on
  // Jetzy" from "this tab opened straight onto this page". Has to live here: counting inside
  // a page would miss every navigation that happened before that page mounted.
  useInAppNavigationTracking();
  // Remembers a mobile-app arrival for the rest of the visit, so the receipt can offer a way
  // back into the app. Same reason as above for living here: the marker is on the visit's first
  // URL, which is long gone by the time a checkout modal mounts.
  useAppOriginTracking();
  return (
    <ReactQueryProvider>
      <ReduxProvider store={store}>
        <Analytics />
        <SessionProvider session={session}>
          <SessionSync />
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
          <ChakraProvider>
            <AnalyticsProvider>
              <Component {...pageProps} />
              <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID as string} />
            </AnalyticsProvider>
          </ChakraProvider>
        </SessionProvider>
      </ReduxProvider>
    </ReactQueryProvider>
  );
}
