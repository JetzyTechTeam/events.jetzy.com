import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import Link from "next/link"
import React from "react"
import {
	Box,
	Flex,
	Text,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	TableContainer,
	Badge,
	Button,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
	Spinner,
	Center,
	useToast,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	ModalCloseButton,
	Textarea,
	useDisclosure,
	Stack,
} from "@chakra-ui/react"
import axios from "axios"
import { displayProfileValue, isHttpUrl, formatAnswerValue } from "@/lib/profile-links"

/**
 * The admin approval queue for Jetzy Premium applications — the questions + card-setup step a
 * buyer goes through instead of an instant trial subscription when no invite code is typed (see
 * `src/lib/premium-application.ts`). Configure the gate and its questions at
 * `/console/admin/premium-settings`.
 */

type Answer = { questionId: string; answer: any }
type Application = {
	_id: string
	email: string
	name?: string
	interval: "month" | "year"
	answers: Answer[]
	status: "awaiting_card" | "under_review" | "approved" | "rejected"
	trialMonths?: number
	reviewedAt?: string
	rejectionReason?: string
	createdAt: string
}

type Question = { id: string; title: string }

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

function ApplicationAnswers({ answers, questions }: { answers: Answer[]; questions: Question[] }) {
	if (answers.length === 0) return <Text color="#6B7280" fontSize="sm">No profiles provided.</Text>
	return (
		<Stack spacing={1}>
			{answers.map((a) => {
				const title = questions.find((q) => q.id === a.questionId)?.title || a.questionId
				return (
					<Text key={a.questionId} fontSize="sm" color="#D1D5DB">
						<Text as="span" color="#9C9C9C">{title}: </Text>
						{/* Only a real http(s) URL becomes a link. Rows saved before validation existed can
						    hold anything, and a `javascript:` value must never reach an `href`. */}
						{typeof a.answer === "string" && isHttpUrl(a.answer) ? (
							<Link href={a.answer} target="_blank" rel="noopener noreferrer" style={{ color: "#F5C518", textDecoration: "underline" }}>
								{displayProfileValue(a.answer)}
							</Link>
						) : (
							formatAnswerValue(a.answer)
						)}
					</Text>
				)
			})}
		</Stack>
	)
}

