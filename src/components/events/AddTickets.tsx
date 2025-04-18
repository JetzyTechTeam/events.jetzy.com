import { PlusIcon } from "@heroicons/react/24/outline"
import React from "react"
import TicketCard, { TicketCardProps, TicketData } from "./TicketCard"

type Props = TicketCardProps & {
  initialTickets?: TicketData[]
}

export default function AddTickets(props: Props) {
  const [tickets, setTickets] = React.useState<React.ReactNode[]>([])
  
  React.useEffect(() => {
    if (props.initialTickets && props.initialTickets.length > 0) {
      const initialTicketComponents = props.initialTickets.map((ticket) => (
        <TicketCard 
          key={ticket.id} 
          {...props} 
          initialData={ticket}
        />
      ))
      setTickets(initialTicketComponents)
    }
  }, [props.initialTickets])
  
  return (
    <section className="bg-slate-300 space-y-6 p-3 rounded-lg">
      <header className="grid grid-rows-2 divide-y divide-slate-400">
        <div className="pb-2 flex items-center justify-between">
          <h2 className="text-slat-400 font-bold">Add Tickets</h2>
          <button
            onClick={() => setTickets([...tickets, <TicketCard key={tickets.length} {...props} />])}
            type="button"
            className="flex items-center justify-center w-8 h-8 bg-app rounded-full text-white shadow-sm hover:bg-app/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
          >
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="w-full"></div>
      </header>

      <section className="space-y-4">{tickets}</section>
    </section>
  )
}
