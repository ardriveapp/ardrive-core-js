/* eslint-env node */
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to resolve turbo-sdk to browser bundle
const turboBrowserPlugin = {
    name: 'turbo-browser',
    setup(build) {
        build.onResolve({ filter: /^@ardrive\/turbo-sdk$/ }, () => {
            return {
                path: join(__dirname, 'node_modules/@ardrive/turbo-sdk/bundles/web.bundle.min.js'),
                external: false
            };
        });
    }
};

// Plugin to stub Node.js-only modules with empty exports
const stubNodeModulesPlugin = {
    name: 'stub-node-modules',
    setup(build) {
        // Stub fs module - used by Node.js-only code paths that will be tree-shaken
        build.onResolve({ filter: /^fs$/ }, () => {
            return { path: 'fs', namespace: 'stub-fs' };
        });
        build.onLoad({ filter: /.*/, namespace: 'stub-fs' }, () => {
            return {
                contents:
                    'export default {}; export const createWriteStream = () => {}; export const mkdirSync = () => {}; export const mkdir = (path, opts) => Promise.resolve(opts?.recursive ? path : undefined); export const readdirSync = () => []; export const readFileSync = () => Buffer.from(""); export const statSync = () => ({}); export const existsSync = () => false; export const promises = { mkdir: (path, opts) => Promise.resolve(opts?.recursive ? path : undefined), readFile: () => Promise.resolve(Buffer.from("")), writeFile: () => Promise.resolve() }; export const rmSync = () => {}; export const createReadStream = () => ({});',
                loader: 'js'
            };
        });
    }
};

const generateTypeDefinitions = () => {
    console.log('Generating TypeScript declarations...');
    try {
        // Use TypeScript compiler to generate declarations directly to dist/
        execSync('yarn tsc --project ./tsconfig.web.json --emitDeclarationOnly', {
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
        mainFields: ['browser', 'module', 'main'], // Prefer browser builds for dependencies
        conditions: ['browser'], // Use browser export conditions
        plugins: [
            turboBrowserPlugin,
            stubNodeModulesPlugin,
            polyfillNode({
                globals: {
                    buffer: true,
                    process: true
                },
                polyfills: {
                    // Only enable what's needed for the web bundle
                    path: true,
                    stream: true,
                    events: true,
                    crypto: true // Required by @ardrive/turbo-sdk dependency
                    // fs is handled by stubNodeModulesPlugin
                }
            })
        ],
        external: [
            'os',
            'smartweave',
            'arweave/node/lib/wallet',
            'arweave/node/lib/transaction',
            'arweave/node/common'
        ], // Keep Node-only modules external; fs uses empty polyfill, path/stream/events/crypto are polyfilled
        // Note: jwk-to-pem is imported by JWKWallet but not used in browser (we use JWKWalletWeb)
        // Note: arweave is NOT external - we let esbuild bundle the browser-compatible parts
        // Note: path/stream/events are polyfilled, not external, to avoid runtime import errors
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
