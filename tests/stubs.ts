import {
	ArFSPublicDrive,
	ArFSPrivateDrive,
	ArFSPublicFolder,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPrivateFile,
	ArFSPublicFileOrFolderWithPaths
} from '../src/arfs/arfs_entities';
import { FolderHierarchy, RootFolderID } from '../src/exports';
import {
	ADDR,
	ArFS_O_11,
	ArweaveAddress,
	ByteCount,
	DriveID,
	EID,
	FileID,
	FolderID,
	JSON_CONTENT_TYPE,
	PRIVATE_CONTENT_TYPE,
	stubTransactionID,
	TransactionID,
	UnixTime
} from '../src/types';

export const stubArweaveAddress = (address = 'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'): ArweaveAddress => {
	return ADDR(address);
};

export const stubEntityID = EID('00000000-0000-0000-0000-000000000000');
export const stubEntityIDAlt = EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7');
export const stubEntityIDAltTwo = EID('72b8b54a-eb5e-4134-8ae2-a3946a428ec7');

export const stubEntityIDRoot = EID('00000000-0000-0000-0000-000000000002');
export const stubEntityIDParent = EID('00000000-0000-0000-0000-000000000003');
export const stubEntityIDChild = EID('00000000-0000-0000-0000-000000000004');
export const stubEntityIDGrandchild = EID('00000000-0000-0000-0000-000000000005');

export const stubPublicDrive = (): ArFSPublicDrive =>
	new ArFSPublicDrive(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		stubEntityID,
		'drive',
		'STUB DRIVE',
		stubTransactionID,
		new UnixTime(0),
		'public',
		stubEntityID
	);

export const stubPrivateDrive = new ArFSPrivateDrive(
	'Integration Test',
	'1.0',
	ArFS_O_11,
	PRIVATE_CONTENT_TYPE,
	stubEntityID,
	'drive',
	'STUB DRIVE',
	stubTransactionID,
	new UnixTime(0),
	'private',
	stubEntityID,
	'password',
	'stubCipher',
	'stubIV'
);

interface StubFolderParams {
	folderId?: FolderID;
	parentFolderId?: FolderID;
	folderName?: string;
	driveId?: DriveID;
}

export const stubPublicFolder = ({
	folderId = stubEntityID,
	parentFolderId = stubEntityID,
	folderName = 'STUB NAME',
	driveId = stubEntityID
}: StubFolderParams): ArFSPublicFolder =>
	new ArFSPublicFolder(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		'folder',
		folderName,
		stubTransactionID,
		new UnixTime(0),
		parentFolderId,
		folderId
	);

export const stubPrivateFolder = ({
	folderId = stubEntityID,
	parentFolderId = stubEntityID,
	folderName = 'STUB NAME',
	driveId = stubEntityID
}: StubFolderParams): ArFSPrivateFolder =>
	new ArFSPrivateFolder(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		'folder',
		folderName,
		stubTransactionID,
		new UnixTime(0),
		parentFolderId,
		folderId,
		'stubCipher',
		'stubIV'
	);

interface StubFileParams {
	driveId?: DriveID;
	fileName?: string;
	txId?: TransactionID;
	parentFolderId?: FolderID;
	fileId?: FileID;
}

export const stubPublicFile = ({
	driveId = stubEntityID,
	fileName = 'STUB NAME',
	txId = stubTransactionID,
	parentFolderId = stubEntityID,
	fileId = stubEntityID
}: StubFileParams): ArFSPublicFile =>
	new ArFSPublicFile(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		'file',
		fileName,
		txId,
		new UnixTime(0),
		parentFolderId,
		fileId,
		new ByteCount(1234567890),
		new UnixTime(0),
		stubTransactionID,
		JSON_CONTENT_TYPE
	);

export const stubPrivateFile = ({ driveId = stubEntityID, fileName = 'STUB NAME' }: StubFileParams): ArFSPrivateFile =>
	new ArFSPrivateFile(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		'file',
		fileName,
		stubTransactionID,
		new UnixTime(0),
		stubEntityID,
		stubEntityID,
		new ByteCount(1234567890),
		new UnixTime(0),
		stubTransactionID,
		JSON_CONTENT_TYPE,
		'stubCipher',
		'stubIV'
	);

const stubPublicRootFolder = stubPublicFolder({ folderId: stubEntityIDRoot, parentFolderId: new RootFolderID() });
const stubPublicParentFolder = stubPublicFolder({
	folderId: stubEntityIDParent,
	parentFolderId: stubEntityIDRoot,
	folderName: 'parent-folder'
});
const stubPublicChildFolder = stubPublicFolder({
	folderId: stubEntityIDChild,
	parentFolderId: stubEntityIDParent,
	folderName: 'child-folder'
});
const stubPublicFileInRoot = stubPublicFile({
	fileId: stubEntityID,
	parentFolderId: stubEntityIDRoot,
	fileName: 'file-in-root'
});
const stubPublicFileInParent = stubPublicFile({
	fileId: stubEntityIDAlt,
	parentFolderId: stubEntityIDParent,
	fileName: 'file-in-parent'
});
const stubPublicFileInChild = stubPublicFile({
	fileId: stubEntityIDAltTwo,
	parentFolderId: stubEntityIDChild,
	fileName: 'file-in-child'
});

export const stubPublicEntities = [
	stubPublicRootFolder,
	stubPublicParentFolder,
	stubPublicChildFolder,
	stubPublicFileInRoot,
	stubPublicFileInParent,
	stubPublicFileInChild
];

export const stubPublicHierarchy = FolderHierarchy.newFromEntities(stubPublicEntities);

export const stubPublicEntitiesWithPaths = stubPublicEntities.map(
	(entity) => new ArFSPublicFileOrFolderWithPaths(entity, stubPublicHierarchy)
);

const stubIndexFileInRoot = stubPublicFile({
	fileId: stubEntityID,
	parentFolderId: stubEntityIDRoot,
	fileName: 'index.html'
});

export const stubEntitiesWithIndexInRoot = [...stubPublicEntities, stubIndexFileInRoot];

export const stubHierarchyWithIndexInRoot = FolderHierarchy.newFromEntities(stubEntitiesWithIndexInRoot);

export const stubEntitiesWithPathsAndIndexInRoot = stubEntitiesWithIndexInRoot.map(
	(entity) => new ArFSPublicFileOrFolderWithPaths(entity, stubHierarchyWithIndexInRoot)
);
