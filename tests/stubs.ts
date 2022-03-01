import Arweave from 'arweave';
import { readFileSync } from 'fs';
import {
	ArFSPublicDrive,
	ArFSPublicFolder,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPrivateFile
} from '../src/arfs/arfs_entities';
import {
	ArFSFileToUpload,
	ArFSFolderToUpload,
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFileDataPrototype,
	ArFSPrivateFileDataTransactionData,
	ArFSPrivateFileMetaDataPrototype,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPublicDriveTransactionData,
	ArFSPublicFileDataPrototype,
	ArFSPublicFileDataTransactionData,
	ArFSPublicFileMetaDataPrototype,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderMetaDataPrototype,
	ArFSPublicFolderTransactionData,
	CommunityTipSettings,
	deriveDriveKey,
	FolderHierarchy,
	JWKWallet,
	publicEntityWithPathsFactory,
	readJWKFile,
	RootFolderID,
	UploadStats,
	W,
	wrapFileOrFolder,
	ArFSPrivateDrive,
	deriveFileKey
} from '../src/exports';
import {
	ADDR,
	ArweaveAddress,
	ByteCount,
	DriveID,
	DriveKey,
	EID,
	FileID,
	FolderID,
	JSON_CONTENT_TYPE,
	PRIVATE_CONTENT_TYPE,
	stubTransactionID,
	TransactionID,
	TxID,
	UnixTime
} from '../src/types';
import { ArFS_O_11 } from '../src/utils/constants';

export const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

export const stubArweaveAddress = (address = 'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'): ArweaveAddress => {
	return ADDR(address);
};

export const getStubDriveKey = async (): Promise<DriveKey> => {
	return await deriveDriveKey(
		'stubPassword',
		`${stubEntityID}`,
		JSON.stringify((readJWKFile('./test_wallet.json') as JWKWallet).getPrivateKey())
	);
};

export const stubTxID = TxID('0000000000000000000000000000000000000000001');
export const stubTxIDAlt = TxID('0000000000000000000000000000000000000000002');
export const stubTxIDAltTwo = TxID('0000000000000000000000000000000000000000003');
export const stubTxIDAltThree = TxID('0000000000000000000000000000000000000000004');

export const stubEntityID = EID('00000000-0000-0000-0000-000000000000');
export const stubEntityIDAlt = EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7');
export const stubEntityIDAltTwo = EID('72b8b54a-eb5e-4134-8ae2-a3946a428ec7');

export const stubEntityIDRoot = EID('00000000-0000-0000-0000-000000000002');
export const stubEntityIDParent = EID('00000000-0000-0000-0000-000000000003');
export const stubEntityIDChild = EID('00000000-0000-0000-0000-000000000004');
export const stubEntityIDGrandchild = EID('00000000-0000-0000-0000-000000000005');

export const stubCommunityTipSettings: CommunityTipSettings = {
	communityTipTarget: stubArweaveAddress(),
	communityWinstonTip: W(1)
};

export const stubPublicFileMetaDataTx = new ArFSPublicFileMetaDataPrototype(
	new ArFSPublicFileMetadataTransactionData(
		'Test Public File Metadata',
		new ByteCount(10),
		new UnixTime(123456789),
		stubTransactionID,
		'text/plain'
	),
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo
);

export const stubPrivateFileMetaDataTx = (async () => {
	return new ArFSPrivateFileMetaDataPrototype(
		await ArFSPrivateFileMetadataTransactionData.from(
			'Test Private File Metadata',
			new ByteCount(10),
			new UnixTime(123456789),
			stubTransactionID,
			'text/plain',
			stubEntityID,
			await getStubDriveKey()
		),
		stubEntityID,
		stubEntityIDAlt,
		stubEntityIDAltTwo
	);
})();

export const stubPublicDriveMetaDataTx = new ArFSPublicDriveMetaDataPrototype(
	new ArFSPublicDriveTransactionData('Test Public Drive Metadata', stubEntityID),
	stubEntityID
);

export const stubPrivateDriveMetaDataTx = (async () =>
	new ArFSPrivateDriveMetaDataPrototype(
		stubEntityID,
		await ArFSPrivateDriveTransactionData.from('Test Private Drive Metadata', stubEntityID, await getStubDriveKey())
	))();

export const stubPublicFolderMetaDataTx = new ArFSPublicFolderMetaDataPrototype(
	new ArFSPublicFolderTransactionData('Test Public Folder Metadata'),
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo
);

export const stubRootFolderMetaData = new ArFSPublicFolderMetaDataPrototype(
	new ArFSPublicFolderTransactionData('Test Root Folder Metadata'),
	stubEntityID,
	stubEntityIDAlt
);

export const stubPrivateFolderMetaDataTx = (async () =>
	new ArFSPrivateFolderMetaDataPrototype(
		stubEntityID,
		stubEntityIDAlt,
		await ArFSPrivateFolderTransactionData.from('Test Private Folder Metadata', await getStubDriveKey()),
		stubEntityIDAltTwo
	))();