export default function PremiumApplicationsPage() {
	const toast = useToast()
	const [pending, setPending] = React.useState<Application[]>([])
	const [processed, setProcessed] = React.useState<Application[]>([])
	const [questions, setQuestions] = React.useState<Question[]>([])
	const [loading, setLoading] = React.useState(true)
	const [busyId, setBusyId] = React.useState<string | null>(null)
	const [rejectTarget, setRejectTarget] = React.useState<Application | null>(null)
	const [rejectReason, setRejectReason] = React.useState("")
	const { isOpen, onOpen, onClose } = useDisclosure()

	const load = React.useCallback(async () => {
		setLoading(true)
		try {
			const [pendingRes, processedRes, settingsRes] = await Promise.all([
				axios.get("/api/premium/applications/list?scope=pending"),
				axios.get("/api/premium/applications/list?scope=processed"),
				axios.get("/api/premium/applications/settings"),
			])
			setPending(pendingRes.data?.data || [])
			setProcessed(processedRes.data?.data || [])
			setQuestions(settingsRes.data?.data?.questions || [])
		} catch (error) {
			toast({ title: "Could not load applications", status: "error" })
		} finally {
			setLoading(false)
		}
	}, [toast])

	React.useEffect(() => {
		load()
	}, [load])

	const approve = async (application: Application) => {
		setBusyId(application._id)
		try {
			await axios.post(`/api/premium/applications/${application._id}/approve`)
			toast({ title: `Approved — ${application.email} is now a member`, status: "success" })
			await load()
		} catch (error: any) {
			toast({ title: "Could not approve", description: error?.response?.data?.message, status: "error" })
		} finally {
			setBusyId(null)
		}
	}

	const openReject = (application: Application) => {
		setRejectTarget(application)
		setRejectReason("")
		onOpen()
	}

	const confirmReject = async () => {
		if (!rejectTarget) return
		setBusyId(rejectTarget._id)
		try {
			await axios.post(`/api/premium/applications/${rejectTarget._id}/reject`, { reason: rejectReason.trim() || undefined })
			toast({ title: `Declined — ${rejectTarget.email} notified`, status: "info" })
			onClose()
			await load()
		} catch (error: any) {
			toast({ title: "Could not decline", description: error?.response?.data?.message, status: "error" })
		} finally {
			setBusyId(null)
		}
	}

	// Shared by the tables (from `md` up) and the phone cards, so a decision made on a card is
	// the same call, with the same busy state, as one made in a table row.
	const planCell = (application: Application, withTrial: boolean) => (
		<>
			{application.interval === "year" ? "Annual" : "Monthly"}
			{withTrial && application.trialMonths ? <Badge ml={2} colorScheme="green">{application.trialMonths}mo free</Badge> : null}
		</>
	)
	const applicationActions = (application: Application) => (
		<Flex gap={2} sx={{ "@media screen and (max-width: 47.99em)": { "& > button": { flex: "1 1 0", height: "44px" } } }}>
			<Button size="sm" colorScheme="green" isLoading={busyId === application._id} onClick={() => approve(application)}>
				Approve
			</Button>
			<Button size="sm" colorScheme="red" variant="outline" isLoading={busyId === application._id} onClick={() => openReject(application)}>
				Decline
			</Button>
		</Flex>
	)

	return (
		<>
			<Head>
				<title>Premium Applications — Console</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%" backBtn="/console/analytics">
				<Box maxW="1200px" mx="auto" px={0} py={{ base: 2, md: 6 }}>
					<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6} justify="space-between" align="center" gap={4} wrap="wrap">
						<Text fontSize="lg" fontWeight="bold">Jetzy Premium Applications</Text>
						<Link href="/console/admin/premium-settings">
							<Button size="sm" variant="outline" colorScheme="orange">Configure questions</Button>
						</Link>
					</Flex>

					{loading ? (
						<Center py={20}><Spinner color="#F79432" /></Center>
					) : (
						<Tabs variant="soft-rounded" colorScheme="orange">
							<TabList mb={4}>
								<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Pending ({pending.length})</Tab>
								<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Processed ({processed.length})</Tab>
							</TabList>
							<TabPanels>
								<TabPanel px={0}>
									{pending.length === 0 ? (
										<Text color="#6B7280">No applications waiting for review.</Text>
									) : (
										<>
										{/* Phones: a card per application. The table put Approve / Decline off-screen. */}
										<Stack display={{ base: "flex", md: "none" }} spacing={3}>
											{pending.map((application) => (
												<Box key={application._id} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="12px" p={4}>
													<Text color="white" fontWeight={700} fontSize="15px">{application.name || "—"}</Text>
													<Text color="#9C9C9C" fontSize="13px" wordBreak="break-all">{application.email}</Text>
													<Flex mt={3} justify="space-between" align="center" gap={3} fontSize="13px">
														<Box color="#D1D5DB">{planCell(application, true)}</Box>
														<Text color="#9C9C9C" flexShrink={0}>Submitted {day(application.createdAt)}</Text>
													</Flex>
													<Box mt={3} sx={{ "& a, & p": { overflowWrap: "anywhere" } }}>
														<ApplicationAnswers answers={application.answers} questions={questions} />
													</Box>
													<Box mt={3} pt={3} borderTop="1px solid #2a2a2a">{applicationActions(application)}</Box>
												</Box>
											))}
										</Stack>
										<TableContainer display={{ base: "none", md: "block" }} bg="#1a1a1a" borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
											<Table size="sm">
												<Thead>
													<Tr>
														<Th color="#9C9C9C">Applicant</Th>
														<Th color="#9C9C9C">Plan</Th>
														<Th color="#9C9C9C">Profiles</Th>
														<Th color="#9C9C9C">Submitted</Th>
														<Th color="#9C9C9C">Actions</Th>
													</Tr>
												</Thead>
												<Tbody>
													{pending.map((application) => (
														<Tr key={application._id}>
															<Td>
																<Text color="white" fontWeight="medium">{application.name || "—"}</Text>
																<Text color="#9C9C9C" fontSize="sm">{application.email}</Text>
															</Td>
															<Td color="#D1D5DB">{planCell(application, true)}</Td>
															<Td maxW="320px"><ApplicationAnswers answers={application.answers} questions={questions} /></Td>
															<Td color="#9C9C9C">{day(application.createdAt)}</Td>
															<Td>{applicationActions(application)}</Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
										</>
									)}
								</TabPanel>
								<TabPanel px={0}>
									{processed.length === 0 ? (
										<Text color="#6B7280">No applications reviewed yet.</Text>
									) : (
										<>
										<Stack display={{ base: "flex", md: "none" }} spacing={3}>
											{processed.map((application) => (
												<Box key={application._id} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="12px" p={4}>
													<Flex justify="space-between" align="flex-start" gap={3}>
														<Text minW={0} color="white" fontWeight={700} fontSize="15px">{application.name || "—"}</Text>
														<Badge flexShrink={0} colorScheme={application.status === "approved" ? "green" : "red"}>{application.status}</Badge>
													</Flex>
													{/* Own line: beside the badge a long address broke mid-word. */}
													<Text color="#9C9C9C" fontSize="13px" wordBreak="break-all">{application.email}</Text>
													<Flex mt={3} justify="space-between" align="center" gap={3} fontSize="13px">
														<Box color="#D1D5DB">{planCell(application, false)}</Box>
														<Text color="#9C9C9C" flexShrink={0}>Reviewed {day(application.reviewedAt)}</Text>
													</Flex>
													<Box mt={3} sx={{ "& a, & p": { overflowWrap: "anywhere" } }}>
														<ApplicationAnswers answers={application.answers} questions={questions} />
													</Box>
													{application.rejectionReason && (
														<Text mt={3} pt={3} borderTop="1px solid #2a2a2a" color="#9C9C9C" fontSize="13px">
															Note: {application.rejectionReason}
														</Text>
													)}
												</Box>
											))}
										</Stack>
										<TableContainer display={{ base: "none", md: "block" }} bg="#1a1a1a" borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
											<Table size="sm">
												<Thead>
													<Tr>
														<Th color="#9C9C9C">Applicant</Th>
														<Th color="#9C9C9C">Plan</Th>
														<Th color="#9C9C9C">Status</Th>
														<Th color="#9C9C9C">Profiles</Th>
														<Th color="#9C9C9C">Reviewed</Th>
														<Th color="#9C9C9C">Note</Th>
													</Tr>
												</Thead>
												<Tbody>
													{processed.map((application) => (
														<Tr key={application._id}>
															<Td>
																<Text color="white" fontWeight="medium">{application.name || "—"}</Text>
																<Text color="#9C9C9C" fontSize="sm">{application.email}</Text>
															</Td>
															<Td color="#D1D5DB">{planCell(application, false)}</Td>
															<Td>
																<Badge colorScheme={application.status === "approved" ? "green" : "red"}>{application.status}</Badge>
															</Td>
															<Td maxW="320px"><ApplicationAnswers answers={application.answers} questions={questions} /></Td>
														<Td color="#9C9C9C">{day(application.reviewedAt)}</Td>
															<Td color="#9C9C9C" fontSize="sm">{application.rejectionReason || "—"}</Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
										</>
									)}
								</TabPanel>
							</TabPanels>
						</Tabs>
					)}
				</Box>
			</ConsoleLayout>

			<Modal isOpen={isOpen} onClose={onClose} isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader>Decline {rejectTarget?.email}</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<Text mb={2} fontSize="sm" color="gray.400">Optional note included in the email they receive.</Text>
						<Textarea
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							placeholder="Reason (optional)"
							bg="#101010"
							color="white"
							borderColor="#434343"
							_focus={{ borderColor: "#F79432", boxShadow: "none" }}
							_placeholder={{ color: "#6B7280" }}
						/>
					</ModalBody>
					<ModalFooter sx={{ "@media screen and (max-width: 47.99em)": { "& > button": { flex: "1 1 0", height: "44px" } } }}>
						<Button variant="ghost" color="white" _hover={{ bg: "#2a2a2a" }} mr={3} onClick={onClose}>Cancel</Button>
						<Button colorScheme="red" isLoading={busyId === rejectTarget?._id} onClick={confirmReject}>Decline application</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}
