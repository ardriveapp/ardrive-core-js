import * as common from './common';
import * as types from './types/base_Types';
import * as arfsTypes from './types/arfs_Types';
import * as gqlTypes from './types/gql_Types';
import * as getDb from './db/db_get';
import * as updateDb from './db/db_update';
import { queryGateway } from './gateway';

import { getTransactionData } from './gateway';
import { deriveDriveKey, driveDecrypt, deriveFileKey, fileDecrypt } from './crypto';

import Arweave from 'arweave';
import { CipherType, DriveAuthMode, DrivePrivacy, EntityType } from './types/type_guards';

const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Our primary GQL url
const graphQLURL = common.gatewayURL.concat('graphql');
export const primaryGraphQLURL = 'https://arweave.net/graphql';
export const backupGraphQLURL = 'https://arweave.dev/graphql';

// Gets the latest version of a drive entity
export async function getPublicDriveEntity(driveId: string): Promise<arfsTypes.ArFSDriveEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const drive: arfsTypes.ArFSDriveEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId,
		drivePrivacy: '',
		entityType: 'drive',
		name: '',
		rootFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
		  { name: "Drive-Privacy", values: "public" }]) 
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Get the drives transaction ID
			drive.txId = node.id;
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get Shared Public Drive');
		return 'CORE GQL ERROR: Cannot get Shared Public Drive';
	}
}

// Gets the latest version of a drive entity
export async function getPrivateDriveEntity(driveId: string): Promise<arfsTypes.ArFSPrivateDriveEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const drive: arfsTypes.ArFSPrivateDriveEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId,
		drivePrivacy: '',
		driveAuthMode: '',
		entityType: '',
		name: '',
		rootFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
		  { name: "Drive-Privacy", values: "private" }]) 
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Cipher':
						drive.cipher = value;
						break;
					case 'Cipher-IV':
						drive.cipherIV = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Auth-Mode':
						drive.driveAuthMode = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Get the drives transaction ID
			drive.txId = node.id;
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get Public Drive');
		return 'CORE GQL ERROR: Cannot get Public Drive';
	}
}

// Gets the latest version of a folder entity
export async function getPublicFolderEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const folder: arfsTypes.ArFSFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId: '',
		entityType: 'folder',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0,
		lastModifiedDate: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "Folder-Id", values: "${entityId}"}
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			folder.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						folder.appName = value;
						break;
					case 'App-Version':
						folder.appVersion = value;
						break;
					case 'ArFS':
						folder.arFS = value;
						break;
					case 'Content-Type':
						folder.contentType = value;
						break;
					case 'Drive-Id':
						folder.driveId = value;
						break;
					case 'Entity-Type':
						folder.entityType = value;
						break;
					case 'Folder-Id':
						folder.entityId = value;
						break;
					case 'Parent-Folder-Id':
						folder.parentFolderId = value;
						break;
					case 'Unix-Time':
						folder.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return folder;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get public folder entity');
		return 'CORE GQL ERROR: Cannot get public folder entity';
	}
}

// Gets the latest version of a folder entity
export async function getPrivateFolderEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSPrivateFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const folder: arfsTypes.ArFSPrivateFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId: '',
		entityType: 'folder',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0,
		lastModifiedDate: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "Folder-Id", values: "${entityId}"}
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			folder.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						folder.appName = value;
						break;
					case 'App-Version':
						folder.appVersion = value;
						break;
					case 'ArFS':
						folder.arFS = value;
						break;
					case 'Cipher':
						folder.cipher = value;
						break;
					case 'Cipher-IV':
						folder.cipherIV = value;
						break;
					case 'Content-Type':
						folder.contentType = value;
						break;
					case 'Drive-Id':
						folder.driveId = value;
						break;
					case 'Entity-Type':
						folder.entityType = value;
						break;
					case 'Folder-Id':
						folder.entityId = value;
						break;
					case 'Parent-Folder-Id':
						folder.parentFolderId = value;
						break;
					case 'Unix-Time':
						folder.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return folder;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get private folder entity');
		return 'CORE GQL ERROR: Cannot get private folder entity';
	}
}

// Gets the latest version of a file entity
export async function getPublicFileEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const file: arfsTypes.ArFSFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId: '',
		entityType: 'file',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0,
		lastModifiedDate: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "File-Id", values: "${entityId}"}
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			file.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						file.appName = value;
						break;
					case 'App-Version':
						file.appVersion = value;
						break;
					case 'ArFS':
						file.arFS = value;
						break;
					case 'Content-Type':
						file.contentType = value;
						break;
					case 'Drive-Id':
						file.driveId = value;
						break;
					case 'Entity-Type':
						file.entityType = value;
						break;
					case 'File-Id':
						file.entityId = value;
						break;
					case 'Parent-Folder-Id':
						file.parentFolderId = value;
						break;
					case 'Unix-Time':
						file.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return file;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get folder entity';
	}
}

