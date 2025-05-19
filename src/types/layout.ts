import { z } from "zod"
import { Pages } from "./const"

export interface LayoutProps {
	children: React.ReactNode
	title?: string
}

export interface ConsoleDashboardProps {
	page?: Pages
	children?: React.ReactNode
	component?: React.ReactNode
	backBtn?: string;
	maxW?: string
	className?: string;
}

export interface ConsoleNavbarProps extends ConsoleDashboardProps {}
