import { CheckoutForm } from "@Jetzy/components/form/CheckoutForm"
import Layout from "@Jetzy/components/layout/Layout"
import Spinner from "@Jetzy/components/misc/Spinner"
import { FetchEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { getTicketState } from "@Jetzy/redux/reducers/ticketsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { ArrowUturnUpIcon, CheckCircleIcon, CheckIcon } from "@heroicons/react/24/outline"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { useRouter } from "next/router"
import React from "react"
import { useSelector } from "react-redux"

export default function BuyEventTicketPage() {
  const navigation = useRouter()
  const { slug, success } = navigation.query
  const dispatcher = useAppDispatch()
  const { isFetching, data } = useAppSelector(getEventState)
  const { ticket } = useSelector(getTicketState)

  React.useEffect(() => {
    if (slug && typeof slug !== "undefined") {
      dispatcher(FetchEventThunk({ id: slug as string }))
    }
  }, [slug])

  const stripePromise = loadStripe(ticket?.configs?.stripe?.publishableKey as string)

  const options = {
    clientSecret: ticket?.configs?.stripe?.piSecret as string,
    // Fully customizable with appearance API.
    appearance: {
      /*...*/
    },
  }

  // go back to the previous page
  const handleBack = () => navigation?.back()

  return (
    <Layout>
      {isFetching ? (
        <div className="flex items-center justify-center p-5 w-full m-auto block">
          <Spinner classes="text-slate-100 h-10 w-10" />
        </div>
      ) : (
        <div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:text-left relative z-10">
          <div className="mb-4">
            <button className="bg-app text-white p-2 rounded-md flex gap-2 " onClick={handleBack}>
              <ArrowUturnUpIcon className="h-5 w-5 rotate-[-90deg]" /> Back
            </button>
          </div>

          {typeof success == "undefined" ? (
            <>
              <h1 className="text-white text-center text-2xl font-bold capitalized">Complete Payment</h1>
              <section className="flex items-center justify-center p-3">
                <Elements stripe={stripePromise} options={options}>
                  <CheckoutForm clientSecret={ticket?.configs?.stripe?.piSecret as string} />
                </Elements>
              </section>
            </>
          ) : (
            <>
              <h1 className="text-white text-center text-2xl font-bold capitalized">Complete Payment</h1>
              <section className="flex items-center justify-center p-3">
                <div className="p-4 bg-slate-200 text-slate-900 rounded-md">
                  <div className="flex items-center justify-center">
                    <CheckCircleIcon className="h-20 w-20 text-green-500" />
                  </div>
                  <h1 className="text-2xl font-bold text-center">Payment Successful</h1>
                  <p className="text-sm font-medium mt-4">Your payment was successful. You will receive an email shortly.</p>
                  {/* return home button */}
                  <div className="mt-4">
                    <button className="bg-app text-white p-2 rounded-md flex gap-2 m-auto block" onClick={() => navigation.push("/")}>
                      <ArrowUturnUpIcon className="h-5 w-5 rotate-[-90deg]" /> Return Home
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </Layout>
  )
}
