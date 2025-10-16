# Using QueryProvider with GatewayAPI

This document explains how to use the `@arweave-query/core` QueryProvider with the `GatewayAPI` class.

## Overview

The `GatewayAPI` class now supports optional integration with `@arweave-query/core`'s `QueryProvider` interface. This allows you to use alternative query providers (like the ParquetProvider) for faster and more efficient transaction queries.

## Installation

First, install the required package:

```bash
npm install @arweave-query/core
# or
yarn add @arweave-query/core
```

## Usage

### Option 1: Using GraphQLProvider from @arweave-query/core

```typescript
import { GraphQLProvider } from '@arweave-query/core';
import { GatewayAPI } from './utils/gateway_api';

const queryProvider = new GraphQLProvider('https://arweave.net/graphql');

const gatewayApi = new GatewayAPI({
  gatewayUrl: new URL('https://arweave.net'),
  queryProvider
});

// Now all gqlRequest calls will use the QueryProvider
const result = await gatewayApi.gqlRequest(buildQuery({
  tags: [{ name: 'App-Name', value: 'my-app' }],
  cursor: undefined
}));
```

### Option 2: Using ParquetProvider (Node.js)

```typescript
import { createNodeParquetProvider } from '@arweave-query/core/node';
import { GatewayAPI } from './utils/gateway_api';

const queryProvider = createNodeParquetProvider({
  parquetUrls: {
    blocks: 'https://gateway.ar.io/local/datasets/blocks.parquet',
    transactions: 'https://gateway.ar.io/local/datasets/transactions.parquet',
    tags: 'https://gateway.ar.io/local/datasets/tags.parquet'
  },
  duckdbConfig: {
    memory: ':memory:',
    readOnly: true
  }
});

const gatewayApi = new GatewayAPI({
  gatewayUrl: new URL('https://arweave.net'),
  queryProvider
});

// Queries will now use the faster Parquet provider
const result = await gatewayApi.gqlRequest(buildQuery({
  tags: [{ name: 'Drive-Id', value: driveId }],
  cursor: ''
}));
```

### Option 3: Fallback Mode (Default)

If no `queryProvider` is provided, the `GatewayAPI` will continue to work as before, using direct HTTP GraphQL requests:

```typescript
import { GatewayAPI } from './utils/gateway_api';

const gatewayApi = new GatewayAPI({
  gatewayUrl: new URL('https://arweave.net')
  // No queryProvider - uses traditional GraphQL endpoint
});

const result = await gatewayApi.gqlRequest(buildQuery({
  tags: [{ name: 'Entity-Type', value: 'file' }]
}));
```

## How It Works

1. When you call `gqlRequest()`, it checks if a `queryProvider` is configured
2. If yes AND the query includes structured parameters (from `buildQuery()`), it:
   - Converts the parameters to the `TransactionsQueryFilter` format
   - Calls the provider's `getTransactions()` method
   - Converts the `QueryResult<Transaction>` response back to `GQLTransactionsResultInterface`
3. If no provider is configured, it falls back to the traditional HTTP GraphQL request

## Benefits

- **Performance**: ParquetProvider can be significantly faster for large queries
- **Flexibility**: Choose the best provider for your use case
- **Backward Compatible**: Existing code continues to work without changes
- **Type Safety**: Full TypeScript support with proper type conversions

## Type Conversions

The integration automatically handles type conversions between:

### Input: BuildGQLQueryParams → TransactionsQueryFilter
```typescript
{
  tags: [{ name: 'App-Name', value: 'my-app' }],
  cursor: 'cursor-string',
  owner: 'address',
  ids: ['tx-id-1', 'tx-id-2']
}
// becomes
{
  tags: [{ name: 'App-Name', values: ['my-app'] }],
  after: 'cursor-string',
  owners: ['address'],
  ids: ['tx-id-1', 'tx-id-2'],
  first: 100
}
```

### Output: QueryResult<Transaction> → GQLTransactionsResultInterface
The provider's transaction format is converted to match the expected GQL format with:
- `edges` array with `cursor` and `node` properties
- `pageInfo` with `hasNextPage` boolean
- Proper tag, owner, fee, and block structures

