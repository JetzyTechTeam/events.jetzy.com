export const capitalize = (s: string) => {
	if (typeof s !== "string") return ""
	return s.charAt(0).toUpperCase() + s.slice(1)
}

export const truncate = (str: string, num: number) => {
	if (str.length <= num) {
		return str
	}
	return str.slice(0, num) + "..."
}

export const placeholderBlurhash =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAoJJREFUWEfFl4lu4zAMRO3cx/9/au6reMaOdkxTTl0grQFCRoqaT+SQotq2bV9N8rRt28xms87m83l553eZ/9vr9Wpkz+ezkT0ej+6dv1X81AFw7M4FBACPVn2c1Z3zLgDeJwHgeLFYdAARYioAEAKJEG2WAjl3gCwNYymQQ9b7/V4spmIAwO6Wy2VnAMikBWlDURBELf8CuN1uHQSrPwMAHK5WqwFELQ01AIXdAa7XawfAb3p6AOwK5+v1ugAoEq4FRSFLgavfQ49jAGQpAE5wjgGCeRrGdBArwHOPcwFcLpcGU1X0IsBuN5tNgYhaiFFwHTiAwq8I+O5xfj6fOz38K+X/fYAdb7fbAgFAjIJ6Aav3AYlQ6nfnDoDz0+lUxNiLALvf7XaDNGQ6GANQBKR85V27B4D3QQRw7hGIYlQKWGM79hSweyCUe1blXhEAogfABwHAXAcqSYkxCtHLUK3XBajSc4Dj8dilAeiSAgD2+30BAEKV4GKcAuDqB4TdYwBgPQByCgApUBoE4EJUGvxUjF3Q69/zLw3g/HA45ABKgdIQu+JPIyDnisCfAxAFNFM0EFNQ64gfS0EUoQP8ighrZSjn3oziZEQpauyKbfjbZchHUL/3AS/Dd30gAkxuRACgfO+EWQW8qwI1o+wseNuKcQiESjALvwNoMI0TcRzD4lFcPYwIM+JTF5x6HOs8yI7jeB5oKhpMRFH9UwaSCDB2Jmg4rc6E2TT0biIaG0rQhNqyhpHBcayTTSXH6vcDL7/sdqRK8LkwTsU499E8vRcAojHcZ4AxABdilgrp4lsXk8oVqgwh7+6H3phqd8J0Kk4vbx/+sZqCD/vNLya/5dT9fAH8g1WdNGgwbQAAAABJRU5ErkJggg=="

export const toDateString = (date: Date) => {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

/**
 * Generate a unique id for use with map as keys or any other purpose.
 * @param {number} length The length of the unique id
 * @returns string
 */
export function uniqueId(length = 20) {
	let result = ""
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	const charactersLength = characters.length
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength))
	}
	return result
}

/**
 * Use the countdownTimer utility to set a timeout counter 
 * @param {number} mins The minutes to count down to
 * @param {function(boolean,number,number)} callback The callback handle which will be called 
after the count down minit has finished counting.
 */
export function countdownTimer(mins = 10, callback?: (elapse: boolean, minute: number, seconds: number) => void) {
	let timer: any = mins * 60,
		minutes: any,
		seconds: any
	const x = setInterval(function () {
		// @ts-ignore
		minutes = parseInt(timer / 60, 10)
		// @ts-ignore
		seconds = parseInt(timer % 60, 10)

		minutes = minutes < 10 ? `0${minutes}` : minutes
		seconds = seconds < 10 ? `0${seconds}` : seconds

		if (typeof callback === "function") {
			callback(true, minutes, seconds)
		}

		if (--timer < 0) {
			timer = 0
			window.clearInterval(x)
			// timer = duration; // uncomment this line to reset timer automatically after reaching 0
			return typeof callback === "function" ? callback(false, minutes, seconds) : ""
		}
	}, 1000)
}

/**
 * Sort the given array in alphabetical other
 * @param {array} arr The array to be sorted
 * @returns array
 */
