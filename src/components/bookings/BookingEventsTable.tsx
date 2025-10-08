import { Table, Thead, Tbody, Tr, Th, Td, Button,Flex,Spinner, Tfoot, Text} from "@chakra-ui/react"
import { useRouter } from "next/router"
import { IEvent } from "@/models/events/types"
import { Pagination } from "@/pages/console/events/index.old"
import { useState ,useEffect} from "react"

type Props = {
    events: IEvent[]
    pagination:Pagination
}
//a component to show all unique events. 
const BookingTableEvents:React.FC<Props> = ({events , pagination} ) => {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
	const handlePrev = () => {
		if (pagination.page > 1) {
			router.push(`/console/bookings?page=${pagination.page - 1}`);
		}
	};

	const handleNext = () => {
		if (pagination.page < pagination.totalPages) {
			router.push(`/console/bookings?page=${pagination.page + 1}`);
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
                <Td>{new Date(event.startsOn).toLocaleDateString()}</Td>
                <Td>{new Date(event.endsOn).toLocaleDateString()}</Td>
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
                    <Flex justify="center" align="center" mt={4}>
                        <Button
                            variant="link"
                            onClick={handlePrev}
                            disabled={pagination.page === 1}
                            mr={2}
                        >
                            &lt;Prev
                        </Button>
                        <Text fontSize="sm" color="gray.600">
                            Page {pagination.page} | showing {pagination.showing} of {pagination.total}
                        </Text>
                        <Button
                            variant="link"
                            onClick={handleNext}
                            disabled={pagination.page === pagination.totalPages}
                            ml={2}
                        >
                            Next&gt;
                        </Button>
                    </Flex>
                </Td>
            </Tr>
        </Tfoot>

    </Table>
    )
}

export default BookingTableEvents
