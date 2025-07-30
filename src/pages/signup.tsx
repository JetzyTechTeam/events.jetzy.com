import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { signupValidation } from "@Jetzy/lib/validator/authValidtor"
import { CreateUserAccountThunk, getAuthState } from "@Jetzy/redux/reducers/authSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { SignUpFormData } from "@Jetzy/types"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"

export default function LoginPage() {
	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getAuthState)
	const navigate = useRouter()

	const formData: SignUpFormData = {
		email: "",
		password: "",
		confirmPassword: "",
		firstName: "",
		lastName: "",
		shouldBeAJetzyMember: false,
	}

	const handleSubmit = (values: SignUpFormData) => {
		dispatcher(CreateUserAccountThunk({ data: values })).then((res: any) => {
			if (res?.payload?.status) navigate.push(ROUTES.login)
		})
	}

	return (
		<>
			<div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
				<div className="sm:mx-auto sm:w-full sm:max-w-sm">
					<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
					<h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">Create new account</h2>
				</div>

				<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm bg-[#1E1E1E] p-5 rounded-lg">
					<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={signupValidation}>
						{({ values, handleChange }) => (
							<Form className="space-y-6" action="#" method="POST">
								{/* First Name */}
								<div>
									<label htmlFor="firstName" className="block text-sm font-medium leading-6">
										First Name
									</label>
									<div className="mt-2">
										<Field
											id="firstName"
											name="firstName"
											value={values?.firstName}
											onChange={handleChange}
											type="text"
											autoComplete="firstName"
											className="bg-[#1E1E1E] block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="firstName" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								{/* Last Name */}
								<div>
									<label htmlFor="lastName" className="block text-sm font-medium leading-6">
										Last Name
									</label>
									<div className="mt-2">
										<Field
											id="lastName"
											name="lastName"
											value={values?.lastName}
											onChange={handleChange}
											type="text"
											autoComplete="lastName"
											className="bg-[#1E1E1E] block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="lastName" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								{/* Email */}
								<div>
									<label htmlFor="email" className="block text-sm font-medium leading-6">
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
											className="bg-[#1E1E1E] block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="email" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								{/* Password */}
								<div>
									<div className="flex items-center justify-between">
										<label htmlFor="password" className="block text-sm font-medium leading-6">
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
											className="bg-[#1E1E1E] block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="password" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								{/* Confirm Password */}
								<div>
									<div className="flex items-center justify-between">
										<label htmlFor="confirmPassword" className="block text-sm font-medium leading-6">
											Confirm Password
										</label>
									</div>
									<div className="mt-2">
										<Field
											id="confirmPassword"
											name="confirmPassword"
											value={values?.confirmPassword}
											onChange={handleChange}
											type="password"
											autoComplete="current-password"
											className="bg-[#1E1E1E] block w-full text-white rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="confirmPassword" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								{/* Jetzy Member Checkbox */}
								<div className="flex items-center gap-2 mt-4">
									<Field
										type="checkbox"
										id="shouldBeAJetzyMember"
										name="shouldBeAJetzyMember"
										className="h-4 w-4 text-app focus:ring-app border-gray-300 rounded"
										checked={values?.shouldBeAJetzyMember}
									/>
									<label htmlFor="shouldBeAJetzyMember" className="block text-sm text-white">
										Sign me up as a Jetzy Member
									</label>
								</div>

								<div>
									<button
										disabled={isLoading}
										type="submit"
										className="flex w-full justify-center rounded-md bg-app disabled:bg-app/50 px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app p-3"
									>
										{isLoading ? <Spinner /> : "Sign up"}
									</button>
								</div>
							</Form>
						)}
					</Formik>

					<p className="mt-10 text-center text-sm text-gray-500">
						Already have account?{" "}
						<Link href={ROUTES.login} className="font-semibold leading-6 text-app hover:text-indigo-500">
							Login
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
