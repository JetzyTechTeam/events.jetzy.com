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
			edit: "/console/events/:eventId/update",
			tickets: "/console/events/:eventId/tickets",
			manage: "/console/events/:eventId/manage",
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
