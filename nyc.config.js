'use-strict';

// Istanbul `nyc` configuration file
// Reference for options: https://github.com/istanbuljs/nyc#common-configuration-options
module.exports = {
	extension: ['.ts', '.tsx'],
	exclude: ['**/*.d.ts', 'src/**/*.test.ts'],
	include: 'src/**/*.ts',
	reporter: [
		// Text reporter adds robust coverage terminal output to each yarn test
		'text',
		// HTML reporter produces HTML files found in `/coverage`
		'html'
	]
	// Coverage options (once we have some coverage)
	// 'check-coverage': true,
	// branches: 80,
	// lines: 80,
	// functions: 80,
	// statements: 80
};
