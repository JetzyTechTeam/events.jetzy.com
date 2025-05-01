import React from "react"
import {
	Table,
	Thead,
	Tbody,
	Tfoot,
	Tr,
	Th,
	Td,
	TableCaption,
	TableContainer,
	IconButton,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	Flex,
	Button,
	Text,
	useDisclosure,
	Box,
	Spinner,
} from "@chakra-ui/react"
import { EllipsisVerticalIcon, PencilIcon, PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline"
import { Pagination } from "@/pages/console/events"
import Image from "next/image"
import Link from "next/link"
import { ROUTES } from "@/configs/routes"
import { IEvent } from "@/models/events/types"

import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react"
import ExpandText from "../misc/ExpandText"
import { useAppDispatch, useAppSelector } from "@/redux/stores"
import { DeleteEventThunk, getEventState } from "@/redux/reducers/eventsSlice"
import { useEdgeStore } from "@/lib/edgestore"
import { useRouter } from "next/router"

type Props = {
	rows: IEvent[]
	pagination: Pagination
}
const EventsTableComponent: React.FC<Props> = ({ rows, pagination }) => {
	const [event, setEventData] = React.useState<IEvent>(rows[0])
	const [tableData, setTableData] = React.useState<IEvent[]>(rows)
	const edgestore = useEdgeStore()
	const router = useRouter()

	const { isOpen, onOpen, onClose } = useDisclosure()

	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getEventState)

	const handleRemove = (item: IEvent) => {
		dispatcher(DeleteEventThunk({ id: item._id.toString() })).then((res: any) => {
			setTableData((prev) => prev.filter((event) => event._id.toString() !== item._id.toString()))

			// delete the images from edge store server
			if (item.images.length > 0) {
				item.images.forEach((image) => {
					edgestore.edgestore.publicFiles.delete({ url: image })
				})
			}
		})
	}

	return (
		<>
			<TableContainer bg="white" borderRadius="md" boxShadow="md" p={2} mx={2}>
				<Table variant="striped" colorScheme="gray">
					<TableCaption>
						List of events.
						{isLoading && <Spinner size="md" />}
					</TableCaption>
					<Thead>
						<Tr>
							<Th>Name</Th>
							<Th>Tickets</Th>
							<Th>Created</Th>
							<Th isNumeric>Actions</Th>
						</Tr>
					</Thead>
					<Tbody>
						{tableData.map((row) => (
							<Tr key={row._id.toString()}>
								<Td fontWeight={"bold"}>
									{/* image and event name */}
									<Flex align="center" gap={2} justifyContent={"flex-start"} alignItems={"center"}>
										<Box display={{ base: "none", md: "block" }}>
											<Image src={row.images[0]} alt={row.name} width={50} height={50} />
										</Box>
										<Button
											onClick={() => {
												setEventData(row)
												onOpen()
											}}
											variant="link"
											colorScheme="blue"
											// handle text overflow to truncate
											overflow="hidden"
											whiteSpace="nowrap"
											textOverflow="ellipsis"
										>
											{row.name}
										</Button>
									</Flex>
								</Td>
								<Td>
									<Link href={ROUTES.dashboard.events.tickets.replace(":eventId", row._id.toString())}>
										<Button variant="link" colorScheme="blue">
											{row.tickets.length}
										</Button>
									</Link>
								</Td>
								<Td>{new Date(row.createdAt).toDateString()}</Td>
								<Td className="space-x-2">
								<Button size='sm' leftIcon={<PencilIcon style={{ width: 15, height: 15 }} />}
								 onClick={() => router.push(ROUTES.dashboard.events.edit.replace(":eventId", row._id.toString()))}
								>
								Edit
								</Button>
								<Button size='sm' leftIcon={<TrashIcon style={{ width: 15, height: 15 }} />} onClick={() => handleRemove(row)}>
								Delete
								</Button>
								</Td>
							</Tr>
						))}
					</Tbody>
					<Tfoot>
						<Tr>
							<Td colSpan={4}>
								<Flex justify="center" align="center" mt={4}>
									<Button
										variant="link"
										//   onClick={handlePrev}
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
										//   onClick={handleNext}
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
			</TableContainer>

			<Modal isOpen={isOpen} onClose={onClose}>
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>Event Details</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<div className="space-y-4">
							<div className="">
								<Image src={event.images[0]} alt={event.name} width={200} height={200} className="d-block m-auto" />
							</div>
							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-lg font-medium text-gray-900">{event.name}</p>
									<p className="text-sm text-gray-500">Name</p>
								</div>
							</div>

							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-lg font-medium text-gray-900">
										<ExpandText content={event.desc} maxChars={25} />
									</p>
									<p className="text-sm text-gray-500">Description</p>
								</div>
							</div>

							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-lg font-medium text-gray-900">{event.capacity === 0 ? "Unlimited" : event.capacity}</p>
									<p className="text-sm text-gray-500">Capacity</p>
								</div>
							</div>

							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-lg font-medium text-gray-900">{event.requireApproval ? "Yes" : "No"}</p>
									<p className="text-sm text-gray-500">Requires Approval</p>
								</div>
							</div>

							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-lg font-medium text-gray-900">{event.isPaid ? event.tickets.length : "No tickets"}</p>
									<p className="text-sm text-gray-500">Tickets</p>
								</div>
							</div>

							<div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white shadow rounded-lg">
								<div className="flex-1">
									<p className="text-md font-medium text-gray-900">
										{new Date(event.startsOn.toString()).toDateString()} {new Date(event.startsOn.toString()).toLocaleTimeString()}
									</p>
									<p className="text-sm text-gray-500">Start Date</p>
								</div>

								<div className="flex-1">
									<p className="text-md font-medium text-gray-900">
										{new Date(event.endsOn.toString()).toDateString()} {new Date(event.endsOn.toString()).toLocaleTimeString()}
									</p>
									<p className="text-sm text-gray-500">Start Date</p>
								</div>
							</div>
						</div>
					</ModalBody>

					<ModalFooter>
						<Button colorScheme="blue" mr={3} onClick={onClose}>
							Close
						</Button>
						<Button variant="ghost">Edit</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}

export default EventsTableComponent
