import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { ServerErrors } from "@Jetzy/lib/_toaster"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { loginValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { SignInFormData } from "@Jetzy/types"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import { signIn } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"

export default function LoginPage() {
	const navigation = useRouter()
	const [isLoading, setLoader] = React.useState(false)
	// The url callback to redirect user to after login
	const { _cb } = navigation?.query

	const formData: SignInFormData = {
		email: "",
		password: "",
	}

	const handleSubmit = async (values: SignInFormData) => {
		setLoader(true)

		//  Process user login
		const res = await signIn("credentials", {
			email: values?.email,
			password: values?.password,
			redirect: false,
		})

		// handle error
		if (res?.error) {
			setLoader(false)

			// format an error message
			const error = { message: res?.error }

			ServerErrors("Sorry", error)

			return
		}

		// turn off loader
		setLoader(false)

		navigation?.push(_cb ? _cb.toString() : ROUTES.dashboard.index)
	}

	return (
		<>
			<div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
				<div className="sm:mx-auto sm:w-full sm:max-w-sm">
					<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
					<h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-slate-400">Sign in to your account</h2>
				</div>

				<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm bg-slate-200 p-3 rounded-lg">
					<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={loginValidatorScheme}>
						{({ values, handleChange }) => (
							<Form className="space-y-6" action="#" method="POST">
								<div>
									<label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
										Email address
									</label>
									<div className="mt-2">
										<Field
											id="email"
											name="email"
											value={values?.email}
											onChange={handleChange}
											type="email"
											autoComplete="email"
											required
											className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="email" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								<div>
									<div className="flex items-center justify-between">
										<label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
											Password
										</label>
									</div>
									<div className="mt-2">
										<Field
											id="password"
											name="password"
											value={values?.password}
											onChange={handleChange}
											type="password"
											autoComplete="current-password"
											required
											className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="password" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								<div>
									<button
										type="submit"
										className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
									>
										{isLoading ? <Spinner /> : "Sign in"}
									</button>
								</div>
							</Form>
						)}
					</Formik>

					<p className="mt-10 text-center text-sm text-gray-500">
						Don&apos;t have an account?{" "}
						<Link href={ROUTES.create} className="font-semibold leading-6 text-app hover:text-blue-500">
							Create Account
						</Link>
					</p>
				</div>
			</div>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return unauthorizedOnly(context)
}
