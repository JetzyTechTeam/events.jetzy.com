import React from "react"
import Link from "next/link"
import { ROUTES } from "@Jetzy/configs/routes"
import Logo from "@Jetzy/assets/logo/logo.png"
import Image from "next/image"

export default function TermsPage() {
	return (
		<div className="min-h-screen bg-black text-white p-6 md:p-12">
			<div className="max-w-4xl mx-auto">
				<div className="flex justify-between items-center mb-10">
					<Link href={ROUTES.home}>
						<Image src={Logo} alt="Jetzy Logo" className="h-12 w-auto" />
					</Link>
					<Link href={ROUTES.create} className="text-app hover:underline">
						Back to Signup
					</Link>
				</div>

				<h1 className="text-3xl font-bold mb-6">Terms and Conditions</h1>
				<p className="mb-4 text-gray-400">Last Updated: March 30, 2026</p>

				<div className="prose prose-invert max-w-none space-y-6 text-gray-300 text-sm leading-relaxed">
					<p>
						The website located at jetzyapp.com, and the mobile application called, &quot;Jetzy&quot; (the &quot;App&quot; and, together with the website, the &quot;Site&quot;) and the services offered through the Site (the &quot;Services&quot;) are copyrighted works belonging to SZ Global, Inc. (&quot;Company&quot;, &quot;us&quot;, &quot;our&quot;, and &quot;we&quot;). Certain features of the Site or Services may be subject to additional guidelines, terms, or rules, which will be posted on the Site or Services in connection with such features. All such additional terms, guidelines, and rules are incorporated by reference into these Terms. In the event of a conflict between the additional terms and any provision in these Terms, the additional terms will prevail, but only with respect to the Service to which the additional terms apply.
					</p>

					<p className="font-bold text-white uppercase italic">
						THESE TERMS OF USE (&quot;TERMS&quot;) SET FORTH THE LEGALLY BINDING TERMS AND CONDITIONS THAT GOVERN YOUR USE OF THE SITE AND SERVICES. BY ACCESSING OR USING THE SITE OR SERVICES OR DOWNLOADING THE APP, YOU ARE ACCEPTING THESE TERMS (ON BEHALF OF YOURSELF OR THE ENTITY THAT YOU REPRESENT), AND YOU REPRESENT AND WARRANT THAT (1) YOU HAVE READ, UNDERSTAND, AND AGREE TO BE BOUND BY THESE TERMS, (2) YOU ARE OF LEGAL AGE TO FORM A BINDING CONTRACT WITH COMPANY, AND (3) YOU HAVE THE AUTHORITY TO ENTER INTO THE TERMS (ON BEHALF OF YOURSELF OR THE ENTITY THAT YOU REPRESENT). IF YOU DO NOT AGREE WITH ALL OF THE PROVISIONS OF THESE TERMS, DO NOT ACCESS AND/OR USE THE SITE OR SERVICES.
					</p>

					<p className="font-bold text-white uppercase italic">
						THESE TERMS INCLUDE A CLASS ACTION WAIVER AND A WAIVER OF JURY TRIALS, REQUIRE BINDING ARBITRATION ON AN INDIVIDUAL BASIS TO RESOLVE DISPUTES, AND ALSO LIMIT THE REMEDIES AVAILABLE TO YOU IN THE EVENT OF A DISPUTE.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">1. Accounts</h2>
					<p>
						<span className="font-semibold text-white block mb-1">1.1 Account Creation.</span>
						In order to use certain features of the Site or Services, you must register for an account (&quot;Account&quot;) and provide certain information about yourself as prompted by the account registration form. You represent and warrant that: (a) all required registration information you submit is truthful and accurate; (b) you will maintain the accuracy of such information. You may delete your Account at any time, for any reason, by following the instructions on the Site or Services or uninstalling the App. You may not have more than one Account. You agree not to create an Account or use the Site or Services if you have been previously removed by us or banned from any of the Services. Company reserves the right in its sole discretion to suspend or terminate your Account and refuse any and all current or future use of the Site or Services (or any portion thereof) at any time for any reason.
					</p>
					<p>
						<span className="font-semibold text-white block mb-1">1.2 Jetzy Membership.</span>
						By creating an Account, you also agree to become a Jetzy member and to receive Jetzy-related communications (including event updates, product news, and marketing emails). You may opt out of marketing emails at any time via the unsubscribe link in any email; transactional and account-related messages will continue to be sent.
					</p>
					<p>
						<span className="font-semibold text-white block mb-1">1.3 Account Responsibilities.</span>
						You are responsible for maintaining the confidentiality of your Account login information and are fully responsible for all activities that occur under your Account. You agree to immediately notify Company at contact@jetzyapp.com of any unauthorized use, or suspected unauthorized use of your Account or any other breach of security. Company cannot and will not be liable for any loss or damage arising from your failure to comply with the above requirements.
					</p>
					<p>
						<span className="font-semibold text-white block mb-1">1.4 Social Networking Sites.</span>
						The Services may allow users to connect with various SNSs. By connecting your SNS account, you represent that you are entitled to grant us access to your SNS account without breach by you of any SNS terms and conditions and without obligating us to pay any fees or making us subject to any usage limitations.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">2. Access to the Site and Services</h2>
					<p>
						<span className="font-semibold text-white block mb-1">2.1 License.</span>
						Subject to these Terms, Company grants you a non-transferable, non-exclusive, revocable, limited license to use and access, solely for your own personal, noncommercial use (a) the App on any compatible device that you own or control, and (b) the other aspects of Site and Services.
					</p>
					<p>
						<span className="font-semibold text-white block mb-1">2.2 Certain Restrictions.</span>
						The rights granted to you in these Terms are subject to the following restrictions: (a) you shall not license, sell, rent, lease, transfer, assign, distribute, host, or otherwise commercially exploit the Site or Services; (b) you shall not modify, make derivative works of, disassemble, reverse compile or reverse engineer any part of the Site or Services.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">3. User Content</h2>
					<p>
						<span className="font-semibold text-white block mb-1">3.1 User Content.</span>
						&quot;User Content&quot; means any and all information and content that a user submits to, or uses with, the Site or Services (e.g., content in the user&apos;s profile or postings). You are solely responsible for your User Content. You assume all risks associated with use of your User Content, including any reliance on its accuracy, completeness or usefulness by others.
					</p>

					<div className="bg-white/5 p-6 rounded-lg border border-app/30 my-8">
						<h3 className="text-lg font-bold text-app mb-4 flex items-center">
							3.7 Discussion and Chat Guidelines
						</h3>
						<p className="mb-4">
							The Site or Services may include discussion forums, message boards, and/or real-time chat features (including embedded chat) that allow users to communicate with each other. By using these features, you agree to:
						</p>
						<ul className="list-disc pl-6 space-y-2 text-gray-200">
							<li><span className="text-white font-medium">Acceptable Use:</span> Strictly follow our Acceptable Use Policy in all communications.</li>
							<li><span className="text-white font-medium">No Spam:</span> Not use the chat or discussion features for spamming, advertising, or soliciting other users.</li>
							<li><span className="text-white font-medium">Monitoring:</span> Acknowledge that SZ Global, Inc. has the right, but not the obligation, to monitor, record, and review communications for compliance with these Terms.</li>
							<li><span className="text-white font-medium">Personal Responsibility:</span> Acknowledge that you are solely responsible for your interactions with other users.</li>
							<li><span className="text-white font-medium">Authenticity:</span> Not impersonate any person or entity or misrepresent your affiliation with a person or entity.</li>
						</ul>
						<p className="mt-4 text-xs text-gray-400 italic bg-black/30 p-3 rounded">
							IMPORTANT: SZ Global, Inc. reserves the right to terminate your access to chat or discussion features, or your entire Account, for any violation of these guidelines.
						</p>
					</div>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">5. Rewards</h2>
					<p>
						When you interact with the Site and Services while logged into your Account, such as by starting or responding to a chat, posting content or sharing content via an SNS, you will earn points (&quot;Points&quot;). You can use your Points to redeem rewards. Points have no cash value.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">6. Indemnification</h2>
					<p>
						You agree to indemnify and hold Company (and its officers, employees, and agents) harmless, including costs and attorneys&apos; fees, from any claim or demand made by any third party due to or arising out of (a) your use of, or inability to use, the Site or Services; (b) your violation of these Terms; (c) your User Content.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">9. Limitation on Liability</h2>
					<p className="uppercase font-bold text-white/90">
						TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL COMPANY (OR OUR SUPPLIERS) BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY LOST PROFITS, LOST DATA, OR ANY INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL OR PUNITIVE DAMAGES ARISING FROM OR RELATING TO THESE TERMS.
					</p>

					<h2 className="text-xl font-semibold text-white mt-8 border-b border-gray-800 pb-2">12. General</h2>
					<p>
						<span className="font-semibold text-white block mb-1">12.2 Arbitration Agreement.</span>
						All claims and disputes in connection with the Terms or the use of any product or service provided by Company that cannot be resolved informally or in small claims court shall be resolved by binding arbitration on an individual basis.
					</p>

					<div className="mt-16 pt-8 border-t border-gray-800 bg-white/5 p-6 rounded-t-lg">
						<h2 className="text-xl font-semibold text-white mb-4">Contact Information</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<p className="text-app font-bold mb-1">SZ Global, Inc.</p>
								<p>205 E 42nd, 16th Floor</p>
								<p>New York, NY 10017</p>
							</div>
							<div>
								<p><span className="text-gray-400">Phone:</span> 212-706-8329</p>
								<p><span className="text-gray-400">Email:</span> contact@jetzyapp.com</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
