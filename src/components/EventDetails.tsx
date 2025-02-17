import { IEvent } from "@/models/events/types"

type Props = {
	event: IEvent
}
export default function EventDetails({ event }: Props) {
	return (
		<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all mt-8">
			<div className="bg-gray-50 p-4 rounded-lg">
				<h3 className="font-semibold text-lg text-gray-800 my-4">About Event</h3>
				<div className="p-6 bg-gray-100 text-gray-900 text-lg">
					<p style={{ whiteSpace: "pre-line", fontSize: "1.2rem", lineHeight: "1.6" }}>{event.desc}</p>
				</div>
			</div>
		</div>
	)
}
