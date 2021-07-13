'use-strict';

// Mocha configuration file
// Reference for options: https://github.com/mochajs/mocha/blob/master/example/config/.mocharc.js
module.exports = {
	extension: ['ts'],
	spec: ['**/*.test.ts'],
	require: ['ts-node/register/transpile-only', 'source-map-support/register', 'tests/testSetup.ts'],
	timeout: '10000', // 10 seconds for smartweave contract reading
	parallel: true,
	recursive: true
};
