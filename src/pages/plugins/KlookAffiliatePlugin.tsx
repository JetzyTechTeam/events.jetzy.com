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
		<div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0   lg:text-left relative z-10">
			<ins className="klk-aff-widget" data-adid="876633" data-lang="" data-currency="" data-cardH="126" data-padding="92" data-lgH="470" data-edgeValue="655" data-prod="static_widget" data-amount="5">
				<a href="//www.klook.com/">Klook.com</a>
			</ins>
		</div>
	)
}
