import React from "react"
import { Modal, ModalOverlay, ModalContent } from "@chakra-ui/react"
import { signOut, useSession } from "next-auth/react"
// Deep import: the package root re-exports only `usePlacesWidget`, and this is the service hook —
// predictions we render ourselves rather than Google's own `<body>` dropdown. Types ship beside it.
import usePlacesAutocompleteService from "react-google-autocomplete/lib/usePlacesAutocompleteService"
import { uploadFile } from "@/services/upload.service"
import { useAppDispatch } from "@Jetzy/redux/stores"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import Spinner from "@Jetzy/components/misc/Spinner"
import { countryCodeForName, listCountries } from "@/lib/countries"
import {
	GENDER_OPTIONS,
	dobParts,
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
 * The city field, searched within the chosen country — the same Country + City pair the mobile app
 * asks for. Google Places still does the searching because a picked city carries coordinates, which
 * `sync_location` needs exactly as mobile sends them.
 *
 * The suggestions are OURS, drawn inside the dialog under the field. Google's own dropdown
 * (`.pac-container`) is appended to `<body>` and positioned against the input, so in a centred modal
 * it landed half off-screen or over the dialog's edge and people didn't see it. A list in the
 * dialog's own flow scrolls with the form and cannot be clipped or mispositioned.
 *
 * Predictions come from `AutocompleteService`; the coordinates come from a `getDetails` call on the
 * chosen prediction, both under one session token so the pair bills as a single lookup.
 */
type CityPrediction = { place_id: string; main: string; secondary: string }

function ProfileCityInput({
	value,
	countryCode,
	onTextChange,
	onPick,
}: {
	value: string
	countryCode?: string
	onTextChange: (text: string) => void
	onPick: (location: ProfileLocation) => void
}) {
	const [open, setOpen] = React.useState(false)
	const [highlighted, setHighlighted] = React.useState(0)
	const [resolving, setResolving] = React.useState(false)
	/**
	 * A query is on its way but hasn't started.
	 *
	 * The hook debounces by 300ms, during which it is neither loading nor holding results — so the
	 * list said "No cities found" the moment somebody typed the first letter.
	 */
	const [awaitingSearch, setAwaitingSearch] = React.useState(false)
	const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const listRef = React.useRef<HTMLDivElement>(null)
	const inputRef = React.useRef<HTMLInputElement>(null)
	/**
	 * Open upwards when the space under the field is too small to show the list.
	 *
	 * On a phone the on-screen keyboard covers the bottom of the screen, and this field sits near the
	 * bottom of the dialog — so a list rendered below it was drawn behind the keyboard. `visualViewport`
	 * is what shrinks when the keyboard opens; `innerHeight` does not, on iOS.
	 */
	const [placeAbove, setPlaceAbove] = React.useState(false)

	const { placePredictions, getPlacePredictions, isPlacePredictionsLoading, placesService, refreshSessionToken } =
		usePlacesAutocompleteService({
			apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
			debounce: 300,
			sessionToken: true,
			options: { types: ["(cities)"], input: "" },
		})

	const predictions: CityPrediction[] = React.useMemo(
		() =>
			(placePredictions || []).map((p: any) => ({
				place_id: p.place_id,
				main: p.structured_formatting?.main_text || p.description,
				secondary: p.structured_formatting?.secondary_text || "",
			})),
		[placePredictions]
	)

	React.useEffect(() => () => {
		if (blurTimer.current) clearTimeout(blurTimer.current)
	}, [])

	// Results (or an empty result) are back.
	React.useEffect(() => {
		setAwaitingSearch(false)
	}, [placePredictions])

	// A freshly opened list must be visible even when it opens below a field near the dialog's fold.
	React.useEffect(() => {
		if (!open) return
		const id = setTimeout(() => listRef.current?.scrollIntoView({ block: "nearest" }), 50)
		return () => clearTimeout(id)
	}, [open, placePredictions])

	// Keep the highlighted row in view when arrowing through a scrolled list.
	React.useEffect(() => {
		const el = listRef.current?.children[highlighted] as HTMLElement | undefined
		el?.scrollIntoView({ block: "nearest" })
	}, [highlighted])

	// Enough room below for a list, or does it have to open upwards? Re-measured while the list is
	// open, because the keyboard appears AFTER focus and changes the answer.
	const measureSpace = React.useCallback(() => {
		const rect = inputRef.current?.getBoundingClientRect()
		if (!rect) return
		const viewportHeight = (typeof window !== "undefined" && window.visualViewport?.height) || window.innerHeight
		const below = viewportHeight - rect.bottom
		// Roughly two rows plus padding — less than this and the list is not usefully visible.
		setPlaceAbove(below < 170 && rect.top > below)
	}, [])

	React.useEffect(() => {
		if (!open) return
		measureSpace()
		const viewport = typeof window !== "undefined" ? window.visualViewport : undefined
		viewport?.addEventListener("resize", measureSpace)
		viewport?.addEventListener("scroll", measureSpace)
		window.addEventListener("resize", measureSpace)
		return () => {
			viewport?.removeEventListener("resize", measureSpace)
			viewport?.removeEventListener("scroll", measureSpace)
			window.removeEventListener("resize", measureSpace)
		}
	}, [open, measureSpace])

	const search = (text: string) => {
		if (!text.trim() || !countryCode) {
			setAwaitingSearch(false)
			return
		}
		setAwaitingSearch(true)
		getPlacePredictions({
			input: text,
			types: ["(cities)"],
			componentRestrictions: { country: countryCode.toLowerCase() },
		})
	}

	const choose = (prediction: CityPrediction) => {
		setOpen(false)
		if (!placesService) return
		setResolving(true)
		placesService.getDetails(
			{ placeId: prediction.place_id, fields: ["address_components", "geometry", "name"] },
			(place: any, status: string) => {
				setResolving(false)
				// A new token per completed lookup — one search plus its details is one session.
				refreshSessionToken?.()
				if (status !== "OK" || !place) {
					// Details failed: keep the name so nothing is lost, but no coordinates means the
					// field stays unpicked and the hint still asks for a suggestion.
					onTextChange(prediction.main)
					return
				}
				onPick(placeToProfileLocation(place))
			}
		)
	}

	const showList = open && !!countryCode && (predictions.length > 0 || isPlacePredictionsLoading || !!value.trim())

	const list = showList ? (
		<div
			id="profile-city-list"
			ref={listRef}
			role="listbox"
			className={`${placeAbove ? "mb-2" : "mt-2"} max-h-56 overflow-y-auto rounded-xl border border-[#434343] bg-[#141414]`}
		>
			{predictions.map((p, i) => (
				<button
					key={p.place_id}
					type="button"
					role="option"
					aria-selected={i === highlighted}
					onMouseEnter={() => setHighlighted(i)}
					onClick={() => choose(p)}
					className={`block w-full border-b border-[#2A2A2A] px-4 py-3 text-left last:border-b-0 ${
						i === highlighted ? "bg-[#2A2A2A]" : ""
					}`}
				>
					<span className="block text-base text-white">{p.main}</span>
					{p.secondary && <span className="block text-sm text-gray-400">{p.secondary}</span>}
				</button>
			))}
			{predictions.length === 0 && (
				<p className="px-4 py-3 text-sm text-gray-400">
					{isPlacePredictionsLoading || awaitingSearch ? "Searching…" : "No cities found"}
				</p>
			)}
		</div>
	) : null

	return (
		<div className="relative">
			{/* Above the field when the keyboard leaves no room below it — see `placeAbove`. */}
			{placeAbove && list}
			<input
				ref={inputRef}
				id="profile-city"
				type="text"
				value={value}
				disabled={!countryCode}
				role="combobox"
				aria-expanded={showList}
				aria-controls="profile-city-list"
				aria-autocomplete="list"
				onChange={(e) => {
					onTextChange(e.target.value)
					setHighlighted(0)
					setOpen(true)
					search(e.target.value)
				}}
				onFocus={() => {
					if (value.trim()) setOpen(true)
					// The keyboard slides up after focus; give it a moment, then bring the field (and the
					// room around it) into the shrunken viewport and re-measure which way to open.
					setTimeout(() => {
						inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
						measureSpace()
					}, 300)
				}}
				onBlur={() => {
					// Delayed — a click on a suggestion fires after blur.
					blurTimer.current = setTimeout(() => setOpen(false), 150)
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") return setOpen(false)
					if (!showList || predictions.length === 0) return
					if (e.key === "ArrowDown") {
						e.preventDefault()
						setHighlighted((i) => (i + 1) % predictions.length)
					} else if (e.key === "ArrowUp") {
						e.preventDefault()
						setHighlighted((i) => (i - 1 + predictions.length) % predictions.length)
					} else if (e.key === "Enter") {
						e.preventDefault()
						choose(predictions[highlighted])
					}
				}}
				placeholder={countryCode ? "Search your city" : "Select a country first"}
				autoComplete="off"
				className={`mt-2 ${fieldClass} text-base disabled:cursor-not-allowed disabled:opacity-50`}
			/>

			{!placeAbove && list}

			{resolving && <p className="mt-2 text-sm text-gray-400">Getting that city…</p>}
		</div>
	)
}

type Props = {
	isOpen: boolean
	initialProfile?: JetzyProfile
	onCompleted: (profile?: JetzyProfile) => void
	/** A line above the steps, e.g. after a purchase — "You're in", then why we're asking. */
	intro?: string
}

export default function ProfileCompletionModal({ isOpen, initialProfile, onCompleted, intro }: Props) {
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
	const [cityText, setCityText] = React.useState("")
	const [countryCode, setCountryCode] = React.useState("")
	const countries = React.useMemo(() => listCountries(), [])
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
			setCityText(p.location?.city || "")
			// A stored name we don't recognise ("USA") leaves the picker unset; the saved location
			// still stands until they choose a country.
			setCountryCode(countryCodeForName(p.location?.country) || "")
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
		// Mobile may have synced bare coordinates with no names — that still counts, untouched.
		const coordinatesOnly = !location.city && !location.country && hasLocation(location)
		if (!coordinatesOnly) {
			if (!location.country && !countryCode) return setError("Please select your country.")
			if (!location.city) return setError("Please pick your city from the suggestions.")
		}
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
			{/* Fully opaque, not a translucent dim — this gate can't be dismissed or clicked past, so
			    there's no reason to let the page underneath (and its own background colour) show
			    through around the card, which on some pages showed as a mismatched sliver above and
			    below it. */}
			<ModalOverlay bg="#0A0B0F" />
			<ModalContent mx={4} borderRadius="2xl" bg="#1E1E1E" color="white" border="1px solid #434343">
				<div className="p-6">
					{intro && <p className="mb-3 rounded-lg bg-app/10 px-3 py-2 text-sm font-medium text-app">{intro}</p>}
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

							<label htmlFor="profile-country" className="mt-5 block text-sm font-semibold text-white">
								Country
							</label>
							<select
								id="profile-country"
								value={countryCode}
								onChange={(e) => {
									const code = e.target.value
									setCountryCode(code)
									// A city belongs to its country — a new country clears it.
									setCityText("")
									setLocation({ country: countries.find((c) => c.code === code)?.name })
									setError(null)
								}}
								className={`mt-2 ${selectClass} ${countryCode ? "" : "text-gray-500"}`}
							>
								<option value="" disabled>
									Select your country
								</option>
								{countries.map((c) => (
									<option key={c.code} value={c.code}>
										{c.name}
									</option>
								))}
							</select>

							<label htmlFor="profile-city" className="mt-4 block text-sm font-semibold text-white">
								City
							</label>
							<ProfileCityInput
								value={cityText}
								countryCode={countryCode || undefined}
								onTextChange={(text) => {
									// Typed text is not a place — only a picked suggestion counts.
									setCityText(text)
									setLocation((prev) => ({ country: prev.country }))
								}}
								onPick={(loc) => {
									const countryName = countries.find((c) => c.code === countryCode)?.name
									setLocation({ ...loc, country: loc.country || countryName })
									setCityText(loc.city || "")
									setError(null)
								}}
							/>
							<p className="mt-2 flex items-start gap-2 text-sm text-gray-400">
								<span aria-hidden="true">📍</span>
								{!location.city && !location.country && hasLocation(location)
									? "Using the location from your Jetzy app. Pick a country and city to change it."
									: "Start typing your city, then pick it from the list that appears."}
							</p>
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