// Gets the latest version of a private file entity
export async function getPrivateFileEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSPrivateFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const file: arfsTypes.ArFSPrivateFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId: '',
		entityType: 'file',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0,
		lastModifiedDate: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "File-Id", values: "${entityId}"}
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			file.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						file.appName = value;
						break;
					case 'App-Version':
						file.appVersion = value;
						break;
					case 'ArFS':
						file.arFS = value;
						break;
					case 'Cipher':
						file.cipher = value;
						break;
					case 'Cipher-IV':
						file.cipherIV = value;
						break;
					case 'Content-Type':
						file.contentType = value;
						break;
					case 'Drive-Id':
						file.driveId = value;
						break;
					case 'Entity-Type':
						file.entityType = value;
						break;
					case 'File-Id':
						file.entityId = value;
						break;
					case 'Parent-Folder-Id':
						file.parentFolderId = value;
						break;
					case 'Unix-Time':
						file.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return file;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get folder entity';
	}
}

// Gets all of the drive entities for a users wallet
export async function getAllPublicDriveEntities(
	owner: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSDriveEntity[] | string> {
	const graphQLURL = primaryGraphQLURL;
	const allDrives: arfsTypes.ArFSDriveEntity[] = [];
	try {
		// Search last 5 blocks minimum
		if (lastBlockHeight > 5) {
			lastBlockHeight -= 5;
		}

		// Create the Graphql Query to search for all drives relating to the User wallet
		const query = {
			query: `query {
      			transactions(
				block: {min: ${lastBlockHeight}}
				first: 100
				owners: ["${owner}"]
				tags: [
					{ name: "Entity-Type", values: "drive" }
					{ name: "Drive-Privacy", values: "public" }]) 
				{
					edges {
						node {
							id
							tags {
								name
								value
							}
						}
					}
      			}
    		}`
		};

		// Call the Arweave Graphql Endpoint
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the drive IDs
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: arfsTypes.ArFSDriveEntity = {
				appName: '',
				appVersion: '',
				arFS: '',
				contentType: 'application/json',
				driveId: '',
				drivePrivacy: 'public',
				entityType: 'drive',
				name: '',
				rootFolderId: '',
				txId: '',
				unixTime: 0,
				syncStatus: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.txId = node.id;
			allDrives.push(drive);
		});
		return allDrives;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get drive ids';
	}
}

// Gets all of the private drive entities for a users wallet
export async function getAllPrivateDriveEntities(
	owner: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateDriveEntity[] | string> {
	const graphQLURL = primaryGraphQLURL;
	const allDrives: arfsTypes.ArFSPrivateDriveEntity[] = [];
	try {
		// Search last 5 blocks minimum
		if (lastBlockHeight > 5) {
			lastBlockHeight -= 5;
		}

		// Create the Graphql Query to search for all drives relating to the User wallet
		const query = {
			query: `query {
      			transactions(
				block: {min: ${lastBlockHeight}}
				first: 100
				owners: ["${owner}"]
				tags: [
					{ name: "Entity-Type", values: "drive" }
					{ name: "Drive-Privacy", values: "private" }]) 
				{
					edges {
						node {
							id
							tags {
								name
								value
							}
						}
					}
      			}
    		}`
		};

		// Call the Arweave Graphql Endpoint
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the drive IDs
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: arfsTypes.ArFSPrivateDriveEntity = {
				appName: '',
				appVersion: '',
				arFS: '',
				cipher: '',
				cipherIV: '',
				contentType: 'application/json',
				driveId: '',
				drivePrivacy: 'private',
				driveAuthMode: '',
				entityType: 'drive',
				name: '',
				rootFolderId: '',
				txId: '',
				unixTime: 0,
				syncStatus: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Cipher':
						drive.cipher = value;
						break;
					case 'Cipher-IV':
						drive.cipherIV = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Auth-Mode':
						drive.driveAuthMode = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.txId = node.id;
			allDrives.push(drive);
		});
		return allDrives;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get private drive entities');
		return 'CORE GQL ERROR: Cannot get private drive entities';
	}
}

// Gets all of the folder entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPublicFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFolders: arfsTypes.ArFSFileFolderEntity[] = [];
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}
	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "folder"}
		  { name: "Content-Type", values: "application/json"}
        ]
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const folder: arfsTypes.ArFSFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					contentType: '',
					driveId: '',
					entityType: 'folder',
					entityId: '',
					name: '',
					parentFolderId: '',
					unixTime: 0,
					txId: '',
					syncStatus: 0,
					lastModifiedDate: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							folder.appName = value;
							break;
						case 'App-Version':
							folder.appVersion = value;
							break;
						case 'ArFS':
							folder.arFS = value;
							break;
						case 'Content-Type':
							folder.contentType = value;
							break;
						case 'Drive-Id':
							folder.driveId = value;
							break;
						case 'Folder-Id':
							folder.entityId = value;
							break;
						case 'Parent-Folder-Id':
							folder.parentFolderId = value;
							break;
						case 'Unix-Time':
							folder.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				folder.txId = node.id;
				allFolders.push(folder);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for folder entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get public folder entities';
	} else {
		return allFolders;
	}
}

