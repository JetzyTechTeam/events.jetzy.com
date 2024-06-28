import React from "react"

export default function KlookAffiliatePlugin() {
	React.useEffect(() => {
		// Load your external JavaScript code here
		const script = document.createElement("script")
		script.src = process.env.NEXT_PUBLIC_URL + "/js/klook.js"
		script.async = true
		script.onload = () => {
			// Initialize the script or call functions defined in the script
			console.log("Script loaded successfully")
		}
		document.body.appendChild(script)

		// Cleanup function to remove the script when the component unmounts
		return () => {
			document.body.removeChild(script)
		}
	}, []) // Empty dependency array means this effect runs once after the initial render

	return (
		<ins
			className="klk-aff-widget"
			data-wid="65506"
			data-adid="876697"
			data-actids="7705,7635,5035"
			data-prod="mul_act"
			data-price="false"
			data-lang=""
			data-width="160"
			data-height="600"
			data-currency=""
		>
			<a href="//www.klook.com/">Klook.com</a>
		</ins>
	)
}
