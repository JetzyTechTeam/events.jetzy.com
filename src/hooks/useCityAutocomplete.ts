import React from "react"
import { placeToProfileLocation, type ProfileLocation } from "@/lib/jetzy-profile"

/**
 * City search for the profile form — our own, because the library's service hook crashes the page.
 *
 * `react-google-autocomplete`'s `usePlacesAutocompleteService` builds its services with
 * `if (!google) return …`: a BARE identifier, so when the Maps script hasn't loaded (blocked, bad or
 * missing key, offline) reading it throws `ReferenceError: google is not defined` inside a React
 * effect — which unmounted the tree and blanked the profile form on staging. Every access here is
 * guarded with `typeof google`, and nothing in this file ever throws into React: a failure becomes
 * `status: "unavailable"` and the form falls back to a plain typed city.
 *
 * (`usePlacesWidget`, used by the event forms, guards properly and is untouched.)
 */

export type CityPrediction = { placeId: string; main: string; secondary: string }
export type CityAutocompleteStatus = "loading" | "ready" | "unavailable"

const SCRIPT_BASE = "https://maps.googleapis.com/maps/api/js"
const LOAD_TIMEOUT_MS = 10_000
const DEBOUNCE_MS = 300

const placesReady = () => {
	if (typeof window === "undefined") return false
	const g = (window as any).google
	return !!g?.maps?.places
}

/** One load per page, whatever the outcome. Resolves true/false — never rejects. */
let loadPromise: Promise<boolean> | null = null

const loadGoogleMaps = (apiKey?: string): Promise<boolean> => {
	if (typeof window === "undefined") return Promise.resolve(false)
	if (placesReady()) return Promise.resolve(true)
	if (loadPromise) return loadPromise

	loadPromise = new Promise<boolean>((resolve) => {
		const settle = (ok: boolean) => resolve(ok && placesReady())
		const timer = setTimeout(() => settle(false), LOAD_TIMEOUT_MS)
		const done = (ok: boolean) => {
			clearTimeout(timer)
			settle(ok)
		}

		try {
			// A tag another component already added (the event forms' picker) — wait for it rather than
			// loading the API twice, which Google warns about and which can reset its state.
			const existing = document.querySelector(`script[src*="${SCRIPT_BASE}"]`) as HTMLScriptElement | null
			if (existing) {
				existing.addEventListener("load", () => done(true))
				existing.addEventListener("error", () => done(false))
				return
			}

			if (!apiKey) return done(false)

			const script = document.createElement("script")
			script.src = `${SCRIPT_BASE}?libraries=places&key=${encodeURIComponent(apiKey)}`
			script.async = true
			script.addEventListener("load", () => done(true))
			script.addEventListener("error", () => done(false))
			document.body.appendChild(script)
		} catch {
			done(false)
		}
	})

	return loadPromise
}

export function useCityAutocomplete(apiKey?: string) {
	const [status, setStatus] = React.useState<CityAutocompleteStatus>("loading")
	const [predictions, setPredictions] = React.useState<CityPrediction[]>([])
	const [loading, setLoading] = React.useState(false)

	const serviceRef = React.useRef<any>(null)
	const placesRef = React.useRef<any>(null)
	const tokenRef = React.useRef<any>(null)
	const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	/** Only the newest search may write results — an earlier, slower one must not overwrite them. */
	const queryIdRef = React.useRef(0)
	const mountedRef = React.useRef(true)

	React.useEffect(() => {
		mountedRef.current = true
		let cancelled = false

		loadGoogleMaps(apiKey).then((ok) => {
			if (cancelled || !mountedRef.current) return
			if (!ok) return setStatus("unavailable")
			try {
				const g = (window as any).google
				serviceRef.current = new g.maps.places.AutocompleteService()
				placesRef.current = new g.maps.places.PlacesService(document.createElement("div"))
				tokenRef.current = new g.maps.places.AutocompleteSessionToken()
				setStatus("ready")
			} catch {
				setStatus("unavailable")
			}
		})

		return () => {
			cancelled = true
			mountedRef.current = false
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [apiKey])

	const reset = React.useCallback(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		queryIdRef.current += 1
		setPredictions([])
		setLoading(false)
	}, [])

	/** Debounced. `countryCode` is ISO-2; results are restricted to it. */
	const search = React.useCallback((text: string, countryCode?: string) => {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		const input = text.trim()
		if (!input || !countryCode || !serviceRef.current) {
			queryIdRef.current += 1
			setPredictions([])
			setLoading(false)
			return
		}

		const id = ++queryIdRef.current
		setLoading(true)
		debounceRef.current = setTimeout(() => {
			try {
				serviceRef.current.getPlacePredictions(
					{
						input,
						types: ["(cities)"],
						componentRestrictions: { country: countryCode.toLowerCase() },
						...(tokenRef.current ? { sessionToken: tokenRef.current } : {}),
					},
					(results: any[]) => {
						// A stale response, or the component has gone.
						if (!mountedRef.current || id !== queryIdRef.current) return
						setLoading(false)
						setPredictions(
							(results || []).map((p) => ({
								placeId: p.place_id,
								main: p.structured_formatting?.main_text || p.description,
								secondary: p.structured_formatting?.secondary_text || "",
							})),
						)
					},
				)
			} catch {
				if (!mountedRef.current) return
				setLoading(false)
				setPredictions([])
				setStatus("unavailable")
			}
		}, DEBOUNCE_MS)
	}, [])

	/** The chosen city with its coordinates. Resolves `null` if Google can't answer. */
	const pick = React.useCallback((placeId: string): Promise<ProfileLocation | null> => {
		return new Promise((resolve) => {
			if (!placesRef.current) return resolve(null)
			try {
				placesRef.current.getDetails(
					{
						placeId,
						fields: ["address_components", "geometry", "name"],
						...(tokenRef.current ? { sessionToken: tokenRef.current } : {}),
					},
					(place: any, detailsStatus: string) => {
						// A search plus its details is one billable session; start a fresh one after each.
						try {
							const g = (window as any).google
							if (g?.maps?.places) tokenRef.current = new g.maps.places.AutocompleteSessionToken()
						} catch {}
						if (detailsStatus !== "OK" || !place) return resolve(null)
						resolve(placeToProfileLocation(place))
					},
				)
			} catch {
				resolve(null)
			}
		})
	}, [])

	return { status, predictions, loading, search, pick, reset }
}