// Gets all of the private folder entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPrivateFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFolders: arfsTypes.ArFSPrivateFileFolderEntity[] = [];
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}
	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "folder"}
		  { name: "Content-Type", values: "application/octet-stream"}
        ]
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const folder: arfsTypes.ArFSPrivateFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					cipher: '',
					cipherIV: '',
					contentType: '',
					driveId: '',
					entityType: 'folder',
					entityId: '',
					name: '',
					parentFolderId: '',
					unixTime: 0,
					txId: '',
					syncStatus: 0,
					lastModifiedDate: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							folder.appName = value;
							break;
						case 'App-Version':
							folder.appVersion = value;
							break;
						case 'ArFS':
							folder.arFS = value;
							break;
						case 'Cipher':
							folder.cipher = value;
							break;
						case 'Cipher-IV':
							folder.cipherIV = value;
							break;
						case 'Content-Type':
							folder.contentType = value;
							break;
						case 'Drive-Id':
							folder.driveId = value;
							break;
						case 'Folder-Id':
							folder.entityId = value;
							break;
						case 'Parent-Folder-Id':
							folder.parentFolderId = value;
							break;
						case 'Unix-Time':
							folder.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				folder.txId = node.id;
				allFolders.push(folder);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for folder entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get private folder entities';
	} else {
		return allFolders;
	}
}

// Gets all of the file entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPublicFileEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFileEntities: arfsTypes.ArFSFileFolderEntity[] = [];
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}
	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "file"}
		  { name: "Content-Type", values: "application/json"}
        ]
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const file: arfsTypes.ArFSFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					contentType: '',
					driveId: '',
					entityType: 'file',
					entityId: '',
					name: '',
					parentFolderId: '',
					txId: '',
					unixTime: 0,
					syncStatus: 0,
					lastModifiedDate: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							file.appName = value;
							break;
						case 'App-Version':
							file.appVersion = value;
							break;
						case 'ArFS':
							file.arFS = value;
							break;
						case 'Content-Type':
							file.contentType = value;
							break;
						case 'Drive-Id':
							file.driveId = value;
							break;
						case 'File-Id':
							file.entityId = value;
							break;
						case 'Parent-Folder-Id':
							file.parentFolderId = value;
							break;
						case 'Unix-Time':
							file.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				file.txId = node.id;
				allFileEntities.push(file);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for file entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get public file entities';
	} else {
		return allFileEntities;
	}
}

// Gets all of the private file entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPrivateFileEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFileEntities: arfsTypes.ArFSPrivateFileFolderEntity[] = [];
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}
	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "file"}
		  { name: "Content-Type", values: "application/octet-stream"}
        ]
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const file: arfsTypes.ArFSPrivateFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					cipher: '',
					cipherIV: '',
					contentType: '',
					driveId: '',
					entityType: 'file',
					entityId: '',
					name: '',
					parentFolderId: '',
					txId: '',
					unixTime: 0,
					syncStatus: 0,
					lastModifiedDate: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							file.appName = value;
							break;
						case 'App-Version':
							file.appVersion = value;
							break;
						case 'ArFS':
							file.arFS = value;
							break;
						case 'Cipher':
							file.cipher = value;
							break;
						case 'Cipher-IV':
							file.cipherIV = value;
							break;
						case 'Content-Type':
							file.contentType = value;
							break;
						case 'Drive-Id':
							file.driveId = value;
							break;
						case 'File-Id':
							file.entityId = value;
							break;
						case 'Parent-Folder-Id':
							file.parentFolderId = value;
							break;
						case 'Unix-Time':
							file.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				file.txId = node.id;
				allFileEntities.push(file);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for file entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get private file entities';
	} else {
		return allFileEntities;
	}
}
// Gets all of the File and Folder Entities from GraphQL for a specific private drive
export async function getAllPublicFileFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<
	{ fileEntities: arfsTypes.ArFSFileFolderEntity[]; folderEntities: arfsTypes.ArFSFileFolderEntity[] } | string
> {
	const folderEntities = await getAllPublicFolderEntities(owner, driveId, lastBlockHeight);
	const fileEntities = await getAllPublicFileEntities(owner, driveId, lastBlockHeight);
	if (typeof folderEntities === 'object' && typeof fileEntities === 'object') {
		return { folderEntities, fileEntities };
	} else {
		return 'Error';
	}
}

// Gets all of the File and Folder Entities from GraphQL for a specific drive
export async function getAllPrivateFileFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<
	| { fileEntities: arfsTypes.ArFSPrivateFileFolderEntity[]; folderEntities: arfsTypes.ArFSPrivateFileFolderEntity[] }
	| string
> {
	const folderEntities = await getAllPrivateFolderEntities(owner, driveId, lastBlockHeight);
	const fileEntities = await getAllPrivateFileEntities(owner, driveId, lastBlockHeight);
	if (typeof folderEntities === 'object' && typeof fileEntities === 'object') {
		return { folderEntities, fileEntities };
	} else {
		return 'Error';
	}
}

