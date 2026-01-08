import React, { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { useRouter } from "next/router"
import { ROUTES } from "@Jetzy/configs/routes"
import { signupValidation } from "@Jetzy/lib/validator/authValidtor"
import { CreateUserAccountThunk, getAuthState } from "@Jetzy/redux/reducers/authSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { SignUpFormData } from "@Jetzy/types"
import { FiEye, FiEyeOff } from "react-icons/fi"
import Spinner from "./Spinner"
import PrivacyPolicyModal from "./PrivacyPolicyModal"

interface SignupModalProps {
	isOpen: boolean
	onClose: () => void
	onSwitchToLogin?: () => void
}

const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onSwitchToLogin }) => {
	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getAuthState)
	const navigate = useRouter()
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)

	const formData: SignUpFormData = {
		email: "",
		password: "",
		confirmPassword: "",
		firstName: "",
		lastName: "",
		shouldBeAJetzyMember: false,
		jetzyChatTermsAccepted: false,
	}
	const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false)

	const handleSubmit = (values: SignUpFormData) => {
		const sanitized = {
			...values,
			email: values.email?.trim(),
			firstName: values.firstName?.trim(),
			lastName: values.lastName?.trim(),
			password: values.password?.trim(),
			confirmPassword: values.confirmPassword?.trim(),
			shouldBeAJetzyMember: values.shouldBeAJetzyMember,
			jetzyChatTermsAccepted: values.jetzyChatTermsAccepted,
		}

		dispatcher(CreateUserAccountThunk({ data: sanitized })).then((res: any) => {
			if (res?.payload?.status) {
				onClose()
				navigate.push(ROUTES.login)
			}
		})
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
								<Dialog.Title as="h3" className="text-3xl font-bold text-text-primary text-center mb-6">
									Sign Up
								</Dialog.Title>

								<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={signupValidation}>
									{({ values, handleChange }) => (
										<Form className="space-y-4">
											{/* First Name & Last Name - Side by Side */}
											<div className="grid grid-cols-2 gap-4">
												<div>
													<label htmlFor="firstName" className="block text-sm font-medium text-text-primary mb-1">
														First Name
													</label>
													<Field
														id="firstName"
														name="firstName"
														value={values?.firstName}
														onChange={handleChange}
														type="text"
														placeholder="Enter first name"
														autoComplete="given-name"
														className="w-full px-4 py-2.5 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
													/>
													<ErrorMessage name="firstName" component="span" className="text-red-500 text-xs block mt-1" />
												</div>

												<div>
													<label htmlFor="lastName" className="block text-sm font-medium text-text-primary mb-1">
														Last Name
													</label>
													<Field
														id="lastName"
														name="lastName"
														value={values?.lastName}
														onChange={handleChange}
														type="text"
														placeholder="Enter last name"
														autoComplete="family-name"
														className="w-full px-4 py-2.5 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
													/>
													<ErrorMessage name="lastName" component="span" className="text-red-500 text-xs block mt-1" />
												</div>
											</div>

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
													className="w-full px-4 py-2.5 bg-white/90 border border-border-gray rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent transition-all"
												/>
												<ErrorMessage name="email" component="span" className="text-red-500 text-xs block mt-1" />
											</div>

											{/* Password */}
											<div>
												<label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
													Password
												</label>
												<div className="relative">
													<Field
														id="password"
														name="password"
														value={values?.password}
														onChange={handleChange}
														type={showPassword ? "text" : "password"}
														placeholder="Enter password"
														autoComplete="new-password"
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

											{/* Confirm Password */}
											<div>
												<label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-1">
													Confirm Password
												</label>
												<div className="relative">
													<Field
														id="confirmPassword"
														name="confirmPassword"
														value={values?.confirmPassword}
														onChange={handleChange}
														type={showConfirmPassword ? "text" : "password"}
														placeholder="Enter password"
														autoComplete="new-password"
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
												<ErrorMessage name="confirmPassword" component="span" className="text-red-500 text-xs block mt-1" />
											</div>

											{/* Jetzy Member Checkbox */}
											<div className="flex items-center gap-2">
												<Field
													type="checkbox"
													id="shouldBeAJetzyMember"
													name="shouldBeAJetzyMember"
													className="h-4 w-4 text-primary-purple focus:ring-primary-purple border-border-gray rounded"
													checked={values?.shouldBeAJetzyMember}
												/>
												<label htmlFor="shouldBeAJetzyMember" className="block text-sm text-text-secondary">
													Sign me up as a Jetzy Member
												</label>
											</div>

											{/* Privacy Policy and JetzyChat Terms Acceptance - REQUIRED */}
											<div className="flex items-start gap-2">
												<Field
													type="checkbox"
													id="jetzyChatTermsAccepted"
													name="jetzyChatTermsAccepted"
													className="h-4 w-4 text-primary-purple focus:ring-primary-purple border-border-gray rounded mt-0.5"
													checked={values?.jetzyChatTermsAccepted}
													required
												/>
												<label htmlFor="jetzyChatTermsAccepted" className="block text-sm text-text-secondary">
													I agree to the{" "}
													<button
														type="button"
														onClick={() => setIsPrivacyModalOpen(true)}
														className="text-primary-purple hover:underline font-semibold"
													>
														Privacy Policy and JetzyChat Terms
													</button>
													<span className="text-red-500 ml-1">*</span>
												</label>
											</div>
											<ErrorMessage name="jetzyChatTermsAccepted" component="span" className="text-red-500 text-xs block mt-1" />

											{/* Sign up button */}
											<div className="pt-2">
												<button
													disabled={isLoading}
													type="submit"
													className="w-full py-3 px-4 bg-primary-purple hover:bg-primary-dark disabled:bg-primary-purple/50 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary-purple focus:ring-offset-2"
												>
													{isLoading ? <Spinner /> : "Create Account"}
												</button>
											</div>

											{/* Login link */}
											<div className="text-center pt-2">
												<p className="text-sm text-text-secondary">
													Already have an account?{" "}
													<button
														type="button"
														onClick={() => {
															onClose()
															if (onSwitchToLogin) {
																onSwitchToLogin()
															} else {
																navigate.push(ROUTES.login)
															}
														}}
														className="font-semibold text-primary-purple hover:text-primary-dark transition-colors"
													>
														Login
													</button>
												</p>
											</div>
										</Form>
									)}
								</Formik>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>

			{/* Privacy Policy Modal */}
			<PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)} />
		</Transition>
	)
}

export default SignupModal
