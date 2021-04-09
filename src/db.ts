import * as sqlite3 from 'sqlite3';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from './types';

// Use verbose mode in development
let sql3 = sqlite3;
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
	sql3 = sqlite3.verbose();
}

let db: sqlite3.Database | null;

const run = (sql: any, params: any[] = []) => {
	return new Promise((resolve, reject) => {
		if (db === null) {
			return reject(new Error('DB not created yet - run setupDatabase() before using these methods.'));
		}
		return db.run(sql, params, (err: string) => {
			if (err) {
				console.log(`Error running sql ${sql}`);
				console.log(err);
				reject(err);
			}
			resolve('Success');
		});
	});
};

function get(sql: any, params: any[] = []): Promise<any> {
	return new Promise((resolve, reject) => {
		if (db === null) {
			return reject(new Error('DB not created yet - run setupDatabase() before using these methods.'));
		}
		return db.get(sql, params, (err: any, result: any) => {
			if (err) {
				console.log(`Error running sql: ${sql}`);
				console.log(err);
				reject(err);
			} else {
				resolve(result);
			}
		});
	});
}

const all = (sql: any, params: any[] = []): Promise<any[]> => {
	return new Promise((resolve, reject) => {
		if (db === null) {
			return reject(new Error('DB not created yet - run setupDatabase() before using these methods.'));
		}
		return db.all(sql, params, (err: any, rows: any[]) => {
			if (err) {
				console.error(`Error running sql: ${sql}`);
				console.error(err);
				reject(err);
			} else {
				resolve(rows);
			}
		});
	});
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
	return run(sql);
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

export const addFileToSyncTable = (file: ArFSFileMetaData) => {
	const {
		login,
		appName,
		appVersion,
		unixTime,
		contentType,
		entityType,
		driveId,
		parentFolderId,
		fileId,
		filePath,
		fileName,
		fileHash,
		fileSize,
		lastModifiedDate,
		fileVersion,
		isPublic,
		isLocal,
		metaDataTxId,
		dataTxId,
		fileDataSyncStatus,
		fileMetaDataSyncStatus,
		permaWebLink,
		cipher,
		dataCipherIV,
		metaDataCipherIV
	} = file;
	return run(
		'REPLACE INTO Sync (login, appName, appVersion, unixTime, contentType, entityType, driveId, parentFolderId, fileId, filePath, fileName, fileHash, fileSize, lastModifiedDate, fileVersion, isPublic, isLocal, metaDataTxId, dataTxId, fileDataSyncStatus, fileMetaDataSyncStatus, permaWebLink, cipher, dataCipherIV, metaDataCipherIV) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[
			login,
			appName,
			appVersion,
			unixTime,
			contentType,
			entityType,
			driveId,
			parentFolderId,
			fileId,
			filePath,
			fileName,
			fileHash,
			fileSize,
			lastModifiedDate,
			fileVersion,
			isPublic,
			isLocal,
			metaDataTxId,
			dataTxId,
			fileDataSyncStatus,
			fileMetaDataSyncStatus,
			permaWebLink,
			cipher,
			dataCipherIV,
			metaDataCipherIV
		]
	);
};

export const addDriveToDriveTable = (drive: ArFSDriveMetaData) => {
	const {
		login,
		appName,
		appVersion,
		driveName,
		rootFolderId,
		cipher,
		cipherIV,
		unixTime,
		arFS,
		driveId,
		driveSharing,
		drivePrivacy,
		driveAuthMode,
		metaDataTxId,
		metaDataSyncStatus
	} = drive;
	return run(
		'REPLACE INTO Drive (login, appName, appVersion, driveName, rootFolderId, cipher, cipherIV, unixTime, arFS, driveId, driveSharing, drivePrivacy, driveAuthMode, metaDataTxId, metaDataSyncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[
			login,
			appName,
			appVersion,
			driveName,
			rootFolderId,
			cipher,
			cipherIV,
			unixTime,
			arFS,
			driveId,
			driveSharing,
			drivePrivacy,
			driveAuthMode,
			metaDataTxId,
			metaDataSyncStatus
		]
	);
};

