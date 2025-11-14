/**
 * Script to identify APIs that need database error handling updates
 * Run with: node scripts/check-api-error-handling.js
 */

const fs = require("fs")
const path = require("path")

const API_DIR = path.join(__dirname, "../src/pages/api")

function getAllFiles(dirPath, arrayOfFiles = []) {
	const files = fs.readdirSync(dirPath)

	files.forEach((file) => {
		const filePath = path.join(dirPath, file)
		if (fs.statSync(filePath).isDirectory()) {
			arrayOfFiles = getAllFiles(filePath, arrayOfFiles)
		} else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
			arrayOfFiles.push(filePath)
		}
	})

	return arrayOfFiles
}

function checkFile(filePath) {
	const content = fs.readFileSync(filePath, "utf8")
	const relativePath = path.relative(process.cwd(), filePath)

	const hasImport = content.includes("import { withDbErrorHandling, handleDbError }")
	const hasMongooseQuery = content.match(/await\s+\w+\.(find|findOne|findById|create|update|delete|aggregate|count)/g)
	const hasDbConnection = content.includes("dbconn.readyState") || content.includes("dbconn.asPromise")
	const hasOldErrorHandling = content.includes("console.error") && content.includes("INTERNAL_SERVER_ERROR")

	return {
		path: relativePath,
		hasImport,
		hasMongooseQuery: hasMongooseQuery !== null,
		queryCount: hasMongooseQuery ? hasMongooseQuery.length : 0,
		hasDbConnection,
		hasOldErrorHandling,
		needsUpdate: (hasMongooseQuery !== null || hasDbConnection) && !hasImport,
	}
}

console.log("Checking API files for database error handling...\n")

const apiFiles = getAllFiles(API_DIR)
const results = apiFiles.map(checkFile)

// Already updated
console.log("✅ ALREADY UPDATED:")
const updated = results.filter((r) => r.hasImport)
updated.forEach((r) => {
	console.log(`   ${r.path}`)
})

console.log(`\n📊 Total updated: ${updated.length}\n`)

// High priority (has DB queries but no new error handling)
console.log("🔴 HIGH PRIORITY - NEEDS UPDATE:")
const highPriority = results.filter((r) => r.needsUpdate && r.queryCount > 2)
highPriority.forEach((r) => {
	console.log(`   ${r.path} (${r.queryCount} queries)`)
})

console.log(`\n📊 High priority: ${highPriority.length}\n`)

// Medium priority
console.log("🟡 MEDIUM PRIORITY - NEEDS UPDATE:")
const mediumPriority = results.filter((r) => r.needsUpdate && r.queryCount <= 2 && r.queryCount > 0)
mediumPriority.forEach((r) => {
	console.log(`   ${r.path} (${r.queryCount} queries)`)
})

console.log(`\n📊 Medium priority: ${mediumPriority.length}\n`)

// Has old DB connection code
console.log("🔧 HAS OLD DB CONNECTION CODE:")
const oldConnection = results.filter((r) => r.hasDbConnection && !r.hasImport)
oldConnection.forEach((r) => {
	console.log(`   ${r.path}`)
})

console.log(`\n📊 Old connection code: ${oldConnection.length}\n`)

// No DB operations (safe to skip)
console.log("✓ NO DATABASE OPERATIONS (SAFE):")
const noDB = results.filter((r) => !r.hasMongooseQuery && !r.hasDbConnection)
console.log(`   ${noDB.length} files`)

console.log("\n" + "=".repeat(60))
console.log("SUMMARY:")
console.log("=".repeat(60))
console.log(`Total API files: ${apiFiles.length}`)
console.log(`Already updated: ${updated.length}`)
console.log(`Needs update: ${highPriority.length + mediumPriority.length}`)
console.log(`  - High priority: ${highPriority.length}`)
console.log(`  - Medium priority: ${mediumPriority.length}`)
console.log(`Safe to skip: ${noDB.length}`)
console.log("=".repeat(60))

// Save results to file
const reportPath = path.join(process.cwd(), "api-error-handling-report.json")
fs.writeFileSync(
	reportPath,
	JSON.stringify(
		{
			summary: {
				total: apiFiles.length,
				updated: updated.length,
				needsUpdate: highPriority.length + mediumPriority.length,
				safe: noDB.length,
			},
			updated: updated.map((r) => r.path),
			highPriority: highPriority.map((r) => ({ path: r.path, queries: r.queryCount })),
			mediumPriority: mediumPriority.map((r) => ({ path: r.path, queries: r.queryCount })),
			oldConnection: oldConnection.map((r) => r.path),
			safe: noDB.map((r) => r.path),
		},
		null,
		2,
	),
)

console.log(`\n📄 Detailed report saved to: api-error-handling-report.json\n`)
