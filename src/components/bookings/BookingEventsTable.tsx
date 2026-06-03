import { Table, Thead, Tbody, Tr, Th, Td, Button,Flex,Spinner, Tfoot, Text} from "@chakra-ui/react"
import { useRouter } from "next/router"
import { IEvent } from "@/models/events/types"
import { Pagination } from "@/pages/console/events/index.old"
import { useState ,useEffect} from "react"

type Props = {
    events: IEvent[]
    pagination:Pagination
    search?: string
}
//a component to show all unique events.
const BookingTableEvents:React.FC<Props> = ({events , pagination, search} ) => {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
	const suffix = search ? `&search=${encodeURIComponent(search)}` : ""
	const handlePrev = () => {
		if (pagination.page > 1) {
			router.push(`/console/bookings?page=${pagination.page - 1}${suffix}`);
		}
	};

	const handleNext = () => {
		if (pagination.page < pagination.totalPages) {
			router.push(`/console/bookings?page=${pagination.page + 1}${suffix}`);
		}
	};
    


        useEffect(() => {
            const handleStart = () => setLoading(true)
            const handleComplete = () => setLoading(false)
    
            router.events.on('routeChangeStart', handleStart)
            router.events.on('routeChangeComplete', handleComplete)
            router.events.on('routeChangeError', handleComplete)
    
            return () => {
                router.events.off('routeChangeStart', handleStart)
                router.events.off('routeChangeComplete', handleComplete)
                router.events.off('routeChangeError', handleComplete)
            }
        }, [router])

        if (loading) {
            return (
                <Flex justify="center" align="center" height="300px">
                    <Spinner size="xl" thickness="4px" color="blue.500" />
                </Flex>
            )
        }

    return (
    <Table>
        <Thead>
            <Tr>
                <Th>Event</Th>
                <Th>Starts On</Th>
                <Th>End On</Th>
                <Th>Actions</Th>
            </Tr>
        </Thead>
        <Tbody>
            {events.map((event) => (
                <Tr key={event._id.toString()}>
                <Td>{event.name}</Td>
                <Td>{event.startsOn ? new Date(event.startsOn).toLocaleString() : "TBD"}</Td>
                <Td>{event.endsOn ? new Date(event.endsOn).toLocaleString() : "TBD"}</Td>
                <Td>
                    <Button
                    onClick={() => router.push(`/console/bookings/${event._id}`)}
                    colorScheme="blue"
                    size="sm"
                    >
                    View Bookings
                    </Button>
                </Td>
                </Tr>
            ))}
        </Tbody>

        <Tfoot>
            <Tr>
                <Td colSpan={7}>
                    <Flex justify="center" align="center" gap={2} mt={4} flexWrap="wrap">
                        <Button
                            size="sm"
                            bg="#2A2A2A"
                            color="white"
                            border="1px solid #444"
                            _hover={{ bg: '#3A3A3A' }}
                            _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
                            onClick={handlePrev}
                            isDisabled={pagination.page <= 1}
                        >
                            &lt; Prev
                        </Button>
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                            <Button
                                key={p}
                                size="sm"
                                bg={p === pagination.page ? '#F79432' : '#2A2A2A'}
                                color={p === pagination.page ? 'black' : 'white'}
                                border="1px solid #444"
                                _hover={{ bg: p === pagination.page ? '#e6832a' : '#3A3A3A' }}
                                onClick={() => router.push(`/console/bookings?page=${p}${suffix}`)}
                            >
                                {p}
                            </Button>
                        ))}
                        <Button
                            size="sm"
                            bg="#2A2A2A"
                            color="white"
                            border="1px solid #444"
                            _hover={{ bg: '#3A3A3A' }}
                            _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
                            onClick={handleNext}
                            isDisabled={pagination.page >= pagination.totalPages}
                        >
                            Next &gt;
                        </Button>
                    </Flex>
                </Td>
            </Tr>
        </Tfoot>

    </Table>
    )
}

export default BookingTableEvents
