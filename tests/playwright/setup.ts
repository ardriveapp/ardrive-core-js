import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Setup script to ensure builds are ready before running Playwright tests
 */
export async function setupBuilds() {
	const projectRoot = join(__dirname, '../..');
	const webBuildPath = join(projectRoot, 'dist/web/index.js');
	const nodeBuildPath = join(projectRoot, 'lib/exports.js');

	console.log('🔧 Setting up builds for Playwright tests...');

	// Check if Node.js build exists
	if (!existsSync(nodeBuildPath)) {
		console.log('📦 Building Node.js version...');
		execSync('yarn build', { cwd: projectRoot, stdio: 'inherit' });
	} else {
		console.log('✅ Node.js build found');
	}

	// Check if web build exists
	if (!existsSync(webBuildPath)) {
		console.log('🌐 Building web version...');
		execSync('yarn build:web', { cwd: projectRoot, stdio: 'inherit' });
	} else {
		console.log('✅ Web build found');
	}

	console.log('🚀 All builds ready for testing!');
}

// Run setup if this file is executed directly
if (require.main === module) {
	setupBuilds().catch(console.error);
}
