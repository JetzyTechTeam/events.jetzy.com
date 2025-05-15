export enum Pages {
	Dasshboard = "Dashboard",
	Events = "Events",
	Bookings = "Bookings",
	Manage = 'Manage Event',
	CreateEvent = 'Create Event',
}

export enum Roles {
	USER = "user",
	ADMIN = "admin",
}

export enum EventPrivacy {
	PUBLIC = "public",
	PRIVATE = "private",
	GROUP = "group",
}

export enum TransactionStatus {
	PENDING = "pending",
	SUCCESS = "success",
	FAILED = "failed",
	RESERVED = "reserved",
}