// Gets the the tags for a file entity data transaction
export async function getPublicFileData(txid: string): Promise<arfsTypes.ArFSFileData | string> {
	let graphQLURL = primaryGraphQLURL;
	const fileData: arfsTypes.ArFSFileData = {
		appName: '',
		appVersion: '',
		contentType: '',
		syncStatus: 0,
		txId: '',
		unixTime: 0
	};
	let tries = 0;
	const query = {
		query: `query {
      transactions(
		first: 1
        sort: HEIGHT_ASC
		ids: ["${txid}"]) 
		{
		edges {
			node {
			id
			tags {
				name
				value
          }
        }
      }
    }
  }`
	};

	// We will only attempt this 10 times
	while (tries < 10) {
		try {
			// Call the Arweave Graphql Endpoint
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						fileData.appName = value;
						break;
					case 'App-Version':
						fileData.appVersion = value;
						break;
					case 'Unix-Type':
						fileData.unixTime = +value;
						break;
					case 'Content-Type':
						fileData.contentType = value;
						break;
					default:
						break;
				}
			});
			return fileData;
		} catch (err) {
			console.log(err);
			console.log('Error getting private transaction cipherIV for txid %s, trying again', txid);
			if (tries < 5) {
				tries += 1;
			} else {
				tries += 1;
				console.log('Primary gateway is having issues, switching to backup and trying again');
				graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
			}
		}
	}
	return 'CORE GQL ERROR: Cannot get public file data';
}

// Gets the the tags for a file entity data transaction
export async function getPrivateFileData(txid: string): Promise<arfsTypes.ArFSPrivateFileData | string> {
	let graphQLURL = primaryGraphQLURL;
	const fileData: arfsTypes.ArFSPrivateFileData = {
		appName: '',
		appVersion: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	let tries = 0;
	const query = {
		query: `query {
      transactions(
		first: 1
        sort: HEIGHT_ASC
		ids: ["${txid}"]) 
		{
		edges {
			node {
			id
			tags {
				name
				value
          }
        }
      }
    }
  }`
	};

	// We will only attempt this 10 times
	while (tries < 10) {
		try {
			// Call the Arweave Graphql Endpoint
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						fileData.appName = value;
						break;
					case 'App-Version':
						fileData.appVersion = value;
						break;
					case 'Unix-Type':
						fileData.unixTime = +value;
						break;
					case 'Cipher':
						fileData.cipher = value;
						break;
					case 'Cipher-IV':
						fileData.cipherIV = value;
						break;
					case 'Content-Type':
						fileData.contentType = value;
						break;
					default:
						break;
				}
			});
			return fileData;
		} catch (err) {
			console.log(err);
			console.log('Error getting private transaction cipherIV for txid %s, trying again', txid);
			if (tries < 5) {
				tries += 1;
			} else {
				tries += 1;
				console.log('Primary gateway is having issues, switching to backup and trying again');
				graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
			}
		}
	}
	return 'CORE GQL ERROR: Cannot get private file data';
}

// Gets the CipherIV tag of a private data transaction
// FIXME: Maybe this could just look up by txid rather than GQL?
export async function getPrivateTransactionCipherIV(txid: string): Promise<string> {
	const query = {
		query: `query {
      transactions(ids: ["${txid}"]) {
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }`
	};

	return await queryGateway(async (url: string) => {
		const response = await arweave.api.request().post(url + "/graphql", query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		const { node } = edges[0];
		const { tags } = node;
		let cipherIV: string = "";
		tags.forEach((tag: gqlTypes.GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Cipher-IV':
					cipherIV = value;
					break;
				default:
					break;
			}
		});

		if (cipherIV !== "")
			return cipherIV;

		console.log("Failed to find data cipher IV for " + txid);
		return "Error";
	});
}

// Uses GraphQl to pull necessary drive information from another user's Shared Public Drives
export async function getSharedPublicDrive(driveId: string): Promise<types.ArFSDriveMetaData> {
	const drive: types.ArFSDriveMetaData = types.ArFSDriveMetaData.Empty(common.appName, common.appVersion, driveId);
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 100
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		await common.asyncForEach(edges, async (edge: gqlTypes.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value as DrivePrivacy;
						break;
					default:
						break;
				}
			});

			// We cannot add this drive if it is private
			if (drive.drivePrivacy === 'private') {
				return 'Skipped';
			}

			// Download the File's Metadata using the metadata transaction ID
			drive.metaDataTxId = node.id;
			console.log('Shared Drive Metadata tx id: ', drive.metaDataTxId);
			drive.metaDataSyncStatus = 3;
			const data = await getTransactionData(drive.metaDataTxId);
			const dataString = await common.Utf8ArrayToStr(data);
			const dataJSON = await JSON.parse(dataString);

			// Get the drive name and root folder id
			drive.driveName = dataJSON.name;
			drive.rootFolderId = dataJSON.rootFolderId;
			return 'Found';
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('Error getting Shared Public Drive');
		return drive;
	}
}

