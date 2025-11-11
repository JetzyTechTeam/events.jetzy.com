import type { Config } from "tailwindcss"

const config: Config = {
	content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				current: "currentColor",
				app: "#F79432",
				danger: "rgb(220 38 38)",
				warning: "rgb(251 146 60)",
				jetzy: "#F79432",
				// New light theme colors
				primary: {
					purple: "#8B5CF6",
					light: "#A78BFA",
					dark: "#7C3AED",
				},
				background: {
					light: "#F5F5F7",
					white: "#FFFFFF",
					gray: "#F9FAFB",
				},
				text: {
					primary: "#1F2937",
					secondary: "#6B7280",
					muted: "#9CA3AF",
				},
				border: {
					light: "#E5E7EB",
					gray: "#D1D5DB",
				},
				category: {
					dining: "#F97316",
					nightlife: "#8B5CF6",
					lifestyle: "#EC4899",
					travels: "#3B82F6",
					entertainment: "#EF4444",
					activities: "#FBBF24",
				},
			},
			backgroundImage: {
				"gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
				"gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
			},
			screens: {
				xs: "300px",
				"xs-75": "375px",
				"sm-4": "400px",
				"xl-2k": "2560px",
				"xl-1k": "1440px",
			},
		},
	},
	plugins: [],
}
export default config
