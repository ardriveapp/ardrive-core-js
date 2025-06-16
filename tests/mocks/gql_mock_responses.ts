import { GQLNodeInterface, GQLEdgeInterface } from '../../src/types';

// Helper to create a mock GQL node
export function createMockGQLNode(overrides: Partial<GQLNodeInterface>): GQLNodeInterface {
	return {
		id: 'tx123',
		anchor: 'anchor123',
		owner: {
			address: 'test-owner-address',
			key: 'test-owner-key'
		},
		fee: {
			winston: '100000000',
			ar: '0.0001'
		},
		quantity: {
			winston: '0',
			ar: '0'
		},
		data: {
			size: 1024,
			type: 'application/json'
		},
		tags: [],
		block: {
			id: 'block123',
			timestamp: 1234567890,
			height: 1000000,
			previous: 'prev-block'
		},
		parent: {
			id: ''
		},
		bundledIn: {
			id: ''
		},
		...overrides
	};
}

// Mock drive entity
export function createMockDriveNode(driveId: string, blockHeight: number): GQLNodeInterface {
	return createMockGQLNode({
		id: `drive-tx-${blockHeight}`,
		tags: [
			{ name: 'Drive-Id', value: driveId },
			{ name: 'Entity-Type', value: 'drive' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'ArFS', value: '0.11' },
			{ name: 'Drive-Privacy', value: 'public' }
		],
		block: {
			id: `block-${blockHeight}`,
			timestamp: 1234567890 + blockHeight,
			height: blockHeight,
			previous: `block-${blockHeight - 1}`
		}
	});
}

// Mock folder entity
export function createMockFolderNode(
	folderId: string,
	driveId: string,
	parentFolderId: string,
	blockHeight: number,
	name = 'Test Folder'
): GQLNodeInterface {
	return createMockGQLNode({
		id: `folder-tx-${blockHeight}`,
		tags: [
			{ name: 'Folder-Id', value: folderId },
			{ name: 'Drive-Id', value: driveId },
			{ name: 'Parent-Folder-Id', value: parentFolderId },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'ArFS', value: '0.11' }
		],
		block: {
			id: `block-${blockHeight}`,
			timestamp: 1234567890 + blockHeight,
			height: blockHeight,
			previous: `block-${blockHeight - 1}`
		}
	});
}

// Mock file entity
export function createMockFileNode(
	fileId: string,
	driveId: string,
	parentFolderId: string,
	blockHeight: number,
	dataTxId = 'data-tx-123',
	name = 'test.txt'
): GQLNodeInterface {
	return createMockGQLNode({
		id: `file-tx-${blockHeight}`,
		tags: [
			{ name: 'File-Id', value: fileId },
			{ name: 'Drive-Id', value: driveId },
			{ name: 'Parent-Folder-Id', value: parentFolderId },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'ArFS', value: '0.11' }
		],
		block: {
			id: `block-${blockHeight}`,
			timestamp: 1234567890 + blockHeight,
			height: blockHeight,
			previous: `block-${blockHeight - 1}`
		}
	});
}

// Create mock GraphQL response with pagination
export function createMockGQLResponse(
	edges: GQLEdgeInterface[],
	hasNextPage = false
): { edges: GQLEdgeInterface[]; pageInfo: { hasNextPage: boolean } } {
	return {
		edges,
		pageInfo: {
			hasNextPage
		}
	};
}

// Create mock edge from node
export function createMockEdge(node: GQLNodeInterface, cursor?: string): GQLEdgeInterface {
	return {
		cursor: cursor || `cursor-${node.id}`,
		node
	};
}

// Mock metadata for entities
export const mockDriveMetadata = {
	name: 'Test Drive',
	rootFolderId: 'root-folder-123'
};

export const mockFolderMetadata = {
	name: 'Test Folder'
};

export const mockFileMetadata = {
	name: 'test.txt',
	size: 1024,
	lastModifiedDate: 1234567890,
	dataTxId: 'data-tx-123',
	dataContentType: 'text/plain'
};