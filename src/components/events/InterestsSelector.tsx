import React from 'react'
import { Box, Flex, Text, Button, Input, Select } from '@chakra-ui/react'
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
	// The last unfiltered read — see the note in `loadCategories`.
	const [allCategories, setAllCategories] = React.useState<Category[]>([])
	const [expanded, setExpanded] = React.useState<string | null>(null)
	const [open, setOpen] = React.useState(false)
	const [loading, setLoading] = React.useState(false)

	// Inline creation. The taxonomy is owned by the Jetzy backend and shared with the mobile
	// app, so an interest added here is added for everyone — see src/lib/jetzy-interests.ts.
	const [creating, setCreating] = React.useState<CreateTarget | null>(null)
	const [draft, setDraft] = React.useState('')
	const [saving, setSaving] = React.useState(false)
	const [createError, setCreateError] = React.useState<string | null>(null)

	// Search. `search` is what is in the box; `query` is what the list on screen was actually
	// fetched with — the two differ for the length of the debounce, and the difference is what
	// tells "no results" apart from "still typing".
	const [search, setSearch] = React.useState('')
	const [query, setQuery] = React.useState('')
	// While searching every match is expanded by default (a result nobody opens is a result
	// nobody sees), so collapsing is the deviation that needs storing. Reset on every new query.
	const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())

	// Debounced fetches can land out of order — a short query issued after a long one often
	// answers first. Only the newest request may write to state.
	const seqRef = React.useRef(0)

	// Returns the list as well as storing it, so a create can locate what it just made.
	const loadCategories = React.useCallback(async (term = ''): Promise<Category[]> => {
		const seq = ++seqRef.current
		setLoading(true)
		try {
			const res = await fetch(`/api/interests?search=${encodeURIComponent(term)}`)
			const data = await res.json()
			const rows = Array.isArray(data) ? data : []
			if (seq === seqRef.current) {
				setCategories(rows)
				setQuery(term)
				setCollapsed(new Set())
				// The unfiltered read is the only one that sees the whole taxonomy. Keep it: the
				// selected strip has to name interests the current filter excludes, and the
				// zero-result panel has to offer categories the search did not return.
				if (!term) setAllCategories(rows)
			}
			return rows
		} catch {
			return []
		} finally {
			if (seq === seqRef.current) setLoading(false)
		}
	}, [])

	// One effect for the first load and for every keystroke after it: `search` starts empty,
	// so the initial run is the unfiltered fetch.
	React.useEffect(() => {
		const term = search.trim()
		const t = setTimeout(() => { loadCategories(term) }, term ? 300 : 0)
		return () => clearTimeout(t)
	}, [search, loadCategories])

	const toggle = (id: string) => {
		if (selected.includes(id)) {
			onChange(selected.filter(s => s !== id))
		} else {
			onChange([...selected, id])
		}
	}

	// `subs` is what is on screen, which while searching is a subset of the category — Select
	// All has to mean the rows the host can actually see, not ones the filter is hiding.
	const toggleCategory = (cat: Category, subs: Category['subCategories']) => {
		const subIds = subs.map(s => s.id)
		const allSelected = subIds.every(id => selected.includes(id))
		if (allSelected) {
			onChange(selected.filter(id => !subIds.includes(id)))
		} else {
			const next = [...selected]
			subIds.forEach(id => { if (!next.includes(id)) next.push(id) })
			onChange(next)
		}
	}

	const openCreate = (target: CreateTarget, seed = '') => {
		setCreating(target)
		setDraft(seed)
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

			// Back to the unfiltered list: what was just created need not match whatever the host
			// had typed in the search box, and the lookup below finds it by name in `rows`.
			setSearch('')
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
	// A search that returned nothing gets its own create panel below, with a parent picker.
	// The block at the top stands down for it — two name fields bound to one `draft`, both
	// autoFocusing, is not a choice anyone can make.
	const emptyResult = !!query && categories.length === 0

	// The term the rendered list was fetched with, normalised the same way the taxonomy is —
	// `search` would be one keystroke ahead of the rows on screen.
	const q = normalizeInterestName(query)

	/**
	 * id -> label, for the selected strip.
	 *
	 * Built from the unfiltered read FIRST and the current one second, so a pick stays named
	 * while a search hides the category holding it. A category id is a legitimate selection
	 * (the Jetzy app tags events with whole top-level interests), so it is labelled as one.
	 */
	const nameById = React.useMemo(() => {
		const map = new Map<string, string>()
		const add = (rows: Category[]) => rows.forEach(cat => {
			map.set(cat._id, `All of ${cat.name}`)
			cat.subCategories.forEach(sub => map.set(sub.id, sub.name))
		})
		add(allCategories)
		add(categories)
		return map
	}, [allCategories, categories])

	// Ids the taxonomy cannot name — picked against a different Jetzy environment. They are
	// left out of the strip rather than rendered as a blank chip; they stay on the event, and
	// saving does not drop them.
	const selectedNamed = selected.map(id => ({ id, name: nameById.get(id) })).filter(row => !!row.name) as { id: string; name: string }[]

	/**
	 * What to prefill a create form with.
	 *
	 * Somebody searching for a name that isn't there is telling us what they want to add, so
	 * the text carries over. It is dropped when the name already exists at that level — then
	 * the host is adding something else and a prefilled duplicate would only be refused.
	 */
	const seedForCreate = (target: CreateTarget): string => {
		if (!q) return ''
		const pool = target.kind === 'category'
			? allCategories.map(cat => cat.name)
			: ([...categories, ...allCategories].find(cat => cat._id === target.categoryId)?.subCategories ?? []).map(sub => sub.name)
		return pool.some(name => normalizeInterestName(name) === q) ? '' : search.trim()
	}

	const list = (
		<>
			{/* Above the search box: with the list filtered — or simply scrolled — what is
			    already picked is otherwise off screen, and this is the one place every pick is
			    visible at once and removable in one click. */}
			{selectedNamed.length > 0 && (
				<Box pb={3} mb={1} borderBottom="1px solid #2E2E2E">
					<Text color="#9C9C9C" fontSize="xs" fontWeight="bold" mb={2}>
						Selected ({selectedNamed.length})
					</Text>
					<Flex wrap="wrap" gap={2}>
						{selectedNamed.map(row => (
							<Flex
								key={row.id}
								as="button"
								type="button"
								align="center"
								gap={2}
								px={3}
								py={1.5}
								rounded="full"
								fontSize="sm"
								fontWeight="medium"
								cursor="pointer"
								bg="#F79432"
								color="white"
								textTransform="capitalize"
								title={`Remove ${row.name}`}
								onClick={() => toggle(row.id)}
								_hover={{ bg: '#E68422' }}
							>
								{row.name}
								{/* Not textTransform'd with the label: a capitalised multiplication
								    sign is still the same glyph, but the aria label should read plainly. */}
								<Box as="span" aria-hidden fontSize="md" lineHeight="1">&times;</Box>
							</Flex>
						))}
					</Flex>
				</Box>
			)}

			{/* First thing in the panel. There are ~35 categories holding several hundred
			    sub-interests, so scanning was the only way to find one. Filtering happens on the
			    BACKEND (`?search=`), which matches sub-interest names as well as category names —
			    a client-side filter over one page could only ever see what was already fetched. */}
			<Box pb={3} pt={1}>
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onKeyDown={(e) => {
						// Inside the event <Formik>: Enter here would submit the whole event.
						if (e.key === 'Enter') e.preventDefault()
						if (e.key === 'Escape') {
							e.preventDefault()
							setSearch('')
						}
					}}
					placeholder="Search interests"
					size="sm"
					rounded="full"
					bg="#090C10"
					borderColor="#3A3D42"
					color="white"
					_placeholder={{ color: '#6B6E73' }}
				/>
			</Box>

			{/* At the TOP, not after the list. There are ~35 categories, so at the bottom this
			    sat below several screens of chips and a host looking for it never found it. */}
			<Box pb={3} mb={1} borderBottom={categories.length > 0 ? '1px solid #2E2E2E' : 'none'} display={emptyResult ? 'none' : undefined}>
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
						onClick={() => openCreate({ kind: 'category' }, seedForCreate({ kind: 'category' }))}
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
				// `query`, not `search`: it names the term the empty list actually came back for,
				// so it can't quote something the host typed after the request went out.
				query ? (
					<Box py={3}>
						<Text color="#9C9C9C" fontSize="sm">
							No interests match &ldquo;{query}&rdquo;.
						</Text>
						{/* With nothing returned there is no category on screen to add under, and a
						    search that found nothing is exactly when a host wants to create the thing
						    they were looking for. So the parent is a picker over the FULL taxonomy
						    (`allCategories`), not over the empty result. */}
						{creating ? (
							<Box mt={3}>
								<Text color="#6B6E73" fontSize="xs" mb={1}>Add it under</Text>
								<Select
									size="sm"
									rounded="full"
									maxW="260px"
									bg="#090C10"
									borderColor="#3A3D42"
									color="white"
									isDisabled={saving}
									value={creating.kind === 'sub' ? creating.categoryId : ''}
									// setCreating directly, never openCreate — that resets the draft,
									// and the name the host typed must survive changing the parent.
									onChange={(e) => setCreating(e.target.value ? { kind: 'sub', categoryId: e.target.value } : { kind: 'category' })}
								>
									<option value="">A new top-level category</option>
									{allCategories.map(cat => (
										<option key={cat._id} value={cat._id}>{cat.name}</option>
									))}
								</Select>
								{renderCreateForm('Interest name')}
								{/* Repeated here because the block carrying it at the top is stood
								    down on an empty result — and this is a create path like any other. */}
								<Text color="#6B6E73" fontSize="xs" mt={2}>
									Interests you add here are shared across Jetzy, including the mobile app.
								</Text>
							</Box>
						) : (
							<Button
								type="button"
								mt={3}
								size="sm"
								bg="#F7943214"
								color="#F79432"
								border="1px dashed #F79432"
								rounded="full"
								_hover={{ bg: '#F7943229' }}
								leftIcon={<Box as={PlusIcon} w="14px" h="14px" />}
								// Seeded with what was searched for — unconditionally here, since an
								// empty result means nothing by that name exists to collide with.
								onClick={() => openCreate({ kind: 'category' }, search.trim())}
							>
								Add &ldquo;{search.trim()}&rdquo;
							</Button>
						)}
					</Box>
				) : (
					<Text color="gray.600" fontSize="sm" py={3}>No interests available</Text>
				)
			) : (
				categories.map((cat, idx) => {
					const subIds = cat.subCategories.map(s => s.id)
					// `interests` can hold a CATEGORY id, not only sub-interest ids — the Jetzy
					// app lets people tag an event with a whole top-level interest. Comparing
					// against sub ids alone made those events show a correct "N Selected" count
					// with nothing highlighted anywhere.
					const categorySelected = selected.includes(cat._id)
					// Counted over the WHOLE category, never the filtered view — the badge reports
					// what is on the event, and a search must not make picks look dropped.
					const selectedCount = subIds.filter(id => selected.includes(id)).length + (categorySelected ? 1 : 0)
					// The backend returns a matching category with ALL of its sub-interests, so a
					// search for one chip still hands back 26 of them. Narrow to the matches here —
					// unless the CATEGORY name is what matched, in which case the whole thing is
					// the result.
					const categoryMatched = !q || normalizeInterestName(cat.name).includes(q)
					const visibleSubs = categoryMatched ? cat.subCategories : cat.subCategories.filter(sub => normalizeInterestName(sub.name).includes(q))
					// While searching, a match nobody opens is a match nobody sees — so results are
					// expanded by default and collapsing is the state worth keeping.
					const isExpanded = q ? !collapsed.has(cat._id) : expanded === cat._id
					const addingSubHere = creating?.kind === 'sub' && creating.categoryId === cat._id
					return (
						<Box key={cat._id} borderBottom={idx === categories.length - 1 ? 'none' : '1px solid #2E2E2E'}>
							<Flex
								align="center"
								justify="space-between"
								cursor="pointer"
								py={4}
								onClick={() => {
									if (q) {
										setCollapsed(prev => {
											const next = new Set(prev)
											if (next.has(cat._id)) next.delete(cat._id)
											else next.add(cat._id)
											return next
										})
									} else {
										setExpanded(isExpanded ? null : cat._id)
									}
								}}
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
												onClick={() => openCreate({ kind: 'sub', categoryId: cat._id }, seedForCreate({ kind: 'sub', categoryId: cat._id }))}
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
										{visibleSubs.map(sub => {
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
										onClick={() => toggleCategory(cat, visibleSubs)}
									>
										{visibleSubs.length > 0 && visibleSubs.every(sub => selected.includes(sub.id)) ? 'Deselect All' : 'Select All'}
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
