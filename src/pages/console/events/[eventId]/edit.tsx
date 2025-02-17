import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import DragAndDropFileUpload from "@Jetzy/components/misc/DragAndDropUploader"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { authorizedOnly } from "@Jetzy/lib/authSession"
import { useEdgeStore } from "@Jetzy/lib/edgestore"
import { parseDateForSelection } from "@Jetzy/lib/utils"
import { eventValidation } from "@Jetzy/lib/validator/event"
import { CreateEventThunk, FetchEventThunk, UpdateEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { CreateEventFormData, EventPrivacy, Pages } from "@Jetzy/types"
import { Switch } from "@headlessui/react"
import { ErrorMessage, Field, Form, Formik, FormikProps } from "formik"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import React from "react"

export default function UpdateEventsPage() {
  const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)
  const [progress, updateProgressBar] = React.useState(0)
  const { edgestore } = useEdgeStore()
  const navigation = useRouter()
  const { isLoading, isFetching, data } = useAppSelector(getEventState)
  const dispatcher = useAppDispatch()

  // Fetch event data a
  const { slug } = navigation?.query

  React.useEffect(() => {
    if (slug) {
      dispatcher(FetchEventThunk({ id: slug as string }))
    }
  }, [slug])

  const formInitData: CreateEventFormData = {
    name: data?.name as string,
    datetime: data?.datetime as string,
    desc: data?.desc as string,
    location: data?.location as string,
    interest: data?.interest?.join(", ") as string,
    privacy: data?.privacy as string,
    isPaid: data?.isPaid as boolean,
    amount: data?.amount as number,
    image: data?.image as string,
    externalUrl: data?.externalUrl as string,
  }

  const setIsPaid = (value: boolean = false) => {
    if (formikRef?.current) {
      formikRef.current.setFieldValue("isPaid", value)
    }
  }

  const handleSubmit = (value: CreateEventFormData) => {
    if (slug && typeof slug !== "undefined") {
      dispatcher(UpdateEventThunk({ id: slug as string, data: value })).then((res: any) => {
        if (res?.payload?.status) {
          navigation.push(ROUTES.dashboard.index)
        }
      })
    }
  }

  const fileUploader = async (file: File) => {
    const res = await edgestore.publicFiles.upload({
      file,
      onProgressChange: (progress) => {
        // you can use this to show a progress bar
        updateProgressBar(progress)
      },
    })

    if (formikRef?.current) {
      formikRef.current.setFieldValue("image", res?.url)
    }
  }

  return (
    <ConsoleLayout page={Pages.Events}>
      {isFetching ? (
        <Loader />
      ) : (
        <>
          <h1 className="text-white text-center text-2xl font-bold capitalized mb-5">Update Event</h1>
          <section className="flex flex-col gap-4 items-center justify-centstart">
            <Formik innerRef={formikRef} initialValues={formInitData} onSubmit={handleSubmit} validationSchema={eventValidation}>
              {({ values, handleChange }) => (
                <Form className="space-y-6 md:w-5/12 xs:w-full" action="#" method="POST">
                  {/* Image Uploader */}
                  <section className="bg-slate-300 space-y-6 p-3 rounded-lg">
                    <DragAndDropFileUpload defaultImage={values?.image} onUpload={fileUploader} progress={progress} />
                  </section>

                  <section className="bg-slate-300 space-y-6 p-3 rounded-lg">
                    <div>
                      <label htmlFor="eventName" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event Name
                      </label>
                      <div className="mt-2">
                        <Field id="eventName" name="name" value={values?.name} onChange={handleChange} type="text" autoComplete="name" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="name" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventDate" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event Date and Time
                      </label>
                      <div className="mt-2">
                        <Field id="eventDate" name="text" value={values?.datetime} onChange={handleChange} type="datetime-local" autoComplete="datetime" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="datetime" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventLocation" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event Location
                      </label>
                      <div className="mt-2">
                        <Field id="eventLocation" name="location" value={values?.location} onChange={handleChange} type="text" autoComplete="datetime" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="location" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventLink" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event External Link (optional)
                      </label>
                      <div className="mt-2">
                        <Field id="eventLink" name="externalUrl" value={values?.externalUrl} onChange={handleChange} type="url" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="externalUrl" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventIneterest" className="block text-sm font-semibold leading-6 text-gray-900">
                        Interest (<span className="text-sm italic">Seperate interest with commas</span>)
                      </label>
                      <div className="mt-2">
                        <Field id="eventIneterest" name="interest" value={values?.interest} onChange={handleChange} type="text" autoComplete="datetime" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="interest" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event Privacy
                      </label>
                      <div className="mt-2">
                        <Field id="eventPrivacy" as="select" name="privacy" value={values?.privacy} onChange={handleChange} type="text" autoComplete="datetime" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3">
                          <option value={EventPrivacy.PUBLIC}>Public</option>
                          <option value={EventPrivacy.PRIVATE}>Private</option>
                          <option value={EventPrivacy.GROUP}>Group</option>
                        </Field>
                        <ErrorMessage name="privacy" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="eventPrivacy" className="block text-sm font-semibold leading-6 text-gray-900">
                        Paid Event (<span className="text-sm italic">Is this event paid?</span> )
                      </label>
                      <div className="mt-2">
                        <Switch
                          checked={values?.isPaid}
                          onChange={setIsPaid}
                          className={`${values?.isPaid ? "bg-app" : "bg-app/50"}
          relative inline-flex h-[38px] w-[74px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
                        >
                          <span className="sr-only">Use setting</span>
                          <span
                            aria-hidden="true"
                            className={`${values?.isPaid ? "translate-x-9" : "translate-x-0"}
            pointer-events-none inline-block h-[34px] w-[34px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
                          />
                        </Switch>
                        <ErrorMessage name="privacy" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>
                    {/* Only show the amount when the event is paid */}
                    {values?.isPaid && (
                      <div>
                        <label htmlFor="eventAmount" className="block text-sm font-semibold leading-6 text-gray-900">
                          Event Amount
                        </label>
                        <div className="mt-2">
                          <Field id="eventAmount" name="amount" value={values?.amount} onChange={handleChange} type="number" step="any" autoComplete="datetime" className="block w-full h-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                          <ErrorMessage name="amount" component="span" className="text-red-500 block mt-1" />
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="eventDescription" className="block text-sm font-semibold leading-6 text-gray-900">
                        Event Description
                      </label>
                      <div className="mt-2">
                        <Field id="eventDescription" as={"textarea"} name="desc" value={values?.desc} onChange={handleChange} type="text" autoComplete="datetime" className="block w-full h-20 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3" />
                        <ErrorMessage name="desc" component="span" className="text-red-500 block mt-1" />
                      </div>
                    </div>
                  </section>

                  <div>
                    <button type="submit" className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app">
                      {isLoading ? <Spinner /> : "Update Event"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </section>
        </>
      )}
    </ConsoleLayout>
  )
}

const Loader = () => {
  return (
    <section className="flex flex-col gap-4 items-center justify-center p-3 animate-pulse m-h-start">
      <div className="space-y-6 md:w-5/12 xs:w-full bg-slate-300 rounded-lg p-3">
        <div className="h-10 bg-slate-400 rounded-lg my-5"></div>
        <div className="h-80 bg-slate-400 rounded-lg my-5"></div>
        <div className="space-y-3">
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-8 rounded-lg"></div>
          </div>
          <div className="flex flex-col gap-4 items-start">
            <div className="w-1/4 bg-slate-400 h-5 rounded-md"></div>
            <div className="w-full bg-slate-200 h-18 rounded-lg"></div>
          </div>
        </div>
        <div className="h-10 bg-slate-400 rounded-lg"></div>
      </div>
    </section>
  )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  return authorizedOnly(context)
}
