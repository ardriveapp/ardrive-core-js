# ArDrive Core Examples

This directory contains example code demonstrating various features of the ArDrive Core library.

## Available Examples

### Incremental Sync Example

Demonstrates how to use the incremental sync feature to efficiently synchronize drive contents.

**File:** `incremental-sync-example.ts`

**Features demonstrated:**
- Initial full sync of a drive
- Incremental sync using saved state
- Progress tracking during sync
- Processing sync results (added/modified/deleted entities)
- Sync state persistence between sessions
- Both public and private drive synchronization

**Usage:**

```bash
# Basic sync (will use saved state if available)
ts-node examples/incremental-sync-example.ts

# Force full resync (clears saved state)
ts-node examples/incremental-sync-example.ts --force

# Sync private drive
ts-node examples/incremental-sync-example.ts --private --drive-key "your-drive-key"
```

**Before running:**
1. Update `WALLET_PATH` to point to your wallet JSON file
2. Update `DRIVE_ID` with your actual drive ID
3. Install dependencies: `yarn install`
4. Ensure you have `ts-node` installed: `yarn add -D ts-node`

## Adding New Examples

When adding new examples:
1. Create a new TypeScript file in this directory
2. Include comprehensive comments explaining the feature
3. Add error handling and user-friendly output
4. Update this README with usage instructions
5. Test the example thoroughly before committing

## Common Patterns

### Reading Configuration

```typescript
import { readJWKFile } from '../src/exports';
const wallet = readJWKFile('./wallet.json');
```

### Creating ArDrive Instance

```typescript
import { arDriveFactory } from '../src/exports';
const arDrive = arDriveFactory({ wallet });
```

### Error Handling

```typescript
try {
  // Your code here
} catch (error) {
  console.error('Operation failed:', error);
  process.exit(1);
}
```