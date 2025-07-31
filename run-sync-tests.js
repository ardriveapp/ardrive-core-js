// Simple test runner for incremental sync tests
const { spawn } = require('child_process');

const testFiles = [
  'src/utils/sync_state.test.ts',
  'src/arfs/arfsdao_anonymous_incremental_sync.test.ts',
  'src/arfs/arfsdao_incremental_sync.test.ts',
  'src/ardrive_incremental_sync.test.ts'
];

console.log('Running incremental sync tests...\n');

// Run each test file sequentially
async function runTests() {
  for (const file of testFiles) {
    console.log(`\nRunning ${file}...`);
    console.log('='.repeat(50));
    
    await new Promise((resolve, reject) => {
      const proc = spawn('npx', [
        'mocha',
        '--parallel', 'false',
        '--require', 'ts-node/register/transpile-only',
        '--require', 'source-map-support/register', 
        '--require', './tests/testSetup.ts',
        '--timeout', '10000',
        file
      ], {
        stdio: 'inherit',
        shell: true
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          console.error(`Test ${file} failed with code ${code}`);
        }
        resolve(code);
      });
      
      proc.on('error', reject);
    });
  }
}

runTests().catch(console.error);