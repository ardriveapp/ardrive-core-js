import * as sqlite3 from 'sqlite3';
import { ArDriveUser, ArFSDriveMetadata, ArFSFileMetaData } from './types';

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
      resolve();
    });
  });
};

const get = (sql: any, params: any[] = []): Promise<any> => {
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
};

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

const createProfileTable = async () => {
  const sql = `CREATE TABLE IF NOT EXISTS Profile (
        id integer NOT NULL PRIMARY KEY,
        login text NOT NULL UNIQUE,
        dataProtectionKey text,
        walletPrivateKey text,
        walletPublicKey text,
        syncFolderPath text
     );`;
  return run(sql);
};

const createSyncTable = () => {
  const sql = `CREATE TABLE IF NOT EXISTS Sync (
        id integer NOT NULL PRIMARY KEY,
        metaDataTxId text NOT NULL,
        dataTxId text,
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
        fileSize integer,
        lastModifiedDate integer,
        fileVersion integer DEFAULT 0,
        cipher text,
        cipherIV text,
        permaWebLink text,
        fileDataSyncStatus text,
        fileMetaDataSyncStatus text,
        ignore INTEGER DEFAULT 0,
        isPublic text DEFAULT 0,
        isLocal text,
        uploader text
     );`;
  return run(sql);
};

const createDriveTable = async () => {
  const sql = `CREATE TABLE IF NOT EXISTS Drive (
      id integer NOT NULL PRIMARY KEY,
      appName text,
      appVersion text,
      driveName text,
      rootFolderId text,
      cipher text,
      cipherIV text,
      unixTime integer,
      arFS text,
      driveId text UNIQUE,
      drivePrivacy text,
      driveAuthMode text,
      metaDataTxId text,
      metaDataSyncStatus integer,
      permaWebLink text
    );`;
  return run(sql);
};

export const addFileToSyncTable = (file: ArFSFileMetaData) => {
  const {
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
    cipherIV,
  } = file;
  return run(
    'REPLACE INTO Sync (appName, appVersion, unixTime, contentType, entityType, driveId, parentFolderId, fileId, filePath, fileName, fileHash, fileSize, lastModifiedDate, fileVersion, isPublic, isLocal, metaDataTxId, dataTxId, fileDataSyncStatus, fileMetaDataSyncStatus, permaWebLink, cipher, cipherIV) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
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
      cipherIV,
    ],
  );
};

export const addDriveToDriveTable = (drive: ArFSDriveMetadata) => {
  const {
    appName,
    appVersion,
    driveName,
    rootFolderId,
    cipher,
    cipherIV,
    unixTime,
    arFS,
    driveId,
    drivePrivacy,
    driveAuthMode,
    metaDataTxId,
    metaDataSyncStatus,
    permaWebLink,
  } = drive;
  return run(
    'REPLACE INTO Drive (appName, appVersion, driveName, rootFolderId, cipher, cipherIV, unixTime, arFS, driveId, drivePrivacy, driveAuthMode, metaDataTxId, metaDataSyncStatus, permaWebLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      appName,
      appVersion,
      driveName,
      rootFolderId,
      cipher,
      cipherIV,
      unixTime,
      arFS,
      driveId,
      drivePrivacy,
      driveAuthMode,
      metaDataTxId,
      metaDataSyncStatus,
      permaWebLink,
    ]
  )
}

export const getFolderFromSyncTable = (filePath: string) => {
  return get(`SELECT * FROM Sync WHERE filePath = ? AND entityType = 'folder'`, [filePath]);
};

export const checkIfExistsInSyncTable = (fileHash: string, fileName: string, fileId: string) => {
  return get(`SELECT * FROM Sync WHERE fileHash = ? AND fileName AND fileId = ?`, [fileHash, fileName, fileId]);
};

export const getByFileHashAndParentFolderFromSyncTable = (fileHash: string, folderPath: string) => {
  return get(`SELECT * FROM Sync WHERE fileHash = ? AND filePath LIKE ?`, [
    fileHash,
    folderPath,
  ]);
};

export const getFolderByHashFromSyncTable = (fileHash: string) => {
  return get(`SELECT * FROM Sync WHERE fileHash = ? AND entityType = 'folder'`, [
    fileHash,
  ]);
};

export const getByFileHashAndFileNameFromSyncTable = (fileHash: string, fileName: string) => {
  return get(`SELECT * FROM Sync WHERE fileHash = ? AND fileName = ?`, [
    fileHash,
    fileName,
  ]);
};

export const getByFilePathFromSyncTable = (filePath: string) => {
  return get(`SELECT * FROM Sync WHERE filePath = ? ORDER BY fileVersion DESC`, [filePath]);
};

export const getByFileNameAndHashAndParentFolderIdFromSyncTable = (fileName: string, fileHash: string, parentFolderId: string) => {
  return get(`SELECT * FROM Sync WHERE fileName = ? AND fileHash = ? AND parentFolderId = ?`, [fileName, fileHash, parentFolderId]);
};

