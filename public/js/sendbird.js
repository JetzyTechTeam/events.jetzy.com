!(function (w, d, s, ...args) {
	var div = d.createElement("div")
	div.id = "aichatbot"
	d.body.appendChild(div)
	w.chatbotConfig = args
	var f = d.getElementsByTagName(s)[0],
		j = d.createElement(s)
	j.defer = true
	j.type = "module"
	j.src = "https://aichatbot.sendbird.com/index.js"
	f.parentNode.insertBefore(j, f)
})(window, document, "script", "AC66EBA6-A4A5-418E-BD43-1A16307BFF06", "onboarding_bot", {
	apiHost: "https://api-cf-us-3.sendbird.com",
})
