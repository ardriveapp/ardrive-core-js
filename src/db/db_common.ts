import Database from 'better-sqlite3';

let db: Database.Database | null;

// Executes a query on the database that does not return a result, like a delete or update
export const run = (sql: any, params: any[] = []): any => {
	if (db === null) {
		console.log('DB not created yet - run setupDatabase() before using these methods.');
		return 'Error';
	} else {
		try {
			const statement = db.prepare(sql);
			return statement.run(params);
		} catch (err) {
			console.log(`Error running sql: ${sql}`);
			console.log(err);
			return 'Error';
		}
	}
};

// Executes a get query on the database that returns a single item
export function get(sql: any, params: any[] = []): any {
	if (db === null) {
		throw new Error('DB not created yet - run setupDatabase() before using these methods.');
	} else {
		try {
			const statement = db.prepare(sql);
			return statement.get(params);
		} catch (err) {
			console.log(`Error running sql: ${sql}`);
			console.log(err);
			throw new Error('Error');
		}
	}
}

// Exectues a get query on the database that returns many items in an array
export const all = (sql: any, params: any[] = []): any[] => {
	if (db === null) {
		console.log('DB not created yet - run setupDatabase() before using these methods.');
		return [];
	} else {
		try {
			const statement = db.prepare(sql);
			return statement.all(params);
		} catch (err) {
			console.log(`Error running sql: ${sql}`);
			console.log(err);
			return [];
		}
	}
};

////////////////////////
// DB SETUP FUNCTIONS //
////////////////////////
// Main entrypoint for database. MUST call this before anything else can happen
export const setupDatabase = async (dbFilePath: string): Promise<Error | null> => {
	try {
		db = await createOrOpenDb(dbFilePath);
		createTablesInDB();
	} catch (err) {
		return err;
	}
	return null;
};

const createOrOpenDb = async (dbFilePath: string): Promise<any> => {
	try {
		const database: any = new Database(dbFilePath);
		return database;
	} catch (err) {
		console.error('Could not connect to database: '.concat(err.message));
		return 'Error';
	}
};

// Sets up each table needed for ArDrive.  All file metadata is stored in the sync table.
const createTablesInDB = () => {
	createProfileTable();
	createSyncTable();
	createDriveTable();
	createBundleTable();
};

// This table stores bundled transaction metadata for status tracking.
// This table is not required to be synchronized, and is only used for new data uploads.
const createBundleTable = async () => {
	const sql = `CREATE TABLE IF NOT EXISTS Bundle (
      id integer NOT NULL PRIMARY KEY,
      login text,
      bundleTxId text UNIQUE,
      bundleSyncStatus integer DEFAULT 0,
      uploader text,
      uploadTime integer
    );`;
	return run(sql);
};

// This table stores each attached personal or shared Drive for each user.
const createDriveTable = async () => {
	const sql = `CREATE TABLE IF NOT EXISTS Drive (
      id integer NOT NULL PRIMARY KEY,
      login text,
      appName text,
      appVersion text,
      driveName text,
      rootFolderId text,
      cipher text,
      cipherIV text,
      unixTime integer,
      arFS text,
      driveId text UNIQUE,
      driveSharing text,
      drivePrivacy text,
      driveAuthMode text,
      metaDataTxId text,
      metaDataSyncStatus integer DEFAULT 0,
      lastBlockHeight integer DEFAULT 0,
      isLocal integer DEFAULT 0
    );`;
	return run(sql);
};

// This table stores the encrypted Arweave Wallet JWK, local wallet balance, sync folder path and other personalized application settings
const createProfileTable = async () => {
	const sql = `CREATE TABLE IF NOT EXISTS Profile (
        id integer NOT NULL PRIMARY KEY,
        login text NOT NULL UNIQUE,
        dataProtectionKey text,
        walletPrivateKey text,
        walletPublicKey text,
        walletBalance integer DEFAULT 0,
        syncFolderPath text,
        autoSyncApproval integer DEFAULT 0,
        lastBlockHeight integer DEFAULT 0
     );`;
	return await run(sql);
};

// This is the primary data table for all Arweave File System metadata for drive root folders, folders and files.
// It also contains other metadata to support the application, such as file hashes, paths, transaction data as well as synchronization status
const createSyncTable = () => {
	const sql = `CREATE TABLE IF NOT EXISTS Sync (
        id integer NOT NULL PRIMARY KEY,
        login text,
        metaDataTxId text NOT NULL,
        dataTxId text,
        bundleTxId text,
        appName text DEFAULT ArDrive,
        appVersion text,
        unixTime integer,
        contentType text,
        entityType text,
        driveId text,
        parentFolderId text,
        fileId text,
        filePath text,
        fileName text,
        fileHash text,
        fileSize integer DEFAULT 0,
        lastModifiedDate integer DEFAULT 0,
        fileVersion integer DEFAULT 0,
        cipher text,
        dataCipherIV text,
        metaDataCipherIV text,
        permaWebLink text,
        fileDataSyncStatus integer DEFAULT 0,
        fileMetaDataSyncStatus integer DEFAULT 0,
        cloudOnly integer DEFAULT 0,
        isPublic integer DEFAULT 0,
        isLocal integer DEFAULT 0,
        uploader text,
        uploadTime integer DEFAULT 0
     );`;
	return run(sql);
};