export const addToBundleTable = (login: string, bundleTxId: string, bundleSyncStatus: number, uploadTime: number) => {
	return run('REPLACE INTO Bundle (login, bundleTxId, bundleSyncStatus, uploadTime) VALUES (?, ?, ?, ?)', [
		login,
		bundleTxId,
		bundleSyncStatus,
		uploadTime
	]);
};

export const getFolderFromSyncTable = (driveId: string, filePath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND filePath = ? AND entityType = 'folder'`, [driveId, filePath]);
};

export const checkIfExistsInSyncTable = (fileHash: string, fileName: string, fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileHash = ? AND fileName AND fileId = ?`, [fileHash, fileName, fileId]);
};

export const getByFileHashAndParentFolderFromSyncTable = (driveId: string, fileHash: string, folderPath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND filePath LIKE ?`, [
		driveId,
		fileHash,
		folderPath
	]);
};

export const getFolderByHashFromSyncTable = (driveId: string, fileHash: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND entityType = 'folder'`, [driveId, fileHash]);
};

export const getFolderByInodeFromSyncTable = (driveId: string, fileSize: number) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileSize = ? AND entityType = 'folder' AND isLocal = 1`, [
		driveId,
		fileSize
	]);
};

export const getByFileHashAndFileNameFromSyncTable = (driveId: string, fileHash: string, fileName: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND fileName = ?`, [driveId, fileHash, fileName]);
};

export const getByFilePathFromSyncTable = (driveId: string, filePath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND filePath = ? ORDER BY fileVersion DESC`, [driveId, filePath]);
};

export const getByFileNameAndHashAndParentFolderIdFromSyncTable = (
	driveId: string,
	fileName: string,
	fileHash: string,
	parentFolderId: string
) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileName = ? AND fileHash = ? AND parentFolderId = ?`, [
		driveId,
		fileName,
		fileHash,
		parentFolderId
	]);
};

