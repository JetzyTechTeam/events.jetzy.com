import { ROUTES } from "@Jetzy/configs/routes"
import { signupValidation } from "@Jetzy/lib/validator/authValidtor"
import { CreateUserAccountThunk, getAuthState } from "@Jetzy/redux/reducers/authSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { SignUpFormData, StartSignupFormData } from "@Jetzy/types"
import { useRouter } from "next/router"
import React from "react"
import { auth } from "@/configs/firebase"
import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth"
import { signIn, useSession } from "next-auth/react"
import { ServerErrors } from "@Jetzy/lib/_toaster"

export const useSignup = (options?: { disableAutoRedirect?: boolean }) => {
    const dispatcher = useAppDispatch()
    const { isLoading } = useAppSelector(getAuthState)
    const navigate = useRouter()

    // Get callback URL from query params
    const { _cb } = navigate?.query
    const [waitingForSession, setWaitingForSession] = React.useState(false)
    const { data: session, status } = useSession()

    // Handle redirect after session is established
    React.useEffect(() => {
        if (!options?.disableAutoRedirect && navigate.isReady && waitingForSession && status === 'authenticated' && session) {
            const target = _cb ? _cb.toString() : (
                // @ts-ignore
                (session?.user?.role === 'admin' || session?.user?.role === 'super admin')
                    ? ROUTES.dashboard.events.index
                    : ROUTES.home
            );

            // Small delay to ensure SessionSync has processed the session
            setTimeout(() => {
                navigate?.push(target);
            }, 600);
        }
    }, [waitingForSession, status, session, navigate, _cb, navigate.isReady, options?.disableAutoRedirect])

    // Attribution passed through to the firebase-auth provider so SSO signups
    // get the same signupSource/signupSessionId stamp as email signups.
    type SsoOptions = { skipToast?: boolean; signupSource?: string; signupSessionId?: string }

    const handleGoogleLogin = async (options?: SsoOptions) => {
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
                isSignup: "true",
                ...(options?.signupSource && { signupSource: options.signupSource }),
                ...(options?.signupSessionId && { signupSessionId: options.signupSessionId }),
            });

            if (res?.error) {
                throw new Error(res.error || "Authentication failed on the server");
            }

            setWaitingForSession(true);
            return { success: true };
        } catch (error: any) {
            console.error("Google Login Error:", error);
            if (!options?.skipToast) {
                ServerErrors("Login Failed", {
                    message: error.message || "An unexpected error occurred during Google signup."
                });
            }
            return { success: false, error: error.message || "Google signup failed." };
        }
    };

    const handleAppleLogin = async (options?: SsoOptions) => {
        setWaitingForSession(false);
        try {
            const provider = new OAuthProvider('apple.com');
            provider.addScope("email");
            provider.addScope("name");
            const result = await signInWithPopup(auth, provider);
            const idToken = await result.user.getIdToken();

            let displayName = result.user.displayName;
            if (!displayName) {
                try {
                    const credential = OAuthProvider.credentialFromResult(result);
                    const appleToken = credential?.idToken;
                    if (appleToken) {
                        const payload = JSON.parse(atob(appleToken.split(".")[1]));
                        displayName = [payload.given_name, payload.family_name].filter(Boolean).join(" ") || null;
                    }
                } catch {}
            }

            const res = await signIn("firebase-auth", {
                idToken,
                name: displayName || "",
                email: result.user.email || "",
                image: result.user.photoURL || "",
                redirect: false,
                isSignup: "true",
                ...(options?.signupSource && { signupSource: options.signupSource }),
                ...(options?.signupSessionId && { signupSessionId: options.signupSessionId }),
            });

            if (res?.error) {
                throw new Error(res.error || "Authentication failed on the server");
            }

            setWaitingForSession(true);
            return { success: true };
        } catch (error: any) {
            console.error("Apple Login Error:", error);
            if (!options?.skipToast) {
                ServerErrors("Login Failed", {
                    message: error.message || "An unexpected error occurred during Apple signup."
                });
            }
            return { success: false, error: error.message || "Apple signup failed." };
        }
    };

    const handleStartSignup = async (values: StartSignupFormData, cb?: string) => {
        try {
            const res = await fetch("/api/auth/start-signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: values.name?.trim(),
                    email: values.email?.trim(),
                    acceptedTerms: values.acceptedTerms,
                    // Optional. Recorded now and sent on to the Jetzy backend once the account
                    // has a password — see api/auth/complete-signup.ts.
                    refCode: values.refCode?.trim() || undefined,
                    cb: cb || undefined,
                }),
            })
            const json = await res.json().catch(() => ({}))
            return {
                ok: res.ok,
                status: res.status,
                code: json?.code,
                message: json?.message,
                // Free months waiting behind the verification link, when an invite code was used.
                trialMonths: json?.data?.trialMonths as number | undefined,
            }
        } catch (err: any) {
            return { ok: false, status: 0, code: "NETWORK_ERROR", message: err?.message || "Network error" }
        }
    }

    const handleEmailSignup = async (values: SignUpFormData & { skipToast?: boolean }) => {
        const { skipToast, ...rest } = values;
        const sanitized = {
            ...rest,
            email: rest.email?.trim(),
            firstName: rest.firstName?.trim() || "User",
            lastName: rest.lastName?.trim() || "Account",
            password: rest.password?.trim(),
            confirmPassword: rest.confirmPassword?.trim() || rest.password?.trim(),
            shouldBeAJetzyMember: rest.shouldBeAJetzyMember ?? false,
            acceptedTerms: rest.acceptedTerms ?? false,
        };

        const res = await dispatcher(CreateUserAccountThunk({ data: sanitized, skipToast }));
        return res;
    }

    return {
        isLoading,
        handleGoogleLogin,
        handleAppleLogin,
        handleEmailSignup,
        handleStartSignup,
        status,
        session,
        _cb
    }
}
