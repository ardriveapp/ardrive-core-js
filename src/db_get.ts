import { get, all } from './db';

///////////////////////////////
// GET SINGLE ITEM FUNCTIONS //
///////////////////////////////
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

// Returns the n-1 version of a file
export const getPreviousFileVersionFromSyncTable = (fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC LIMIT 1 OFFSET 1`, [fileId]);
};

export const getLatestFolderVersionFromSyncTable = (folderId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [folderId]);
};

// Gets a drive's root folder by selecting the folder with a parent ID of 0
export const getRootFolderPathFromSyncTable = (driveId: string) => {
	return get(`SELECT filePath from Sync WHERE parentFolderId = '0' and driveId = ?`, [driveId]);
};

export const getDriveRootFolderFromSyncTable = (folderId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? AND entityType = 'folder'`, [folderId]);
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

export const getFileUploadTimeFromSyncTable = (id: number): Promise<number> => {
	return get(`SELECT uploadTime FROM Sync WHERE id = ?`, [id]);
};

export const getBundleUploadTimeFromBundleTable = (id: number): Promise<number> => {
	return get(`SELECT uploadTime FROM Bundle WHERE id = ?`, [id]);
};

export const getByMetaDataTxFromSyncTable = (metaDataTxId: string) => {
	return get(`SELECT * FROM Sync WHERE metaDataTxId = ?`, [metaDataTxId]);
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

export const getProfileWalletBalance = (login: string) => {
	return get(`SELECT walletBalance FROM Profile WHERE login = ?`, [login]);
};

export const getSyncFolderPathFromProfile = (login: string) => {
	return get(`SELECT syncFolderPath FROM Profile WHERE login = ?`, [login]);
};

export const getDriveFromDriveTable = (driveId: string) => {
	return get(`SELECT * FROM Drive WHERE driveId = ?`, [driveId]);
};

///////////////////////////////
// GET ALL ITEMS FUNCTIONS   //
///////////////////////////////
export const getAllUploadedDrivesFromDriveTable = () => {
	return all(`SELECT * FROM Drive WHERE metaDataSyncStatus = 2`);
};

export const getFilesToDownload = (login: string) => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = 'file' AND login = ?`, [login]);
};

export const getFoldersToCreate = (login: string) => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = 'folder' AND login = ?`, [
		login
	]);
};

// returns all of the local files and folders that have the same parent folder id.
export const getFilesAndFoldersByParentFolderFromSyncTable = (parentFolderId: string) => {
	return all(`SELECT * FROM Sync WHERE isLocal = 1 AND parentFolderId = ?`, [parentFolderId]);
};

export const getNewDrivesFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND metaDataTxId = '0'`, [login]);
};

export const getAllFilesByLoginFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE login = ? ORDER BY unixTime DESC`, [login]);
};

export const getFilesToUploadFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 1 OR fileMetaDataSyncStatus = 1)`, [
		login
	]);
};

export const getAllUploadedBundlesFromBundleTable = (login: string) => {
	return all(`SELECT * FROM Bundle WHERE (login = ?) AND (bundleSyncStatus = 2)`, [login]);
};

export const getAllUploadedDataItemsFromSyncTable = (login: string, bundleTxId: string) => {
	return all(`SELECT * FROM Sync WHERE login = ? AND bundleTxId = ?`, [login, bundleTxId]);
};

export const getAllUploadedFilesFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 2 OR fileMetaDataSyncStatus = 2)`, [
		login
	]);
};

export const getMyFileDownloadConflicts = (login: string) => {
	return all(`SELECT * FROM Sync WHERE isLocal = 2 AND login = ?`, [login]);
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

// Gets all files that are not Cloud Only so they can be validated they still exist locally
export const getAllLatestFileAndFolderVersionsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 1`);
};

export const getAllFromProfile = () => {
	return all(`SELECT * FROM Profile`);
};

export const getAllDrivesFromDriveTable = () => {
	return all(`SELECT * FROM Drive`);
};

export const getAllDrivesByLoginFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND isLocal = 1`, [login]);
};

export const getAllUnSyncedPersonalDrivesByLoginFromDriveTable = (login: string, drivePrivacy: string) => {
	return all(
		`SELECT * FROM Drive WHERE login = ? AND drivePrivacy = ? AND driveSharing = 'personal' AND isLocal != 1 AND driveName != 'Invalid Drive Password'`,
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
