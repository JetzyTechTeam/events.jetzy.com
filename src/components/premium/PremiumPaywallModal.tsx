import React, { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import axios from "axios"
import { StarIcon } from "@heroicons/react/24/solid"
import Spinner from "@/components/misc/Spinner"
import { Error as ErrorToast } from "@/lib/_toaster"

type PlanInfo = {
	name: string
	unitAmount: number | null
	currency: string
	interval: string
}

type Props = {
	isOpen: boolean
	onClose: () => void
	eventName: string
	returnTo: string
}

// Structurally mirrors EventCheckoutModel.tsx: one modal shell, multiple internal states
// (here: "locked" -> "plan"), same icon-circle/banner/message layout as its
// Pending-Approval / Waiting-List states.
const PremiumPaywallModal: React.FC<Props> = ({ isOpen, onClose, eventName, returnTo }) => {
	const [step, setStep] = useState<"locked" | "plan">("locked")

	const { data: plan, isLoading: planLoading } = useQuery({
		queryKey: ["premium-plan"],
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/plan")
			return data?.data as PlanInfo
		},
		enabled: isOpen && step === "plan",
	})

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axios.post("/api/subscriptions/checkout", { returnTo })
			return data?.data as { url: string }
		},
		onSuccess: (data) => {
			if (data?.url) {
				window.location.href = data.url
			} else {
				ErrorToast("Error", "Could not start checkout. Please try again.")
			}
		},
		onError: () => {
			ErrorToast("Error", "Could not start checkout. Please try again.")
		},
	})

	if (!isOpen) return null

	const handleClose = () => {
		setStep("locked")
		onClose()
	}

	const formattedPrice = plan?.unitAmount != null
		? (plan.unitAmount / 100).toLocaleString("en-US", { style: "currency", currency: plan.currency || "usd" })
		: null

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
			<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full max-w-lg relative max-h-[90vh] flex flex-col overflow-hidden">
				<button
					onClick={handleClose}
					className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center z-10"
				>
					&times;
				</button>

				{step === "locked" ? (
					<div className="p-6 space-y-6">
						<div className="text-center">
							<div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(245,197,24,0.15)" }}>
								<StarIcon className="w-8 h-8" style={{ color: "#F5C518" }} />
							</div>
							<div className="rounded-lg p-6 mb-6" style={{ background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.3)" }}>
								<p className="text-2xl font-bold text-center" style={{ color: "#F5C518" }}>Premium Event</p>
							</div>
							<p className="text-white mb-2">
								<strong>&quot;{eventName}&quot;</strong> is reserved for Jetzy Premium subscribers.
							</p>
							<p className="text-gray-400 text-sm mb-6">
								Subscribe to Jetzy Premium to unlock booking for this and every other premium event.
							</p>
							<div className="flex flex-col gap-3">
								<button
									onClick={() => setStep("plan")}
									className="font-bold px-6 py-3 rounded-lg hover:opacity-90 transition-colors"
									style={{ background: "#F5C518", color: "#000" }}
								>
									Upgrade to Jetzy Premium
								</button>
								<button
									onClick={handleClose}
									className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
								>
									Not now
								</button>
							</div>
						</div>
					</div>
				) : (
					<div className="p-6 space-y-6">
						<div className="text-center">
							<h2 className="text-2xl font-bold text-white mb-4">Jetzy Premium Events</h2>

							{planLoading ? (
								<div className="flex justify-center py-6"><Spinner /></div>
							) : plan ? (
								<div className="rounded-xl p-6 mb-6 border" style={{ background: "rgba(245,197,24,0.08)", borderColor: "rgba(245,197,24,0.3)" }}>
									<div className="flex items-center justify-center gap-2 mb-2">
										<StarIcon className="w-5 h-5" style={{ color: "#F5C518" }} />
										<p className="text-white font-semibold">{plan.name}</p>
									</div>
									<p className="text-3xl font-bold" style={{ color: "#F5C518" }}>
										{formattedPrice}
										<span className="text-sm text-gray-400 font-normal"> / {plan.interval}</span>
									</p>
								</div>
							) : (
								<p className="text-gray-400 mb-6">Could not load plan details.</p>
							)}

							<p className="text-gray-400 text-sm mb-6">
								You&apos;ll be redirected to Stripe to complete your subscription securely.
							</p>

							<div className="flex gap-3">
								<button
									type="button"
									onClick={() => setStep("locked")}
									className="w-1/3 border border-[#444] text-white font-bold px-6 py-3 rounded-xl transition-all hover:bg-[#222]"
								>
									Back
								</button>
								<button
									disabled={subscribeMutation.isPending}
									onClick={() => subscribeMutation.mutate()}
									className="w-2/3 font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50"
									style={{ background: "#F5C518", color: "#000" }}
								>
									{subscribeMutation.isPending ? <Spinner /> : "Subscribe Now"}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default PremiumPaywallModal
