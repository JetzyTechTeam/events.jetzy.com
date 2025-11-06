import React from "react"
import Image from "next/image"
import Link from "next/link"
import { useSession } from "next-auth/react"
import JetzyLogo from "@/assets/logo/jetzy_logo.png"
import FacebookIcon from "@/assets/social/Facebook.png"
import InstagramIcon from "@/assets/social/Instagram.png"
import TikTokIcon from "@/assets/social/TikTok.png"
import XIcon from "@/assets/social/X.png"

const Footer: React.FC = () => {
	const currentYear = new Date().getFullYear()

	const socialLinks = [
		{ name: "Facebook", icon: FacebookIcon, url: "https://facebook.com/jetzy" },
		{ name: "Instagram", icon: InstagramIcon, url: "https://instagram.com/jetzy" },
		{ name: "TikTok", icon: TikTokIcon, url: "https://tiktok.com/@jetzy" },
		{ name: "X", icon: XIcon, url: "https://x.com/jetzy" },
	]

	return (
		<footer className="bg-white border-t border-border-light mt-12">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="flex flex-col md:flex-row justify-between items-center gap-6">
					{/* Logo Section */}
					<div className="flex items-center gap-3">
						<Image src={JetzyLogo} alt="Jetzy" width={32} height={32} className="object-contain" />
						<span className="text-text-primary font-semibold text-lg">Jetzy</span>
					</div>

					{/* Social Icons */}
					<div className="flex items-center gap-4">
						{socialLinks.map((social) => (
							<a
								key={social.name}
								href={social.url}
								target="_blank"
								rel="noopener noreferrer"
								className="w-8 h-8 flex items-center justify-center rounded-full bg-background-gray hover:bg-border-light transition-colors"
								aria-label={social.name}
							>
								<Image src={social.icon} alt={social.name} width={20} height={20} className="object-contain" />
							</a>
						))}
					</div>
				</div>

				{/* Copyright */}
				<div className="mt-6 pt-6 border-t border-border-light text-center">
					<p className="text-text-muted text-sm">© {currentYear} Jetzy. All rights reserved.</p>
				</div>
			</div>
		</footer>
	)
}

export default Footer
