import React from "react"
import { Modal, ModalOverlay, ModalContent } from "@chakra-ui/react"
import { signOut, useSession } from "next-auth/react"
import { usePlacesWidget } from "react-google-autocomplete"
import { uploadFile } from "@/services/upload.service"
import { useAppDispatch } from "@Jetzy/redux/stores"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import Spinner from "@Jetzy/components/misc/Spinner"
import { allowPlacesDropdown, suppressPlacesDropdown } from "@/lib/google-place"
import {
	GENDER_OPTIONS,
	dobParts,
	formatProfileLocation,
	hasLocation,
	isDefaultAvatar,
	placeToProfileLocation,
	toBackendDob,
	type JetzyProfile,
	type ProfileLocation,
} from "@/lib/jetzy-profile"

/**
 * "Complete your profile" — the same two steps the mobile app asks (photo, full name, date of
 * birth; then gender), plus location, which the portal also requires. Saves through
 * `PUT /api/profile`, which writes the backend profile mobile reads.
 *
 * Deliberately NOT dismissible: no close button, overlay click or Esc. Logout is offered instead
 * so nobody is trapped.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const daysIn = (year?: number, month?: number) => (month ? new Date(Date.UTC(year || 2000, month, 0)).getUTCDate() : 31)

const fieldClass =
	"w-full rounded-xl border border-[#343536] bg-[#090C10] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-app"

/**
 * The Places input lives in its OWN component on purpose. `usePlacesWidget` attaches Google
 * Autocomplete in a mount-only effect and silently gives up if the input doesn't exist yet. Called
 * at the top of the modal, that effect ran while step 1 was showing (and before Chakra's portal had
 * mounted), so the step-2 input never got suggestions and no place could ever be picked. Mounting
 * the hook with the input guarantees the element is there when it looks.
 */
function ProfileLocationInput({
	value,
	onTextChange,
	onPick,
}: {
	value: string
	onTextChange: (text: string) => void
	onPick: (location: ProfileLocation, text: string) => void
}) {
	const lastPicked = React.useRef(value)

	const { ref: placesRef } = usePlacesWidget<HTMLInputElement>({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			const loc = placeToProfileLocation(place)
			const text = formatProfileLocation(loc) || place?.formatted_address || ""
			lastPicked.current = text
			onPick(loc, text)
		},
		options: {
			types: ["(cities)"],
			fields: ["address_components", "geometry", "name", "formatted_address"],
		},
	})

	return (
		<input
			id="profile-location"
			ref={placesRef}
			type="text"
			value={value}
			onFocus={() => {
				// An untouched saved location must not pop a fresh search on focus.
				if (value && value === lastPicked.current) suppressPlacesDropdown()
			}}
			onChange={(e) => {
				allowPlacesDropdown()
				onTextChange(e.target.value)
			}}
			onBlur={() => allowPlacesDropdown()}
			placeholder="Search your city"
			autoComplete="off"
			className={`mt-2 ${fieldClass}`}
		/>
	)
}

type Props = {
	isOpen: boolean
	initialProfile?: JetzyProfile
	onCompleted: (profile?: JetzyProfile) => void
}

