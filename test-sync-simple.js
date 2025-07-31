#!/usr/bin/env node

// Simple test runner to run sync_state tests without TypeScript compilation issues
const { execSync } = require('child_process');

console.log('Building the library first...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error.message);
  console.log('Attempting to run tests anyway...');
}

console.log('\nRunning sync_state tests...');

try {
  execSync('npx mocha --require source-map-support/register lib/utils/sync_state.test.js', { 
    stdio: 'inherit' 
  });
} catch (error) {
  console.error('Test execution failed:', error.message);
  process.exit(1);
}

console.log('\nTests completed!');