export const stubPublicFileDataTx = new ArFSPublicFileDataPrototype(
	new ArFSPublicFileDataTransactionData(readFileSync('./test_wallet.json')),
	'application/json'
);

export const stubPrivateFileDataTx = (async () =>
	new ArFSPrivateFileDataPrototype(
		await ArFSPrivateFileDataTransactionData.from(
			readFileSync('./test_wallet.json'),
			stubEntityID,
			await getStubDriveKey()
		)
	))();

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

export const stubPrivateDrive = async (): Promise<ArFSPrivateDrive> =>
	new ArFSPrivateDrive(
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
		'stubIV',
		await getStubDriveKey()
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
		folderName,
		stubTransactionID,
		new UnixTime(0),
		parentFolderId,
		folderId
	);

export const stubPrivateFolder = async ({
	folderId = stubEntityID,
	parentFolderId = stubEntityID,
	folderName = 'STUB NAME',
	driveId = stubEntityID
}: StubFolderParams): Promise<ArFSPrivateFolder> =>
	new ArFSPrivateFolder(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		folderName,
		stubTransactionID,
		new UnixTime(0),
		parentFolderId,
		folderId,
		'stubCipher',
		'stubIV',
		await getStubDriveKey()
	);

interface StubFileParams {
	driveId?: DriveID;
	fileName?: string;
	txId?: TransactionID;
	parentFolderId?: FolderID;
	fileId?: FileID;
	dataTxId?: TransactionID;
}

export const stubPublicFile = ({
	driveId = stubEntityID,
	fileName = 'STUB NAME',
	txId = stubTransactionID,
	parentFolderId = stubEntityID,
	fileId = stubEntityID,
	dataTxId = stubTransactionID
}: StubFileParams): ArFSPublicFile =>
	new ArFSPublicFile(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		fileName,
		txId,
		new UnixTime(0),
		parentFolderId,
		fileId,
		new ByteCount(1234567890),
		new UnixTime(0),
		dataTxId,
		JSON_CONTENT_TYPE
	);

export const stubPrivateFile = async ({
	driveId = stubEntityID,
	fileName = 'STUB NAME',
	txId = stubTransactionID,
	parentFolderId = stubEntityID,
	fileId = stubEntityID,
	dataTxId = stubTransactionID
}: StubFileParams): Promise<ArFSPrivateFile> => {
	const driveKey = await getStubDriveKey();
	const fileKey = await deriveFileKey(`${fileId}`, driveKey);
	return new ArFSPrivateFile(
		'Integration Test',
		'1.0',
		ArFS_O_11,
		JSON_CONTENT_TYPE,
		driveId,
		fileName,
		txId,
		new UnixTime(0),
		parentFolderId,
		fileId,
		new ByteCount(1234567890),
		new UnixTime(0),
		dataTxId,
		JSON_CONTENT_TYPE,
		'stubCipher',
		'stubIV',
		fileKey,
		driveKey
	);
};

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
	fileName: 'file-in-root',
	dataTxId: stubTxID
});
const stubPublicFileInParent = stubPublicFile({
	fileId: stubEntityIDAlt,
	parentFolderId: stubEntityIDParent,
	fileName: 'file-in-parent',
	dataTxId: stubTxIDAlt
});
const stubPublicFileInChild = stubPublicFile({
	fileId: stubEntityIDAltTwo,
	parentFolderId: stubEntityIDChild,
	fileName: 'file-in-child',
	dataTxId: stubTxIDAltTwo
});

export const stubPublicEntities = [
	stubPublicRootFolder,
	stubPublicParentFolder,
	stubPublicChildFolder,
	stubPublicFileInRoot,
	stubPublicFileInParent,
	stubPublicFileInChild
] as const;

export const stubPublicFolders = [stubPublicRootFolder, stubPublicParentFolder, stubPublicChildFolder];

export const stubPublicHierarchy = FolderHierarchy.newFromEntities(stubPublicFolders);

export const stubPublicEntitiesWithPaths = stubPublicEntities.map((entity) =>
	publicEntityWithPathsFactory(entity, stubPublicHierarchy)
);

const stubIndexFileInRoot = stubPublicFile({
	fileId: stubEntityID,
	parentFolderId: stubEntityIDRoot,
	fileName: 'index.html',
	dataTxId: stubTxIDAltThree
});

export const stubEntitiesWithIndexInRoot = [...stubPublicEntities, stubIndexFileInRoot];

export const stubHierarchyWithIndexInRoot = FolderHierarchy.newFromEntities(stubPublicFolders);

export const stubEntitiesWithPathsAndIndexInRoot = stubEntitiesWithIndexInRoot.map((entity) =>
	publicEntityWithPathsFactory(entity, stubHierarchyWithIndexInRoot)
);

