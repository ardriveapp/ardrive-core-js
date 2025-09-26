# ArDrive Core JS - Playwright Testing

This directory contains Playwright tests for comparing browser and Node.js builds of ArDrive Core JS.

## Test Files

- `browser-vs-node.spec.ts` - Basic browser functionality tests
- `cross-platform-comparison.spec.ts` - Compares browser vs Node.js behavior
- `interactive-browser.spec.ts` - Interactive browser testing with HTML page
- `test-page.html` - Test HTML page for manual and automated testing
- `setup.ts` - Build setup utilities

## Running Tests

### Prerequisites
1. Ensure both Node.js and web builds are available:
   ```bash
   yarn build:all
   ```

2. Install Playwright browsers (if not already done):
   ```bash
   npx playwright install
   ```

### Test Commands

```bash
# Run all Playwright tests (headless)
yarn test:playwright

# Run tests with browser UI visible
yarn test:playwright:headed

# Run tests with Playwright UI for debugging
yarn test:playwright:ui

# View test report
yarn test:playwright:report

# Run both Node.js and browser tests
yarn test:all
```

### Test Coverage

The tests verify:

1. **Basic Functionality**
   - ArDrive factory functions work in browser
   - Anonymous instances can be created
   - Core API methods are available

2. **Cross-Platform Consistency**
   - Data signing produces identical results
   - Crypto operations work consistently
   - API surfaces match between environments

3. **Browser-Specific Features**
   - File handling with browser File API
   - Web bundle loading and initialization
   - Performance benchmarks

4. **Interactive Testing**
   - HTML page for manual verification
   - File upload simulation
   - Large data crypto operations

## Configuration

Tests are configured via `playwright.config.ts` in the project root:
- Runs on Chromium, Firefox, and WebKit
- Generates HTML reports
- Takes screenshots on failure
- Captures video on failure

## Troubleshooting

1. **Build Issues**: Ensure `yarn build:all` completes successfully
2. **Browser Issues**: Run `npx playwright install` to update browsers
3. **Test Failures**: Check `playwright-report/` for detailed failure information
4. **Linting**: Run `yarn lintfix` to fix code style issues
