/**
 * Every ISO 3166-1 alpha-2 country, named in English by the browser/runtime (`Intl.DisplayNames`),
 * so there is no hand-maintained name table to drift. English matches what the backend stores and
 * what Google Places returns as the `country` component ("Pakistan", "United States").
 *
 * The code is what restricts the city search (`componentRestrictions.country`); the name is what
 * gets saved.
 */
const ISO_CODES =
	"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
	"CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
	"GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
	"KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
	"MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
	"SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
	"UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"

export type Country = { code: string; name: string }

let cached: Country[] | null = null

export const listCountries = (): Country[] => {
	if (cached) return cached
	let names: { of: (code: string) => string | undefined } | null = null
	try {
		names = new Intl.DisplayNames(["en"], { type: "region" })
	} catch {
		names = null
	}
	cached = ISO_CODES.split(" ")
		.map((code) => ({ code, name: names?.of(code) || code }))
		.sort((a, b) => a.name.localeCompare(b.name))
	return cached
}

/** Stored name → code, case-insensitive. Undefined for a name we don't recognise ("USA"). */
export const countryCodeForName = (name?: string) => {
	const wanted = name?.trim().toLowerCase()
	if (!wanted) return undefined
	return listCountries().find((c) => c.name.toLowerCase() === wanted)?.code
}
