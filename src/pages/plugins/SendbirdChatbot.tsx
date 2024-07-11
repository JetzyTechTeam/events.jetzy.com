import React from "react"

export default function SendbirdChatbot() {
	React.useEffect(() => {
		// Load your external JavaScript code here
		const script = document.createElement("script")
		script.src = process.env.NEXT_PUBLIC_URL + "/js/sendbird.js"
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

	return <div id="aichatbot" />
}