export const getLatestFileVersionFromSyncTable = (fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

// returns all of the local files and folders that have the same parent folder id.
export const getFilesAndFoldersByParentFolderFromSyncTable = (parentFolderId: string) => {
	return all('SELECT * FROM Sync WHERE isLocal = 1 AND parentFolderId = ?', [parentFolderId]);
};

// Returns the n-1 version of a file
export const getPreviousFileVersionFromSyncTable = (fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC LIMIT 1 OFFSET 1`, [fileId]);
};

export const getLatestFolderVersionFromSyncTable = (folderId: string) => {
	return get('SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC', [folderId]);
};

export const getAllFilesByLoginFromSyncTable = (login: string) => {
	return all('SELECT * FROM Sync WHERE login = ? ORDER BY unixTime DESC', [login]);
};

export const getFilesToUploadFromSyncTable = (login: string) => {
	return all('SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 1 OR fileMetaDataSyncStatus = 1)', [
		login
	]);
};

export const getAllUploadedBundlesFromBundleTable = (login: string) => {
	return all('SELECT * FROM Bundle WHERE (login = ?) AND (bundleSyncStatus = 2)', [login]);
};

export const getAllUploadedDataItemsFromSyncTable = (login: string, bundleTxId: string) => {
	return all('SELECT * FROM Sync WHERE login = ? AND bundleTxId = ?', [login, bundleTxId]);
};

export const getAllUploadedFilesFromSyncTable = (login: string) => {
	return all('SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 2 OR fileMetaDataSyncStatus = 2)', [
		login
	]);
};

export const getAllUploadedDrivesFromDriveTable = () => {
	return all('SELECT * FROM Drive WHERE metaDataSyncStatus = 2');
};

export const getFilesToDownload = (login: string) => {
	return all('SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = "file" AND login = ?', [login]);
};

export const getFoldersToCreate = (login: string) => {
	return all('SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = "folder" AND login = ?', [
		login
	]);
};

// Gets a drive's root folder by selecting the folder with a parent ID of 0
export const getRootFolderPathFromSyncTable = (driveId: string) => {
	return get('SELECT filePath from Sync WHERE parentFolderId = "0" and driveId = ?', [driveId]);
};

export const getNewDrivesFromDriveTable = (login: string) => {
	return all('SELECT * FROM Drive WHERE login = ? AND metaDataTxId = "0"', [login]);
};

export const getDriveRootFolderFromSyncTable = (folderId: string) => {
	return get('SELECT * FROM Sync WHERE fileId = ? AND entityType = "folder"', [folderId]);
};

export const getDriveInfoFromSyncTable = (id: string) => {
	return get(`SELECT driveId, fileId, fileName FROM Sync WHERE id = ?`, [id]);
};

export const getFolderNameFromSyncTable = (fileId: string) => {
	return get(`SELECT fileName FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

export const getFolderEntityFromSyncTable = (fileId: string) => {
	return get(`SELECT entityType FROM Sync WHERE fileId = ?`, [fileId]);
};

export const getFolderParentIdFromSyncTable = (fileId: string) => {
	return get(`SELECT parentFolderId FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

export function getFileUploadTimeFromSyncTable(id: number): Promise<number> {
	return get(`SELECT uploadTime FROM Sync WHERE id = ?`, [id]);
}

export function getBundleUploadTimeFromBundleTable(id: number): Promise<number> {
	return get(`SELECT uploadTime FROM Bundle WHERE id = ?`, [id]);
}

export const updateFileMetaDataSyncStatus = (file: {
	fileMetaDataSyncStatus: number;
	metaDataTxId: string;
	metaDataCipherIV: string;
	cipher: string;
	id: number;
}) => {
	const { fileMetaDataSyncStatus, metaDataTxId, metaDataCipherIV, cipher, id } = file;
	return get(
		`UPDATE Sync SET fileMetaDataSyncStatus = ?, metaDataTxId = ?, metaDataCipherIV = ?, cipher = ? WHERE id = ?`,
		[fileMetaDataSyncStatus, metaDataTxId, metaDataCipherIV, cipher, id]
	);
};

export const updateFileDataSyncStatus = (file: {
	fileDataSyncStatus: number;
	dataTxId: string;
	dataCipherIV: string;
	cipher: string;
	id: number;
}) => {
	const { fileDataSyncStatus, dataTxId, dataCipherIV, cipher, id } = file;
	return get(`UPDATE Sync SET fileDataSyncStatus = ?, dataTxId = ?, dataCipherIV = ?, cipher = ? WHERE id = ?`, [
		fileDataSyncStatus,
		dataTxId,
		dataCipherIV,
		cipher,
		id
	]);
};

export const updateFileInSyncTable = (file: {
	driveId: any;
	parentFolderId: any;
	fileId: any;
	fileVersion: any;
	metaDataTxId: any;
	dataTxId: any;
	fileDataSyncStatus: number;
	fileMetaDataSyncStatus: number;
	permaWebLink: any;
	id: any;
}) => {
	const {
		driveId,
		parentFolderId,
		fileId,
		fileVersion,
		metaDataTxId,
		dataTxId,
		fileDataSyncStatus,
		fileMetaDataSyncStatus,
		permaWebLink,
		id
	} = file;
	return run(
		'UPDATE Sync SET driveId = ?, parentFolderId = ?, fileId = ?, fileVersion = ?, metaDataTxId = ?, dataTxId = ?, fileDataSyncStatus = ?, fileMetaDataSyncStatus = ?, permaWebLink = ? WHERE id = ?',
		[
			driveId,
			parentFolderId,
			fileId,
			fileVersion,
			metaDataTxId,
			dataTxId,
			fileDataSyncStatus,
			fileMetaDataSyncStatus,
			permaWebLink,
			id
		]
	);
};

// Modifies the file path of a given file/folder
export const updateFilePathInSyncTable = (filePath: string, id: number) => {
	return get(`UPDATE Sync SET filePath = ? WHERE id = ?`, [filePath, id]);
};

export const updateFolderHashInSyncTable = (folderHash: string, id: number) => {
	return get(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [folderHash, id]);
};

export const updateFileSizeInSyncTable = (fileSize: number, id: number) => {
	return get(`UPDATE Sync SET fileSize = ? WHERE id = ?`, [fileSize, id]);
};

export const updateFileHashInSyncTable = (fileHash: string, id: number) => {
	return get(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [fileHash, id]);
};

export const updateFileDownloadStatus = (isLocal: string, id: number) => {
	return get(`UPDATE Sync SET isLocal = ? WHERE id = ?`, [isLocal, id]);
};

export const updateFileBundleTxId = (bundleTxId: string, id: number) => {
	return get(`UPDATE Sync SET bundleTxId = ? WHERE id = ?`, [bundleTxId, id]);
};

export const updateFileUploadTimeInSyncTable = (id: number, uploadTime: number) => {
	return get(`UPDATE Sync SET uploadTime = ? WHERE id = ?`, [uploadTime, id]);
};

export const updateDriveInDriveTable = (metaDataTxId: string, cipher: string, cipherIV: string, driveId: string) => {
	return get(
		`UPDATE Drive SET metaDataTxId = ?, cipher = ?, cipherIV = ?, metaDataSyncStatus = 2 WHERE driveId = ?`,
		[metaDataTxId, cipher, cipherIV, driveId]
	);
};

// Updates the sync folder (where all the users ardrive data is stored) path for a given user in the profile table
export const updateUserSyncFolderPathInProfileTable = (login: string, syncFolderPath: string) => {
	return get(`UPDATE Profile SET syncFolderPath = ? WHERE login = ?`, [syncFolderPath, login]);
};

export const setFileMetaDataSyncStatus = (fileMetaDataSyncStatus: number, id: number) => {
	return get(`UPDATE Sync SET fileMetaDataSyncStatus = ? WHERE id = ?`, [fileMetaDataSyncStatus, id]);
};

export const setFileDataSyncStatus = (fileDataSyncStatus: number, id: number) => {
	return get(`UPDATE Sync SET fileDataSyncStatus = ? WHERE id = ?`, [fileDataSyncStatus, id]);
};

// Sets a files sync statuses to 1, requiring a reupload
export const setFileDataItemSyncStatus = (id: number) => {
	return get(`UPDATE Sync SET fileDataSyncStatus = 1, fileMetaDataSyncStatus = 1 WHERE id = ?`, [id]);
};

// Sets the data bundle tx id for a file or folder and marks it as synchronized
export const completeFileDataItemFromSyncTable = (permaWebLink: string, id: number) => {
	return get('UPDATE Sync Set fileDataSyncStatus = 3, fileMetaDataSyncStatus = 3, permaWebLink = ? WHERE id = ?', [
		permaWebLink,
		id
	]);
};

export const completeBundleFromBundleTable = (id: number) => {
	return get('UPDATE Bundle Set bundleSyncStatus = 3 WHERE id = ?', [id]);
};

export const completeFileDataFromSyncTable = (file: { fileDataSyncStatus: number; permaWebLink: any; id: any }) => {
	const { fileDataSyncStatus, permaWebLink, id } = file;
	return get(`UPDATE Sync SET fileDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
		fileDataSyncStatus,
		permaWebLink,
		id
	]);
};

export const completeFileMetaDataFromSyncTable = (file: {
	fileMetaDataSyncStatus: number;
	permaWebLink: any;
	id: any;
}) => {
	const { fileMetaDataSyncStatus, permaWebLink, id } = file;
	return get(`UPDATE Sync SET fileMetaDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
		fileMetaDataSyncStatus,
		permaWebLink,
		id
	]);
};

// Set a drive record to completely synchronized
export const completeDriveMetaDataFromDriveTable = (metaDataSyncStatus: number, driveId: string) => {
	return get(`UPDATE Drive SET metaDataSyncStatus = ? WHERE driveId = ?`, [metaDataSyncStatus, driveId]);
};

// Same as remove from sync table.  which to remove?
export const deleteFromSyncTable = (id: number) => {
	return get(`DELETE FROM Sync WHERE id = ?`, [id]);
};

// Same as delete from sync table.  which to remove?
export const removeFromSyncTable = (id: number) => {
	return get(`DELETE FROM Sync WHERE id = ?`, [id]);
};

// Deletes a file from the Sync table based on driveID
export const removeByDriveIdFromSyncTable = (id: string) => {
	return get(`DELETE FROM Sync WHERE driveId = ?`, [id]);
};

// Deletes a profile based on login
export const removeFromProfileTable = (login: string) => {
	return get(`DELETE FROM Profile WHERE login = ?`, [login]);
};

// Deletes a drive based on the drive ID
export const removeFromDriveTable = (driveId: string) => {
	return get(`DELETE FROM Drive WHERE driveId = ?`, [driveId]);
};

export const getByMetaDataTxFromSyncTable = (metaDataTxId: string) => {
	return get(`SELECT * FROM Sync WHERE metaDataTxId = ?`, [metaDataTxId]);
};

export const getMyFileDownloadConflicts = (login: string) => {
	return all('SELECT * FROM Sync WHERE isLocal = 2 AND login = ?', [login]);
};

export const createArDriveProfile = (user: ArDriveUser) => {
	return run(
		'REPLACE INTO Profile (login, dataProtectionKey, walletPrivateKey, walletPublicKey, syncFolderPath, autoSyncApproval) VALUES (?, ?, ?, ?, ?, ?)',
		[
			user.login,
			user.dataProtectionKey,
			user.walletPrivateKey,
			user.walletPublicKey,
			user.syncFolderPath,
			user.autoSyncApproval
		]
	);
};

export const setProfileAutoSyncApproval = (autoSyncApproval: number, login: string) => {
	return get(`UPDATE Profile SET autoSyncApproval = ? WHERE login = ?`, [autoSyncApproval, login]);
};

export const setProfileWalletBalance = (walletBalance: number, login: string) => {
	return get(`UPDATE Profile SET walletBalance = ? WHERE login = ?`, [walletBalance, login]);
};

// Sets a Drive to be synchronized
export const setDriveToSync = (driveId: string) => {
	return get(`UPDATE Drive SET isLocal = 1 WHERE driveId = ?`, [driveId]);
};

// Sets the last block height for a given drive
export const setDriveLastBlockHeight = (lastBlockHeight: number, driveId: string) => {
	return get(`UPDATE Drive SET lastBlockHeight = ? WHERE driveId = ?`, [lastBlockHeight, driveId]);
};

export const getProfileWalletBalance = (login: string) => {
	return get(`SELECT walletBalance FROM Profile WHERE login = ?`, [login]);
};

// Sets the last block height for an entire profile
export const setProfileLastBlockHeight = (lastBlockHeight: number, login: string) => {
	return get(`UPDATE Profile SET lastBlockHeight = ? WHERE login = ?`, [lastBlockHeight, login]);
};

export const getProfileLastBlockHeight = (login: string) => {
	return get(`SELECT lastBlockHeight FROM Profile WHERE login = ?`, [login]);
};

export const getDriveLastBlockHeight = (driveId: string) => {
	return get(`SELECT lastBlockHeight FROM Drive WHERE driveId = ?`, [driveId]);
};

export const getUserFromProfileById = (id: string) => {
	return get(`SELECT * FROM Profile WHERE id = ?`, [id]);
};

export const getUserFromProfile = (login: string) => {
	return get(`SELECT * FROM Profile WHERE login = ?`, [login]);
};

export const getAllMissingPathsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE filePath = '' ORDER BY id DESC`);
};

export const getAllMissingParentFolderIdsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE parentFolderId = ''`);
};

export const getAllLocalFoldersFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'folder' AND isLocal = 1`);
};

