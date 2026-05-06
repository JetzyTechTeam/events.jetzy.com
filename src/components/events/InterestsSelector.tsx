import React from 'react'
import { Box, Flex, Text, Badge, Button } from '@chakra-ui/react'

type SubCategory = { id: string; name: string }
type Category = { _id: string; name: string; subCategories: SubCategory[] }

type Props = {
	selected: string[]
	onChange: (ids: string[]) => void
}

export default function InterestsSelector({ selected, onChange }: Props) {
	const [categories, setCategories] = React.useState<Category[]>([])
	const [expanded, setExpanded] = React.useState<string | null>(null)
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

	return (
		<Box>
			<Flex align="center" justify="space-between" mb={2}>
				<Text fontWeight="semibold" color="gray.400">Interests</Text>
				{selected.length > 0 && (
					<Badge colorScheme="orange" borderRadius="full" px={2} py={0.5}>
						{selected.length} selected
					</Badge>
				)}
			</Flex>
			<Box bg="#141619" rounded="xl" px="3" py="3" mb={4}>
				{loading ? (
					<Text color="gray.500" fontSize="sm">Loading interests...</Text>
				) : categories.length === 0 ? (
					<Text color="gray.600" fontSize="sm">No interests available</Text>
				) : (
					categories.map(cat => {
						const subIds = cat.subCategories.map(s => s.id)
						const selectedCount = subIds.filter(id => selected.includes(id)).length
						const isExpanded = expanded === cat._id
						return (
							<Box key={cat._id} mb={1}>
								<Flex
									align="center"
									justify="space-between"
									cursor="pointer"
									py={2}
									px={1}
									borderBottom="1px solid #2B2B2B"
									onClick={() => setExpanded(isExpanded ? null : cat._id)}
									_hover={{ bg: '#1a1d22' }}
									rounded="md"
								>
									<Flex align="center" gap={2}>
										<Text color="white" textTransform="capitalize" fontSize="sm">
											{cat.name}
										</Text>
										{selectedCount > 0 && (
											<Badge colorScheme="orange" borderRadius="full" fontSize="xs">
												{selectedCount}
											</Badge>
										)}
									</Flex>
									<Text color="gray.500" fontSize="xs">{isExpanded ? '▲' : '▼'}</Text>
								</Flex>
								{isExpanded && (
									<Box pt={2} pb={2} px={1}>
										<Flex wrap="wrap" gap={2} mb={2}>
											{cat.subCategories.map(sub => {
												const isSelected = selected.includes(sub.id)
												return (
													<Box
														key={sub.id}
														as="button"
														type="button"
														px={3}
														py={1}
														rounded="full"
														fontSize="xs"
														cursor="pointer"
														bg={isSelected ? '#F79432' : '#2B2B2B'}
														color={isSelected ? 'black' : 'white'}
														textTransform="capitalize"
														border="1px solid"
														borderColor={isSelected ? '#F79432' : '#464646'}
														onClick={() => toggle(sub.id)}
														_hover={{ opacity: 0.85 }}
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
			</Box>
		</Box>
	)
}
