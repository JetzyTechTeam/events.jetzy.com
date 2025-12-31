import React, { useState, useEffect } from "react"
import { Box, Button, HStack, Text, Input, VStack, Flex } from "@chakra-ui/react"
import { FiCalendar } from "react-icons/fi"

interface DateRangeSelectorProps {
	dateFrom: Date | null
	dateTo: Date | null
	onDateChange: (from: Date | null, to: Date | null) => void
}

const formatDateForInput = (date: Date | null) => {
	if (!date) return ""
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

export default function DateRangeSelector({ dateFrom, dateTo, onDateChange }: DateRangeSelectorProps) {
	// Local state for input values (don't trigger API calls until Apply is clicked)
	const [localDateFrom, setLocalDateFrom] = useState<string>("")
	const [localDateTo, setLocalDateTo] = useState<string>("")

	// Update local state when props change
	useEffect(() => {
		setLocalDateFrom(dateFrom ? formatDateForInput(dateFrom) : "")
		setLocalDateTo(dateTo ? formatDateForInput(dateTo) : "")
	}, [dateFrom, dateTo])

	const handlePreset = (hours: number | null) => {
		if (hours === null) {
			// All time
			setLocalDateFrom("")
			setLocalDateTo("")
			onDateChange(null, null)
		} else if (hours <= 24) {
			// Hours-based (e.g., 24 hours) - use current time as end
			const now = new Date()
			const from = new Date(now.getTime() - hours * 60 * 60 * 1000)
			from.setHours(0, 0, 0, 0)
			setLocalDateFrom(formatDateForInput(from))
			setLocalDateTo(formatDateForInput(now))
			onDateChange(from, now)
		} else {
			// Days-based (convert hours to days) - use end of today
			const now = new Date()
			now.setHours(23, 59, 59, 999)
			const days = hours / 24
			const from = new Date()
			from.setDate(from.getDate() - days)
			from.setHours(0, 0, 0, 0)
			setLocalDateFrom(formatDateForInput(from))
			setLocalDateTo(formatDateForInput(now))
			onDateChange(from, now)
		}
	}

	const formatDate = (date: Date | null) => {
		if (!date) return "All Time"
		// For 24-hour range, show time as well
		if (dateFrom && dateTo && (dateTo.getTime() - dateFrom.getTime()) < (24 * 60 * 60 * 1000)) {
			return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
		}
		return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
	}

	const handleDateFromInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setLocalDateFrom(e.target.value)
	}

	const handleDateToInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setLocalDateTo(e.target.value)
	}

	const handleApply = () => {
		// Parse dates and set proper times
		let from: Date | null = null
		let to: Date | null = null

		if (localDateFrom) {
			from = new Date(localDateFrom)
			from.setHours(0, 0, 0, 0) // Start of day
		}

		if (localDateTo) {
			to = new Date(localDateTo)
			to.setHours(23, 59, 59, 999) // End of day
		}

		// Validate: if both dates exist, ensure from <= to
		if (from && to && from > to) {
			// Swap them if invalid
			const temp = from
			from = to
			from.setHours(0, 0, 0, 0)
			to = temp
			to.setHours(23, 59, 59, 999)
			setLocalDateFrom(formatDateForInput(from))
			setLocalDateTo(formatDateForInput(to))
		}

		// Apply the filter (this will trigger API calls)
		onDateChange(from, to)
	}

	const handleClear = () => {
		setLocalDateFrom("")
		setLocalDateTo("")
		onDateChange(null, null)
	}

	const maxDate = formatDateForInput(new Date())

	return (
		<VStack spacing={4} align="stretch">
			<Flex direction={{ base: "column", md: "row" }} gap={4} align={{ base: "stretch", md: "center" }}>
				{/* Custom Date Inputs */}
				<HStack spacing={2} flexWrap="wrap" flex={1}>
					<Box>
						<Text fontSize="xs" color="#65676B" mb={1}>
							Start Date
						</Text>
						<Input
							type="date"
							value={localDateFrom}
							onChange={handleDateFromInputChange}
							size="sm"
							max={localDateTo || maxDate}
							borderColor="#E4E6EB"
							_focus={{ borderColor: "#1877F2", boxShadow: "0 0 0 1px #1877F2" }}
						/>
					</Box>
					<Box>
						<Text fontSize="xs" color="#65676B" mb={1}>
							End Date
						</Text>
						<Input
							type="date"
							value={localDateTo}
							onChange={handleDateToInputChange}
							size="sm"
							min={localDateFrom}
							max={maxDate}
							borderColor="#E4E6EB"
							_focus={{ borderColor: "#1877F2", boxShadow: "0 0 0 1px #1877F2" }}
						/>
					</Box>
					<Box alignSelf="flex-end" pt={6}>
						<HStack spacing={2}>
							<Button size="sm" colorScheme="blue" onClick={handleApply}>
								Apply
							</Button>
							<Button size="sm" variant="outline" onClick={handleClear}>
								Clear
							</Button>
						</HStack>
					</Box>
				</HStack>

				{/* Preset Buttons */}
				<HStack spacing={2} flexWrap="wrap">
					<Button size="sm" variant="outline" onClick={() => handlePreset(24)}>
						Last 24 hours
					</Button>
					<Button size="sm" variant="outline" onClick={() => handlePreset(168)}>
						Last 7 days
					</Button>
					<Button size="sm" variant="outline" onClick={() => handlePreset(720)}>
						Last 30 days
					</Button>
					<Button size="sm" variant="outline" onClick={() => handlePreset(2160)}>
						Last 90 days
					</Button>
					<Button size="sm" variant="outline" onClick={() => handlePreset(null)}>
						All Time
					</Button>
				</HStack>
			</Flex>

			{/* Display Selected Range */}
			<Text fontSize="sm" color="#65676B">
				{dateFrom && dateTo ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "All Time"}
			</Text>
		</VStack>
	)
}