// Gets the root folder ID for a Public Drive
export async function getPublicDriveRootFolderTxId(driveId: string, folderId: string): Promise<string> {
	let metaDataTxId = '0';
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "ArFS", values: "${common.arFSVersion}" }
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
          }
        }
      }
    }`
		};
		const response = await arweave.api.request().post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		await common.asyncForEach(edges, async (edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			metaDataTxId = node.id;
		});
		return metaDataTxId;
	} catch (err) {
		console.log(err);
		console.log('Error querying GQL for personal public drive root folder id, trying again.');
		metaDataTxId = await getPublicDriveRootFolderTxId(driveId, folderId);
		return metaDataTxId;
	}
}

// Gets the root folder ID for a Private Drive and includes the Cipher and IV
export async function getPrivateDriveRootFolderTxId(
	driveId: string,
	folderId: string
): Promise<types.ArFSRootFolderMetaData> {
	let rootFolderMetaData: types.ArFSRootFolderMetaData = {
		metaDataTxId: '0',
		cipher: '',
		cipherIV: ''
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "ArFS", values: "${common.arFSVersion}" }
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		await common.asyncForEach(edges, async (edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			rootFolderMetaData.metaDataTxId = node.id;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'Cipher':
						rootFolderMetaData.cipher = value as CipherType;
						break;
					case 'Cipher-IV':
						rootFolderMetaData.cipherIV = value;
						break;
				}
			});
		});
		return rootFolderMetaData;
	} catch (err) {
		console.log(err);
		console.log('Error querying GQL for personal private drive root folder id, trying again.');
		rootFolderMetaData = await getPrivateDriveRootFolderTxId(driveId, folderId);
		return rootFolderMetaData;
	}
}

// Gets all of the ardrive IDs from a user's wallet
// Uses the Entity type to only search for Drive tags
export async function getAllMyPublicArDriveIds(
	login: string,
	walletPublicKey: string,
	lastBlockHeight: number
): Promise<types.ArFSDriveMetaData[]> {
	const allPublicDrives: types.ArFSDriveMetaData[] = [];
	try {
		// Search last 5 blocks minimum
		if (lastBlockHeight > 5) {
			lastBlockHeight -= 5;
		}

		// Create the Graphql Query to search for all drives relating to the User wallet
		const query = {
			query: `query {
      			transactions(
				block: {min: ${lastBlockHeight}}
				first: 100
				owners: ["${walletPublicKey}"]
				tags: [
					{ name: "App-Name", values: ["${common.appName}", "${common.webAppName}"] }
					{ name: "Entity-Type", values: "drive" }
					{ name: "Drive-Privacy", values: "public" }]) 
				{
					edges {
						node {
							id
							tags {
								name
								value
							}
						}
					}
      			}
    		}`
		};

		// Call the Arweave Graphql Endpoint
		const response = await arweave.api.post(graphQLURL, query); // This must be updated to production when available
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the private drive IDs
		await common.asyncForEach(edges, async (edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: types.ArFSDriveMetaData = {
				id: 0,
				login: login,
				appName: '',
				appVersion: '',
				driveName: '',
				rootFolderId: '',
				cipher: '',
				cipherIV: '',
				unixTime: 0,
				arFS: '',
				driveId: '',
				driveSharing: 'personal',
				drivePrivacy: 'public',
				driveAuthMode: '',
				metaDataTxId: '',
				metaDataSyncStatus: 3,
				isLocal: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value as DrivePrivacy;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.metaDataTxId = node.id;

			// Download the File's Metadata using the metadata transaction ID
			const data = await getTransactionData(drive.metaDataTxId);
			const dataString = await common.Utf8ArrayToStr(data);
			const dataJSON = await JSON.parse(dataString);

			// Get the drive name and root folder id
			drive.driveName = dataJSON.name;
			drive.rootFolderId = dataJSON.rootFolderId;
			allPublicDrives.push(drive);
			return 'Added';
		});
		return allPublicDrives;
	} catch (err) {
		console.log(err);
		console.log('Error getting all public drives');
		return allPublicDrives;
	}
}

// Gets all of the private ardrive IDs from a user's wallet, using the Entity type to only search for Drive tags
// Only returns Private drives from graphql
export async function getAllMyPrivateArDriveIds(
	user: types.ArDriveUser,
	lastBlockHeight: number
): Promise<types.ArFSDriveMetaData[]> {
	const allPrivateDrives: types.ArFSDriveMetaData[] = [];

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	const query = {
		query: `query {
    transactions(
      block: {min: ${lastBlockHeight}}
      first: 100
      owners: ["${user.walletPublicKey}"]
      tags: [
        { name: "ArFS", values: "${common.arFSVersion}" }
        { name: "Entity-Type", values: "drive" }
        { name: "Drive-Privacy", values: "private" }
      ]
    ) {
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }`
	};

	// Call the Arweave Graphql Endpoint
	let response;
	try {
		response = await arweave.api.post(graphQLURL, query);
	} catch (err) {
		return allPrivateDrives;
	}

	const { data } = response.data;
	const { transactions } = data;
	const { edges } = transactions;

	// Iterate through each returned transaction and pull out the private drive IDs
	await common.asyncForEach(edges, async (edge: gqlTypes.GQLEdgeInterface) => {
		const { node } = edge;
		const { tags } = node;
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login: user.login,
			appName: '',
			appVersion: '',
			driveName: '',
			rootFolderId: '',
			cipher: '',
			cipherIV: '',
			unixTime: 0,
			arFS: '',
			driveId: '',
			driveSharing: 'personal',
			drivePrivacy: '',
			driveAuthMode: '',
			metaDataTxId: '',
			metaDataSyncStatus: 3,
			isLocal: 0
		};
		// Iterate through each tag and pull out each drive ID as well the drives privacy status
		tags.forEach((tag: gqlTypes.GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					drive.appName = value;
					break;
				case 'App-Version':
					drive.appVersion = value;
					break;
				case 'Unix-Time':
					drive.unixTime = +value;
					break;
				case 'Drive-Id':
					drive.driveId = value;
					break;
				case 'ArFS':
					drive.arFS = value;
					break;
				case 'Drive-Privacy':
					drive.drivePrivacy = value as DrivePrivacy;
					break;
				case 'Drive-Auth-Mode':
					drive.driveAuthMode = value as DriveAuthMode;
					break;
				case 'Cipher':
					drive.cipher = value as CipherType;
					break;
				case 'Cipher-IV':
					drive.cipherIV = value;
					break;
				default:
					break;
			}
		});
		try {
			// Capture the TX of the public drive metadata tx
			drive.metaDataTxId = node.id;

			// Download the File's Metadata using the metadata transaction ID
			const data = await getTransactionData(drive.metaDataTxId);
			const dataBuffer = Buffer.from(data);
			// Since this is a private drive, we must decrypt the JSON data
			const driveKey: Buffer = await deriveDriveKey(user.dataProtectionKey, drive.driveId, user.walletPrivateKey);
			const decryptedDriveBuffer: Buffer = await driveDecrypt(drive.cipherIV, driveKey, dataBuffer);
			const decryptedDriveString: string = await common.Utf8ArrayToStr(decryptedDriveBuffer);
			const decryptedDriveJSON = await JSON.parse(decryptedDriveString);

			// Get the drive name and root folder id
			drive.driveName = decryptedDriveJSON.name;
			drive.rootFolderId = decryptedDriveJSON.rootFolderId;
			allPrivateDrives.push(drive);
		} catch (err) {
			console.log('Error: ', err);
			console.log('Password not valid for this private drive TX %s | ID %s', node.id, drive.driveId);
			drive.driveName = 'Invalid Drive Password';
			drive.rootFolderId = '';
			allPrivateDrives.push(drive);
		}
	});
	return allPrivateDrives;
}

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID
// CHANGE TO RETURN ARFSFILEMETADATA
export async function getAllMyDataFileTxs(
	walletPublicKey: string,
	driveId: string,
	lastBlockHeight: number
): Promise<gqlTypes.GQLEdgeInterface[]> {
	let hasNextPage = true;
	let cursor = '';
	let edges: gqlTypes.GQLEdgeInterface[] = [];
	let primaryGraphQLURL = graphQLURL;
	const backupGraphQLURL = graphQLURL.replace('.net', '.dev');
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "App-Name", values: ["${common.appName}", "${common.webAppName}"]}
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: ["file", "folder"]}
        ]
        first: 100
        after: "${cursor}"
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};

		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(primaryGraphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			if (transactions.edges && transactions.edges.length) {
				edges = edges.concat(transactions.edges);
				cursor = transactions.edges[transactions.edges.length - 1].cursor;
			}
			hasNextPage = transactions.pageInfo.hasNextPage;
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for personal data transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				tries = 0;
				if (primaryGraphQLURL.includes('.dev')) {
					console.log('Backup gateway is having issues, switching to primary.');
					primaryGraphQLURL = graphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					primaryGraphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
}

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID.
export async function getAllMySharedDataFileTxs(
	driveId: string,
	lastBlockHeight: number
): Promise<gqlTypes.GQLEdgeInterface[]> {
	let hasNextPage = true;
	let cursor = '';
	let edges: gqlTypes.GQLEdgeInterface[] = [];
	let primaryGraphQLURL = graphQLURL;
	const backupGraphQLURL = graphQLURL.replace('.net', '.dev');
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        tags: [
          { name: "App-Name", values: ["${common.appName}", "${common.webAppName}"]}
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: ["file", "folder"]}
        ]
        first: 100
        after: "${cursor}"
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    		}`
		};

		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(primaryGraphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			if (transactions.edges && transactions.edges.length) {
				edges = edges.concat(transactions.edges);
				cursor = transactions.edges[transactions.edges.length - 1].cursor;
			}
			hasNextPage = transactions.pageInfo.hasNextPage;
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for personal data transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				tries = 0;
				if (primaryGraphQLURL.includes('.dev')) {
					console.log('Backup gateway is having issues, switching to primary.');
					primaryGraphQLURL = graphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					primaryGraphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
}
// Takes an ArDrive File Data Transaction and writes to the database.
export async function getFileMetaDataFromTx(fileDataTx: gqlTypes.GQLEdgeInterface, user: types.ArDriveUser) {
	const fileToSync: types.ArFSFileMetaData = types.ArFSFileMetaData.Empty(user.login);
	try {
		const { node } = fileDataTx;
		const { tags } = node;
		fileToSync.metaDataTxId = node.id;

		// DOUBLE CHECK THIS
		// Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
		const isMetaDataSynced = await getDb.getByMetaDataTxFromSyncTable(fileToSync.metaDataTxId);
		if (isMetaDataSynced) {
			// this file is already downloaded and synced
			return 'Synced Already';
		}

		// Download the File's Metadata using the metadata transaction ID
		const data: Uint8Array = await getTransactionData(fileToSync.metaDataTxId);

		// Enumerate through each tag to pull the data
		tags.forEach((tag: gqlTypes.GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					fileToSync.appName = value;
					break;
				case 'App-Version':
					fileToSync.appVersion = value;
					break;
				case 'Unix-Time':
					fileToSync.unixTime = +value; // Convert to number
					break;
				case 'Content-Type':
					fileToSync.contentType = value;
					break;
				case 'Entity-Type':
					fileToSync.entityType = value as EntityType;
					break;
				case 'Drive-Id':
					fileToSync.driveId = value;
					break;
				case 'File-Id':
					fileToSync.fileId = value;
					break;
				case 'Folder-Id':
					fileToSync.fileId = value;
					break;
				case 'Parent-Folder-Id':
					fileToSync.parentFolderId = value;
					break;
				case 'Cipher':
					fileToSync.cipher = value as CipherType;
					break;
				case 'Cipher-IV':
					fileToSync.metaDataCipherIV = value;
					break;
				default:
					break;
			}
		});

		let dataJSON;
		let decryptedData = Buffer.from('');
		// If it is a private file or folder, the data will need decryption.
		if (fileToSync.cipher === 'AES256-GCM') {
			fileToSync.isPublic = 0;
			const dataBuffer = Buffer.from(data);
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToSync.driveId,
				user.walletPrivateKey
			);
			if (fileToSync.entityType === 'file') {
				// Decrypt files using a File Key derived from the Drive key
				const fileKey: Buffer = await deriveFileKey(fileToSync.fileId, driveKey);
				decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, fileKey, dataBuffer);
			} else if (fileToSync.entityType === 'folder') {
				// Decrypt folders using the Drive Key only
				decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, driveKey, dataBuffer);
			}

			// Handle an error with decryption by ignoring this file.  THIS NEEDS TO BE IMPROVED.
			if (decryptedData.toString('ascii') === 'Error') {
				console.log(
					'There was a problem decrypting a private %s with TXID: %s',
					fileToSync.entityType,
					fileToSync.metaDataTxId
				);
				console.log('Skipping this file...');
				fileToSync.fileSize = 0;
				fileToSync.fileName = '';
				fileToSync.fileHash = '';
				fileToSync.fileDataSyncStatus = 0;
				fileToSync.fileMetaDataSyncStatus = 3;
				fileToSync.dataTxId = '0';
				fileToSync.lastModifiedDate = fileToSync.unixTime;
				fileToSync.permaWebLink = common.gatewayURL.concat(fileToSync.dataTxId);
				fileToSync.cloudOnly = 1;
				await updateDb.addFileToSyncTable(fileToSync); // This must be handled better.
				return 'Error Decrypting';
			} else {
				const dataString = await common.Utf8ArrayToStr(decryptedData);
				dataJSON = await JSON.parse(dataString);
			}
		} else {
			// the file is public and does not require decryption
			const dataString = await common.Utf8ArrayToStr(data);
			dataJSON = await JSON.parse(dataString);
			fileToSync.isPublic = 1;
		}

		// Set metadata for Folder and File entities
		fileToSync.fileSize = dataJSON.size;
		fileToSync.fileName = dataJSON.name;
		fileToSync.fileHash = '';
		fileToSync.fileDataSyncStatus = 3;
		fileToSync.fileMetaDataSyncStatus = 3;
		fileToSync.dataTxId = '0';

		// Perform specific actions for File, Folder and Drive entities
		if (fileToSync.entityType === 'file') {
			// The actual data transaction ID, lastModifiedDate, and Filename of the underlying file are pulled from the metadata transaction
			fileToSync.lastModifiedDate = dataJSON.lastModifiedDate; // Convert to milliseconds
			fileToSync.dataTxId = dataJSON.dataTxId;
			fileToSync.contentType = common.extToMime(dataJSON.name);
			fileToSync.permaWebLink = common.gatewayURL.concat(dataJSON.dataTxId);

			if (fileToSync.isPublic === 0) {
				// if this is a private file, the CipherIV of the Data transaction should also be captured
				fileToSync.dataCipherIV = await getPrivateTransactionCipherIV(fileToSync.dataTxId);
			}

			// Check to see if a previous version exists, and if so, increment the version.
			// Versions are determined by comparing old/new file hash.
			const latestFile = await getDb.getLatestFileVersionFromSyncTable(fileToSync.fileId);
			if (latestFile !== undefined) {
				if (latestFile.fileDataTx !== fileToSync.dataTxId) {
					fileToSync.fileVersion = +latestFile.fileVersion + 1;
					// console.log ("%s has a new version %s", dataJSON.name, fileToSync.fileVersion)
				}
				// If the previous file data tx matches, then we do not increment the version
				else {
					fileToSync.fileVersion = latestFile.fileVersion;
				}
			}
			// Perform specific actions for Folder entities
		} else if (fileToSync.entityType === 'folder') {
			fileToSync.lastModifiedDate = fileToSync.unixTime;
			fileToSync.permaWebLink = common.gatewayURL.concat(fileToSync.metaDataTxId);
		}

		console.log(
			'QUEUING %s %s | Id: %s | Tx: %s for download',
			fileToSync.entityType,
			fileToSync.fileName,
			fileToSync.fileId,
			fileToSync.metaDataTxId
		);
		await updateDb.addFileToSyncTable(fileToSync);
		return 'Success';
	} catch (err) {
		console.log(err);
		console.log('Error syncing file metadata');
		console.log(fileToSync);
		return 'Error syncing file metadata';
	}
}
function tagToAttributeMap(tag: string): string {
	// tag to camel case
	const words = tag.split('-');
	const attribute = words.join('');
	return `${attribute.charAt(0).toLowerCase()}${attribute.slice(1)}`;
}

