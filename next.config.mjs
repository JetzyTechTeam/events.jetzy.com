/** @type {import('next').NextConfig} */
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const nextConfig = {
	reactStrictMode: true,
	sassOptions: {
		includePaths: [path.join(__dirname, "src", "styles")],
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "files.edgestore.dev",
				port: "",
				pathname: "/**",
			},
			{
				protocol: "https",
				hostname: "jetzy-media-prod.s3.us-east-1.amazonaws.com",
				port: "",
				pathname: "/**",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
				port: "",
				pathname: "/**",
			},
			{
				protocol: "https",
				hostname: "via.placeholder.com",
				port: "",
				pathname: "/**",
			},
			{
				protocol: "https",
				hostname: "jetzy-media-prod.s3.us-east-1.amazonaws.com",
				port: "",
				pathname: "/**",
			},
		],
	},
	async rewrites() {
		return [
			{
				source: '/events/:slug*',
				destination: '/:slug*',
			},
		]
	},
}

export default nextConfig
