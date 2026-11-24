import { Badge, Tooltip } from "@chakra-ui/react"
import { bookingMarketingSource, marketingPlatformLabel } from "@/lib/marketing-link"

/**
 * "via Instagram bio" — which of the event's marketing links brought this booking in. Renders
 * nothing for a direct booking, so rows without a link look exactly as before. Used on the
 * Event Bookings page, the Guests tab and the event page's Bookings panel.
 */
export default function MarketingSourceTag({ booking, ml }: { booking: any; ml?: number }) {
	const source = bookingMarketingSource(booking)
	if (!source) return null
	return (
		<Tooltip hasArrow label={`Came from your ${source.platform ? marketingPlatformLabel(source.platform) + " " : ""}marketing link`}>
			<Badge
				ml={ml}
				variant="outline"
				colorScheme="orange"
				borderRadius="6px"
				textTransform="none"
				fontWeight="semibold"
				maxW="220px"
				overflow="hidden"
				textOverflow="ellipsis"
				whiteSpace="nowrap"
				verticalAlign="middle"
			>
				via {source.label}
			</Badge>
		</Tooltip>
	)
}
