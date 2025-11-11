import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { ServerErrors } from "@Jetzy/lib/_toaster"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { loginValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { SignInFormData } from "@Jetzy/types"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import Head from "next/head"
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
		isJetzyMember: false,
	}

	const handleSubmit = async (values: SignInFormData) => {
		setLoader(true)

		//  Process user login
		const res = await signIn("credentials", {
			email: values?.email,
			password: values?.password,
			isJetzyMember: values?.isJetzyMember,
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
			<Head>
				<title>Login - Jetzy Events</title>
				<meta name="description" content="Login to your Jetzy account to manage your events, bookings, and profile." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			{/* Background with gradient */}
			<div className="min-h-screen bg-gradient-to-br from-background-light via-white to-background-gray flex items-center justify-center px-4 py-12">
				{/* Glassy overlay card */}
				<div className="w-full max-w-md">
					<div className="bg-white/70 backdrop-blur-lg border-2 border-primary-purple rounded-2xl shadow-2xl p-8">
						{/* Header */}
						<div className="text-center mb-8">
							<h2 className="text-3xl font-bold text-text-primary">Login</h2>
						</div>

						<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={loginValidatorScheme}>
							{({ values, handleChange }) => (
								<Form className="space-y-5">
									{/* Email */}
									<div>
										<label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
											Email
										</label>
										<Field
											id="email"
											name="email"
											value={values?.email}
											onChange={handleChange}
											type="email"
											placeholder="Enter email"
											autoComplete="email"
											required
											className="w-full px-4 py-2.5 bg-white/80 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
										/>
										<ErrorMessage name="email" component="span" className="text-red-500 text-xs block mt-1" />
									</div>

									{/* Password */}
									<div>
										<label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
											Password
										</label>
										<Field
											id="password"
											name="password"
											value={values?.password}
											onChange={handleChange}
											type="password"
											placeholder="Enter password"
											autoComplete="current-password"
											required
											className="w-full px-4 py-2.5 bg-white/80 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
										/>
										<ErrorMessage name="password" component="span" className="text-red-500 text-xs block mt-1" />
									</div>

									{/* Jetzy Member Checkbox */}
									<div className="flex items-center gap-2">
										<Field id="isJetzyMember" name="isJetzyMember" type="checkbox" className="h-4 w-4 text-primary-purple focus:ring-primary-purple border-border-gray rounded" />
										<label htmlFor="isJetzyMember" className="text-sm text-text-secondary">
											I am a Jetzy member
										</label>
									</div>

									{/* Login button */}
									<div className="pt-2">
										<button
											type="submit"
											disabled={isLoading}
											className="w-full py-3 px-4 bg-primary-purple hover:bg-primary-dark disabled:bg-primary-purple/50 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary-purple focus:ring-offset-2"
										>
											{isLoading ? <Spinner /> : "Login"}
										</button>
									</div>

									{/* Create account link */}
									<div className="text-center pt-2">
										<p className="text-sm text-text-secondary">
											Don&apos;t have an account?{" "}
											<Link href={ROUTES.create} className="font-semibold text-primary-purple hover:text-primary-dark transition-colors">
												Create Account
											</Link>
										</p>
									</div>
								</Form>
							)}
						</Formik>
					</div>
				</div>
			</div>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return unauthorizedOnly(context)
}
