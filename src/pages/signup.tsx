import { ROUTES } from "@Jetzy/configs/routes"
import { useSignup } from "@Jetzy/hooks/useSignup"
import { startSignupValidation } from "@Jetzy/lib/validator/authValidtor"
import { StartSignupFormData } from "@Jetzy/types"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"
import { FcGoogle } from "react-icons/fc"
import { AiFillApple } from "react-icons/ai"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"

export default function SignupPage() {
	const { handleGoogleLogin, handleAppleLogin, handleStartSignup, _cb } = useSignup()
	const router = useRouter()

	const [submitting, setSubmitting] = React.useState(false)
	const [emailExists, setEmailExists] = React.useState(false)

	const formData: StartSignupFormData = {
		name: "",
		email: "",
		acceptedTerms: false,
	}

	const handleSubmit = async (values: StartSignupFormData) => {
		setEmailExists(false)
		setSubmitting(true)
		const res = await handleStartSignup(values, _cb ? _cb.toString() : undefined)

		if (res.ok) {
			router.push("/post-signup")
			return
		}
		setSubmitting(false)
		if (res.code === "EMAIL_EXISTS") {
			setEmailExists(true)
		}
	}

	const loginHref = _cb ? `${ROUTES.login}?_cb=${encodeURIComponent(_cb.toString())}` : ROUTES.login

	return (
		<div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-sm">
				<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
				<h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">
					Create your account
				</h2>
			</div>

			<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm bg-[#1E1E1E] p-5 rounded-lg">
						<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={startSignupValidation}>
							{({ values, handleChange }) => (
								<Form className="space-y-6">
									<div>
										<label htmlFor="name" className="block text-sm font-medium leading-6">
											Name
										</label>
										<div className="mt-2">
											<Field
												id="name"
												name="name"
												value={values?.name}
												onChange={handleChange}
												type="text"
												autoComplete="name"
												className="bg-[#1E1E1E] dark-autofill text-white block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
											/>
											<ErrorMessage name="name" component="span" className="text-red-500 block mt-1" />
										</div>
									</div>

									<div>
										<label htmlFor="email" className="block text-sm font-medium leading-6">
											Email address
										</label>
										<div className="mt-2">
											<Field
												id="email"
												name="email"
												value={values?.email}
												onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
													setEmailExists(false)
													handleChange(e)
												}}
												type="email"
												autoComplete="email"
												className="bg-[#1E1E1E] dark-autofill text-white block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
											/>
											<ErrorMessage name="email" component="span" className="text-red-500 block mt-1" />
											{emailExists && (
												<span className="text-red-500 block mt-1 text-sm">
													Email already registered. Please use login link below with this email.
												</span>
											)}
										</div>
									</div>

									<div className="flex flex-col mt-4">
										<div className="flex items-center gap-2">
											<Field
												type="checkbox"
												id="acceptedTerms"
												name="acceptedTerms"
												className="h-4 w-4 text-app focus:ring-app border-gray-300 rounded"
												checked={values?.acceptedTerms}
											/>
											<label htmlFor="acceptedTerms" className="block text-sm text-white">
												I agree to the{" "}
												<Link href={ROUTES.terms} target="_blank" className="text-app hover:underline">
													Terms and Conditions
												</Link>
											</label>
										</div>
										<ErrorMessage name="acceptedTerms" component="span" className="text-red-500 block mt-1 text-xs" />
									</div>

									<div>
										<button
											disabled={submitting}
											type="submit"
											className="flex w-full justify-center rounded-md bg-app disabled:bg-app/50 px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app p-3"
										>
											{submitting ? <Spinner /> : "Send verification link"}
										</button>
									</div>
								</Form>
							)}
						</Formik>

						<div className="mt-6">
							<div className="relative">
								<div className="absolute inset-0 flex items-center" aria-hidden="true">
									<div className="w-full border-t border-[#434343]"></div>
								</div>
								<div className="relative flex justify-center text-sm font-medium leading-6">
									<span className="bg-[#1E1E1E] px-6 text-gray-400">Or continue with</span>
								</div>
							</div>

							<div className="mt-6 grid grid-cols-2 gap-4">
								<button
									onClick={() => handleGoogleLogin({})}
									disabled={submitting}
									className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:ring-transparent disabled:opacity-50"
								>
									<FcGoogle className="h-5 w-5" />
									<span className="text-sm font-semibold leading-6">Google</span>
								</button>

								<button
									onClick={() => handleAppleLogin({})}
									disabled={submitting}
									className="flex w-full items-center justify-center gap-3 rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-gray-700 hover:bg-gray-900 focus-visible:ring-transparent disabled:opacity-50"
								>
									<AiFillApple className="h-5 w-5" />
									<span className="text-sm font-semibold leading-6">Apple</span>
								</button>
							</div>
						</div>

					<p className="mt-10 text-center text-sm text-gray-500">
						Already have account?{" "}
						<Link href={loginHref} className="font-semibold leading-6 text-app hover:text-indigo-500">
							Login
						</Link>
					</p>
			</div>
		</div>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return unauthorizedOnly(context)
}