const QUERY_ARGUMENTS_WHITELIST = [
	'edges',
	'edges.node',
	'edges.node.id',
	'edges.node.tags',
	'edges.node.tags.name',
	'edges.node.tags.value',
	'edges.node.block',
	'edges.node.block.timestamp',
	'edges.node.block.height',
	'pageInfo',
	'pageInfo.hasNextPage'
];

class Query<T extends arfsTypes.ArFSEntity> {
	private _parameters: string[] = ['edges.node.id', 'hasNextPage'];
	private edges: gqlTypes.GQLEdgeInterface[] = [];
	private hasNextPage = true;
	private cursor = '';
	owners?: string[];
	tags?: { name: string; values: string | string[] }[];
	block?: { min: number };
	first?: number;

	set parameters(parameters: string[]) {
		if (!this._validateArguments(parameters)) {
			throw new Error('Invalid parameters.');
		}
		this._parameters = parameters;
	}

	private _validateArguments(argument: string[]) {
		const isValid = argument.reduce((valid: boolean, arg: string): boolean => {
			return valid && QUERY_ARGUMENTS_WHITELIST.includes(arg);
		}, true);
		return isValid;
	}

	public getAll = async (): Promise<T[]> => {
		await this._run();
		const entities: T[] = [];
		this.edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const entity: any = {};
			entity.txId = node.id;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const { name, value } = tag;
				const attributeName = tagToAttributeMap(name);
				entity[attributeName] = value;
			});
			entities.push(entity);
		});
		return entities;
	};

	public getRaw = async (): Promise<gqlTypes.GQLEdgeInterface[]> => {
		await this._run();
		return this.edges;
	};

	private _run = async (): Promise<void> => {
		const queryString = this._toString();
		while (this.hasNextPage) {
			const response = await arweave.api.post(primaryGraphQLURL, queryString);
			const { data } = response.data;
			const { transactions } = data;
			if (transactions.edges && transactions.edges.length) {
				this.edges = this.edges.concat(transactions.edges);
				this.cursor = transactions.edges[transactions.edges.length - 1].cursor;
			}
			this.hasNextPage = this._parameters.includes('pageInfo.hasNextPage') && transactions.pageInfo.hasNextPage;
		}
	};

	private _toString = () => {
		const serializedTransactionData = this._getSerializedTransactionData();
		const serializedQueryParameters = this._getSerializedParameters();
		return JSON.stringify(`query {\ntransactions(\n${serializedTransactionData}) ${serializedQueryParameters}\n}`);
	};

	private _getSerializedTransactionData = (): string => {
		const data: any = {};
		if (this.owners) {
			data.owners = serializedArray(this.owners, serializedString);
		}
		if (this.tags) {
			if (typeof this.tags === 'string') {
				data.tags = serializedString(this.tags);
			} else {
				data.tags = serializedArray(this.tags, serializedObject);
			}
		}
		if (this.block) {
			data.block = serializedObject(this.block);
		}
		if (this.first) {
			data.first = serializedNumber(this.first);
		}
		if (this.cursor) {
			data.after = serializedString(this.cursor);
		}
		const dataKeys = Object.keys(data);
		const serializedData = dataKeys.map((key) => `${key}: ${data[key]}`).join('\n');
		return serializedData;
	};

	private _getSerializedParameters = (params: any = this._getParametersObject(), depht = 0): string => {
		const paramKeys = Object.keys(params);
		let serializedParameters = '';
		if (paramKeys.length > 0) {
			serializedParameters = paramKeys
				.map((key): string => {
					const value = params[key];
					const valueChildrenKeys = Object.keys(value);
					if (valueChildrenKeys.length > 0) {
						return `${key} {${this._getSerializedParameters(value, depht + 1)}}`;
					} else {
						return `${key}`;
					}
				})
				.join('\n');
		}
		if (depht === 0 && serializedParameters) {
			serializedParameters = `{\n${serializedParameters}\n}`;
		}
		return serializedParameters;
	};

	private _getParametersObject = (): { [key: string]: any } => {
		const normalizedParameters = this._parameters.reduce((params: any, p: string): any => {
			const object: any = {};
			const nodes = p.split('.');
			let o = object;
			nodes.forEach((n) => {
				if (!o[n]) {
					o[n] = {};
					o = o[n];
				}
			});
			return Object.apply(params, object);
		}, {} as any);
		return normalizedParameters;
	};
}

function serializedNumber(n: number): string {
	return `${n}`;
}

function serializedString(s: string): string {
	return `"${s}"`;
}

function serializedObject(o: any): string {
	return JSON.stringify(o);
}

function serializedArray<T>(a: T[], serializeItem: (i: T) => string) {
	const serialized = a.map(serializeItem).join('\n');
	return `[\n${serialized}\n]`;
}

new Query<arfsTypes.ArFSDriveEntity>();
