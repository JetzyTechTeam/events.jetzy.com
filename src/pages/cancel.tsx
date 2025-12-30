import Head from "next/head"
import { useRouter } from "next/router"
import React from "react"

const CheckoutCancelPage: React.FC = () => {
	const router = useRouter()
	const { returnUrl: returnUrlParam } = router.query
	const [returnUrl, setReturnUrl] = React.useState<string | null>(null)
	const [hasHistory, setHasHistory] = React.useState(false)

	React.useEffect(() => {
		// Check if we can go back in history
		if (typeof window !== 'undefined') {
			setHasHistory(window.history.length > 1)
			
			// Log current URL for debugging
			console.log("[Cancel Page] Current URL:", window.location.href)
			console.log("[Cancel Page] Query params:", window.location.search)
			
			// Priority 1: Get return URL from query parameter (most reliable)
			let stored: string | null = null
			
			// Try reading directly from URL search params first (most reliable)
			if (typeof window !== 'undefined') {
				try {
					const urlParams = new URLSearchParams(window.location.search)
					const urlParam = urlParams.get('returnUrl')
					if (urlParam) {
						stored = decodeURIComponent(urlParam)
						console.log("[Cancel Page] ✅ Got returnUrl from URL search params:", stored)
					} else {
						console.log("[Cancel Page] ❌ No returnUrl in URL search params")
					}
				} catch (e) {
					console.error("[Cancel Page] Error reading returnUrl from URL search:", e)
				}
			}
			
			// Try router query as fallback
			if (!stored && returnUrlParam && typeof returnUrlParam === 'string') {
				try {
					stored = decodeURIComponent(returnUrlParam)
					console.log("[Cancel Page] Got returnUrl from router query param:", stored)
				} catch (e) {
					console.error("Error decoding returnUrl from router:", e)
				}
			}
			
			// Priority 2: Get from sessionStorage (stored before checkout redirect)
			if (!stored) {
				stored = sessionStorage.getItem("checkout_return_url")
				console.log("[Cancel Page] Got returnUrl from sessionStorage:", stored)
			}
			
			// Priority 3: Try to get from referrer (the page before Stripe)
			if (!stored && document.referrer) {
				// Check if referrer is from our domain (not Stripe)
				try {
					const referrerUrl = new URL(document.referrer)
					const currentUrl = new URL(window.location.href)
					// Only use referrer if it's from the same origin and not the cancel page
					if (referrerUrl.origin === currentUrl.origin && 
						!referrerUrl.pathname.includes('/cancel') && 
						!referrerUrl.pathname.includes('/success') &&
						referrerUrl.pathname !== '/') {
						stored = document.referrer
						// Store it for future use
						sessionStorage.setItem("checkout_return_url", stored)
						console.log("[Cancel Page] Got returnUrl from referrer:", stored)
					}
				} catch (e) {
					// Invalid referrer URL, ignore
					console.error("[Cancel Page] Error parsing referrer:", e)
				}
			}
			
			// Validate stored URL - if it's just the base URL, log warning
			if (stored) {
				try {
					const urlObj = new URL(stored)
					if (urlObj.pathname === '/' || urlObj.pathname === '') {
						console.warn("[Cancel Page] Return URL is just base URL, this will redirect to home page:", stored)
						// Don't use it if it's just the base URL
						stored = null
					}
				} catch (e) {
					// If it's not a full URL, it might be a relative path, which is OK
					console.log("[Cancel Page] Return URL is relative path:", stored)
				}
			}
			
			if (stored) {
				setReturnUrl(stored)
				// Don't clear it yet - we'll clear it when user successfully retries
			} else {
				console.warn("[Cancel Page] No valid return URL found. Query param:", returnUrlParam, "SessionStorage:", sessionStorage.getItem("checkout_return_url"), "Referrer:", document.referrer)
			}
			
			// Store flag to indicate we should reopen checkout form
			sessionStorage.setItem("checkout_retry", "true")
		}
	}, [router.isReady, returnUrlParam])

	const handleBack = () => {
		// Go back one step in history if possible
		if (hasHistory && typeof window !== 'undefined') {
			window.history.back()
		} else if (returnUrl) {
			router.push(returnUrl)
		} else {
			router.push("/")
		}
	}

	const handleTryAgain = () => {
		// Go back to event page and reopen checkout form
		// Preserve the retry flag so checkout form can reopen
		sessionStorage.setItem("checkout_retry", "true")
		
		// Try to get returnUrl from multiple sources
		let urlToUse = returnUrl
		
		// Debug: Log all available sources
		console.log("[Cancel Page] handleTryAgain - returnUrl state:", returnUrl)
		console.log("[Cancel Page] handleTryAgain - sessionStorage:", sessionStorage.getItem("checkout_return_url"))
		console.log("[Cancel Page] handleTryAgain - query param:", returnUrlParam)
		console.log("[Cancel Page] handleTryAgain - referrer:", document.referrer)
		
		if (!urlToUse && typeof window !== 'undefined') {
			// Try sessionStorage again
			urlToUse = sessionStorage.getItem("checkout_return_url")
		}
		
		// Also try query parameter again in case it wasn't loaded in useEffect
		if (!urlToUse && typeof window !== 'undefined') {
			try {
				const urlParams = new URLSearchParams(window.location.search)
				const urlParam = urlParams.get('returnUrl')
				if (urlParam) {
					urlToUse = decodeURIComponent(urlParam)
					console.log("[Cancel Page] Got returnUrl from URL search params in handleTryAgain:", urlToUse)
				}
			} catch (e) {
				console.error("[Cancel Page] Error reading returnUrl from URL search in handleTryAgain:", e)
			}
		}
		
		if (!urlToUse && typeof window !== 'undefined' && document.referrer) {
			// Try to use referrer if returnUrl is not available
			try {
				const referrerUrl = new URL(document.referrer)
				const currentUrl = new URL(window.location.href)
				// Only use referrer if it's from the same origin and not the cancel/success page
				if (referrerUrl.origin === currentUrl.origin && 
					!referrerUrl.pathname.includes('/cancel') && 
					!referrerUrl.pathname.includes('/success') &&
					referrerUrl.pathname !== '/') {
					urlToUse = document.referrer
					console.log("[Cancel Page] Using referrer as returnUrl:", urlToUse)
				}
			} catch (e) {
				// Invalid referrer URL, fall through to default
				console.error("[Cancel Page] Error parsing referrer in handleTryAgain:", e)
			}
		}
		
		if (urlToUse) {
			// Validate URL - if it's just the base URL, try to extract event slug or use history
			try {
				const urlObj = new URL(urlToUse)
				// If URL is just the base domain (no path or just '/'), it will go to home page
				if (urlObj.pathname === '/' || urlObj.pathname === '') {
					console.warn("[Cancel Page] Return URL is base URL, trying history.back() instead")
					if (hasHistory && typeof window !== 'undefined') {
						window.history.back()
						return
					}
					// If history.back() doesn't work, don't navigate to home - just show error
					console.error("[Cancel Page] Cannot navigate - return URL is base URL and no history available")
					alert("Unable to return to event page. Please navigate back manually.")
					return
				}
			} catch (e) {
				// If URL parsing fails, try to use it as a relative path
				console.warn("[Cancel Page] Error parsing URL, treating as relative:", urlToUse)
			}
			
			console.log("[Cancel Page] Navigating to:", urlToUse)
			router.push(urlToUse)
		} else {
			// Last resort: try to go back in history
			console.log("[Cancel Page] No URL found, trying history.back()")
			if (hasHistory && typeof window !== 'undefined') {
				window.history.back()
			} else {
				// Final fallback: show error instead of going to home
				console.error("[Cancel Page] No return URL and no history available")
				alert("Unable to return to event page. Please use your browser's back button or navigate to the event manually.")
			}
		}
	}

	return (
		<>
			<Head>
				<title>Payment Canceled - Jetzy Events</title>
				<meta name="description" content="Your payment was canceled. Please try again." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
				{/* Main Container */}
				<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					{/* Content Section */}
					<div className="p-6 sm:p-8 text-center">
						{/* Cancel Icon */}
						<div className="mb-6">
							<svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</div>

						{/* Cancel Message */}
						<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Payment Canceled</h1>
						<p className="text-gray-600 mb-2">Your payment was not completed.</p>
						<p className="text-gray-500 text-sm mb-6">You can go back to continue or return to the event page to try again.</p>

						{/* Action Buttons */}
						<div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
							{hasHistory && (
								<button
									onClick={handleBack}
									className="bg-white text-purple-600 border-2 border-purple-600 px-6 py-3 rounded-full hover:bg-purple-50 transition-all transform hover:scale-105 shadow-lg"
								>
									← Go Back
								</button>
							)}
							<button
								onClick={handleTryAgain}
								className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
							>
								{returnUrl ? "Back to Event" : "Try Again"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default CheckoutCancelPage