export const getLatestFileVersionFromSyncTable = (fileId: string) => {
  return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

export const getLatestFolderVersionFromSyncTable = (folderId: string) => {
  return get('SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC', [folderId])
}

export const getFilesToUploadFromSyncTable = () => {
  return all('SELECT * FROM Sync WHERE fileDataSyncStatus = 1 OR fileMetaDataSyncStatus = 1 ');
};

export const getAllUploadedFilesFromSyncTable = () => {
  return all('SELECT * FROM Sync WHERE fileDataSyncStatus = 2 OR fileMetaDataSyncStatus = 2');
};

export const getAllUploadedDrivesFromDriveTable = () => {
  return all('SELECT * FROM Drive WHERE metaDataSyncStatus = 2');
};

export const getFilesToDownload = () => {
  return all('SELECT * FROM Sync WHERE ignore = 0 AND isLocal = 0 AND entityType = "file"');
};

export const getFoldersToCreate = () => {
  return all('SELECT * FROM Sync WHERE ignore = 0 AND isLocal = 0 AND entityType = "folder"');
};

export const getNewDrivesFromDriveTable = () => {
  return all('SELECT * FROM Drive WHERE metaDataTxId = "0"');
}

export const getDriveRootFolderFromSyncTable = (folderId: string) => {
  return get('SELECT * FROM Sync WHERE fileId = ? AND entityType = "folder"', [folderId]);
}

export const getDriveInfoFromSyncTable = (id: string) => {
  return get(`SELECT driveId, fileId, fileName FROM Sync WHERE id = ?`, [id]);
};

export const getFolderNameFromSyncTable = (fileId: string) => {
  return get(`SELECT fileName FROM Sync WHERE fileId = ?`, [fileId]);
};

export const getFolderEntityFromSyncTable = (fileId: string) => {
  return get(`SELECT entityType FROM Sync WHERE fileId = ?`, [fileId]);
};

export const getFolderParentIdFromSyncTable = (fileId: string) => {
  return get(`SELECT parentFolderId FROM Sync WHERE fileId = ?`, [fileId]);
};

export const updateFileMetaDataSyncStatus = (file: { fileMetaDataSyncStatus: any; metaDataTxId: any; id: any }) => {
  const { fileMetaDataSyncStatus, metaDataTxId, id } = file;
  return get(`UPDATE Sync SET fileMetaDataSyncStatus = ?, metaDataTxId = ? WHERE id = ?`, [
    fileMetaDataSyncStatus,
    metaDataTxId,
    id,
  ]);
};

export const updateFileDataSyncStatus = (file: { fileDataSyncStatus: any; dataTxId: any; id: any }) => {
  const { fileDataSyncStatus, dataTxId, id } = file;
  return get(`UPDATE Sync SET fileDataSyncStatus = ?, dataTxId = ? WHERE id = ?`, [fileDataSyncStatus, dataTxId, id]);
};

export const updateFileInSyncTable = (file: {
  driveId: any;
  parentFolderId: any;
  fileId: any;
  fileVersion: any;
  metaDataTxId: any;
  dataTxId: any;
  fileDataSyncStatus: any;
  fileMetaDataSyncStatus: any;
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
    id,
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
      id,
    ],
  );
};

export const updateDriveInDriveTable = (metaDataTxId: string, driveId: string) => {
  return get(`UPDATE Drive SET metaDataTxId = ?, metaDataSyncStatus = 2 WHERE driveId = ?`, [metaDataTxId, driveId]);
};