export const getAllLocalFilesFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'file' AND isLocal = 1`);
};

export const getAllLocalFilesAndFoldersFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'file' AND entityType = 'folder' AND isLocal = 1`);
};

export const getAllUnhashedLocalFilesFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE fileHash = '' AND entityType = 'file' AND isLocal = 1`);
};

export const setParentFolderId = (parentFolderId: string, id: number) => {
	return get(`UPDATE Sync SET parentFolderId = ? WHERE id = ?`, [parentFolderId, id]);
};

export const setPermaWebFileToCloudOnly = (id: number) => {
	return get(`UPDATE Sync SET cloudOnly = 1 WHERE id = ?`, [id]);
};

export const setPermaWebFileToOverWrite = (id: string) => {
	return get(`UPDATE Sync SET isLocal = 2 WHERE id = ?`, [id]);
};

export const setFileUploaderObject = (uploader: string, id: number) => {
	return get(`UPDATE Sync SET uploader = ? WHERE id = ?`, [uploader, id]);
};

export const setBundleUploaderObject = (uploader: string, bundleTxId: string) => {
	return get(`UPDATE Bundle SET uploader = ? WHERE bundleTxId = ?`, [uploader, bundleTxId]);
};

export const setFilePath = (filePath: string, id: number) => {
	return get(`UPDATE Sync SET filePath = ? WHERE id = ?`, [filePath, id]);
};

// Sets a file isLocal to 0, which will prompt a download
export const setFileToDownload = (metaDataTxId: string) => {
	return get(`UPDATE Sync SET isLocal = 0 WHERE metaDataTxId = ?`, [metaDataTxId]);
};

export const updateArDriveRootDirectoryTx = (
	arDriveMetaDataTxId: string,
	permaWebLink: string,
	fileId: string,
	fileName: string,
	filePath: string
) => {
	return get(
		`UPDATE Sync SET metaDataTxId = ?, permaWebLink = ?, fileId = ?, fileMetaDataSyncStatus = 3 WHERE fileName = ? AND filePath = ?`,
		[arDriveMetaDataTxId, permaWebLink, fileId, fileName, filePath]
	);
};

export const getSyncFolderPathFromProfile = (login: string) => {
	return get(`SELECT syncFolderPath FROM Profile WHERE login = ?`, [login]);
};

// Gets all files that are not Cloud Only so they can be validated they still exist locally
export const getAllLatestFileAndFolderVersionsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 1`);
};

