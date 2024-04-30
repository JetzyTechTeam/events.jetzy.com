import React, { useState } from "react"
import ReactDOM from "react-dom"

import { PaymentElement, Elements, useStripe, useElements } from "@stripe/react-stripe-js"
import Spinner from "../misc/Spinner"

type CheckoutFormProps = {
  clientSecret: string
}

export const CheckoutForm = ({ clientSecret }: CheckoutFormProps) => {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setLoader] = React.useState<boolean>(false)

  const [errorMessage, setErrorMessage] = useState<string>()

  const handleSubmit = async (event: any) => {
    event.preventDefault()
    setLoader(true)
    if (elements == null) {
      return
    }

    // Trigger form validation and wallet collection
    const { error: submitError } = await elements.submit()
    if (submitError) {
      // Show error to your customer
      setErrorMessage(submitError?.message as string)
      return
    }

    // @ts-ignore
    const { error } = await stripe?.confirmPayment({
      //`Elements` instance that was used to create the Payment Element
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.href}?success=true`,
      },
    })

    if (error) {
      setLoader(false)
      // This point will only be reached if there is an immediate error when
      // confirming the payment. Show error to your customer (for example, payment
      // details incomplete)
      setErrorMessage(error?.message)
    } else {
      setLoader(false)
      // Your customer will be redirected to your `return_url`. For some payment
      // methods like iDEAL, your customer will be redirected to an intermediate
      // site first to authorize the payment, then redirected to the `return_url`.
    }
  }

  return (
    <form className="space-y-6 md:w-5/12 xs:w-full" onSubmit={handleSubmit}>
      <section className="bg-slate-300 space-y-4 p-3 rounded-lg">
        <PaymentElement />
      </section>
      <section className="bg-slate-300 space-y-4 p-3 rounded-lg">
        <button type="submit" disabled={!stripe || !elements || isLoading} className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app">
          {isLoading ? <Spinner /> : "Pay Now"}
        </button>
      </section>
      {/* Show error message to your customers */}
      {errorMessage && <div>{errorMessage}</div>}
    </form>
  )
}
