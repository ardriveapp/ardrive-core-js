import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';

const bundle = async () => {
	console.log('Building ArDrive web bundle...');
	return build({
		entryPoints: ['./src/web/index.ts'],
		bundle: true,
		minify: false, // Keep unminified for debugging
		platform: 'browser',
		target: ['es2020'],
		format: 'esm',
		plugins: [
			polyfillNode({
				polyfills: {
					crypto: true,
					process: true,
					fs: true,
					buffer: true,
					stream: true,
					events: true,
				},
			}),
		],
		external: ['fs', 'path', 'os'], // Keep some Node.js modules external
		outfile: './dist/web/index.js',
		sourcemap: true,
	}).catch((e) => {
		console.error('Build failed:', e);
		process.exit(1);
	});
};

const result = await bundle();
console.log('ArDrive web bundle built successfully!');