export const getAllFromProfile = (): Promise<any[]> => {
	return all('SELECT * FROM Profile');
};

export const getAllDrivesFromDriveTable = () => {
	return all(`SELECT * FROM Drive`);
};

export const getDriveFromDriveTable = (driveId: string) => {
	return get(`SELECT * FROM Drive WHERE driveId = ?`, [driveId]);
};

export const getAllDrivesByLoginFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND isLocal = 1`, [login]);
};

export const getAllUnSyncedPersonalDrivesByLoginFromDriveTable = (login: string, drivePrivacy: string) => {
	return all(
		`SELECT * FROM Drive WHERE login = ? AND drivePrivacy = ? AND driveSharing = 'personal' AND isLocal = 0 AND driveName != 'Invalid Drive Password'`,
		[login, drivePrivacy]
	);
};

export const getAllPersonalDrivesByLoginFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND driveSharing = 'personal' AND isLocal = 1`, [login]);
};

export const getAllDrivesByPrivacyFromDriveTable = (login: string, driveSharing: string, drivePrivacy: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND driveSharing = ? AND drivePrivacy = ? AND isLocal = 1`, [
		login,
		driveSharing,
		drivePrivacy
	]);
};

const createOrOpenDb = (dbFilePath: string): Promise<sqlite3.Database> => {
	return new Promise((resolve, reject) => {
		const database: sqlite3.Database = new sql3.Database(dbFilePath, (err: any) => {
			if (err) {
				console.error('Could not connect to database: '.concat(err.message));
				return reject(err);
			}
			return resolve(database);
		});
	});
};

const createTablesInDB = async () => {
	await createProfileTable();
	await createSyncTable();
	await createDriveTable();
	await createBundleTable();
};

// Main entrypoint for database. MUST call this before anything else can happen
export async function setupDatabase(dbFilePath: string): Promise<Error | null> {
	try {
		db = await createOrOpenDb(dbFilePath);
		await createTablesInDB();
	} catch (err) {
		return err;
	}
	return null;
}
