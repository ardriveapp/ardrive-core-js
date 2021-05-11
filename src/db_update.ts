import { run } from './db';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from './types/base_Types';

////////////////////////
// NEW ITEM FUNCTIONS //
////////////////////////
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
		metaDataSyncStatus,
		isLocal
	} = drive;
	return run(
		'REPLACE INTO Drive (login, appName, appVersion, driveName, rootFolderId, cipher, cipherIV, unixTime, arFS, driveId, driveSharing, drivePrivacy, driveAuthMode, metaDataTxId, metaDataSyncStatus, isLocal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
			metaDataSyncStatus,
			isLocal
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

export const createArDriveProfile = (user: ArDriveUser) => {
	return run(
		`REPLACE INTO Profile (login, dataProtectionKey, walletPrivateKey, walletPublicKey, syncFolderPath, autoSyncApproval) VALUES (?, ?, ?, ?, ?, ?)`,
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

////////////////////////
// UPDATING FUNCTIONS //
////////////////////////
export const updateFileMetaDataSyncStatus = (
	fileMetaDataSyncStatus: number,
	metaDataTxId: string,
	metaDataCipherIV: string,
	cipher: string,
	id: number
) => {
	return run(
		`UPDATE Sync SET fileMetaDataSyncStatus = ?, metaDataTxId = ?, metaDataCipherIV = ?, cipher = ? WHERE id = ?`,
		[fileMetaDataSyncStatus, metaDataTxId, metaDataCipherIV, cipher, id]
	);
};

export const updateFileDataSyncStatus = (
	fileDataSyncStatus: number,
	dataTxId: string,
	dataCipherIV: string,
	cipher: string,
	id: number
) => {
	return run(`UPDATE Sync SET fileDataSyncStatus = ?, dataTxId = ?, dataCipherIV = ?, cipher = ? WHERE id = ?`, [
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
		`UPDATE Sync SET driveId = ?, parentFolderId = ?, fileId = ?, fileVersion = ?, metaDataTxId = ?, dataTxId = ?, fileDataSyncStatus = ?, fileMetaDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`,
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
	return run(`UPDATE Sync SET filePath = ? WHERE id = ?`, [filePath, id]);
};

export const updateFolderHashInSyncTable = (folderHash: string, id: number) => {
	return run(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [folderHash, id]);
};

export const updateFileSizeInSyncTable = (fileSize: number, id: number) => {
	return run(`UPDATE Sync SET fileSize = ? WHERE id = ?`, [fileSize, id]);
};

export const updateFileHashInSyncTable = (fileHash: string, id: number) => {
	return run(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [fileHash, id]);
};

export const updateFileDownloadStatus = (isLocal: string, id: number) => {
	return run(`UPDATE Sync SET isLocal = ? WHERE id = ?`, [isLocal, id]);
};

export const updateFileBundleTxId = (bundleTxId: string, id: number) => {
	return run(`UPDATE Sync SET bundleTxId = ? WHERE id = ?`, [bundleTxId, id]);
};

export const updateFileUploadTimeInSyncTable = (id: number, uploadTime: number) => {
	return run(`UPDATE Sync SET uploadTime = ? WHERE id = ?`, [uploadTime, id]);
};

// Updates the sync folder (where all the users ardrive data is stored) path for a given user in the profile table
export const updateUserSyncFolderPathInProfileTable = (login: string, syncFolderPath: string) => {
	return run(`UPDATE Profile SET syncFolderPath = ? WHERE login = ?`, [syncFolderPath, login]);
};

export const setFileMetaDataSyncStatus = (fileMetaDataSyncStatus: number, id: number) => {
	return run(`UPDATE Sync SET fileMetaDataSyncStatus = ? WHERE id = ?`, [fileMetaDataSyncStatus, id]);
};

export const setFileDataSyncStatus = (fileDataSyncStatus: number, id: number) => {
	return run(`UPDATE Sync SET fileDataSyncStatus = ? WHERE id = ?`, [fileDataSyncStatus, id]);
};

// Sets a files sync statuses to 1, requiring a reupload
export const setFileDataItemSyncStatus = (id: number) => {
	return run(`UPDATE Sync SET fileDataSyncStatus = 1, fileMetaDataSyncStatus = 1 WHERE id = ?`, [id]);
};

// Sets the data bundle tx id for a file or folder and marks it as synchronized
export const completeFileDataItemFromSyncTable = (permaWebLink: string, id: number) => {
	return run(`UPDATE Sync Set fileDataSyncStatus = 3, fileMetaDataSyncStatus = 3, permaWebLink = ? WHERE id = ?`, [
		permaWebLink,
		id
	]);
};

export const completeBundleFromBundleTable = (id: number) => {
	return run(`UPDATE Bundle Set bundleSyncStatus = 3 WHERE id = ?`, [id]);
};

export const completeFileDataFromSyncTable = (file: { fileDataSyncStatus: number; permaWebLink: any; id: any }) => {
	const { fileDataSyncStatus, permaWebLink, id } = file;
	return run(`UPDATE Sync SET fileDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
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
	return run(`UPDATE Sync SET fileMetaDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
		fileMetaDataSyncStatus,
		permaWebLink,
		id
	]);
};

// Set a drive record to completely synchronized
export const completeDriveMetaDataFromDriveTable = (metaDataSyncStatus: number, driveId: string) => {
	return run(`UPDATE Drive SET metaDataSyncStatus = ? WHERE driveId = ?`, [metaDataSyncStatus, driveId]);
};

export const updateDriveInDriveTable = (
	metaDataSyncStatus: number,
	metaDataTxId: string,
	cipher: string,
	cipherIV: string,
	driveId: string
) => {
	return run(
		`UPDATE Drive SET metaDataSyncStatus = ?, metaDataTxId = ?, cipher = ?, cipherIV = ? WHERE driveId = ?`,
		[metaDataSyncStatus, metaDataTxId, cipher, cipherIV, driveId]
	);
};

export const setProfileAutoSyncApproval = (autoSyncApproval: number, login: string) => {
	return run(`UPDATE Profile SET autoSyncApproval = ? WHERE login = ?`, [autoSyncApproval, login]);
};

export const setProfileWalletBalance = (walletBalance: number, login: string) => {
	return run(`UPDATE Profile SET walletBalance = ? WHERE login = ?`, [walletBalance, login]);
};

// Sets a Drive to be synchronized
export const setDriveToSync = (driveId: string) => {
	return run(`UPDATE Drive SET isLocal = 1 WHERE driveId = ?`, [driveId]);
};

// Sets the last block height for a given drive
export const setDriveLastBlockHeight = (lastBlockHeight: number, driveId: string) => {
	return run(`UPDATE Drive SET lastBlockHeight = ? WHERE driveId = ?`, [lastBlockHeight, driveId]);
};

export const setParentFolderId = (parentFolderId: string, id: number) => {
	return run(`UPDATE Sync SET parentFolderId = ? WHERE id = ?`, [parentFolderId, id]);
};

export const setPermaWebFileToCloudOnly = (id: number) => {
	return run(`UPDATE Sync SET cloudOnly = 1 WHERE id = ?`, [id]);
};

export const setPermaWebFileToOverWrite = (id: string) => {
	return run(`UPDATE Sync SET isLocal = 2 WHERE id = ?`, [id]);
};

export const setFileUploaderObject = (uploader: string, id: number) => {
	return run(`UPDATE Sync SET uploader = ? WHERE id = ?`, [uploader, id]);
};

export const setBundleUploaderObject = (uploader: string, bundleTxId: string) => {
	return run(`UPDATE Bundle SET uploader = ? WHERE bundleTxId = ?`, [uploader, bundleTxId]);
};

export const setFilePath = (filePath: string, id: number) => {
	return run(`UPDATE Sync SET filePath = ? WHERE id = ?`, [filePath, id]);
};

// Sets a file isLocal to 0, which will prompt a download
export const setFileToDownload = (metaDataTxId: string) => {
	return run(`UPDATE Sync SET isLocal = 0 WHERE metaDataTxId = ?`, [metaDataTxId]);
};

export const updateArDriveRootDirectoryTx = (
	arDriveMetaDataTxId: string,
	permaWebLink: string,
	fileId: string,
	fileName: string,
	filePath: string
) => {
	return run(
		`UPDATE Sync SET metaDataTxId = ?, permaWebLink = ?, fileId = ?, fileMetaDataSyncStatus = 3 WHERE fileName = ? AND filePath = ?`,
		[arDriveMetaDataTxId, permaWebLink, fileId, fileName, filePath]
	);
};

// Sets the last block height for an entire profile
export const setProfileLastBlockHeight = (lastBlockHeight: number, login: string) => {
	return run(`UPDATE Profile SET lastBlockHeight = ? WHERE login = ?`, [lastBlockHeight, login]);
};