const stubSpecialCharParentFolder = stubPublicFolder({
	folderId: stubEntityIDParent,
	parentFolderId: stubEntityIDRoot,
	folderName: '~!@#$%^&*()_+{}|[]:";<>?,./`'
});
const stubSpecialCharChildFolder = stubPublicFolder({
	folderId: stubEntityIDChild,
	parentFolderId: stubEntityIDParent,
	folderName: "'/'' \\   '' '  /'   ''' "
});
const stubSpecialCharFileInRoot = stubPublicFile({
	fileId: stubEntityID,
	parentFolderId: stubEntityIDRoot,
	fileName: '%&@*(%&(@*:">?{}[]',
	dataTxId: stubTxID
});
const stubSpecialCharFileInParent = stubPublicFile({
	fileId: stubEntityIDAlt,
	parentFolderId: stubEntityIDParent,
	fileName: 'dwijqndjqwnjNJKNDKJANKDNJWNJIvmnbzxnmvbcxvbm,uiqwerioeqwndjkla',
	dataTxId: stubTxIDAlt
});
const stubSpecialCharFileInChild = stubPublicFile({
	fileId: stubEntityIDAltTwo,
	parentFolderId: stubEntityIDChild,
	fileName: 'QWERTYUIOPASDFGHJKLZXCVBNM!@#$%^&*()_+{}:">?',
	dataTxId: stubTxIDAltTwo
});

export const stubSpecialCharacterFolders = [
	stubPublicRootFolder,
	stubSpecialCharParentFolder,
	stubSpecialCharChildFolder
];

export const stubSpecialCharEntities = [
	...stubSpecialCharacterFolders,
	stubSpecialCharFileInRoot,
	stubSpecialCharFileInParent,
	stubSpecialCharFileInChild
];

export const stubSpecialCharHierarchy = FolderHierarchy.newFromEntities(stubSpecialCharacterFolders);

export const stubSpecialCharEntitiesWithPaths = stubSpecialCharEntities.map((entity) =>
	publicEntityWithPathsFactory(entity, stubSpecialCharHierarchy)
);

export const stubEntitiesWithOneFile = [stubPublicRootFolder, stubPublicFileInRoot];

export const stubHierarchyWithOneFile = FolderHierarchy.newFromEntities([stubPublicRootFolder]);

export const stubEntitiesWithOneFileWithPaths = stubEntitiesWithOneFile.map((entity) =>
	publicEntityWithPathsFactory(entity, stubHierarchyWithOneFile)
);

export const stubEntitiesWithNestedFile = [
	stubPublicRootFolder,
	stubPublicParentFolder,
	stubPublicChildFolder,
	stubPublicFileInChild
];

export const stubHierarchyWithNestedFile = FolderHierarchy.newFromEntities(stubPublicFolders);

export const stubEntitiesWithNestedFileWithPaths = stubEntitiesWithNestedFile.map((entity) =>
	publicEntityWithPathsFactory(entity, stubHierarchyWithNestedFile)
);

export const stubEntitiesWithNoFiles = [stubPublicRootFolder, stubPublicParentFolder, stubPublicChildFolder];
export const stubHierarchyWithNoFiles = FolderHierarchy.newFromEntities(stubEntitiesWithNoFiles);
export const stubEntitiesWithNoFilesWithPaths = stubEntitiesWithNoFiles.map((entity) =>
	publicEntityWithPathsFactory(entity, stubHierarchyWithNoFiles)
);

export const stubCommunityContract = {
	settings: [['fee', 50]],
	vault: { [`${stubArweaveAddress()}`]: [{ balance: 500, start: 1, end: 2 }] },
	balances: { [`${stubArweaveAddress()}`]: 200 }
};

const stubPlanUploadStats = (destFolderId: FolderID): Omit<UploadStats, 'wrappedEntity'> => {
	return {
		destDriveId: stubEntityID,
		destFolderId: destFolderId,
		owner: stubArweaveAddress()
	};
};

export const stubFileUploadStats = (destFolderId = stubEntityID): UploadStats<ArFSFileToUpload> => {
	return {
		...stubPlanUploadStats(destFolderId),
		wrappedEntity: stubFileToUpload()
	};
};
export const stubFolderUploadStats = (destFolderId = stubEntityID): UploadStats<ArFSFolderToUpload> => {
	return {
		...stubPlanUploadStats(destFolderId),
		wrappedEntity: stubFolderToUpload()
	};
};

export const stubFileToUpload = (destinationName?: string): ArFSFileToUpload => {
	const file = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;

	// Assign destination name if provided
	file.destName = destinationName;
	return file;
};

export const stubFolderToUpload = (): ArFSFolderToUpload =>
	wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

export const stubEmptyFolderToUpload = (destinationName?: string): ArFSFolderToUpload => {
	const folder = stubFolderToUpload();

	// Empty the files and folders
	folder.files = [];
	folder.folders = [];

	// Assign destination name if provided
	folder.destName = destinationName;

	return folder;
};

export const stubEmptyFolderStats = (destFolderId = stubEntityID): UploadStats<ArFSFolderToUpload> => {
	return {
		...stubPlanUploadStats(destFolderId),
		wrappedEntity: stubEmptyFolderToUpload()
	};
};

export const stub1025CharString =
	'12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345';

export const stub3073CharString =
	'1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234512345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123';
