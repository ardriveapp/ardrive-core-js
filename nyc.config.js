'use-strict';

// Istanbul `nyc` configuration file

// Note: The nyc package is locked to v14.1.1 due to a TypeScript related
// coverage issue here: https://github.com/istanbuljs/nyc/issues/1351

// Reference for config options: https://github.com/istanbuljs/nyc#common-configuration-options
module.exports = {
	extension: ['.ts'],
	include: ['src/**/*.ts'],
	exclude: ['**/*.d.ts', '**/*.test.ts'],
	all: true,
	// Reporter options: https://istanbul.js.org/docs/advanced/alternative-reporters/
	reporter: ['text-summary', 'html']

	// Coverage options (once we have some coverage)
	// 'check-coverage': true,
	// branches: 80,
	// lines: 80,
	// functions: 80,
	// statements: 80
};
