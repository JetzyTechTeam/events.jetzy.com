export const discussionEndpoints = {
	// Discussion Posts
	posts: {
		create: "public:/events/discussions/create",
		list: "public:/events/discussions/list",
		get: "public:/events/discussions/get",
		update: "public:/events/discussions/update",
		delete: "public:/events/discussions/delete",
		pin: "public:/events/discussions/pin",
		lock: "public:/events/discussions/lock",
		react: "public:/events/discussions/react",
		whoReacted: "public:/events/discussions/who-reacted",
		whoViewed: "public:/events/discussions/who-viewed",
		report: "public:/events/discussions/report",
	},
	// Discussion Comments
	comments: {
		create: "public:/events/discussions/comments/create",
		get: "public:/events/discussions/comments/get",
		reply: "public:/events/discussions/comments/reply",
		edit: "public:/events/discussions/comments/edit",
		delete: "public:/events/discussions/comments/delete",
		react: "public:/events/discussions/comments/react",
		whoReacted: "public:/events/discussions/comments/who-reacted",
		report: "public:/events/discussions/comments/report",
	},
}
