import React, { Fragment, useState, useEffect } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { useRouter } from "next/router"
import { signIn } from "next-auth/react"
import { ROUTES } from "@Jetzy/configs/routes"
import { loginValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { SignInFormData } from "@Jetzy/types"
import { FiEye, FiEyeOff } from "react-icons/fi"
import Spinner from "./Spinner"
import ForgotPasswordModal from "./ForgotPasswordModal"

interface LoginModalProps {
	isOpen: boolean
	onClose: () => void
	onSwitchToSignup?: () => void
	onLoginSuccess?: () => void
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSwitchToSignup, onLoginSuccess }) => {
	const navigation = useRouter()
	const [isLoading, setLoader] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [showForgotPassword, setShowForgotPassword] = useState(false)
	const [hasShownSuccess, setHasShownSuccess] = useState(false)
	const { _cb } = navigation?.query

	// Reset success flag when modal opens
	useEffect(() => {
		if (isOpen) {
			setHasShownSuccess(false)
		}
	}, [isOpen])

	const formData: SignInFormData = {
		email: "",
		password: "",
		isJetzyMember: false,
	}

	const handleSubmit = async (values: SignInFormData) => {
		setLoader(true)

		// Process user login
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

			ServerErrors("Login Failed", error)

			return
		}

		// Success - show success toast only once
		if (res?.ok && !hasShownSuccess) {
			Success("Login Successful", "You have been logged in successfully!")
			setHasShownSuccess(true)
		}

		// Get API token from external API after NextAuth login succeeds
		if (res?.ok) {
			try {
				// Use a separate env variable for external API to avoid affecting HTTPClient
				// This allows NEXT_PUBLIC_API_BASE_URL to remain unchanged for existing API calls
				const externalApiUrl = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL

				// Debug: Log the API base URL (only first part for security)
				if (process.env.NODE_ENV === 'development') {
					console.log('[LoginModal] NEXT_PUBLIC_EXTERNAL_API_BASE_URL:', process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || 'NOT SET (using NEXT_PUBLIC_API_BASE_URL as fallback)')
					console.log('[LoginModal] NEXT_PUBLIC_API_BASE_URL (fallback):', process.env.NEXT_PUBLIC_API_BASE_URL || 'NOT SET')
				}

				// Validate that externalApiUrl is set and is a valid absolute URL
				if (!externalApiUrl || externalApiUrl.trim() === '') {
					console.warn('[LoginModal] External API URL not set, skipping token fetch')
					console.warn('[LoginModal] Please set NEXT_PUBLIC_EXTERNAL_API_BASE_URL in .env.local or .env')
					console.warn('[LoginModal] Example: NEXT_PUBLIC_EXTERNAL_API_BASE_URL=https://test.jetzy.com')
					return
				}

				// Ensure externalApiUrl doesn't have trailing slash and is absolute URL
				const baseUrl = externalApiUrl.trim().replace(/\/+$/, '') // Remove trailing slashes

				// Validate it's an absolute URL (starts with http:// or https://)
				if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
					console.error('[LoginModal] External API URL must be an absolute URL (start with http:// or https://)')
					console.error('[LoginModal] Current value:', baseUrl)
					console.error('[LoginModal] Example: NEXT_PUBLIC_EXTERNAL_API_BASE_URL=https://test.jetzy.com')
					return
				}

				// Use fetch directly with full absolute URL
				// The endpoint is /authorize (from authEndpoints.login = "public:/authorize")
				const authorizeUrl = `${baseUrl}/authorize`

				// Debug: Log the full URL being called
				if (process.env.NODE_ENV === 'development') {
					console.log('[LoginModal] Calling authorize endpoint:', authorizeUrl)
				}

				const tokenResponse = await fetch(authorizeUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: values.email,
						password: values.password,
						isJetzyMember: values.isJetzyMember
					})
				})

				if (tokenResponse.ok) {
					const tokenData = await tokenResponse.json()
					if (tokenData?.status && tokenData?.data?.accessToken) {
						// Store token for events app API calls and JetzyChat
						sessionStorage.setItem('api_token', tokenData.data.accessToken)
						if (process.env.NODE_ENV === 'development') {
							console.log('[LoginModal] API token stored in sessionStorage')
						}
					} else {
						console.warn('[LoginModal] Token response missing accessToken:', tokenData)
					}
				} else {
					const errorText = await tokenResponse.text()
					console.warn('[LoginModal] Failed to get API token:', tokenResponse.status, tokenResponse.statusText)
					if (process.env.NODE_ENV === 'development') {
						console.warn('[LoginModal] Response:', errorText.substring(0, 200))
					}
				}
			} catch (error: any) {
				console.error('[LoginModal] Error fetching API token:', error)
				// Log more details in development
				if (process.env.NODE_ENV === 'development') {
					console.warn('[LoginModal] Token fetch error details:', {
						message: error?.message,
						status: error?.code,
						data: error
					})
				}
				// Continue anyway - user is still logged in via NextAuth
			}
		}

		// turn off loader
		setLoader(false)

		// Close modal
		onClose()

		// If there's a login success callback (e.g., from checkout), call it
		if (onLoginSuccess) {
			onLoginSuccess()
		} else {
			// Wait a moment for session to update, then redirect
			setTimeout(async () => {
				try {
					const { getSession } = await import("next-auth/react")
					const updatedSession = await getSession()
					const userRole = (updatedSession?.user as any)?.role
					const isAdmin = userRole === "admin" || userRole === "super admin"

					// Determine redirect destination
					let redirectUrl = ROUTES.home // Default to home page

					if (_cb) {
						redirectUrl = _cb.toString()
					} else if (isAdmin) {
						redirectUrl = ROUTES.dashboard.index
					} else {
						redirectUrl = ROUTES.home
					}

					navigation.replace(redirectUrl)
				} catch (error) {
					console.error("Error getting session after login:", error)
					navigation.replace(ROUTES.home)
				}
			}, 300)
		}
	}

	return (
		<>
			<Transition appear show={isOpen}>
				<Dialog as="div" className="relative z-[60]" onClose={onClose}>
					<Transition.Child
						as="div"
						className="fixed inset-0 bg-black/40 backdrop-blur-sm"
						enter="ease-out duration-300"
						enterFrom="opacity-0"
						enterTo="opacity-100"
						leave="ease-in duration-200"
						leaveFrom="opacity-100"
						leaveTo="opacity-0"
					/>

					<div className="fixed inset-0 overflow-y-auto">
						<div className="flex min-h-full items-center justify-center p-4">
							<Transition.Child
								as="div"
								className="w-full max-w-md"
								enter="ease-out duration-300"
								enterFrom="opacity-0 scale-95"
								enterTo="opacity-100 scale-100"
								leave="ease-in duration-200"
								leaveFrom="opacity-100 scale-100"
								leaveTo="opacity-0 scale-95"
							>
								<Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-[#1E1E1E] backdrop-blur-lg border border-[#434343] p-8 shadow-2xl transition-all">
									{/* Close button */}
									<button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
										<XMarkIcon className="h-6 w-6" />
									</button>

									{/* Header */}
									<Dialog.Title as="h3" className="text-3xl font-bold text-white text-center mb-6">
										Login
									</Dialog.Title>

									<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={loginValidatorScheme}>
										{({ values, handleChange }) => (
											<Form className="space-y-5">
												{/* Email or Phone Number */}
												<div>
													<label htmlFor="email" className="block text-sm font-medium text-white mb-1">
														Email or Phone Number
													</label>
													<Field
														id="email"
														name="email"
														value={values?.email}
														onChange={handleChange}
														type="email"
														placeholder="Enter email or phone number"
														autoComplete="email"
														required
														className="w-full px-4 py-2.5 bg-[#2b2b2b] border border-[#434343] rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
													/>
													<ErrorMessage name="email" component="span" className="text-red-500 text-xs block mt-1" />
												</div>

												{/* Password */}
												<div>
													<div className="flex items-center justify-between mb-1">
														<label htmlFor="password" className="block text-sm font-medium text-white">
															Password
														</label>
														<button
															type="button"
															onClick={() => {
																onClose()
																setShowForgotPassword(true)
															}}
															className="text-sm font-medium text-primary-purple hover:text-primary-dark transition-colors"
														>
															Forgot password?
														</button>
													</div>
													<div className="relative">
														<Field
															id="password"
															name="password"
															value={values?.password}
															onChange={handleChange}
															type={showPassword ? "text" : "password"}
															placeholder="Enter password"
															autoComplete="current-password"
															required
															className="w-full px-4 py-2.5 pr-10 bg-[#2b2b2b] border border-[#434343] rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
														/>
														<button
															type="button"
															onClick={() => setShowPassword(!showPassword)}
															className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
															aria-label={showPassword ? "Hide password" : "Show password"}
														>
															{showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
														</button>
													</div>
													<ErrorMessage name="password" component="span" className="text-red-500 text-xs block mt-1" />
												</div>

												{/* Sign Up link */}
												<div className="text-sm">
													<span className="text-gray-400">
														Don&apos;t have an account yet?{" "}
														<button
															type="button"
															onClick={() => {
																onClose()
																if (onSwitchToSignup) {
																	onSwitchToSignup()
																}
															}}
															className="font-semibold text-primary-purple hover:text-primary-dark transition-colors"
														>
															Sign Up
														</button>
													</span>
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
											</Form>
										)}
									</Formik>
								</Dialog.Panel>
							</Transition.Child>
						</div>
					</div>
				</Dialog>
			</Transition>

			{/* Forgot Password Modal */}
			<ForgotPasswordModal
				isOpen={showForgotPassword}
				onClose={() => setShowForgotPassword(false)}
				onSwitchToLogin={() => {
					setShowForgotPassword(false)
					// Optionally reopen login modal
					setTimeout(() => {
						// You can add logic here to reopen login modal if needed
					}, 100)
				}}
			/>
		</>
	)
}

export default LoginModal
