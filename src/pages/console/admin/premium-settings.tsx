import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React from "react"
import {
	Box,
	Flex,
	Text,
	Button,
	Switch,
	Stack,
	Badge,
	IconButton,
	useToast,
	Spinner,
	Center,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	ModalCloseButton,
	FormControl,
	FormLabel,
	Input,
	Select,
	Checkbox,
	Textarea,
	useDisclosure,
} from "@chakra-ui/react"
import { FiEdit2, FiTrash2, FiArrowUp, FiArrowDown, FiPlus } from "react-icons/fi"
import axios from "axios"

/**
 * Configures the Jetzy Premium application gate: whether buying Premium with no invite code
 * requires the questions + card-setup + admin-review flow (`src/lib/premium-application.ts`),
 * and which questions are asked. Same question shape as an event's custom questions
 * (`ICustomQuestion`), so this editor is modelled on `CustomQuestionsManager` in
 * `console/events/[eventId]/manage.tsx`.
 */

type QuestionType = "text" | "options" | "multiple_choice" | "social_profile" | "company" | "checkbox" | "terms" | "mobile" | "website"

type Question = {
	id: string
	title: string
	type: QuestionType
	isRequired?: boolean
	responseLength?: "short" | "multi-line"
	selectionType?: "single" | "multiple"
	options?: string[]
	platform?: string
	collectJobTitle?: boolean
	termsContentType?: "text" | "link"
	termsContent?: string
	collectSignature?: boolean
}

const TYPE_LABELS: Record<QuestionType, string> = {
	text: "Text answer",
	options: "Multiple choice (pick one/many)",
	multiple_choice: "Multiple choice",
	social_profile: "Social profile link",
	company: "Company / job title",
	checkbox: "Single checkbox",
	terms: "Terms agreement",
	mobile: "Phone number",
	website: "Website URL",
}

const emptyQuestion = (): Question => ({ id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title: "", type: "text", isRequired: false })

