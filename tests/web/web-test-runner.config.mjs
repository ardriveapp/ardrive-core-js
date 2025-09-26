import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
    rootDir: '.',
    files: ['tests/web/**/*.test.ts'],
    nodeResolve: {
        exportConditions: ['browser', 'module', 'default']
    },
    browsers: [playwrightLauncher({ product: 'chromium' })],
    plugins: [
        esbuildPlugin({
            ts: true,
            target: 'es2020'
        })
    ],
    testFramework: {
        config: {
            timeout: 15000
        }
    }
};
