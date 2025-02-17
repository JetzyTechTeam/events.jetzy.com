import React from "react"
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TableCaption, TableContainer, IconButton, Menu, MenuButton, MenuList, MenuItem, Flex, Button, Text } from "@chakra-ui/react"
import { EllipsisVerticalIcon, PencilIcon, PencilSquareIcon, PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline"
import Link from "next/link"
import { ROUTES } from "@/configs/routes"

export interface TicketsRowData {
	id: string
	title: string
	price: number
	date: string
}

type Props = {
	rows: TicketsRowData[]
	eventName: string
}
const EventTicketTable: React.FC<Props> = ({ rows, eventName }) => {
	return (
		<TableContainer bg="white" borderRadius="md" boxShadow="md" p={2} mx={2}>
			<Table variant="striped" colorScheme="gray">
				<TableCaption>
					<Text fontWeight={"bold"} display={"inline"}>
						{eventName}
					</Text>{" "}
					tickets.
				</TableCaption>
				<Thead>
					<Tr>
						<Th>Title</Th>
						<Th>Price</Th>
						<Th>Created</Th>
						<Th isNumeric>Actions</Th>
					</Tr>
				</Thead>
				<Tbody>
					{rows.map((row) => (
						<Tr key={row.id}>
							<Td fontWeight={"bold"}>{row.title}</Td>
							<Td>
								<Button variant="link" colorScheme="blue">
									{row.price.toLocaleString("en-US", { style: "currency", currency: "USD" })}
								</Button>
							</Td>
							<Td>{new Date(row.date).toDateString()}</Td>
							<Td>
								<Menu placement="top-end">
									<MenuButton as={IconButton} aria-label="Options" icon={<EllipsisVerticalIcon style={{ width: 20, height: 20 }} />} variant="outline" />
									<MenuList>
										<MenuItem icon={<PencilSquareIcon style={{ width: 20, height: 20 }} />}>Edit</MenuItem>
										<MenuItem icon={<TrashIcon style={{ width: 20, height: 20 }} />}>Delete</MenuItem>
									</MenuList>
								</Menu>
							</Td>
						</Tr>
					))}
				</Tbody>
			</Table>
		</TableContainer>
	)
}

export default EventTicketTable
