import {
	TransactionID,
	AnyEntityID,
	MakeOptional,
	ArweaveAddress,
	Winston,
	FolderID,
	DriveID,
	FileID,
	FileConflictPrompts,
	FileNameConflictResolution,
	FolderConflictPrompts
} from '.';
import { WithDriveKey } from '../arfs/arfs_entity_result_factory';
import { ArFSFolderToUpload, ArFSFileToUpload } from '../arfs/arfs_file_wrapper';
import { PrivateDriveKeyData } from '../arfs/arfsdao';
import { ArFSListPublicFolderParams } from '../arfs/arfsdao_anonymous';
import { PrivateKeyData } from '../arfs/private_key_data';

export type ArFSEntityDataType = 'drive' | 'folder' | 'file';

export interface ArFSEntityData {
	type: ArFSEntityDataType;
	metadataTxId: TransactionID;
	dataTxId?: TransactionID;
	entityId: AnyEntityID;
	key?: string;
}

export type ListPublicFolderParams = MakeOptional<ArFSListPublicFolderParams, 'maxDepth' | 'includeRoot' | 'owner'>;
export type ListPrivateFolderParams = ListPublicFolderParams & WithDriveKey;

export interface TipData {
	txId: TransactionID;
	recipient: ArweaveAddress;
	winston: Winston;
}

export interface TipResult {
	tipData: TipData;
	reward: Winston;
}

export type ArFSFees = { [key: string]: Winston };

export interface ArFSResult {
	created: ArFSEntityData[];
	tips: TipData[];
	fees: ArFSFees;
}

export interface ArFSManifestResult extends ArFSResult {
	links: string[];
}

export const emptyArFSResult: ArFSResult = {
	created: [],
	tips: [],
	fees: {}
};

export interface MetaDataBaseCosts {
	metaDataBaseReward: Winston;
}

export interface BulkFileBaseCosts extends MetaDataBaseCosts {
	fileDataBaseReward: Winston;
}
export interface FileUploadBaseCosts extends BulkFileBaseCosts {
	communityWinstonTip: Winston;
}

export interface DriveUploadBaseCosts {
	driveMetaDataBaseReward: Winston;
	rootFolderMetaDataBaseReward: Winston;
}

export interface RecursivePublicBulkUploadParams {
	parentFolderId: FolderID;
	wrappedFolder: ArFSFolderToUpload;
	driveId: DriveID;
	owner: ArweaveAddress;
}
export type RecursivePrivateBulkUploadParams = RecursivePublicBulkUploadParams & WithDriveKey;

export interface UploadPublicManifestParams {
	folderId: FolderID;
	maxDepth?: number;
	destManifestName?: string;
	conflictResolution?: FileNameConflictResolution;
}

export interface CreatePublicManifestParams extends Required<UploadPublicManifestParams> {
	driveId: DriveID;
	owner: ArweaveAddress;
}

export interface CreatePublicFolderParams {
	folderName: string;
	driveId: DriveID;
	parentFolderId: FolderID;
}
export type CreatePrivateFolderParams = CreatePublicFolderParams & WithDriveKey;

export interface UploadParams {
	parentFolderId: FolderID;
	conflictResolution?: FileNameConflictResolution;
}

export interface BulkPublicUploadParams extends UploadParams {
	wrappedFolder: ArFSFolderToUpload;
	parentFolderId: FolderID;
	prompts?: FolderConflictPrompts;
	destParentFolderName?: string;
}
export type BulkPrivateUploadParams = BulkPublicUploadParams & WithDriveKey;

export interface UploadPublicFileParams extends UploadParams {
	wrappedFile: ArFSFileToUpload;
	prompts?: FileConflictPrompts;
	destinationFileName?: string;
}
export type UploadPrivateFileParams = UploadPublicFileParams & WithDriveKey;

export interface CommunityTipParams {
	communityWinstonTip: Winston;
	assertBalance?: boolean;
}

interface MoveParams {
	newParentFolderId: FolderID;
}

export interface MovePublicFileParams extends MoveParams {
	fileId: FileID;
}
export type MovePrivateFileParams = MovePublicFileParams & WithDriveKey;

export interface MovePublicFolderParams extends MoveParams {
	folderId: FolderID;
}
export type MovePrivateFolderParams = MovePublicFolderParams & WithDriveKey;

export interface CreatePublicDriveParams {
	driveName: string;
}
export interface CreatePrivateDriveParams extends CreatePublicDriveParams {
	newPrivateDriveData: PrivateDriveKeyData;
}

interface GetEntityParams {
	owner?: ArweaveAddress;
}
export interface GetPublicDriveParams extends GetEntityParams {
	driveId: DriveID;
}
export type GetPrivateDriveParams = GetPublicDriveParams & WithDriveKey;

export interface GetPublicFolderParams extends GetEntityParams {
	folderId: FolderID;
}
export type GetPrivateFolderParams = GetPublicFolderParams & WithDriveKey;

export interface GetPublicFileParams extends GetEntityParams {
	fileId: FileID;
}
export type GetPrivateFileParams = GetPublicFileParams & WithDriveKey;

export interface GetAllDrivesForAddressParams {
	address: ArweaveAddress;
	privateKeyData: PrivateKeyData;
}

// The manifest interfaces below are taken from arweave-deploy

// A path object is labeled by its path, file name
// and extension, and then an arweave transaction id
export interface ManifestPathMap {
	[index: string]: { id: string };
}
export interface Manifest {
	/** manifest must be 'arweave/paths' */
	manifest: 'arweave/paths';
	/** version must be 0.1.0 */
	version: '0.1.0';
	/** index contains the default path that will redirected when the user access the manifest transaction itself */
	index: {
		path: string;
	};
	/** paths is an object of path objects */
	paths: ManifestPathMap;
}
