#!/usr/bin/env ts-node
// Direct test runner to bypass module loading issues

import 'source-map-support/register';
import './tests/testSetup';

// Set test environment
process.env.NODE_ENV = 'test';

// Import test files directly
console.log('Running sync_state tests...\n');

try {
	require('./src/utils/sync_state.test.ts');
	console.log('\n✓ sync_state tests completed');
} catch (error) {
	console.error('\n✗ sync_state tests failed:', error);
	process.exit(1);
}

console.log('\nRunning ArFSDAOAnonymousIncrementalSync tests...\n');

try {
	require('./src/arfs/arfsdao_anonymous_incremental_sync.test.ts');
	console.log('\n✓ ArFSDAOAnonymousIncrementalSync tests completed');
} catch (error) {
	console.error('\n✗ ArFSDAOAnonymousIncrementalSync tests failed:', error);
	process.exit(1);
}

console.log('\nAll tests completed!');