export default function PremiumSettingsPage() {
	const toast = useToast()
	const [loading, setLoading] = React.useState(true)
	const [saving, setSaving] = React.useState(false)
	const [enabled, setEnabled] = React.useState(false)
	const [questions, setQuestions] = React.useState<Question[]>([])
	const [editing, setEditing] = React.useState<Question | null>(null)
	const [editingIndex, setEditingIndex] = React.useState<number | null>(null)
	const { isOpen, onOpen, onClose } = useDisclosure()

	React.useEffect(() => {
		axios
			.get("/api/premium/applications/settings")
			.then((res) => {
				setEnabled(!!res.data?.data?.enabled)
				setQuestions(res.data?.data?.questions || [])
			})
			.catch(() => toast({ title: "Could not load settings", status: "error" }))
			.finally(() => setLoading(false))
	}, [toast])

	const save = async (nextEnabled: boolean, nextQuestions: Question[]) => {
		setSaving(true)
		try {
			await axios.put("/api/premium/applications/settings", { enabled: nextEnabled, questions: nextQuestions })
			setEnabled(nextEnabled)
			setQuestions(nextQuestions)
			toast({ title: "Saved", status: "success" })
		} catch (error: any) {
			toast({ title: "Could not save", description: error?.response?.data?.message, status: "error" })
		} finally {
			setSaving(false)
		}
	}

	const openAdd = () => {
		setEditing(emptyQuestion())
		setEditingIndex(null)
		onOpen()
	}
	const openEdit = (q: Question, index: number) => {
		setEditing({ ...q })
		setEditingIndex(index)
		onOpen()
	}
	const remove = (index: number) => {
		const next = questions.filter((_, i) => i !== index)
		save(enabled, next)
	}
	const move = (index: number, dir: -1 | 1) => {
		const next = [...questions]
		const target = index + dir
		if (target < 0 || target >= next.length) return
		;[next[index], next[target]] = [next[target], next[index]]
		save(enabled, next)
	}
	const confirmEdit = () => {
		if (!editing || !editing.title.trim()) {
			toast({ title: "Give the question a title", status: "warning" })
			return
		}
		const next = [...questions]
		if (editingIndex === null) next.push(editing)
		else next[editingIndex] = editing
		save(enabled, next)
		onClose()
	}

	return (
		<>
			<Head>
				<title>Premium Application Settings — Console</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%" backBtn="/console/admin/premium-applications">
				<Box maxW="800px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					{loading ? (
						<Center py={20}><Spinner color="#F79432" /></Center>
					) : (
						<Stack spacing={6}>
							<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" justify="space-between" align="center">
								<Box>
									<Text fontWeight="bold">Require an application to buy Premium</Text>
									<Text fontSize="sm" color="#9C9C9C" maxW="480px">
										While on, buying Jetzy Premium with no invite code shows the questions below, then saves a
										card for review, instead of starting the trial instantly. Approving grants the same
										first-period-free offer as today.
									</Text>
								</Box>
								<Switch
									isChecked={enabled}
									isDisabled={saving}
									colorScheme="orange"
									size="lg"
									onChange={(e) => save(e.target.checked, questions)}
								/>
							</Flex>

							<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
								<Flex justify="space-between" align="center" mb={3}>
									<Text color="white" fontWeight="bold">Questions</Text>
									<Button size="sm" colorScheme="orange" leftIcon={<FiPlus />} onClick={openAdd}>Add question</Button>
								</Flex>
								{questions.length === 0 ? (
									<Text color="#6B7280" fontSize="sm">
										No questions configured — applicants go straight from choosing a plan to card setup.
									</Text>
								) : (
									<Stack spacing={2}>
										{questions.map((q, index) => (
											<Flex key={q.id} justify="space-between" align="center" bg="#0F0F0F" p={3} borderRadius="md" border="1px solid" borderColor="#2a2a2a">
												<Box>
													<Text color="white">{q.title}</Text>
													<Text color="#9C9C9C" fontSize="xs">
														{TYPE_LABELS[q.type]}
														{q.isRequired ? <Badge ml={2} colorScheme="orange">Required</Badge> : <Badge ml={2} colorScheme="gray">Optional</Badge>}
													</Text>
												</Box>
												<Flex gap={1}>
													<IconButton aria-label="Move up" icon={<FiArrowUp />} size="sm" variant="ghost" isDisabled={index === 0} onClick={() => move(index, -1)} />
													<IconButton aria-label="Move down" icon={<FiArrowDown />} size="sm" variant="ghost" isDisabled={index === questions.length - 1} onClick={() => move(index, 1)} />
													<IconButton aria-label="Edit" icon={<FiEdit2 />} size="sm" variant="ghost" onClick={() => openEdit(q, index)} />
													<IconButton aria-label="Delete" icon={<FiTrash2 />} size="sm" variant="ghost" colorScheme="red" onClick={() => remove(index)} />
												</Flex>
											</Flex>
										))}
									</Stack>
								)}
							</Box>
						</Stack>
					)}
				</Box>
			</ConsoleLayout>

			<Modal isOpen={isOpen} onClose={onClose} size="lg">
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>{editingIndex === null ? "Add question" : "Edit question"}</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						{editing && (
							<Stack spacing={4}>
								<FormControl>
									<FormLabel>Title</FormLabel>
									<Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. LinkedIn Profile" />
								</FormControl>
								<FormControl>
									<FormLabel>Answer type</FormLabel>
									<Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as QuestionType })}>
										{Object.entries(TYPE_LABELS).map(([value, label]) => (
											<option key={value} value={value}>{label}</option>
										))}
									</Select>
								</FormControl>

								{editing.type === "social_profile" && (
									<FormControl>
										<FormLabel>Platform (optional label, e.g. &quot;linkedin&quot;)</FormLabel>
										<Input value={editing.platform || ""} onChange={(e) => setEditing({ ...editing, platform: e.target.value })} />
									</FormControl>
								)}

								{(editing.type === "options" || editing.type === "multiple_choice") && (
									<>
										<FormControl>
											<FormLabel>Options (one per line)</FormLabel>
											<Textarea
												value={(editing.options || []).join("\n")}
												onChange={(e) => setEditing({ ...editing, options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
												rows={4}
											/>
										</FormControl>
										<FormControl>
											<FormLabel>Selection</FormLabel>
											<Select value={editing.selectionType || "single"} onChange={(e) => setEditing({ ...editing, selectionType: e.target.value as "single" | "multiple" })}>
												<option value="single">Pick one</option>
												<option value="multiple">Pick multiple</option>
											</Select>
										</FormControl>
									</>
								)}

								{editing.type === "text" && (
									<FormControl>
										<FormLabel>Response length</FormLabel>
										<Select value={editing.responseLength || "short"} onChange={(e) => setEditing({ ...editing, responseLength: e.target.value as "short" | "multi-line" })}>
											<option value="short">Short</option>
											<option value="multi-line">Multi-line</option>
										</Select>
									</FormControl>
								)}

								{editing.type === "company" && (
									<Checkbox isChecked={!!editing.collectJobTitle} onChange={(e) => setEditing({ ...editing, collectJobTitle: e.target.checked })}>
										Also collect job title
									</Checkbox>
								)}

								{editing.type === "terms" && (
									<>
										<FormControl>
											<FormLabel>Terms text or link</FormLabel>
											<Textarea value={editing.termsContent || ""} onChange={(e) => setEditing({ ...editing, termsContent: e.target.value })} rows={3} />
										</FormControl>
										<Checkbox isChecked={!!editing.collectSignature} onChange={(e) => setEditing({ ...editing, collectSignature: e.target.checked })}>
											Require typed signature
										</Checkbox>
									</>
								)}

								<Checkbox isChecked={!!editing.isRequired} onChange={(e) => setEditing({ ...editing, isRequired: e.target.checked })}>
									Required
								</Checkbox>
							</Stack>
						)}
					</ModalBody>
					<ModalFooter>
						<Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
						<Button colorScheme="orange" isLoading={saving} onClick={confirmEdit}>Save question</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}
