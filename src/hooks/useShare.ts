export type ShareData = {
	title?: string
	text?: string
	url?: string
}
export function useWebShare(defaultData?: ShareData) {
	const share = async (data: ShareData = defaultData as ShareData) => {
		if (navigator.share) {
			try {
				await navigator.share(data)
				console.log("Content shared successfully")
			} catch (error) {
				console.error("Error sharing content:", error)
			}
		} else {
			console.warn("Web Share API not supported in this browser")
			fallbackShare(data)
		}
	}

	const fallbackShare = (data: ShareData) => {
		const shareText = `${data.title ? `${data.title}\n` : ""}${data.text ? `${data.text}\n` : ""}${data.url ? data.url : ""}`
		navigator.clipboard
			.writeText(shareText)
			.then(() => alert("Share text copied to clipboard!"))
			.catch((err) => console.error("Could not copy to clipboard:", err))
	}

	return { share }
}