export const completeFileDataFromSyncTable = (file: { fileDataSyncStatus: any; permaWebLink: any; id: any }) => {
  const { fileDataSyncStatus, permaWebLink, id } = file;
  return get(`UPDATE Sync SET fileDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
    fileDataSyncStatus,
    permaWebLink,
    id,
  ]);
};

export const completeFileMetaDataFromSyncTable = (file: {
  fileMetaDataSyncStatus: any;
  permaWebLink: any;
  id: any;
}) => {
  const { fileMetaDataSyncStatus, permaWebLink, id } = file;
  return get(`UPDATE Sync SET fileMetaDataSyncStatus = ?, permaWebLink = ? WHERE id = ?`, [
    fileMetaDataSyncStatus,
    permaWebLink,
    id,
  ]);
};

// Set a drive record to completely synchronized
export const completeDriveMetaDataFromDriveTable = (metaDataSyncStatus: number, permaWebLink: string, driveId: string) => {
  return get(`UPDATE Drive SET metaDataSyncStatus = ?, permaWebLink = ? WHERE driveId = ?`, [
    metaDataSyncStatus,
    permaWebLink,
    driveId,
  ]);
}

export const removeFromSyncTable = (id: string) => {
  return get(`DELETE FROM Sync WHERE id = ?`, [id]);
};

export const getByMetaDataTxFromSyncTable = (metaDataTxId: string) => {
  return get(`SELECT * FROM Sync WHERE metaDataTxId = ?`, [metaDataTxId]);
};

export const getMyFileDownloadConflicts = () => {
  return all('SELECT * FROM Sync WHERE isLocal = 2 ');
};

export const createArDriveProfile = (user: ArDriveUser) => {
  return run(
    'REPLACE INTO Profile (login, dataProtectionKey, walletPrivateKey, walletPublicKey, syncFolderPath) VALUES (?, ?, ?, ?, ?)',
    [user.login, user.dataProtectionKey, user.walletPrivateKey, user.walletPublicKey, user.syncFolderPath],
  );
};

export const getUserFromProfileById = (id: string) => {
  return get(`SELECT * FROM Profile WHERE id = ?`, [id]);
};

export const getUserFromProfile = (login: string) => {
  return get(`SELECT * FROM Profile WHERE login = ?`, [login]);
};

export const getAllMissingPathsFromSyncTable = () => {
  return all(`SELECT * FROM Sync WHERE filePath = ''`);
}

export const getAllMissingParentFolderIdsFromSyncTable = () => {
  return all(`SELECT * FROM Sync WHERE parentFolderId = ''`);
}

export const getAllLocalFoldersFromSyncTable = () => {
  return all(`SELECT * FROM Sync WHERE entityType = 'folder' AND isLocal = 1`);
}

export const getAllLocalFilesFromSyncTable = () => {
  return all(`SELECT * FROM Sync WHERE entityType = 'file' AND isLocal = 1`);
}

export const deleteFromSyncTable = (id: string) => {
  return get(`DELETE FROM Sync WHERE id = ?`, [id]);
};

export const setParentFolderId = (parentFolderId: string, id: number) => {
  return get(`UPDATE Sync SET parentFolderId = ? WHERE id = ?`, [parentFolderId, id]);
};

export const setPermaWebFileToIgnore = (id: number) => {
  return get(`UPDATE Sync SET ignore = 1 WHERE id = ?`, [id]);
};

export const setPermaWebFileToOverWrite = (id: string) => {
  return get(`UPDATE Sync SET isLocal = 2 WHERE id = ?`, [id]);
};

export const setFileUploaderObject = (uploader: string, id: string) => {
  return get(`UPDATE Sync SET uploader = ? WHERE id = ?`, [uploader, id]);
};

export const setFilePath = (filePath: string, id: number) => {
  return get(`UPDATE Sync SET filePath = ? WHERE id = ?`, [filePath, id]);
};

export const updateFolderHashInSyncTable = (folderHash: string, id: number) => {
  return get(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [folderHash, id]);
};

export const updateFileHashInSyncTable = (fileHash: string, id: number) => {
  return get(`UPDATE Sync SET fileHash = ? WHERE id = ?`, [fileHash, id]);
};

export const updateFileDownloadStatus = (isLocal: string, id: number) => {
  return get(`UPDATE Sync SET isLocal = ? WHERE id = ?`, [isLocal, id]);
};

// Sets a file isLocal to 0, which will prompt a download
export const setFileToDownload = (metaDataTxId: string) => {
  return get(`UPDATE Sync SET isLocal = 0 WHERE metaDataTxId = ?`, [metaDataTxId]);
}

export const updateArDriveRootDirectoryTx = (arDriveMetaDataTxId: string, permaWebLink: string, fileId: string, fileName: string, filePath: string) => {
  return get(`UPDATE Sync SET metaDataTxId = ?, permaWebLink = ?, fileId = ?, fileMetaDataSyncStatus = 3 WHERE fileName = ? AND filePath = ?`, [arDriveMetaDataTxId, permaWebLink, fileId, fileName, filePath]);
};

export const getArDriveSyncFolderPathFromProfile = () => {
  return get(`SELECT syncFolderPath FROM Profile WHERE id = 1`); // THIS ONLY WORKS WITH 1 PROFILE
}

// Gets all files that are not ignored so they can be validated they still exist locally
export const getAllLatestFileAndFolderVersionsFromSyncTable = () => {
  return all(`SELECT * FROM Sync WHERE ignore = 0 AND isLocal = 1`);
};

export const getAllFromProfile = (): Promise<any[]> => {
  return all('SELECT * FROM Profile');
};

export const getAllDrivesFromDriveTable = () => {
  return all(`SELECT * FROM Drive`);
};

export const getAllDrivesByPrivacyFromDriveTable = (drivePrivacy: string) => {
  return all(`SELECT * FROM Drive WHERE drivePrivacy = ?`, [drivePrivacy]);
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
};

// Main entrypoint for database. MUST call this before anything else can happen
export const setupDatabase = async (dbFilePath: string): Promise<Error | null> => {
  try {
    db = await createOrOpenDb(dbFilePath);
    await createTablesInDB();
  } catch (err) {
    return err;
  }
  return null;
};
