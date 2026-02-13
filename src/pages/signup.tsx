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
import React from "react"
import { auth } from "@/configs/firebase"
import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth"
import { FcGoogle } from "react-icons/fc"
import { AiFillApple } from "react-icons/ai"
import { signIn, useSession } from "next-auth/react"
import { ServerErrors } from "@Jetzy/lib/_toaster"

export default function LoginPage() {
	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getAuthState)
	const navigate = useRouter()

	// Get callback URL from query params
	const { _cb } = navigate?.query
	const [waitingForSession, setWaitingForSession] = React.useState(false)
	const { data: session, status } = useSession()

	// Handle redirect after session is established
	React.useEffect(() => {
		if (waitingForSession && status === 'authenticated' && session) {
			console.log('✅ Session established, redirecting...');
			setTimeout(() => {
				setTimeout(() => {
					// @ts-ignore
					if (session?.user?.role === 'admin' || session?.user?.role === 'super admin') {
						navigate?.push(_cb ? _cb.toString() : ROUTES.dashboard.events.index)
					} else {
						navigate?.push(_cb ? _cb.toString() : ROUTES.home)
					}
				}, 300);
			}, 300);
		}
	}, [waitingForSession, status, session, navigate, _cb])

	const handleGoogleLogin = async () => {
		setWaitingForSession(false);
		try {
			const provider = new GoogleAuthProvider();
			const result = await signInWithPopup(auth, provider);
			const idToken = await result.user.getIdToken();

			const res = await signIn("firebase-auth", {
				idToken,
				name: result.user.displayName || "",
				email: result.user.email || "",
				image: result.user.photoURL || "",
				redirect: false,
			});

			if (res?.error) {
				console.error("NextAuth SignIn Error:", res.error);
				throw new Error(res.error || "Authentication failed on the server");
			}

			setWaitingForSession(true);
		} catch (error: any) {
			console.error("Google Login Error:", error);
			ServerErrors("Login Failed", {
				message: error.message || "An unexpected error occurred during Google signup."
			});
		}
	};

	const handleAppleLogin = async () => {
		setWaitingForSession(false);
		try {
			const provider = new OAuthProvider('apple.com');
			provider.addScope("email");
			provider.addScope("name");
			const result = await signInWithPopup(auth, provider);
			const idToken = await result.user.getIdToken();

			const res = await signIn("firebase-auth", {
				idToken,
				name: result.user.displayName || "",
				email: result.user.email || "",
				image: result.user.photoURL || "",
				redirect: false,
			});

			if (res?.error) {
				console.error("NextAuth SignIn Error:", res.error);
				throw new Error(res.error || "Authentication failed on the server");
			}

			setWaitingForSession(true);
		} catch (error: any) {
			console.error("Apple Login Error:", error);
			ServerErrors("Login Failed", {
				message: error.message || "An unexpected error occurred during Apple signup."
			});
		}
	};

	const formData: SignUpFormData = {
		email: "",
		password: "",
		confirmPassword: "",
		firstName: "",
		lastName: "",
		shouldBeAJetzyMember: false,
	}

	const handleSubmit = (values: SignUpFormData) => {

		const sanitized = {
			...values,
			email: values.email?.trim(),
			firstName: values.firstName?.trim(),
			lastName: values.lastName?.trim(),
			password: values.password?.trim(),
			confirmPassword: values.confirmPassword?.trim(),
			shouldBeAJetzyMember: values.shouldBeAJetzyMember,

		};

		dispatcher(CreateUserAccountThunk({ data: sanitized })).then((res: any) => {
			if (res?.payload?.status) {
				// Redirect to login with callback URL preserved
				const loginUrl = _cb ? `${ROUTES.login}?_cb=${encodeURIComponent(_cb.toString())}` : ROUTES.login
				navigate.push(loginUrl)
			}
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
								onClick={handleGoogleLogin}
								disabled={isLoading}
								className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:ring-transparent disabled:opacity-50"
							>
								<FcGoogle className="h-5 w-5" />
								<span className="text-sm font-semibold leading-6">Google</span>
							</button>

							<button
								onClick={handleAppleLogin}
								disabled={isLoading}
								className="flex w-full items-center justify-center gap-3 rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-gray-700 hover:bg-gray-900 focus-visible:ring-transparent disabled:opacity-50"
							>
								<AiFillApple className="h-5 w-5" />
								<span className="text-sm font-semibold leading-6">Apple</span>
							</button>
						</div>
					</div>

					<p className="mt-10 text-center text-sm text-gray-500">
						Already have account?{" "}
						<Link href={_cb ? `${ROUTES.login}?_cb=${encodeURIComponent(_cb.toString())}` : ROUTES.login} className="font-semibold leading-6 text-app hover:text-indigo-500">
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
