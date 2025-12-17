import React, { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { useRouter } from "next/router"
import { signIn } from "next-auth/react"
import { ROUTES } from "@Jetzy/configs/routes"
import { loginValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { ServerErrors } from "@Jetzy/lib/_toaster"
import { SignInFormData } from "@Jetzy/types"
import { FiEye, FiEyeOff } from "react-icons/fi"
import Spinner from "./Spinner"
import ForgotPasswordModal from "./ForgotPasswordModal"

interface LoginModalProps {
	isOpen: boolean
	onClose: () => void
	onSwitchToSignup?: () => void
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSwitchToSignup }) => {
	const navigation = useRouter()
	const [isLoading, setLoader] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [showForgotPassword, setShowForgotPassword] = useState(false)
	const { _cb } = navigation?.query

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

			ServerErrors("Sorry", error)

			return
		}

		// turn off loader
		setLoader(false)

		// Close modal and redirect
		onClose()
		navigation?.push(_cb ? _cb.toString() : ROUTES.dashboard.index)
	}

	return (
		<>
		<Transition appear show={isOpen}>
			<Dialog as="div" className="relative z-50" onClose={onClose}>
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
							<Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white/80 backdrop-blur-lg border-2 border-primary-purple p-8 shadow-2xl transition-all">
								{/* Close button */}
								<button onClick={onClose} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors">
									<XMarkIcon className="h-6 w-6" />
								</button>

								{/* Header */}
								<Dialog.Title as="h3" className="text-3xl font-bold text-text-primary text-center mb-6">
									Login
								</Dialog.Title>

								<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={loginValidatorScheme}>
									{({ values, handleChange }) => (
										<Form className="space-y-5">
											{/* Email or Phone Number */}
											<div>
												<label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
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
													className="w-full px-4 py-2.5 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
												/>
												<ErrorMessage name="email" component="span" className="text-red-500 text-xs block mt-1" />
											</div>

											{/* Password */}
											<div>
												<div className="flex items-center justify-between mb-1">
													<label htmlFor="password" className="block text-sm font-medium text-text-primary">
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
														className="w-full px-4 py-2.5 pr-10 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
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
												<ErrorMessage name="password" component="span" className="text-red-500 text-xs block mt-1" />
											</div>

											{/* Sign Up link */}
											<div className="text-sm">
												<span className="text-text-secondary">
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
