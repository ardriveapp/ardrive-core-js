import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		'web/index': 'src/web/index.ts'
	},
	format: ['esm'],
	dts: false, // Temporarily disabled due to strict mode issues in main codebase
	sourcemap: true,
	clean: true,
	outDir: 'dist',
	outExtension() {
		return {
			js: '.js'
		};
	},
	platform: 'browser',
	target: 'es2020',
	shims: true, // Enable Node.js polyfills for browser
	bundle: true, // Bundle all dependencies
	// Keep Node-only deps out of web bundles
	external: ['fs', 'path', 'os', 'stream', 'crypto', 'node:crypto', 'arweave/node/*', '@dha-team/arbundles'],
	// Ensure browser-compatible dependencies are bundled
	noExternal: ['axios', '@noble/ciphers', '@noble/hashes', 'uuid', 'utf8']
});
