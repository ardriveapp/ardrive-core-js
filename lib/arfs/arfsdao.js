"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSDAO = exports.PrivateDriveKeyData = void 0;
const uuid_1 = require("uuid");
const arfs_drive_builders_1 = require("./arfs_builders/arfs_drive_builders");
const arfs_file_builders_1 = require("./arfs_builders/arfs_file_builders");
const arfs_folder_builders_1 = require("./arfs_builders/arfs_folder_builders");
const arfs_entities_1 = require("./arfs_entities");
const arfs_prototypes_1 = require("./arfs_prototypes");
const arfs_trx_data_types_1 = require("./arfs_trx_data_types");
const folderHierarchy_1 = require("./folderHierarchy");
const arfsdao_anonymous_1 = require("./arfsdao_anonymous");
const constants_1 = require("../utils/constants");
const crypto_1 = require("../utils/crypto");
const private_key_data_1 = require("./private_key_data");
const types_1 = require("../types");
const filter_methods_1 = require("../utils/filter_methods");
const mapper_functions_1 = require("../utils/mapper_functions");
const query_1 = require("../utils/query");
class PrivateDriveKeyData {
    constructor(driveId, driveKey) {
        this.driveId = driveId;
        this.driveKey = driveKey;
    }
    static from(drivePassword, privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const driveId = uuid_1.v4();
            const driveKey = yield crypto_1.deriveDriveKey(drivePassword, driveId, JSON.stringify(privateKey));
            return new PrivateDriveKeyData(types_1.EID(driveId), driveKey);
        });
    }
}
exports.PrivateDriveKeyData = PrivateDriveKeyData;
class ArFSDAO extends arfsdao_anonymous_1.ArFSDAOAnonymous {
    // TODO: Can we abstract Arweave type(s)?
    constructor(wallet, arweave, dryRun = false, appName = constants_1.DEFAULT_APP_NAME, appVersion = constants_1.DEFAULT_APP_VERSION) {
        super(arweave, appName, appVersion);
        this.wallet = wallet;
        this.dryRun = dryRun;
        this.appName = appName;
        this.appVersion = appVersion;
    }
    // For generic use with public and private drives. Generic types should all be harmonious.
    createFolder({ driveId, rewardSettings, parentFolderId, syncParentFolderId = true }, getDriveFn, folderPrototypeFactory) {
        return __awaiter(this, void 0, void 0, function* () {
            if (parentFolderId && syncParentFolderId) {
                // Assert that drive ID is consistent with parent folder ID
                const actualDriveId = yield this.getDriveIdForFolderId(parentFolderId);
                if (!actualDriveId.equals(driveId)) {
                    throw new Error(`Drive id: ${driveId} does not match actual drive id: ${actualDriveId} for parent folder id`);
                }
            }
            else if (syncParentFolderId) {
                // If drive contains a root folder ID, treat this as a subfolder to the root folder
                const drive = yield getDriveFn();
                if (!drive) {
                    throw new Error(`Drive with Drive ID ${driveId} not found!`);
                }
                if (drive.rootFolderId) {
                    parentFolderId = drive.rootFolderId;
                }
            }
            // Generate a new folder ID
            const folderId = types_1.EID(uuid_1.v4());
            // Create a root folder metadata transaction
            const folderMetadata = folderPrototypeFactory(folderId, parentFolderId);
            const folderTrx = yield this.prepareArFSObjectTransaction(folderMetadata, rewardSettings);
            // Execute the upload
            if (!this.dryRun) {
                const folderUploader = yield this.arweave.transactions.getUploader(folderTrx);
                while (!folderUploader.isComplete) {
                    yield folderUploader.uploadChunk();
                }
            }
            return { metaDataTrxId: types_1.TxID(folderTrx.id), metaDataTrxReward: types_1.W(folderTrx.reward), folderId };
        });
    }
    // Convenience wrapper for folder creation in a known-public use case
    createPublicFolder({ folderData, driveId, rewardSettings, parentFolderId, syncParentFolderId = true, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.createFolder({ driveId, rewardSettings, parentFolderId, syncParentFolderId, owner }, () => this.getPublicDrive(driveId, owner), (folderId, parentFolderId) => new arfs_prototypes_1.ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId, parentFolderId));
        });
    }
    // Convenience wrapper for folder creation in a known-private use case
    createPrivateFolder({ folderData, driveId, driveKey, parentFolderId, rewardSettings, syncParentFolderId = true, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.createFolder({ driveId, rewardSettings, parentFolderId, syncParentFolderId, owner }, () => this.getPrivateDrive(driveId, driveKey, owner), (folderId, parentFolderId) => new arfs_prototypes_1.ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData, parentFolderId));
        });
    }
    createDrive(driveRewardSettings, generateDriveIdFn, createFolderFn, createMetadataFn, resultFactory) {
        return __awaiter(this, void 0, void 0, function* () {
            // Generate a new drive ID  for the new drive
            const driveId = generateDriveIdFn();
            // Create root folder
            const { metaDataTrxId: rootFolderTrxId, metaDataTrxReward: rootFolderTrxReward, folderId: rootFolderId } = yield createFolderFn(driveId);
            // Create a drive metadata transaction
            const driveMetaData = yield createMetadataFn(driveId, rootFolderId);
            const driveTrx = yield this.prepareArFSObjectTransaction(driveMetaData, driveRewardSettings);
            // Execute the upload
            if (!this.dryRun) {
                const driveUploader = yield this.arweave.transactions.getUploader(driveTrx);
                while (!driveUploader.isComplete) {
                    yield driveUploader.uploadChunk();
                }
            }
            return resultFactory({
                metaDataTrxId: types_1.TxID(driveTrx.id),
                metaDataTrxReward: types_1.W(driveTrx.reward),
                rootFolderTrxId: rootFolderTrxId,
                rootFolderTrxReward: rootFolderTrxReward,
                driveId: driveId,
                rootFolderId: rootFolderId
            });
        });
    }
    createPublicDrive(driveName, driveRewardSettings, rootFolderRewardSettings, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.createDrive(driveRewardSettings, () => types_1.EID(uuid_1.v4()), (driveId) => __awaiter(this, void 0, void 0, function* () {
                const folderData = new arfs_trx_data_types_1.ArFSPublicFolderTransactionData(driveName);
                return this.createPublicFolder({
                    folderData,
                    driveId,
                    rewardSettings: rootFolderRewardSettings,
                    syncParentFolderId: false,
                    owner
                });
            }), (driveId, rootFolderId) => {
                return Promise.resolve(new arfs_prototypes_1.ArFSPublicDriveMetaDataPrototype(new arfs_trx_data_types_1.ArFSPublicDriveTransactionData(driveName, rootFolderId), driveId));
            }, (result) => result // No change
            );
        });
    }
    createPrivateDrive(driveName, newDriveData, driveRewardSettings, rootFolderRewardSettings, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.createDrive(driveRewardSettings, () => newDriveData.driveId, (driveId) => __awaiter(this, void 0, void 0, function* () {
                const folderData = yield arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from(driveName, newDriveData.driveKey);
                return this.createPrivateFolder({
                    folderData,
                    driveId,
                    rewardSettings: rootFolderRewardSettings,
                    syncParentFolderId: false,
                    driveKey: newDriveData.driveKey,
                    owner
                });
            }), (driveId, rootFolderId) => __awaiter(this, void 0, void 0, function* () {
                return Promise.resolve(new arfs_prototypes_1.ArFSPrivateDriveMetaDataPrototype(driveId, yield arfs_trx_data_types_1.ArFSPrivateDriveTransactionData.from(driveName, rootFolderId, newDriveData.driveKey)));
            }), (result) => {
                return Object.assign(Object.assign({}, result), { driveKey: newDriveData.driveKey }); // Add drive key for private return type
            });
        });
    }
    moveEntity(metaDataBaseReward, metaDataFactory, resultFactory) {
        return __awaiter(this, void 0, void 0, function* () {
            const metadataPrototype = metaDataFactory();
            // Prepare meta data transaction
            const metaDataTrx = yield this.prepareArFSObjectTransaction(metadataPrototype, metaDataBaseReward);
            // Upload meta data
            if (!this.dryRun) {
                const metaDataUploader = yield this.arweave.transactions.getUploader(metaDataTrx);
                while (!metaDataUploader.isComplete) {
                    yield metaDataUploader.uploadChunk();
                }
            }
            return resultFactory({ metaDataTrxId: types_1.TxID(metaDataTrx.id), metaDataTrxReward: types_1.W(metaDataTrx.reward) });
        });
    }
    movePublicFile({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.moveEntity(metaDataBaseReward, () => {
                return new arfs_prototypes_1.ArFSPublicFileMetaDataPrototype(transactionData, originalMetaData.driveId, originalMetaData.fileId, newParentFolderId);
            }, (results) => {
                return Object.assign(Object.assign({}, results), { dataTrxId: originalMetaData.dataTxId });
            });
        });
    }
    movePrivateFile({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.moveEntity(metaDataBaseReward, () => {
                return new arfs_prototypes_1.ArFSPrivateFileMetaDataPrototype(transactionData, originalMetaData.driveId, originalMetaData.fileId, newParentFolderId);
            }, (results) => {
                return Object.assign(Object.assign({}, results), { dataTrxId: originalMetaData.dataTxId, fileKey: transactionData.fileKey });
            });
        });
    }
    movePublicFolder({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.moveEntity(metaDataBaseReward, () => {
                return new arfs_prototypes_1.ArFSPublicFolderMetaDataPrototype(transactionData, originalMetaData.driveId, originalMetaData.entityId, newParentFolderId);
            }, (results) => results);
        });
    }
    movePrivateFolder({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.moveEntity(metaDataBaseReward, () => {
                return new arfs_prototypes_1.ArFSPrivateFolderMetaDataPrototype(originalMetaData.driveId, originalMetaData.entityId, transactionData, newParentFolderId);
            }, (results) => {
                return Object.assign(Object.assign({}, results), { driveKey: transactionData.driveKey });
            });
        });
    }
    uploadFile(wrappedFile, fileDataRewardSettings, metadataRewardSettings, dataPrototypeFactoryFn, metadataTrxDataFactoryFn, metadataFactoryFn, resultFactoryFn, destFileName, existingFileId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Establish destination file name
            const destinationFileName = destFileName !== null && destFileName !== void 0 ? destFileName : wrappedFile.getBaseFileName();
            // Use existing file ID (create a revision) or generate new file ID
            const fileId = existingFileId !== null && existingFileId !== void 0 ? existingFileId : types_1.EID(uuid_1.v4());
            // Gather file information
            const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();
            // Read file data into memory
            const fileData = wrappedFile.getFileDataBuffer();
            // Build file data transaction
            const fileDataPrototype = yield dataPrototypeFactoryFn(fileData, dataContentType, fileId);
            const dataTrx = yield this.prepareArFSObjectTransaction(fileDataPrototype, fileDataRewardSettings);
            // Upload file data
            if (!this.dryRun) {
                const dataUploader = yield this.arweave.transactions.getUploader(dataTrx);
                while (!dataUploader.isComplete) {
                    yield dataUploader.uploadChunk();
                }
            }
            // Prepare meta data transaction
            const metadataTrxData = yield metadataTrxDataFactoryFn(destinationFileName, fileSize, lastModifiedDateMS, types_1.TxID(dataTrx.id), dataContentType, fileId);
            const fileMetadata = metadataFactoryFn(metadataTrxData, fileId);
            const metaDataTrx = yield this.prepareArFSObjectTransaction(fileMetadata, metadataRewardSettings);
            // Upload meta data
            if (!this.dryRun) {
                const metaDataUploader = yield this.arweave.transactions.getUploader(metaDataTrx);
                while (!metaDataUploader.isComplete) {
                    yield metaDataUploader.uploadChunk();
                }
            }
            return resultFactoryFn({
                dataTrxId: types_1.TxID(dataTrx.id),
                dataTrxReward: types_1.W(dataTrx.reward),
                metaDataTrxId: types_1.TxID(metaDataTrx.id),
                metaDataTrxReward: types_1.W(metaDataTrx.reward),
                fileId
            }, metadataTrxData);
        });
    }
    uploadPublicFile({ parentFolderId, wrappedFile, driveId, fileDataRewardSettings, metadataRewardSettings, destFileName, existingFileId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.uploadFile(wrappedFile, fileDataRewardSettings, metadataRewardSettings, (fileData, dataContentType) => __awaiter(this, void 0, void 0, function* () {
                return new arfs_prototypes_1.ArFSPublicFileDataPrototype(new arfs_trx_data_types_1.ArFSPublicFileDataTransactionData(fileData), dataContentType);
            }), (destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType) => __awaiter(this, void 0, void 0, function* () {
                return new arfs_trx_data_types_1.ArFSPublicFileMetadataTransactionData(destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType);
            }), (metadataTrxData, fileId) => {
                return new arfs_prototypes_1.ArFSPublicFileMetaDataPrototype(metadataTrxData, driveId, fileId, parentFolderId);
            }, (result) => result, // no change
            destFileName, existingFileId);
        });
    }
    uploadPrivateFile({ parentFolderId, wrappedFile, driveId, driveKey, fileDataRewardSettings, metadataRewardSettings, destFileName, existingFileId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.uploadFile(wrappedFile, fileDataRewardSettings, metadataRewardSettings, (fileData, _dataContentType, fileId) => __awaiter(this, void 0, void 0, function* () {
                const trxData = yield arfs_trx_data_types_1.ArFSPrivateFileDataTransactionData.from(fileData, fileId, driveKey);
                return new arfs_prototypes_1.ArFSPrivateFileDataPrototype(trxData);
            }), (destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType, fileId) => __awaiter(this, void 0, void 0, function* () {
                return yield arfs_trx_data_types_1.ArFSPrivateFileMetadataTransactionData.from(destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType, fileId, driveKey);
            }), (metadataTrxData, fileId) => {
                return new arfs_prototypes_1.ArFSPrivateFileMetaDataPrototype(metadataTrxData, driveId, fileId, parentFolderId);
            }, (result, trxData) => {
                return Object.assign(Object.assign({}, result), { fileKey: trxData.fileKey }); // add the file key to the result data
            }, destFileName, existingFileId);
        });
    }
    prepareArFSObjectTransaction(objectMetaData, rewardSettings = {}, otherTags = []) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const wallet = this.wallet;
            // Create transaction
            const trxAttributes = {
                data: objectMetaData.objectData.asTransactionData()
            };
            // If we provided our own reward setting, use it now
            if (rewardSettings.reward) {
                trxAttributes.reward = rewardSettings.reward.toString();
            }
            // TODO: Use a mock arweave server instead
            if (process.env.NODE_ENV === 'test') {
                trxAttributes.last_tx = 'STUB';
            }
            const transaction = yield this.arweave.createTransaction(trxAttributes, wallet.getPrivateKey());
            // If we've opted to boost the transaction, do so now
            if ((_a = rewardSettings.feeMultiple) === null || _a === void 0 ? void 0 : _a.wouldBoostReward()) {
                transaction.reward = rewardSettings.feeMultiple.boostReward(transaction.reward);
            }
            // Add baseline ArFS Tags
            transaction.addTag('App-Name', this.appName);
            transaction.addTag('App-Version', this.appVersion);
            transaction.addTag('ArFS', constants_1.CURRENT_ARFS_VERSION);
            if ((_b = rewardSettings.feeMultiple) === null || _b === void 0 ? void 0 : _b.wouldBoostReward()) {
                transaction.addTag('Boost', rewardSettings.feeMultiple.toString());
            }
            // Add object-specific tags
            objectMetaData.addTagsToTransaction(transaction);
            // Enforce that other tags are not protected
            objectMetaData.assertProtectedTags(otherTags);
            otherTags.forEach((tag) => {
                transaction.addTag(tag.name, tag.value);
            });
            // Sign the transaction
            yield this.arweave.transactions.sign(transaction, wallet.getPrivateKey());
            return transaction;
        });
    }
    // Convenience function for known-private use cases
    getPrivateDrive(driveId, driveKey, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_drive_builders_1.ArFSPrivateDriveBuilder({ entityId: driveId, arweave: this.arweave, key: driveKey, owner }).build();
        });
    }
    // Convenience function for known-private use cases
    getPrivateFolder(folderId, driveKey, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_folder_builders_1.ArFSPrivateFolderBuilder(folderId, this.arweave, driveKey, owner).build();
        });
    }
    getPrivateFile(fileId, driveKey, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_file_builders_1.ArFSPrivateFileBuilder(fileId, this.arweave, driveKey, owner).build();
        });
    }
    getAllFoldersOfPrivateDrive({ driveId, driveKey, owner, latestRevisionsOnly = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allFolders = [];
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({
                    tags: [
                        { name: 'Drive-Id', value: `${driveId}` },
                        { name: 'Entity-Type', value: 'folder' }
                    ],
                    cursor,
                    owner
                });
                const response = yield this.arweave.api.post(arfsdao_anonymous_1.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const folders = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    cursor = edge.cursor;
                    const { node } = edge;
                    const folderBuilder = yield arfs_folder_builders_1.ArFSPrivateFolderBuilder.fromArweaveNode(node, this.arweave, driveKey);
                    return yield folderBuilder.build(node);
                }));
                allFolders.push(...(yield Promise.all(folders)));
            }
            return latestRevisionsOnly ? allFolders.filter(filter_methods_1.latestRevisionFilter) : allFolders;
        });
    }
    getPrivateFilesWithParentFolderIds(folderIDs, driveKey, owner, latestRevisionsOnly = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allFiles = [];
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({
                    tags: [
                        { name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
                        { name: 'Entity-Type', value: 'file' }
                    ],
                    cursor,
                    owner
                });
                const response = yield this.arweave.api.post(arfsdao_anonymous_1.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const files = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    const { node } = edge;
                    cursor = edge.cursor;
                    const fileBuilder = yield arfs_file_builders_1.ArFSPrivateFileBuilder.fromArweaveNode(node, this.arweave, driveKey);
                    return yield fileBuilder.build(node);
                }));
                allFiles.push(...(yield Promise.all(files)));
            }
            return latestRevisionsOnly ? allFiles.filter(filter_methods_1.latestRevisionFilter) : allFiles;
        });
    }
    getEntitiesInFolder(parentFolderId, builder, latestRevisionsOnly = true, filterOnOwner = true) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allEntities = [];
            // TODO: Derive the owner of a wallet from earliest transaction of a drive by default
            const owner = yield this.wallet.getAddress();
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({
                    tags: [
                        { name: 'Parent-Folder-Id', value: `${parentFolderId}` },
                        { name: 'Entity-Type', value: ['file', 'folder'] }
                    ],
                    cursor,
                    owner: filterOnOwner ? owner : undefined
                });
                const response = yield this.arweave.api.post(arfsdao_anonymous_1.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const folders = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const { node } = edge;
                    cursor = edge.cursor;
                    const { tags } = node;
                    // Check entityType to determine which builder to use
                    const entityType = (_a = tags.find((t) => t.name === 'Entity-Type')) === null || _a === void 0 ? void 0 : _a.value;
                    if (!entityType || (entityType !== 'file' && entityType !== 'folder')) {
                        throw new Error('Entity-Type tag is missing or invalid!');
                    }
                    return builder(node, entityType).build(node);
                }));
                allEntities.push(...(yield Promise.all(folders)));
            }
            return latestRevisionsOnly ? allEntities.filter(filter_methods_1.latestRevisionFilter) : allEntities;
        });
    }
    getPrivateEntitiesInFolder(parentFolderId, driveKey, latestRevisionsOnly = true) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getEntitiesInFolder(parentFolderId, (node, entityType) => entityType === 'folder'
                ? arfs_folder_builders_1.ArFSPrivateFolderBuilder.fromArweaveNode(node, this.arweave, driveKey)
                : arfs_file_builders_1.ArFSPrivateFileBuilder.fromArweaveNode(node, this.arweave, driveKey), latestRevisionsOnly);
        });
    }
    getPublicEntitiesInFolder(parentFolderId, latestRevisionsOnly = true) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getEntitiesInFolder(parentFolderId, (node, entityType) => entityType === 'folder'
                ? arfs_folder_builders_1.ArFSPublicFolderBuilder.fromArweaveNode(node, this.arweave)
                : arfs_file_builders_1.ArFSPublicFileBuilder.fromArweaveNode(node, this.arweave), latestRevisionsOnly);
        });
    }
    getChildrenFolderIds(folderId, allFolderEntitiesOfDrive) {
        return __awaiter(this, void 0, void 0, function* () {
            const hierarchy = folderHierarchy_1.FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
            return hierarchy.folderIdSubtreeFromFolderId(folderId, Number.MAX_SAFE_INTEGER);
        });
    }
    getPrivateEntityNamesInFolder(folderId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const childrenOfFolder = yield this.getPrivateEntitiesInFolder(folderId, driveKey, true);
            return childrenOfFolder.map(mapper_functions_1.entityToNameMap);
        });
    }
    getPublicEntityNamesInFolder(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            const childrenOfFolder = yield this.getPublicEntitiesInFolder(folderId, true);
            return childrenOfFolder.map(mapper_functions_1.entityToNameMap);
        });
    }
    getPublicNameConflictInfoInFolder(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            const childrenOfFolder = yield this.getPublicEntitiesInFolder(folderId, true);
            return {
                files: childrenOfFolder.filter(filter_methods_1.fileFilter).map(mapper_functions_1.fileConflictInfoMap),
                folders: childrenOfFolder.filter(filter_methods_1.folderFilter).map(mapper_functions_1.folderToNameAndIdMap)
            };
        });
    }
    getPrivateNameConflictInfoInFolder(folderId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const childrenOfFolder = yield this.getPrivateEntitiesInFolder(folderId, driveKey, true);
            return {
                files: childrenOfFolder.filter(filter_methods_1.fileFilter).map(mapper_functions_1.fileConflictInfoMap),
                folders: childrenOfFolder.filter(filter_methods_1.folderFilter).map(mapper_functions_1.folderToNameAndIdMap)
            };
        });
    }
    getPrivateChildrenFolderIds({ folderId, driveId, driveKey, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getChildrenFolderIds(folderId, yield this.getAllFoldersOfPrivateDrive({ driveId, driveKey, owner, latestRevisionsOnly: true }));
        });
    }
    getPublicChildrenFolderIds({ folderId, owner, driveId }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getChildrenFolderIds(folderId, yield this.getAllFoldersOfPublicDrive({ driveId, owner, latestRevisionsOnly: true }));
        });
    }
    getOwnerAndAssertDrive(driveId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const gqlQuery = query_1.buildQuery({
                tags: [
                    { name: 'Entity-Type', value: 'drive' },
                    { name: 'Drive-Id', value: `${driveId}` }
                ],
                sort: query_1.ASCENDING_ORDER
            });
            const response = yield this.arweave.api.post(arfsdao_anonymous_1.graphQLURL, gqlQuery);
            const edges = response.data.data.transactions.edges;
            if (!edges.length) {
                throw new Error(`Could not find a transaction with "Drive-Id": ${driveId}`);
            }
            const edgeOfFirstDrive = edges[0];
            const drivePrivacy = driveKey ? 'private' : 'public';
            const drivePrivacyFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Drive-Privacy');
            if (!drivePrivacyFromTag) {
                throw new Error('Target drive has no "Drive-Privacy" tag!');
            }
            if (drivePrivacyFromTag.value !== drivePrivacy) {
                throw new Error(`Target drive is not a ${drivePrivacy} drive!`);
            }
            if (driveKey) {
                const cipherIVFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Cipher-IV');
                if (!cipherIVFromTag) {
                    throw new Error('Target private drive has no "Cipher-IV" tag!');
                }
                const driveDataBuffer = Buffer.from(yield this.arweave.transactions.getData(edgeOfFirstDrive.node.id, { decode: true }));
                try {
                    // Attempt to decrypt drive to assert drive key is correct
                    yield crypto_1.driveDecrypt(cipherIVFromTag.value, driveKey, driveDataBuffer);
                }
                catch (_a) {
                    throw new Error('Provided drive key or password could not decrypt target private drive!');
                }
            }
            const driveOwnerAddress = edgeOfFirstDrive.node.owner.address;
            return new types_1.ArweaveAddress(driveOwnerAddress);
        });
    }
    /**
     * Lists the children of certain private folder
     * @param {FolderID} folderId the folder ID to list children of
     * @param {DriveKey} driveKey the drive key used for drive and folder data decryption and file key derivation
     * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
     * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
     * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPrivateFolder({ folderId, driveKey, maxDepth, includeRoot, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Number.isInteger(maxDepth) || maxDepth < 0) {
                throw new Error('maxDepth should be a non-negative integer!');
            }
            const folder = yield this.getPrivateFolder(folderId, driveKey, owner);
            // Fetch all of the folder entities within the drive
            const driveIdOfFolder = folder.driveId;
            const allFolderEntitiesOfDrive = yield this.getAllFoldersOfPrivateDrive({
                driveId: driveIdOfFolder,
                driveKey,
                owner,
                latestRevisionsOnly: true
            });
            const hierarchy = folderHierarchy_1.FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
            const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth - 1);
            const [, ...subFolderIDs] = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth);
            const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) => subFolderIDs.includes(folder.entityId));
            if (includeRoot) {
                childrenFolderEntities.unshift(folder);
            }
            // Fetch all file entities within all Folders of the drive
            const childrenFileEntities = yield this.getPrivateFilesWithParentFolderIds(searchFolderIDs, driveKey, owner, true);
            const children = [...childrenFolderEntities, ...childrenFileEntities];
            const entitiesWithPath = children.map((entity) => new arfs_entities_1.ArFSPrivateFileOrFolderWithPaths(entity, hierarchy));
            return entitiesWithPath;
        });
    }
    assertValidPassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const wallet = this.wallet;
            const walletAddress = yield wallet.getAddress();
            const query = query_1.buildQuery({
                tags: [
                    { name: 'Entity-Type', value: 'drive' },
                    { name: 'Drive-Privacy', value: 'private' }
                ],
                owner: walletAddress,
                sort: query_1.ASCENDING_ORDER
            });
            const response = yield this.arweave.api.post(arfsdao_anonymous_1.graphQLURL, query);
            const { data } = response.data;
            const { transactions } = data;
            const { edges } = transactions;
            if (!edges.length) {
                // No drive has been created for this wallet
                return;
            }
            const { node } = edges[0];
            const safeDriveBuilder = arfs_drive_builders_1.SafeArFSDriveBuilder.fromArweaveNode(node, this.arweave, new private_key_data_1.PrivateKeyData({ password, wallet: this.wallet }));
            const safelyBuiltDrive = yield safeDriveBuilder.build();
            if (safelyBuiltDrive.name === arfs_entities_1.ENCRYPTED_DATA_PLACEHOLDER ||
                `${safelyBuiltDrive.rootFolderId}` === arfs_entities_1.ENCRYPTED_DATA_PLACEHOLDER) {
                throw new Error(`Invalid password! Please type the same as your other private drives!`);
            }
        });
    }
}
exports.ArFSDAO = ArFSDAO;
