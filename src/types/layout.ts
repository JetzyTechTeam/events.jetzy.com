import { Pages } from "./const"

export interface LayoutProps {
	children: React.ReactNode
	title?: string
}

export interface ConsoleDashboardProps {
	page: Pages
	children?: React.ReactNode
	component?: React.ReactNode
}

export interface ConsoleNavbarProps extends ConsoleDashboardProps {}
