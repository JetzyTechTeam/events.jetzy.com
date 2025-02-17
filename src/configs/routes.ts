const baseUrl = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "http://localhost:3000"
const scheme = process.env.NODE_ENV === "development" ? "http" : "https"

export const ROUTES = {
	// ----------------- Auth Routes -----------------
	create: `/signup`,
	login: `/login`,

	// ----------------- Dashboard  Routes -----------------
	dashboard: {
		index: "/console",
		events: {
			index: "/console/events",
			create: "/console/events/create",
			edit: "/console/events/:slug/edit",
			tickets: "/console/events/:eventId/tickets",
		},

		// ----------------- Orders  Routes -----------------
		bookings: {
			index: "/console/bookings",
		},
	},

	// ----------------- Public Routes -----------------
	home: "/",
	eventDetails: "/[slug]",
}
