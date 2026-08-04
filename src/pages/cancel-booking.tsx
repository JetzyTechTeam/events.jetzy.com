import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'

export default function CancelBookingPage() {
	const router = useRouter()
	const { bookingRef } = router.query
	const [loading, setLoading] = useState(false)
	const [booking, setBooking] = useState<any>(null)
	const [preview, setPreview] = useState<any>(null)
	const [loadingPreview, setLoadingPreview] = useState(true)
	const [error, setError] = useState('')
	const [cancelled, setCancelled] = useState(false)

	// Load what is actually being cancelled. Without this the page asked people to confirm
	// something it couldn't name — and it can't show the right money warning either.
	useEffect(() => {
		if (!router.isReady) return
		if (!bookingRef) {
			setLoadingPreview(false)
			setError('Invalid booking reference')
			return
		}

		let active = true
		axios
			.get(`/api/bookings/preview?bookingRef=${encodeURIComponent(String(bookingRef))}`)
			.then((res) => {
				if (!active) return
				if (res.data?.status) setPreview(res.data.data)
				else setError(res.data?.message || 'Booking not found')
			})
			.catch((err) => {
				if (!active) return
				setError(err.response?.data?.message || 'We could not load this booking.')
			})
			.finally(() => active && setLoadingPreview(false))

		return () => { active = false }
	}, [router.isReady, bookingRef])

	const handleCancelBooking = async () => {
		if (!bookingRef) {
			setError('Invalid booking reference')
			return
		}

		setLoading(true)
		setError('')

		try {
			const response = await axios.post('/api/bookings/cancel', {
				bookingRef
			})

			if (response.data.status) {
				setCancelled(true)
				setBooking(response.data.data?.booking)
			} else {
				setError(response.data.message || 'Failed to cancel booking')
			}
		} catch (error: any) {
			console.error('Error cancelling booking:', error)
			setError(error.response?.data?.message || 'Failed to cancel booking. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	if (cancelled) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
				<div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					<div className="p-6 sm:p-8 text-center">
						<div className="mb-6">
							<div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
								<svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</div>
						</div>
						<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Booking Cancelled</h1>
						<p className="text-gray-600 mb-6">
							Your booking has been successfully cancelled. Your ticket slots have been freed up for other attendees.
						</p>
						{booking && (
							<div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
								<h3 className="font-semibold text-gray-800 mb-2">Booking Details:</h3>
								<p className="text-sm text-gray-600">
									<strong>Booking Reference:</strong> {booking.bookingRef}
								</p>
								<p className="text-sm text-gray-600">
									<strong>Status:</strong> <span className="text-red-600 font-semibold">Cancelled</span>
								</p>
								<p className="text-sm text-gray-600">
									<strong>Cancelled on:</strong> {new Date().toLocaleString()}
								</p>
							</div>
						)}
						<button
							onClick={() => router.push('/')}
							className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
						>
							Back to Home
						</button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
			<div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
				<div className="p-6 sm:p-8 text-center">
					<div className="mb-6">
						<div className="w-16 h-16 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-4">
							<svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
							</svg>
						</div>
					</div>
					<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Cancel Your Booking</h1>
					<p className="text-gray-600 mb-6">
						Are you sure you want to cancel your booking? This action will free up your ticket slots for other attendees.
					</p>
					{bookingRef && (
						<div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
							<p className="text-sm text-gray-600">
								<strong>Booking Reference:</strong> {bookingRef}
							</p>
							{preview?.event?.name && (
								<p className="text-sm text-gray-600 mt-1">
									<strong>Event:</strong> {preview.event.name}
								</p>
							)}
							{preview?.ticketCount ? (
								<p className="text-sm text-gray-600 mt-1">
									<strong>Tickets:</strong> {preview.ticketCount}
								</p>
							) : null}
						</div>
					)}

					{/* Jetzy issues no refunds — a guest about to lose money must be told before
					    they press the button, not after. */}
					{preview?.moneyState === 'captured' && (
						<div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 text-left">
							<p className="text-red-700 text-sm font-bold mb-1">This booking is non-refundable.</p>
							<p className="text-red-700 text-sm">
								${Number(preview.moneyAmount || 0).toFixed(2)} was paid for this booking and will NOT be returned to you.
							</p>
						</div>
					)}
					{preview?.moneyState === 'unknown' && (
						<div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 text-left">
							<p className="text-red-700 text-sm font-bold mb-1">This booking is non-refundable.</p>
							<p className="text-red-700 text-sm">
								If a payment of ${Number(preview.moneyAmount || 0).toFixed(2)} was made for this booking, it will NOT be
								returned to you.
							</p>
						</div>
					)}
					{preview?.moneyState === 'hold' && (
						<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
							<p className="text-blue-700 text-sm">
								You have not been charged. The ${Number(preview.moneyAmount || 0).toFixed(2)} hold on your card will be
								released immediately.
							</p>
						</div>
					)}

					{preview && !preview.canCancel && (
						<div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mb-6">
							<p className="text-gray-700 text-sm">{preview.cancelBlockedReason || 'This booking can no longer be cancelled.'}</p>
						</div>
					)}

					{error && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
							<p className="text-red-600 text-sm">{error}</p>
						</div>
					)}
					<div className="flex flex-col sm:flex-row gap-4 justify-center">
						<button
							onClick={handleCancelBooking}
							disabled={loading || loadingPreview || (!!preview && !preview.canCancel)}
							className="bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{loading ? 'Cancelling...' : loadingPreview ? 'Loading...' : 'Yes, Cancel My Booking'}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
