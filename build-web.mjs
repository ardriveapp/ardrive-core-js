/* eslint-env node */
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { execSync } from 'child_process';

const generateTypeDefinitions = () => {
    console.log('Generating TypeScript declarations...');
    try {
        // Use TypeScript compiler to generate declarations directly to dist/
        execSync('npx tsc --project ./tsconfig.web.json --emitDeclarationOnly', {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        console.log('TypeScript declarations generated successfully!');
    } catch (error) {
        console.error('Failed to generate TypeScript declarations:', error.message);
        process.exit(1);
    }
};

const bundle = async () => {
    console.log('Building ArDrive web bundle...');

    // Build JavaScript bundle with optimizations
    await build({
        entryPoints: ['./src/web/index.ts'],
        bundle: true,
        minify: true, // Enable minification to reduce size
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
                    events: true
                }
            })
        ],
        external: [
            'fs', 'path', 'os', 'stream', 
            'smartweave', 'node:crypto', 'crypto', 'human-crypto-keys',
            'arweave/node/lib/wallet', 'arweave/node/lib/transaction', 'arweave/node/common'
        ], // Keep Node.js built-ins and Node.js-specific arweave paths external
        // Note: jwk-to-pem is imported by JWKWallet but not used in browser (we use JWKWalletWeb)
        // Note: arweave is NOT external - we let esbuild bundle the browser-compatible parts
        // Note: We also mark stream as external since it's a Node.js built-in
        outfile: './dist/web/index.js',
        sourcemap: true,
        // Enable tree shaking and dead code elimination
        treeShaking: true,
        // Optimize for size
        legalComments: 'none'
    }).catch((e) => {
        console.error('Build failed:', e);
        process.exit(1);
    });

    // Generate TypeScript declarations
    generateTypeDefinitions();
};

await bundle();
console.log('ArDrive web bundle built successfully!');
