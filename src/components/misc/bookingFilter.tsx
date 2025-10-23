import {Flex , Input , Select ,Button , HStack } from "@chakra-ui/react"


import { useRouter } from "next/router"
import { useState } from "react"

type Props = {
    eventId: string
    initialFilters: { status?: string; date?: string; search?: string; amount?:string; minTickets?:string; }
}


export default function BookingFilters({ eventId, initialFilters }: Props) {
    const router = useRouter()
    const [status, setStatus] = useState(initialFilters.status|| "")

    const [search, setSearch] = useState(initialFilters.search ||"")
    const [date ,setDate] = useState(initialFilters.date || "")
    const [amount, setAmount] = useState(initialFilters.amount ||"");
    const [minTickets, setMinTickets] = useState(initialFilters.minTickets || "");



    const applyFilters = () => {
        const params = new URLSearchParams()
        if (status) params.set("status", status);
        if (search) params.set("search", search.trim());
        if (date) params.set("date", date);
        if (amount) params.set("amount", amount.trim());
        if (minTickets) params.set("minTickets", minTickets.trim());

        router.push(`/console/bookings/${eventId}?${params.toString()}`)
        }

    return (
    <Flex gap={2} p={2} wrap="wrap">
            <Input placeholder="Name or Email" value={search} onChange={(e) => setSearch(e.target.value)} width="350px"/>
            <Input
                placeholder="Min Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                width="175px"
            />
            <Select placeholder="Status" value={status} onChange={(e) => setStatus(e.target.value)}  width="150px">
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
            </Select>
            
            <Input placeholder="Tickets (min)"
                type="number"
                value={minTickets}
                onChange={(e) => setMinTickets(e.target.value)}
                width="175px"
            />
            <Input type="date" name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                width="180px"

            />
        <Button colorScheme="blue" onClick={ applyFilters} height="40px" px={6} fontWeight="semibold">
            Apply
        </Button>
    
    </Flex>
    )
}