export default function ProfileCompletionModal({ isOpen, initialProfile, onCompleted }: Props) {
	const { update } = useSession()
	const dispatch = useAppDispatch()

	const [step, setStep] = React.useState<1 | 2>(1)
	const [image, setImage] = React.useState("")
	const [uploading, setUploading] = React.useState(false)
	const [fullName, setFullName] = React.useState("")
	const [month, setMonth] = React.useState<number | undefined>()
	const [day, setDay] = React.useState<number | undefined>()
	const [year, setYear] = React.useState<number | undefined>()
	const [gender, setGender] = React.useState("")
	const [location, setLocation] = React.useState<ProfileLocation>({})
	const [locationText, setLocationText] = React.useState("")
	const [error, setError] = React.useState<string | null>(null)
	const [saving, setSaving] = React.useState(false)
	const fileRef = React.useRef<HTMLInputElement>(null)
	const seededRef = React.useRef(false)

	// Prefill once from whatever the profile already holds — mobile may have filled half of it.
	React.useEffect(() => {
		if (!initialProfile || seededRef.current) return
		seededRef.current = true
		const p = initialProfile
		if (!isDefaultAvatar(p.image)) setImage(p.image || "")
		setFullName(p.fullName || "")
		const parts = dobParts(p.dob)
		setMonth(parts.month)
		setDay(parts.day)
		setYear(parts.year)
		if (p.gender && (GENDER_OPTIONS as readonly string[]).includes(p.gender)) setGender(p.gender)
		if (hasLocation(p.location)) {
			setLocation(p.location || {})
			setLocationText(formatProfileLocation(p.location) || "Current location")
		}
	}, [initialProfile])

	// Feb 30 must not survive a month change.
	React.useEffect(() => {
		if (day && day > daysIn(year, month)) setDay(undefined)
	}, [day, month, year])

	const years = React.useMemo(() => {
		const now = new Date().getFullYear()
		return Array.from({ length: 100 }, (_, i) => now - i)
	}, [])

	const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		e.target.value = ""
		if (!file) return
		if (!file.type.startsWith("image/")) {
			setError("Please choose an image file.")
			return
		}
		setError(null)
		setUploading(true)
		try {
			const { url } = await uploadFile(file, { folder: "photos" })
			setImage(url)
		} catch {
			setError("Photo upload failed. Please try again.")
		} finally {
			setUploading(false)
		}
	}

	const goNext = () => {
		if (!image) return setError("Please add a profile photo.")
		if (!fullName.trim()) return setError("Please enter your full name.")
		if (!month || !day || !year) return setError("Please enter your date of birth.")
		if (new Date(Date.UTC(year, month - 1, day)) > new Date()) return setError("Date of birth can't be in the future.")
		setError(null)
		setStep(2)
	}

	const handleComplete = async () => {
		if (!gender) return setError("Please select how you identify.")
		if (!hasLocation(location)) return setError("Please pick your city from the suggestions.")
		if (!month || !day || !year) return setStep(1)
		setError(null)
		setSaving(true)
		try {
			const res = await fetch("/api/profile", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fullName: fullName.trim(),
					dob: toBackendDob(year, month, day),
					gender,
					image,
					location,
				}),
			})
			const json = await res.json().catch(() => null)
			if (!res.ok || !json?.status) {
				setError(json?.message || "We couldn't save your profile. Please try again.")
				setSaving(false)
				return
			}
			await update({ name: fullName.trim(), image }).catch(() => {})
			setSaving(false)
			onCompleted(json?.data?.profile)
		} catch {
			setError("Network error. Please try again.")
			setSaving(false)
		}
	}

	const logout = () => {
		try {
			sessionStorage.removeItem("api_token")
		} catch {}
		dispatch(destroySession({}))
		signOut({ callbackUrl: "/" })
	}

	const selectClass =
		"w-full appearance-none rounded-xl border border-[#343536] bg-[#090C10] px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-app [&>option]:bg-[#1E1E1E]"

	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {}}
			closeOnOverlayClick={false}
			closeOnEsc={false}
			// Google's suggestion list is appended to <body>, outside the modal. A focus trap pulls
			// focus back from it and the list closes before the click lands.
			trapFocus={false}
			isCentered
			size="md"
			scrollBehavior="inside"
		>
			<ModalOverlay bg="blackAlpha.700" />
			<ModalContent mx={4} borderRadius="2xl" bg="#1E1E1E" color="white" border="1px solid #434343">
				{/* Google's suggestion list renders on <body>, under Chakra's modal layer by default. */}
				<style>{`
					.pac-container{z-index:2000 !important;background:#1E1E1E;border:1px solid #434343;border-radius:12px;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:inherit}
					.pac-container:after{display:none}
					.pac-item{color:#9CA3AF;border-top:1px solid #2A2A2A;padding:8px 12px;cursor:pointer}
					.pac-item:first-child{border-top:none}
					.pac-item:hover,.pac-item-selected{background:#2A2A2A}
					.pac-item-query{color:#fff}
					.pac-matched{color:#F79432}
				`}</style>
				<div className="p-6">
					<h2 className="text-xl font-bold text-white">Complete your profile</h2>
					<p className="mt-2 text-xs text-gray-400">Step {step} of 2</p>
					<div className="mt-2 flex gap-2">
						<div className="h-1.5 flex-1 rounded-full bg-app" />
						<div className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-app" : "bg-[#343536]"}`} />
					</div>

					{step === 1 && (
						<>
							<p className="mt-4 text-sm text-gray-400">Add a photo, your name, and date of birth so others can recognize you.</p>

							<p className="mt-5 text-sm font-semibold text-white">Profile photo</p>
							<div className="mt-3 flex justify-center">
								<button
									type="button"
									onClick={() => fileRef.current?.click()}
									disabled={uploading}
									className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-dashed border-[#434343] bg-[#090C10]"
								>
									{image ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={image} alt="Profile" className="h-full w-full object-cover" />
									) : (
										<span className="text-sm font-medium text-app">Add photo</span>
									)}
									{uploading && (
										<span className="absolute inset-0 flex items-center justify-center bg-black/60">
											<Spinner />
										</span>
									)}
								</button>
								<input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
							</div>
							{image && !uploading && (
								<button type="button" onClick={() => fileRef.current?.click()} className="mx-auto mt-2 block text-xs font-medium text-app">
									Change photo
								</button>
							)}

							<label htmlFor="profile-full-name" className="mt-5 block text-sm font-semibold text-white">
								Full name
							</label>
							<input
								id="profile-full-name"
								type="text"
								value={fullName}
								maxLength={100}
								onChange={(e) => setFullName(e.target.value)}
								placeholder="Enter your full name"
								autoComplete="name"
								className={`mt-2 ${fieldClass}`}
							/>

							<p className="mt-5 text-sm font-semibold text-white">Date of birth</p>
							<div className="mt-2 grid grid-cols-3 gap-2">
								<select aria-label="Month" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? +e.target.value : undefined)} className={selectClass}>
									<option value="">Month</option>
									{MONTHS.map((m, i) => (
										<option key={m} value={i + 1}>
											{m}
										</option>
									))}
								</select>
								<select aria-label="Day" value={day ?? ""} onChange={(e) => setDay(e.target.value ? +e.target.value : undefined)} className={selectClass}>
									<option value="">Day</option>
									{Array.from({ length: daysIn(year, month) }, (_, i) => i + 1).map((d) => (
										<option key={d} value={d}>
											{d}
										</option>
									))}
								</select>
								<select aria-label="Year" value={year ?? ""} onChange={(e) => setYear(e.target.value ? +e.target.value : undefined)} className={selectClass}>
									<option value="">Year</option>
									{years.map((y) => (
										<option key={y} value={y}>
											{y}
										</option>
									))}
								</select>
							</div>
						</>
					)}

					{step === 2 && (
						<>
							<h3 className="mt-5 text-2xl font-bold text-white">How do you identify?</h3>
							<p className="mt-1 text-sm text-gray-400">Select your gender identity to help us personalize your experience.</p>
							<div className="mt-4 space-y-3" role="radiogroup">
								{GENDER_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										role="radio"
										aria-checked={gender === option}
										onClick={() => {
											setGender(option)
											setError(null)
										}}
										className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-base font-medium ${
											gender === option ? "border border-app bg-app/10 ring-1 ring-app" : "border border-[#343536] bg-[#090C10] hover:bg-white/5"
										}`}
									>
										{option}
										<span className={`h-5 w-5 rounded-full border-2 ${gender === option ? "border-app bg-app" : "border-gray-500"}`} />
									</button>
								))}
							</div>

							<label htmlFor="profile-location" className="mt-5 block text-sm font-semibold text-white">
								Location
							</label>
							<ProfileLocationInput
								value={locationText}
								onTextChange={(text) => {
									// Typed text is not a place — only a picked suggestion counts.
									setLocationText(text)
									setLocation({})
								}}
								onPick={(loc, text) => {
									setLocation(loc)
									setLocationText(text)
									setError(null)
								}}
							/>
							<p className="mt-1 text-xs text-gray-500">Start typing and pick your city from the suggestions.</p>
						</>
					)}

					{error && <p className="mt-4 text-sm text-red-400">{error}</p>}

					{step === 1 ? (
						<button
							type="button"
							onClick={goNext}
							disabled={uploading}
							className="mt-6 w-full rounded-xl bg-app py-3 text-base font-semibold text-black hover:bg-app/80 disabled:opacity-60"
						>
							Next
						</button>
					) : (
						<div className="mt-6 grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => {
									setError(null)
									setStep(1)
								}}
								disabled={saving}
								className="rounded-xl border border-[#434343] py-3 text-base font-medium text-white hover:bg-white/5"
							>
								Back
							</button>
							<button
								type="button"
								onClick={handleComplete}
								disabled={saving}
								className="flex items-center justify-center rounded-xl bg-app py-3 text-base font-semibold text-black hover:bg-app/80 disabled:opacity-60"
							>
								{saving ? <Spinner /> : "Complete"}
							</button>
						</div>
					)}

					<button type="button" onClick={logout} data-analytics-ignore="" className="mx-auto mt-4 block text-xs text-gray-500 hover:text-gray-300">
						Log out
					</button>
				</div>
			</ModalContent>
		</Modal>
	)
}
