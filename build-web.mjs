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

    // Build JavaScript bundle
    await build({
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
                    events: true
                }
            })
        ],
        external: ['fs', 'path', 'os'], // Keep some Node.js modules external
        outfile: './dist/web/index.js',
        sourcemap: true
    }).catch((e) => {
        console.error('Build failed:', e);
        process.exit(1);
    });

    // Generate TypeScript declarations
    generateTypeDefinitions();
};

await bundle();
console.log('ArDrive web bundle built successfully!');
