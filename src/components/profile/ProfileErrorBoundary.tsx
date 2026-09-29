import React from "react"
import { signOut } from "next-auth/react"

/**
 * A crash inside the profile form must not blank the page.
 *
 * The gate is deliberately non-dismissible and mounts over every page, so an error thrown in it took
 * the whole app down with nothing to click — which is exactly what the Places hook's
 * `ReferenceError: google is not defined` did on staging. This catches it, says so plainly, and
 * keeps the two ways out: refresh, or log out.
 */
type Props = { children: React.ReactNode }
type State = { failed: boolean }

export default class ProfileErrorBoundary extends React.Component<Props, State> {
	state: State = { failed: false }

	static getDerivedStateFromError(): State {
		return { failed: true }
	}

	componentDidCatch(error: unknown) {
		console.error("[profile] form crashed:", error)
	}

	private logout = () => {
		// Logout-safety rule: targeted removal, never localStorage.clear().
		try {
			sessionStorage.removeItem("api_token")
		} catch {}
		signOut({ callbackUrl: "/" })
	}

	render() {
		if (!this.state.failed) return this.props.children

		return (
			<div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/80 px-4">
				<div className="w-full max-w-md rounded-2xl border border-[#434343] bg-[#1E1E1E] p-6 text-white">
					<h2 className="text-lg font-bold">Something went wrong</h2>
					<p className="mt-2 text-sm text-gray-400">
						We couldn&apos;t load your profile form. Please refresh the page and try again.
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="mt-5 w-full rounded-xl bg-app py-3 text-base font-semibold text-black hover:bg-app/80"
					>
						Refresh
					</button>
					<button
						type="button"
						onClick={this.logout}
						data-analytics-ignore=""
						className="mx-auto mt-4 block text-xs text-gray-500 hover:text-gray-300"
					>
						Log out
					</button>
				</div>
			</div>
		)
	}
}
