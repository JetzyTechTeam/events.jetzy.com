import React from 'react'
import { Box, Flex, Text, Button } from '@chakra-ui/react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

type SubCategory = { id: string; name: string }
type Category = { _id: string; name: string; subCategories: SubCategory[] }

type Props = {
	selected: string[]
	onChange: (ids: string[]) => void
	/** Manage Event card style: no inner background box, white "Interests" header + "N Selected" text (Figma). */
	bare?: boolean
}

export default function InterestsSelector({ selected, onChange, bare = false }: Props) {
	const [categories, setCategories] = React.useState<Category[]>([])
	const [expanded, setExpanded] = React.useState<string | null>(null)
	const [open, setOpen] = React.useState(false)
	const [loading, setLoading] = React.useState(false)

	React.useEffect(() => {
		setLoading(true)
		fetch('/api/interests')
			.then(r => r.json())
			.then(data => setCategories(Array.isArray(data) ? data : []))
			.catch(() => {})
			.finally(() => setLoading(false))
	}, [])

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

	const list = (
		<>
			{loading ? (
				<Text color="gray.500" fontSize="sm">Loading interests...</Text>
			) : categories.length === 0 ? (
				<Text color="gray.600" fontSize="sm">No interests available</Text>
			) : (
				categories.map((cat, idx) => {
					const subIds = cat.subCategories.map(s => s.id)
					const selectedCount = subIds.filter(id => selected.includes(id)).length
					const isExpanded = expanded === cat._id
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
									<Flex wrap="wrap" gap={3} mb={2}>
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
