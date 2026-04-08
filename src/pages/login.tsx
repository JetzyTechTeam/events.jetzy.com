import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { ServerErrors } from "@Jetzy/lib/_toaster"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { loginValidatorScheme } from "@Jetzy/lib/validator/authValidtor"
import { SignInFormData } from "@Jetzy/types"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { GetServerSideProps } from "next"
import { signIn, useSession } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"
import { auth } from "@/configs/firebase"
import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth"
import { FcGoogle } from "react-icons/fc"
import { AiFillApple, AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai"

export default function LoginPage() {
	const navigation = useRouter()
	const [isLoading, setLoader] = React.useState(false)
	const [waitingForSession, setWaitingForSession] = React.useState(false)
	const [hasAttemptedMagicLink, setHasAttemptedMagicLink] = React.useState(false)
	const [accountStatus, setAccountStatus] = React.useState<'blocked' | 'bounced' | null>(null)
	const [showPassword, setShowPassword] = React.useState(false)

	const { data: session, status } = useSession()

	// The url callback to redirect user to after login
	const { _cb } = navigation?.query

	const formData: SignInFormData = {
		email: "",
		password: "",
		isJetzyMember: false,
	}

	// Handle redirect after session is established
	React.useEffect(() => {
		if (navigation.isReady && waitingForSession && status === 'authenticated' && session) {
			const { eventId, magicToken } = navigation.query;
			console.log('✅ Session established, checking redirect target...');

			let target = _cb ? _cb.toString() : (
				// @ts-ignore
				(session?.user?.role === 'admin' || session?.user?.role === 'super admin')
					? ROUTES.dashboard.events.index
					: ROUTES.home
			);

			// Mobile Flow: Forward user to specific event with context if eventId is present
			if (eventId && magicToken) {
				target = `/${eventId}?external=true&token=${magicToken}`;
				console.log('📱 [Mobile Flow] Directing to event page with context');
			}


			console.log('🚀 Redirecting to:', target);

			// Small delay to ensure SessionSync has processed the session
			setTimeout(() => {
				navigation?.push(target);
			}, 600);
		}
	}, [waitingForSession, status, session, navigation, _cb, navigation.isReady])

	React.useEffect(() => {
		const { magicToken, lat, long, eventId } = navigation.query;
		console.log('🔍 [Login] useEffect check - magicToken:', !!magicToken, 'isLoading:', isLoading, 'status:', status, 'hasAttempted:', hasAttemptedMagicLink);

		if (magicToken && !isLoading && !waitingForSession && status !== 'loading' && !hasAttemptedMagicLink) {
			console.log('✨ [Login] Magic Token detected, attempting auto-login...');
			setLoader(true);
			setHasAttemptedMagicLink(true);



			// Store location if present (marks mobile origin)
			if (lat && long) {
				console.log('📍 [Login] Storing location context:', lat, long);
				sessionStorage.setItem("user_lat", lat.toString());
				sessionStorage.setItem("user_long", long.toString());
			}

			signIn("credentials", {
				magicToken: magicToken.toString(),
				redirect: false,
			}).then((res) => {

				console.log('📡 [Login] signIn response:', res);
				if (res?.error) {
					console.error('❌ [Login] Magic Login Error:', res.error);
					setLoader(false);
					ServerErrors("Auto-login Failed", { message: "Your one-click link is invalid or has expired." });
				} else {
					console.log('✅ [Login] Magic Login successful!');
					setWaitingForSession(true);
				}
			}).catch(err => {
				console.error('🚨 [Login] Magic Login fatal error:', err);
				setLoader(false);
			});
		}
	}, [navigation.query, isLoading, status, waitingForSession]);

	const handleSubmit = async (values: SignInFormData) => {
		setLoader(true)


		//  Process user login
		const res = await signIn("credentials", {
			email: values?.email,
			password: values?.password,
			isJetzyMember: values?.isJetzyMember,
			redirect: false,
		})

		console.log('Login Result:', res);

		// handle error
		if (res?.error) {
			console.error('Login Error detail:', res.error);
			setLoader(false)

			// Account safety checks — surface specific popups
			if (res.error === 'ACCOUNT_BLOCKED' || res.error.includes('ACCOUNT_BLOCKED')) {
				setAccountStatus('blocked')
				return
			}
			if (res.error === 'EMAIL_BOUNCED' || res.error.includes('EMAIL_BOUNCED')) {
				setAccountStatus('bounced')
				return
			}

			// format an error message
			const error = { message: res?.error }
			ServerErrors("Sorry", error)
			return
		}

		// Wait for session to be established before redirecting
		console.log('Login successful, waiting for session...');
		setWaitingForSession(true)
		// Loader stays on until redirect happens
	}

	const handleGoogleLogin = async () => {
		setLoader(true);
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

			if (res?.error === "ACCOUNT_BLOCKED") {
				setAccountStatus('blocked');
				setLoader(false);
				return;
			}
			if (res?.error === "EMAIL_BOUNCED") {
				setAccountStatus('bounced');
				setLoader(false);
				return;
			}
			if (res?.error) {
				console.error("NextAuth SignIn Error:", res.error);
				throw new Error(res.error || "Authentication failed on the server");
			}

			setWaitingForSession(true);
		} catch (error: any) {
			console.error("Google Login Error:", error);
			setLoader(false);
			ServerErrors("Login Failed", {
				message: error.message || "An unexpected error occurred during Google login."
			});
		}
	};

	const handleAppleLogin = async () => {
		setLoader(true);
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

			if (res?.error === "ACCOUNT_BLOCKED") {
				setAccountStatus('blocked');
				return;
			}
			if (res?.error === "EMAIL_BOUNCED") {
				setAccountStatus('bounced');
				return;
			}
			if (res?.error) {
				console.error("NextAuth SignIn Error:", res.error);
				throw new Error(res.error || "Authentication failed on the server");
			}

			setWaitingForSession(true);
		} catch (error: any) {
			console.error("Apple Login Error:", error);
			setLoader(false);
			ServerErrors("Login Failed", {
				message: error.message || "An unexpected error occurred during Apple login."
			});
		}
	};

	if ((navigation.query.magicToken || waitingForSession) && isLoading) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-black">
				<div className="text-center">
					<Image className="mx-auto h-24 w-auto mb-8 animate-pulse" src={Logo} alt="Jetzy Life" />
					<Spinner />
					<p className="mt-4 text-white font-medium text-lg">Getting ready...</p>




				</div>
			</div>
		)
	}

	return (

		<>
			{/* ── Account Safety Popups ── */}
			{accountStatus && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
					<div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 flex flex-col items-center text-center">
						<div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-5">
							<svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
							</svg>
						</div>

						{accountStatus === 'blocked' ? (
							<>
								<h2 className="text-xl font-bold text-gray-900 mb-3">Email Not Verified</h2>
								<p className="text-gray-600 text-sm leading-relaxed mb-6">
									Your email didn't verify. Kindly input your correct email address.
								</p>
							</>
						) : (
							<>
								<h2 className="text-xl font-bold text-gray-900 mb-3">Email Bounced Back</h2>
								<p className="text-gray-600 text-sm leading-relaxed mb-6">
									Your email bounced back. Kindly input your correct email address.
								</p>
							</>
						)}

						{/* Primary CTA */}
						<button
							onClick={() => navigation.push('/jetzyqrsignup')}
							className="w-full bg-[#F79432] text-white font-semibold py-3 px-6 rounded-full hover:bg-[#e8842a] transition-colors mb-3"
						>
							Try a Different Email
						</button>

						{/* Secondary: Recovery for accidental block */}
						<button
							onClick={() => {
								const emailInput = (document.querySelector('input[name="email"]') as HTMLInputElement)?.value;
								navigation.push(`/auth/verify?email=${encodeURIComponent(emailInput || '')}&mode=recover`);
							}}
							className="w-full text-sm text-gray-500 hover:text-[#F79432] transition-colors underline"
						>
							I accidentally blocked my account — Recover it
						</button>
					</div>
				</div>
			)}

			<div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
				<div className="sm:mx-auto sm:w-full sm:max-w-sm">
					<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
					<h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">Sign in to your account</h2>
				</div>

				<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm bg-[#1E1E1E] p-3 rounded-lg">
					<Formik initialValues={formData} onSubmit={handleSubmit} validationSchema={loginValidatorScheme}>
						{({ values, handleChange }) => (
							<Form className="space-y-6" action="#" method="POST">


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
											required
											className="text-white bg-[#1E1E1E] dark-autofill block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
										/>
										<ErrorMessage name="email" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								<div>
									<div className="flex items-center justify-between">
										<label htmlFor="password" className="block text-sm font-medium leading-6">
											Password
										</label>
									</div>
									<div className="mt-2">
										<div className="relative">
											<Field
												id="password"
												name="password"
												value={values?.password}
												onChange={handleChange}
												type={showPassword ? "text" : "password"}
												autoComplete="current-password"
												required
												className="text-white bg-[#1E1E1E] dark-autofill block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3 pr-10"
											/>
											<button
												type="button"
												onClick={() => setShowPassword(!showPassword)}
												className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
											>
												{showPassword ? <AiOutlineEyeInvisible size={20} /> : <AiOutlineEye size={20} />}
											</button>
										</div>
										<ErrorMessage name="password" component="span" className="text-red-500 block mt-1" />
									</div>
								</div>

								<div className="flex items-center">
									<Field
										id="isJetzyMember"
										name="isJetzyMember"
										type="checkbox"
										className="h-4 w-4 text-app focus:ring-app border-gray-300 rounded"
									/>
									<label htmlFor="isJetzyMember" className="ml-2 block text-sm text-gray-300">
										I am a Jetzy member
									</label>
								</div>


								<div>
									<button
										type="submit"
										className="flex w-full justify-center rounded-md bg-app px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
									>
										{isLoading ? <Spinner /> : "Sign in"}
									</button>
								</div>

								{/* Forgot Password */}
								<div className="text-center">
									<Link href="/auth/forgot-password" className="text-sm text-gray-400 hover:text-[#F79432] transition-colors">
										Forgot your password?
									</Link>
								</div>

								{/* OTP Login Option */}
								<div className="text-center pt-1">
									<button
										type="button"
										onClick={() => {
											const emailVal = (document.querySelector('input[name="email"]') as HTMLInputElement)?.value;
											if (emailVal) {
												navigation.push(`/auth/login-otp?email=${encodeURIComponent(emailVal)}`);
											} else {
												navigation.push('/auth/login-otp');
											}
										}}
										className="text-sm text-gray-400 hover:text-[#F79432] transition-colors"
									>
										✉️ Send me a login code instead
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
						Don&apos;t have an account?{" "}
						<Link href={_cb ? `${ROUTES.create}?_cb=${encodeURIComponent(_cb.toString())}` : ROUTES.create} className="font-semibold leading-6 text-app hover:text-blue-500">
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
