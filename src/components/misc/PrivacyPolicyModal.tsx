import React, { Fragment } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { JETZY_PRIVACY_POLICY } from "@/lib/privacy-policy"

interface PrivacyPolicyModalProps {
	isOpen: boolean
	onClose: () => void
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
	return (
		<Transition appear show={isOpen} as={Fragment}>
			<Dialog as="div" className="relative z-50" onClose={onClose}>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
				</Transition.Child>

				<div className="fixed inset-0 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 scale-95"
							enterTo="opacity-100 scale-100"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 scale-100"
							leaveTo="opacity-0 scale-95"
						>
							<Dialog.Panel className="relative w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all max-h-[90vh] flex flex-col">
								{/* Header */}
								<div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
									<Dialog.Title as="h2" className="text-2xl font-bold text-gray-900">
										{JETZY_PRIVACY_POLICY.title}
									</Dialog.Title>
									<button
										onClick={onClose}
										className="text-gray-400 hover:text-gray-600 transition-colors"
										aria-label="Close"
									>
										<XMarkIcon className="h-6 w-6" />
									</button>
								</div>

								{/* Content */}
								<div className="flex-1 overflow-y-auto px-6 py-4">
									<div className="prose prose-sm max-w-none">
										<p className="text-gray-700 mb-6 leading-relaxed">{JETZY_PRIVACY_POLICY.intro}</p>

										{JETZY_PRIVACY_POLICY.sections.map((section, index) => (
											<div key={index} className="mb-8">
												<h3 className="text-xl font-bold text-gray-900 mb-4">{section.title}</h3>
												<div className="text-gray-700 whitespace-pre-line leading-relaxed">{section.content}</div>
											</div>
										))}
									</div>
								</div>

								{/* Footer */}
								<div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
									<button
										onClick={onClose}
										className="px-6 py-2 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold rounded-lg transition-colors"
									>
										I Understand
									</button>
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
	)
}

export default PrivacyPolicyModal

