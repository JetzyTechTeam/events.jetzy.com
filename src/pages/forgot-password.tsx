import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { changePasswordValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"
import { FiEye, FiEyeOff } from "react-icons/fi"
import axios from "axios"

type ForgotPasswordFormData = {
	email: string
	newPassword: string
	confirm_password: string
	isJetzyMember: boolean
}

export default function ForgotPasswordPage() {
	const navigate = useRouter()
	const [isLoading, setLoader] = React.useState(false)
	const [showPassword, setShowPassword] = React.useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

	const formData: ForgotPasswordFormData = {
		email: "",
		newPassword: "",
		confirm_password: "",
		isJetzyMember: false,
	}

	const handleSubmit = async (values: ForgotPasswordFormData) => {
		setLoader(true)

		try {
			console.log("Submitting forgot password form:", { email: values.email, isJetzyMember: values.isJetzyMember })
			
			const response = await axios.post("/api/auth/forgot-password", {
				email: values.email.trim(),
				password: values.newPassword.trim(),
				confirmPassword: values.confirm_password.trim(),
				isJetzyMember: values.isJetzyMember,
			})

			console.log("Forgot password response:", response.data)

			if (response.data?.status === true) {
				Success(response.data?.message || "Password reset successfully! Redirecting to login...")
				setLoader(false)
				setTimeout(() => {
					navigate.push(ROUTES.login)
				}, 2000)
			} else {
				const errorMsg = response.data?.message || "Failed to reset password. Please try again."
				ServerErrors("Error", { message: errorMsg })
				setLoader(false)
			}
		} catch (error: any) {
			console.error("Forgot password error:", error)
			const errorMessage = error.response?.data?.message || error.message || "Failed to reset password. Please try again."
			ServerErrors("Error", { message: errorMessage })
			setLoader(false)
		}
	}

	return (
		<>
			<Head>
				<title>Forgot Password - Jetzy Events</title>
				<meta name="description" content="Reset your Jetzy account password." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			{/* Background with gradient */}
			<div className="min-h-screen bg-gradient-to-br from-background-light via-white to-background-gray flex items-center justify-center px-4 py-12">
				{/* Glassy overlay card */}
				<div className="w-full max-w-md">
					<div className="bg-white/70 backdrop-blur-lg border-2 border-primary-purple rounded-2xl shadow-2xl p-8">
						{/* Header */}
						<div className="text-center mb-8">
							<h2 className="text-3xl font-bold text-text-primary">Reset Password</h2>
							<p className="text-sm text-text-secondary mt-2">Enter your email and new password</p>
						</div>

						<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={changePasswordValidatorScheme}>
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
											placeholder="Enter your email"
											autoComplete="email"
											required
											className="w-full px-4 py-2.5 bg-white/80 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
										/>
										<ErrorMessage name="email" component="span" className="text-red-500 text-xs block mt-1" />
									</div>

									{/* New Password */}
									<div>
										<label htmlFor="newPassword" className="block text-sm font-medium text-text-primary mb-1">
											New Password
										</label>
										<div className="relative">
											<Field
												id="newPassword"
												name="newPassword"
												value={values?.newPassword}
												onChange={handleChange}
												type={showPassword ? "text" : "password"}
												placeholder="Enter new password"
												autoComplete="new-password"
												required
												className="w-full px-4 py-2.5 pr-10 bg-white/80 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
											/>
											<button
												type="button"
												onClick={() => setShowPassword(!showPassword)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
												aria-label={showPassword ? "Hide password" : "Show password"}
											>
												{showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
											</button>
										</div>
										<ErrorMessage name="newPassword" component="span" className="text-red-500 text-xs block mt-1" />
									</div>

									{/* Confirm Password */}
									<div>
										<label htmlFor="confirm_password" className="block text-sm font-medium text-text-primary mb-1">
											Confirm Password
										</label>
										<div className="relative">
											<Field
												id="confirm_password"
												name="confirm_password"
												value={values?.confirm_password}
												onChange={handleChange}
												type={showConfirmPassword ? "text" : "password"}
												placeholder="Confirm new password"
												autoComplete="new-password"
												required
												className="w-full px-4 py-2.5 pr-10 bg-white/80 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
											/>
											<button
												type="button"
												onClick={() => setShowConfirmPassword(!showConfirmPassword)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
												aria-label={showConfirmPassword ? "Hide password" : "Show password"}
											>
												{showConfirmPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
											</button>
										</div>
										<ErrorMessage name="confirm_password" component="span" className="text-red-500 text-xs block mt-1" />
									</div>

									{/* Jetzy Member Checkbox */}
									<div className="flex items-center gap-2">
										<Field id="isJetzyMember" name="isJetzyMember" type="checkbox" className="h-4 w-4 text-primary-purple focus:ring-primary-purple border-border-gray rounded" />
										<label htmlFor="isJetzyMember" className="text-sm text-text-secondary">
											I am a Jetzy member
										</label>
									</div>

									{/* Reset Password button */}
									<div className="pt-2">
										<button
											type="submit"
											disabled={isLoading}
											className="w-full py-3 px-4 bg-primary-purple hover:bg-primary-dark disabled:bg-primary-purple/50 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary-purple focus:ring-offset-2"
										>
											{isLoading ? <Spinner /> : "Reset Password"}
										</button>
									</div>

									{/* Back to login link */}
									<div className="text-center pt-2">
										<p className="text-sm text-text-secondary">
											Remember your password?{" "}
											<Link href={ROUTES.login} className="font-semibold text-primary-purple hover:text-primary-dark transition-colors">
												Login
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
