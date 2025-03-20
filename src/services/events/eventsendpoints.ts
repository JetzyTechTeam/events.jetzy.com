export const eventEndPoints = {
	create: "public:/events/create",
	list: "public:/events",
	fetch: "public:/events/:slug",
	update: "public:/events/:eventId/update",
	delete: "public:/events/:eventId/delete",
	tickets: {
		update: "public:/events/:eventId/tickets/:ticketId/update",
		delete: "public:/events/:eventId/tickets/:ticketId/delete",
	},
}
