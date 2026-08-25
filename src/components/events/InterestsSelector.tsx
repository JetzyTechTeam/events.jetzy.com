import React from 'react'
import { Box, Flex, Text, Button, Input } from '@chakra-ui/react'
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline'
import { normalizeInterestName, type InterestCategory } from '@/lib/jetzy-interests'

type Category = InterestCategory

type Props = {
	selected: string[]
	onChange: (ids: string[]) => void
	/** Manage Event card style: no inner background box, white "Interests" header + "N Selected" text (Figma). */
	bare?: boolean
}

/** Which inline create form is open, if any. */
type CreateTarget = { kind: 'category' } | { kind: 'sub'; categoryId: string }

export default function InterestsSelector({ selected, onChange, bare = false }: Props) {
	const [categories, setCategories] = React.useState<Category[]>([])
	const [expanded, setExpanded] = React.useState<string | null>(null)
	const [open, setOpen] = React.useState(false)
	const [loading, setLoading] = React.useState(false)

	// Inline creation. The taxonomy is owned by the Jetzy backend and shared with the mobile
	// app, so an interest added here is added for everyone — see src/lib/jetzy-interests.ts.
	const [creating, setCreating] = React.useState<CreateTarget | null>(null)
	const [draft, setDraft] = React.useState('')
	const [saving, setSaving] = React.useState(false)
	const [createError, setCreateError] = React.useState<string | null>(null)

	// Returns the list as well as storing it, so a create can locate what it just made.
	const loadCategories = React.useCallback(async (): Promise<Category[]> => {
		setLoading(true)
		try {
			const res = await fetch('/api/interests')
			const data = await res.json()
			const rows = Array.isArray(data) ? data : []
			setCategories(rows)
			return rows
		} catch {
			return []
		} finally {
			setLoading(false)
		}
	}, [])

	React.useEffect(() => {
		loadCategories()
	}, [loadCategories])

	const toggle = (id: string) => {
		if (selected.includes(id)) {
			onChange(selected.filter(s => s !== id))
		} else {
			onChange([...selected, id])
		}
	}

	const toggleCategory = (cat: Category) => {
		const subIds = cat.subCategories.map(s => s.id)
		const allSelected = subIds.every(id => selected.includes(id))
		if (allSelected) {
			onChange(selected.filter(id => !subIds.includes(id)))
		} else {
			const next = [...selected]
			subIds.forEach(id => { if (!next.includes(id)) next.push(id) })
			onChange(next)
		}
	}

	const openCreate = (target: CreateTarget) => {
		setCreating(target)
		setDraft('')
		setCreateError(null)
	}

	const closeCreate = () => {
		setCreating(null)
		setDraft('')
		setCreateError(null)
	}

	/**
	 * Post the draft, then re-read the taxonomy and find what was created BY NAME rather than
	 * trusting the create response — the backend's created-entity shape is not part of any
	 * contract we control, and the re-read is needed anyway to refresh the list.
	 */
	const submitCreate = async () => {
		if (!creating || saving) return
		const name = normalizeInterestName(draft)
		if (!name) {
			setCreateError('Enter a name')
			return
		}

		setSaving(true)
		setCreateError(null)
		try {
			const isSub = creating.kind === 'sub'
			const res = await fetch(isSub ? '/api/interests/sub-categories' : '/api/interests/categories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(isSub ? { categoryId: creating.categoryId, name } : { name }),
			})

			if (!res.ok) {
				const body = await res.json().catch(() => null)
				setCreateError(body?.error || 'Could not create that interest')
				return
			}

			const rows = await loadCategories()

			if (isSub) {
				const parentId = creating.categoryId
				const parent = rows.find(c => c._id === parentId)
				const made = parent?.subCategories?.find(s => normalizeInterestName(s.name) === name)
				// Tick it: the host created it precisely to tag this event with it.
				if (made && !selected.includes(made.id)) onChange([...selected, made.id])
				closeCreate()
			} else {
				const made = rows.find(c => normalizeInterestName(c.name) === name)
				// A brand new category is empty, and an event is tagged with sub-interests, never
				// the category alone — so drop straight into adding its first one.
				if (made) {
					setExpanded(made._id)
					setCreating({ kind: 'sub', categoryId: made._id })
					setDraft('')
				} else {
					closeCreate()
				}
			}
		} catch {
			setCreateError('Could not create that interest')
		} finally {
			setSaving(false)
		}
	}

	/**
	 * The inline name field.
	 *
	 * This component renders inside the event <Formik> form, so Enter would submit the whole
	 * event and every button needs an explicit type="button". Both are handled here.
	 */
	const renderCreateForm = (placeholder: string) => (
		<Box mt={2}>
			<Flex gap={2} align="center" wrap="wrap">
				<Input
					autoFocus
					value={draft}
					isDisabled={saving}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault()
							submitCreate()
						}
						if (e.key === 'Escape') {
							e.preventDefault()
							closeCreate()
						}
					}}
					placeholder={placeholder}
					size="sm"
					rounded="full"
					maxW="220px"
					bg="#090C10"
					borderColor="#3A3D42"
					color="white"
					_placeholder={{ color: '#6B6E73' }}
				/>
				<Button type="button" size="sm" bg="#F79432" color="black" _hover={{ bg: '#E68422' }} isLoading={saving} onClick={submitCreate}>
					Add
				</Button>
				<Button type="button" size="sm" variant="ghost" color="gray.400" _hover={{ color: 'white' }} isDisabled={saving} onClick={closeCreate}>
					Cancel
				</Button>
			</Flex>
			{createError && <Text color="#EC5E5E" fontSize="xs" mt={2}>{createError}</Text>}
		</Box>
	)

	// The section header is the open/close control. `Flex` renders a div, so it needs the
	// button role, state and key handling spelled out to stay usable without a mouse.
	const headerProps = {
		role: 'button',
		tabIndex: 0,
		'aria-expanded': open,
		cursor: 'pointer',
		onClick: () => setOpen(o => !o),
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				setOpen(o => !o)
			}
		},
	} as const

	const chevron = (
		<Box
			as={ChevronDownIcon}
			w="20px"
			h="20px"
			color="#9C9C9C"
			transition="transform 0.2s"
			transform={open ? 'rotate(180deg)' : 'rotate(0deg)'}
		/>
	)

	const addingCategory = creating?.kind === 'category'

	// Ids on the event that this taxonomy cannot render at all. The taxonomy is per
	// environment — an id created against one Jetzy backend does not exist on the other — so
	// without this the header counts interests the host can see no trace of anywhere.
	const knownIds = React.useMemo(() => {
		const set = new Set<string>()
		categories.forEach(cat => {
			set.add(cat._id)
			cat.subCategories.forEach(sub => set.add(sub.id))
		})
		return set
	}, [categories])
	// Guarded on `categories.length`: mid-load everything looks unrecognised.
	const unrecognised = categories.length > 0 ? selected.filter(id => !knownIds.has(id)).length : 0

	const list = (
		<>
			{unrecognised > 0 && (
				<Box mb={3} p={3} borderRadius="10px" bg="#1A1206" border="1px solid #F7943255">
					<Text color="#F79432" fontSize="xs" fontWeight="bold">
						{unrecognised} selected {unrecognised === 1 ? 'interest is' : 'interests are'} not in this list
					</Text>
					<Text color="#9C9C9C" fontSize="xs" mt={1} lineHeight="140%">
						They were picked against a different Jetzy environment&apos;s interest list, so there is
						nothing here to highlight. They stay on the event — saving does not remove them.
					</Text>
				</Box>
			)}

			{/* At the TOP, not after the list. There are ~35 categories, so at the bottom this
			    sat below several screens of chips and a host looking for it never found it. */}
			<Box pb={3} mb={1} borderBottom={categories.length > 0 ? '1px solid #2E2E2E' : 'none'}>
				{addingCategory ? (
					renderCreateForm('New interest category')
				) : (
					// `display` is explicit: Flex is display:flex, which would stretch this pill
					// across the full width of the card instead of hugging its label.
					<Flex
						as="button"
						type="button"
						align="center"
						display="inline-flex"
						gap={2}
						px={4}
						py={2}
						rounded="full"
						fontSize="sm"
						fontWeight="bold"
						cursor="pointer"
						bg="#F7943214"
						color="#F79432"
						border="1px dashed #F79432"
						onClick={() => openCreate({ kind: 'category' })}
						_hover={{ bg: '#F7943229' }}
					>
						<Box as={PlusIcon} w="16px" h="16px" />
						New interest category
					</Flex>
				)}
				<Text color="#6B6E73" fontSize="xs" mt={2}>
					Interests you add here are shared across Jetzy, including the mobile app.
				</Text>
			</Box>

			{loading && categories.length === 0 ? (
				<Text color="gray.500" fontSize="sm">Loading interests...</Text>
			) : categories.length === 0 ? (
				<Text color="gray.600" fontSize="sm">No interests available</Text>
			) : (
				categories.map((cat, idx) => {
					const subIds = cat.subCategories.map(s => s.id)
					// `interests` can hold a CATEGORY id, not only sub-interest ids — the Jetzy
					// app lets people tag an event with a whole top-level interest. Comparing
					// against sub ids alone made those events show a correct "N Selected" count
					// with nothing highlighted anywhere.
					const categorySelected = selected.includes(cat._id)
					const selectedCount = subIds.filter(id => selected.includes(id)).length + (categorySelected ? 1 : 0)
					const isExpanded = expanded === cat._id
					const addingSubHere = creating?.kind === 'sub' && creating.categoryId === cat._id
					return (
						<Box key={cat._id} borderBottom={idx === categories.length - 1 ? 'none' : '1px solid #2E2E2E'}>
							<Flex
								align="center"
								justify="space-between"
								cursor="pointer"
								py={4}
								onClick={() => setExpanded(isExpanded ? null : cat._id)}
							>
								<Flex align="center" gap={3}>
									<Text color="white" fontWeight="bold" textTransform="capitalize" fontSize="md">
										{cat.name}
									</Text>
									{selectedCount > 0 && (
										<Flex align="center" justify="center" minW="22px" h="22px" px="1.5" rounded="full" bg="#F79432">
											<Text fontSize="xs" fontWeight="bold" color="white">{selectedCount}</Text>
										</Flex>
									)}
								</Flex>
								<Box
									as={ChevronDownIcon}
									w="20px"
									h="20px"
									color="#9C9C9C"
									transition="transform 0.2s"
									transform={isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}
								/>
							</Flex>
							{isExpanded && (
								<Box pb={4}>
									{/* Above the chips, not inline with them: the form is far wider than a chip
									    and would reflow the whole row it sits in. */}
									{addingSubHere && renderCreateForm('New interest in ' + cat.name)}
									<Flex wrap="wrap" gap={3} mb={2}>
										{/* First in the row, so it is visible without scanning to the end of a
										    long category. Dashed and tinted rather than solid: a solid #F79432
										    chip is what "selected" looks like here. */}
										{!addingSubHere && (
											<Flex
												as="button"
												type="button"
												align="center"
												gap={1}
												px={4}
												py={2}
												rounded="full"
												fontSize="sm"
												fontWeight="bold"
												cursor="pointer"
												bg="#F7943214"
												color="#F79432"
												border="1px dashed #F79432"
												onClick={() => openCreate({ kind: 'sub', categoryId: cat._id })}
												_hover={{ bg: '#F7943229' }}
											>
												<Box as={PlusIcon} w="14px" h="14px" />
												Add interest
											</Flex>
										)}
										{/* Rendered ONLY when it is already selected. Offering it otherwise
										    would start writing category-level picks from the web, a shape this
										    form has never produced — surfacing existing data is the job here,
										    and it stays removable. */}
										{categorySelected && (
											<Box
												as="button"
												type="button"
												title="The whole category is selected — picked in the Jetzy app"
												px={4}
												py={2}
												rounded="full"
												fontSize="sm"
												fontWeight="medium"
												cursor="pointer"
												bg="#F79432"
												color="white"
												textTransform="capitalize"
												border="1px solid #F79432"
												onClick={() => toggle(cat._id)}
											>
												All of {cat.name}
											</Box>
										)}
										{cat.subCategories.map(sub => {
											const isSelected = selected.includes(sub.id)
											return (
												<Box
													key={sub.id}
													as="button"
													type="button"
													px={4}
													py={2}
													rounded="full"
													fontSize="sm"
													fontWeight="medium"
													cursor="pointer"
													bg={isSelected ? '#F79432' : 'transparent'}
													color="white"
													textTransform="capitalize"
													border="1px solid"
													borderColor={isSelected ? '#F79432' : '#3A3D42'}
													onClick={() => toggle(sub.id)}
													_hover={{ borderColor: isSelected ? '#F79432' : '#5A5D62' }}
												>
													{sub.name}
												</Box>
											)
										})}
									</Flex>
									<Button
										size="xs"
										variant="ghost"
										color="gray.500"
										_hover={{ color: 'white' }}
										type="button"
										onClick={() => toggleCategory(cat)}
									>
										{subIds.every(id => selected.includes(id)) ? 'Deselect All' : 'Select All'}
									</Button>
								</Box>
							)}
						</Box>
					)
				})
			)}

		</>
	)

	if (bare) {
		return (
			<Box>
				<Flex align="center" justify="space-between" mb={open ? 2 : 0} {...headerProps}>
					<Text fontWeight="bold" color="white" fontSize="lg">Interests</Text>
					<Flex align="center" gap={3}>
						<Text color="white" fontWeight="semibold">{selected.length} Selected</Text>
						{chevron}
					</Flex>
				</Flex>
				{open && list}
			</Box>
		)
	}

	return (
		<Box>
			<Flex align="center" justify="space-between" mb={2} {...headerProps}>
				<Text fontWeight="semibold" color="gray.400">Interests</Text>
				<Flex align="center" gap={3}>
					{selected.length > 0 && (
						<Text color="#F79432" fontWeight="semibold" fontSize="sm">{selected.length} Selected</Text>
					)}
					{chevron}
				</Flex>
			</Flex>
			{open && (
				<Box bg="#141619" rounded="xl" px="4" py="2" mb={4}>
					{list}
				</Box>
			)}
		</Box>
	)
}
