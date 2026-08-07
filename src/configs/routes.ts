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
			checkIn: "/console/events/:eventId/check-in",
		},

		// ----------------- Orders  Routes -----------------
		bookings: {
			index: "/console/bookings",
		},
	},

	// ----------------- Public Routes -----------------
	home: "/",
	eventDetails: "/[slug]",
	terms: "/terms",
	// A guest's own tickets. Not to be confused with `dashboard.bookings` above, which is
	// the host-side view of who booked events *you* run.
	myBookings: "/my-bookings",
	// Mobile-facing bridge page: plan picker + Stripe subscription checkout, entered via
	// magicToken and returning to the app via deep link when done.
	subscribe: "/subscribe",
	// Single entry point for cancelling or changing a Jetzy Premium membership. Handles
	// logged-out visitors by routing through login and back, so it can be linked from
	// anywhere — including mid-checkout, before the buyer has an account.
	manageMembership: "/manage-membership",
}

/**
 * Where "home" is for this user.
 *
 * An admin's home is the console, not the public listing — sending them to `/` after they
 * finish something drops them on a page they never work from. This rule already existed
 * inline in `login.tsx`; it lives here now so every "back to Jetzy" affordance agrees with
 * where logging in actually lands you.
 *
 * `role` is untyped on the session object, so this takes a loose string.
 */
export const homeRouteForRole = (role?: string | null): string =>
	role === "admin" || role === "super admin" ? ROUTES.dashboard.events.index : ROUTES.home
