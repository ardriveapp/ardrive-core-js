'use-strict';

// Mocha configuration file
// Reference for options: https://github.com/mochajs/mocha/blob/master/example/config/.mocharc.js
module.exports = {
	extension: ['ts'],
	spec: ['src/**/*.test.ts', 'test/**/*.test.ts'],
	require: 'ts-node/register',
	timeout: '3000',
	parallel: true
};