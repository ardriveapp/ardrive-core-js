/**
 * Interface for ArFS Data Access Object
 * Defines the common contract between Node.js and Web implementations
 */

import type { DriveID, FolderID, ArweaveAddress, DriveKey } from '../types';

/**
 * Minimal common interface for ArFS DAO implementations
 * Both ArFSDAO (Node.js) and ArFSDAOWeb (Browser) implement this interface
 *
 * This interface defines the core methods that MUST work across all platforms.
 * Platform-specific implementations may have additional methods.
 */
export interface IArFSDAO {
	// Core query operations that work everywhere
	getDriveIdForFolderId(folderId: FolderID): Promise<DriveID>;
	getDriveIdForFileId(fileId: FolderID): Promise<DriveID>;
	isPublicDrive(driveId: DriveID, address: ArweaveAddress): Promise<boolean>;
	assertDrivePrivacy(driveId: DriveID, address: ArweaveAddress, driveKey?: DriveKey): Promise<void>;
	getOwnerAndAssertDrive(driveId: DriveID, driveKey?: DriveKey): Promise<ArweaveAddress>;
}