export const ArraySortAlpha = (arr: Array<{ name: string }> = []) => {
	// make sure it's an array the user is providing
	if (!Array.isArray(arr)) return arr // return whatever user provided back

	return arr.sort((a, b) => {
		if (a.name.toUpperCase() < b.name.toUpperCase()) {
			return -1
		} else if (a.name.toUpperCase() > b.name.toUpperCase()) {
			return 1
		} else {
			return 0
		}
	})
}

/**
 * Shuffle array randomly
 * @param {array} arr The array to shuffle
 */
export function arrayShuffleRandomizer(arr: Array<any>) {
	let currentIndex = arr.length,
		randomIndex

	/* whle there remain elements to suffle.  */
	while (currentIndex !== 0) {
		/* pick a remaining element. */
		randomIndex = Math.floor(Math.random() * currentIndex)

		currentIndex--

		/* Swap it with the current element */
		;[arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]]
	}

	return arr
}

export function getDiscount(_amount: number, discount: number) {
	const _discountVal = _amount * (discount / 100)
	const _disc = Math.round(_discountVal * 100) / 100

	const newAmount = _amount - _disc

	return {
		amount: newAmount,
		discount: _disc,
	}
}

export const navigateTo = (path: string): void => {
	const origin = new URL(window.location.href)
	path = path.startsWith("/", 0) ? path : `/${path}`
	window.location.href = `${origin.origin}${path}`
}

export const snoopOnchange = () => {}

export const greetings = (name: string) => {
	var today = new Date()
	var curHr = today.getHours()

	if (curHr < 12) {
		return `Good morning ${name}`
	} else if (curHr < 18) {
		return `Good afternoon ${name}`
	} else {
		return `Good evening ${name}`
	}
}

export const waitUntil = (timeout: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, timeout))
}

// @ts-ignore
export const classNames = (...classes) => {
	return classes.filter(Boolean).join(" ")
}

export function formatDate(dateString: string): string {
	const date = new Date(dateString)
	const options: Intl.DateTimeFormatOptions = {
		weekday: "long",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		hour12: true,
	}

	const formatter = new Intl.DateTimeFormat("en-US", options)
	return formatter.format(date)
}

export function parseDateForSelection(htmlDateString: string): string | null {
	// Handle empty or invalid input
	if (!htmlDateString) {
		return null
	}

	// Regular expression for mm/dd/yyyy format (optional time)
	const regex = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s([0-1][0-9]|2[0-3]):([0-5][0-9]))?$/
	const match = regex.exec(htmlDateString)

	// Check if parsing was successful
	if (!match) {
		console.error("Invalid date format (mm/dd/yyyy [--:--])")
		return null
	}

	// Extract date components
	const month = parseInt(match[1], 10) - 1 // Adjust for zero-based month indexing
	const day = parseInt(match[2], 10)
	const year = parseInt(match[3], 10)

	// Extract time components (if provided)
	const hours = match[4] ? parseInt(match[4], 10) : 0
	const minutes = match[5] ? parseInt(match[5], 10) : 0

	// Create a Date object
	const dateObj = new Date(year, month, day, hours, minutes)

	// Ensure the date is valid
	if (isNaN(dateObj.getTime())) {
		console.error("Invalid date")
		return null
	}

	// Format the date object for selection (including time if provided)
	let formattedDate = dateObj.toLocaleDateString("en-US") // Adjust locale if needed

	if (hours && minutes) {
		formattedDate += ` ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
	}

	return formattedDate
}

export const formatTextWithLineBreaks = (text: string): string => {
	return text
		.replace(/\.\s+/g, ".\n") // Add \n after a period followed by space
		.replace(/! /g, "!\n") // Add \n after an exclamation mark
		.replace(/\? /g, "?\n") // Add \n after a question mark
		.replace(/(\n\s*)+/g, "\n") // Remove extra new lines (if any)
		.trim() // Trim leading/trailing spaces
}
