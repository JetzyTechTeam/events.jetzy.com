import {Flex , Input , Select ,Button } from "@chakra-ui/react"
import { useRouter } from "next/router"
import { useState } from "react"

type Props = {
    eventId: string
    initialFilters: { status?: string; date?: string; search?: string; amount?:string; minTickets?:string; checkedIn?: string; }
}

export default function BookingFilters({ eventId, initialFilters }: Props) {
    const router = useRouter()
    const [status, setStatus] = useState(initialFilters.status|| "")
    const [search, setSearch] = useState(initialFilters.search ||"")
    const [date ,setDate] = useState(initialFilters.date || "")
    const [amount, setAmount] = useState(initialFilters.amount ||"");
    const [minTickets, setMinTickets] = useState(initialFilters.minTickets || "");
    const [checkedIn, setCheckedIn] = useState(initialFilters.checkedIn || "");

    const applyFilters = () => {
        const params = new URLSearchParams()
        if (status) params.set("status", status);
        if (search) params.set("search", search.trim());
        if (date) params.set("date", date);
        if (amount) params.set("amount", amount.trim());
        if (minTickets) params.set("minTickets", minTickets.trim());
        if (checkedIn) params.set("checkedIn", checkedIn);

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
            <Select placeholder="Status" value={status} onChange={(e) => setStatus(e.target.value)} width="150px" bg="#1a1a1a" color="white" borderColor="#444" _focus={{ borderColor: "#F79432" }} sx={{ option: { background: "#1a1a1a", color: "white" } }}>
                <option value="confirmed" style={{ background: "#1a1a1a", color: "white" }}>Confirmed</option>
                <option value="pending" style={{ background: "#1a1a1a", color: "white" }}>Pending</option>
                <option value="approved" style={{ background: "#1a1a1a", color: "white" }}>Approved</option>
                <option value="cancelled" style={{ background: "#1a1a1a", color: "white" }}>Cancelled</option>
                {/* No "Refunded" option: Jetzy issues no refunds, so BookingStatus.REFUNDED is
                    never written and the filter only ever returned an empty list. */}
                <option value="rejected" style={{ background: "#1a1a1a", color: "white" }}>Declined</option>
                <option value="failed" style={{ background: "#1a1a1a", color: "white" }}>Failed</option>
            </Select>
            <Select placeholder="Check-in Status" value={checkedIn} onChange={(e) => setCheckedIn(e.target.value)} width="175px" bg="#1a1a1a" color="white" borderColor="#444" _focus={{ borderColor: "#F79432" }} sx={{ option: { background: "#1a1a1a", color: "white" } }}>
                <option value="yes" style={{ background: "#1a1a1a", color: "white" }}>Checked In</option>
                <option value="no" style={{ background: "#1a1a1a", color: "white" }}>Not Checked In</option>
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
