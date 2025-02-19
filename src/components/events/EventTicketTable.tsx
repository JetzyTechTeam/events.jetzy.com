import React from "react"
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TableCaption, TableContainer, IconButton, Menu, MenuButton, MenuList, MenuItem, Flex, Button, Text, Spinner, useDisclosure } from "@chakra-ui/react"
import { EllipsisVerticalIcon, PencilIcon, PencilSquareIcon, PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline"

import { useAppDispatch, useAppSelector } from "@/redux/stores"
import { DeleteTicketThunk, getEventState, UpdateTicketThunk } from "@/redux/reducers/eventsSlice"

import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react"
import { ROUTES } from "@/configs/routes"
import { useRouter } from "next/router"

export interface TicketsRowData {
	id: string
	title: string
	price: number
	date: string
	desc: string
}

export type UpdateTicketData = {
	title: string
	description: string
}

type Props = {
	rows: TicketsRowData[]
	eventName: string
	eventId: string
}
const EventTicketTable: React.FC<Props> = ({ rows, eventName, eventId }) => {
	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getEventState)
	const router = useRouter()

	const [tableData, setTableData] = React.useState<TicketsRowData[]>(rows)
	const [data, setData] = React.useState<TicketsRowData>(rows[0])

	const handleChange = (key: keyof typeof data, value: string) => {
		setData((prev) => ({ ...prev, [key]: value }))
	}

	const handleRowDelete = (id: string) => {
		dispatcher(DeleteTicketThunk({ data: { eventId: eventId, ticketId: id } })).then((res: any) => {
			setTableData((prev) => prev.filter((ticket) => ticket.id !== id))
		})
	}

	const handleSaveTicketChanges = () => {
		dispatcher(UpdateTicketThunk({ data: { payload: { title: data.title, description: data.desc }, params: { eventId, ticketId: data.id } } })).then((res: any) => {
			// update row data
			if (res.payload.status) {
				setTableData((prev) => prev.map((ticket) => (ticket.id === data.id ? data : ticket)))
				onClose()
			}
		})
	}
	const { isOpen, onOpen, onClose } = useDisclosure()

	return (
		<>
			<TableContainer bg="white" borderRadius="md" boxShadow="md" p={2} mx={2}>
				<Table variant="striped" colorScheme="gray">
					<TableCaption>
						<Text fontWeight={"bold"} display={"inline"}>
							{eventName}
						</Text>{" "}
						tickets. {isLoading && <Spinner size="sm" />}
					</TableCaption>
					<Thead>
						<Tr>
							<Th>Title</Th>
							<Th>Price</Th>
							<Th>Description</Th>
							<Th isNumeric>Actions</Th>
						</Tr>
					</Thead>
					<Tbody>
						{tableData.map((row) => (
							<Tr key={row.id}>
								<Td fontWeight={"bold"}>{row.title}</Td>
								<Td>
									<Button variant="link" colorScheme="blue">
										{row.price.toLocaleString("en-US", { style: "currency", currency: "USD" })}
									</Button>
								</Td>
								<Td>{row.desc}</Td>
								<Td isNumeric>
									<Menu placement="top-end">
										<MenuButton as={IconButton} aria-label="Options" icon={<EllipsisVerticalIcon style={{ width: 20, height: 20 }} />} variant="outline" />
										<MenuList>
											<MenuItem
												onClick={() => {
													setData(row)
													onOpen()
												}}
												icon={<PencilSquareIcon style={{ width: 20, height: 20 }} />}
											>
												Edit
											</MenuItem>

											<MenuItem onClick={() => router.push(ROUTES.dashboard.events.edit.replace(":eventId", eventId))} icon={<PlusCircleIcon style={{ width: 20, height: 20 }} />}>
												Add Ticket
											</MenuItem>

											<MenuItem onClick={() => handleRowDelete(row.id)} icon={<TrashIcon style={{ width: 20, height: 20 }} />}>
												Delete
											</MenuItem>
										</MenuList>
									</Menu>
								</Td>
							</Tr>
						))}
					</Tbody>
				</Table>
			</TableContainer>

			{/* Update Ticket Modal */}

			<Modal isOpen={isOpen} onClose={onClose}>
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>Update Ticket</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<div className="relative max-w-sm mx-auto bg-white rounded-lg shadow-md p-6 space-y-4">
							{/* Title Input */}
							<div>
								<label htmlFor="ticket-title" className="block text-gray-700 font-bold mb-1">
									Title
								</label>
								<input
									id="ticket-title"
									type="text"
									value={data.title}
									onChange={(e) => handleChange("title", e.target.value)}
									placeholder="Enter ticket title"
									className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>

							{/* Description Input */}
							<div>
								<label htmlFor="ticket-description" className="block text-gray-700 font-bold mb-1">
									Description
								</label>
								<textarea
									id="ticket-description"
									value={data.desc}
									onChange={(e) => handleChange("desc", e.target.value)}
									placeholder="Enter description"
									className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>

							{/* Save Button */}
							<div>
								<Button isLoading={isLoading} disabled={isLoading} colorScheme="orange" onClick={handleSaveTicketChanges} width={"full"}>
									Save
								</Button>
							</div>
						</div>
					</ModalBody>

					<ModalFooter>
						<Button colorScheme="gray" mr={3} onClick={onClose}>
							Close
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}

export default EventTicketTable
