import Layout from "@Jetzy/components/layout/Layout"
import Spinner from "@Jetzy/components/misc/Spinner"
import TicketQuantityInput from "@Jetzy/components/misc/TicketQuantityInput"
import { EventInfoLoader } from "@Jetzy/components/placeholders/loader"
import { ROUTES } from "@Jetzy/configs/routes"
import { authorizedOnly } from "@Jetzy/lib/authSession"
import { ticketValidation } from "@Jetzy/lib/validator/event"
import { FetchEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { CreateTicketThunk, getTicketState } from "@Jetzy/redux/reducers/ticketsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { CreateTicketFormData } from "@Jetzy/types"
import { ArrowUturnUpIcon } from "@heroicons/react/24/outline"
import { ErrorMessage, Field, Form, Formik, FormikProps } from "formik"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import React from "react"

export default function EventTicketPage() {
  const formikRef = React.useRef<FormikProps<CreateTicketFormData>>(null)
  const navigation = useRouter()
  const { slug } = navigation.query
  const dispatcher = useAppDispatch()
  const { isFetching, data } = useAppSelector(getEventState)

  React.useEffect(() => {
    if (slug && typeof slug !== "undefined") {
      dispatcher(FetchEventThunk({ id: slug as string }))
    }
  }, [slug])

  const setTicketQuantity = (value: number) => {
    if (formikRef.current) {
      formikRef.current.setFieldValue("quantity", value)
    }
  }

  const { isLoading } = useAppSelector(getTicketState)

  const formInitData: CreateTicketFormData = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    event: data?._id as string,
    quantity: 1,
  }

  const handleSubmit = (value: CreateTicketFormData) => {
    dispatcher(CreateTicketThunk({ data: value })).then((res: any) => {
      if (res?.payload?.status) {
        navigation.push(ROUTES.events?.buyTicket?.replace(":slug", slug as string))
      }
    })
  }

  // go back to the previous page
  const handleBack = () => navigation?.back()

  return (
    <Layout>
      {isFetching ? (
        <EventInfoLoader />
      ) : (
        <div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:text-left relative z-10">
          <div className="mb-4">
            <button className="bg-app text-white p-2 rounded-md flex gap-2 " onClick={handleBack}>
              <ArrowUturnUpIcon className="h-5 w-5 rotate-[-90deg]" /> Back
            </button>
          </div>

          <h1 className="text-white text-center text-2xl font-bold capitalized">Ticket Reservation</h1>
          <section className="flex items-center justify-center p-3">
            <Formik innerRef={formikRef} initialValues={formInitData} onSubmit={handleSubmit} validationSchema={ticketValidation}>
              {({ values, handleChange }) => (
                <Form className="space-y-6 md:w-5/12 xs:w-full" action="#" method="POST">
                  <section className="bg-slate-300 space-y-4 p-3 rounded-lg">
                    <div className="border-b-2 border-b-slate-400 pb-2">
                      <h1 className="text-slate-800 font-semibold text-lg">Personal Details</h1>
                    </div>
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-semibold leading-6 text-gray-900">
                        First Name
                      </label>
                      <div className="mt-2">
                        <Field id="firstName" name="firstName" value={values?.firstName} onChange={handleChange} type="text" autoComplete="firstName" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="firstName" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="lastName" className="block text-sm font-semibold leading-6 text-gray-900">
                        Last Name
                      </label>
                      <div className="mt-2">
                        <Field id="lastName" name="lastName" value={values?.lastName} onChange={handleChange} type="text" autoComplete="lastName" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="lastName" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-semibold leading-6 text-gray-900">
                        Email
                      </label>
                      <div className="mt-2">
                        <Field id="email" name="email" value={values?.email} onChange={handleChange} type="email" autoComplete="email" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="email" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-semibold leading-6 text-gray-900">
                        Phone Number
                      </label>
                      <div className="mt-2">
                        <Field id="phone" name="phone" value={values?.phone} onChange={handleChange} type="tel" autoComplete="phone" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="phone" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-300 space-y-4 p-3 rounded-lg">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-semibold leading-6 text-gray-900">
                        Number of Tickets
                      </label>
                      <TicketQuantityInput amount={data?.amount} onChange={setTicketQuantity} initialValue={values?.quantity} />
                    </div>
                  </section>

                  <div>
                    <button type="submit" className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app">
                      {isLoading ? <Spinner /> : "Proceed to Payment"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </section>
        </div>
      )}
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  return authorizedOnly(context)
}
