import React, { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { useRouter } from "next/router"
import { ROUTES } from "@Jetzy/configs/routes"
import { changePasswordValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { FiEye, FiEyeOff } from "react-icons/fi"
import Spinner from "./Spinner"
import axios from "axios"

interface ForgotPasswordModalProps {
	isOpen: boolean
	onClose: () => void
	onSwitchToLogin?: () => void
}

type ForgotPasswordFormData = {
	email: string
	newPassword: string
	confirm_password: string
	isJetzyMember: boolean
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose, onSwitchToLogin }) => {
	const navigation = useRouter()
	const [isLoading, setLoader] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)

	const formData: ForgotPasswordFormData = {
		email: "",
		newPassword: "",
		confirm_password: "",
		isJetzyMember: false,
	}

	const handleSubmit = async (values: ForgotPasswordFormData) => {
		setLoader(true)

		try {
			console.log("Submitting forgot password form (modal):", { email: values.email, isJetzyMember: values.isJetzyMember })
			
			const response = await axios.post("/api/auth/forgot-password", {
				email: values.email.trim(),
				password: values.newPassword.trim(),
				confirmPassword: values.confirm_password.trim(),
				isJetzyMember: values.isJetzyMember,
			})

			console.log("Forgot password response (modal):", response.data)

			if (response.data?.status === true) {
				Success(response.data?.message || "Password reset successfully! Redirecting to login...")
				setLoader(false)
				onClose()
				// Optionally switch to login modal or redirect
				if (onSwitchToLogin) {
					setTimeout(() => {
						onSwitchToLogin()
					}, 1000)
				} else {
					setTimeout(() => {
						navigation.push(ROUTES.login)
					}, 1000)
				}
			} else {
				const errorMsg = response.data?.message || "Failed to reset password. Please try again."
				ServerErrors("Error", { message: errorMsg })
				setLoader(false)
			}
		} catch (error: any) {
			console.error("Forgot password error (modal):", error)
			const errorMessage = error.response?.data?.message || error.message || "Failed to reset password. Please try again."
			ServerErrors("Error", { message: errorMessage })
			setLoader(false)
		}
	}

	return (
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
								<Dialog.Title as="h3" className="text-3xl font-bold text-text-primary text-center mb-2">
									Reset Password
								</Dialog.Title>
								<p className="text-sm text-text-secondary text-center mb-6">Enter your email and new password</p>

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
													className="w-full px-4 py-2.5 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
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
														className="w-full px-4 py-2.5 pr-10 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
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
											<div className="text-sm text-center">
												<span className="text-text-secondary">
													Remember your password?{" "}
													<button
														type="button"
														onClick={() => {
															onClose()
															if (onSwitchToLogin) {
																onSwitchToLogin()
															}
														}}
														className="font-semibold text-primary-purple hover:text-primary-dark transition-colors"
													>
														Login
													</button>
												</span>
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
	)
}

export default ForgotPasswordModal
