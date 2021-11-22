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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArDrive = void 0;
const ardrive_anonymous_1 = require("./ardrive_anonymous");
const arfs_file_wrapper_1 = require("./arfs/arfs_file_wrapper");
const arfs_trx_data_types_1 = require("./arfs/arfs_trx_data_types");
const crypto_1 = require("./utils/crypto");
const types_1 = require("./types");
const types_2 = require("./types");
const common_1 = require("./utils/common");
const error_message_1 = require("./utils/error_message");
const exports_1 = require("./exports");
const constants_1 = require("./utils/constants");
const ar_data_price_chunk_estimator_1 = require("./pricing/ar_data_price_chunk_estimator");
class ArDrive extends ardrive_anonymous_1.ArDriveAnonymous {
    constructor(wallet, walletDao, arFsDao, communityOracle, appName, appVersion, priceEstimator = new ar_data_price_chunk_estimator_1.ARDataPriceChunkEstimator(true), feeMultiple = new types_1.FeeMultiple(1.0), dryRun = false) {
        super(arFsDao);
        this.wallet = wallet;
        this.walletDao = walletDao;
        this.arFsDao = arFsDao;
        this.communityOracle = communityOracle;
        this.appName = appName;
        this.appVersion = appVersion;
        this.priceEstimator = priceEstimator;
        this.feeMultiple = feeMultiple;
        this.dryRun = dryRun;
    }
    // NOTE: Presumes that there's a sufficient wallet balance
    sendCommunityTip({ communityWinstonTip, assertBalance = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHolder = yield this.communityOracle.selectTokenHolder();
            const arTransferBaseFee = yield this.priceEstimator.getBaseWinstonPriceForByteCount(new types_1.ByteCount(0));
            const transferResult = yield this.walletDao.sendARToAddress(new types_1.AR(communityWinstonTip), this.wallet, tokenHolder, { reward: arTransferBaseFee, feeMultiple: this.feeMultiple }, this.dryRun, this.getTipTags(), assertBalance);
            return {
                tipData: { txId: transferResult.trxID, recipient: tokenHolder, winston: communityWinstonTip },
                reward: transferResult.reward
            };
        });
    }
    getTipTags(tipType = 'data upload') {
        return [
            { name: 'App-Name', value: this.appName },
            { name: 'App-Version', value: this.appVersion },
            { name: 'Type', value: 'fee' },
            { name: 'Tip-Type', value: tipType }
        ];
    }
    movePublicFile({ fileId, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const destFolderDriveId = yield this.arFsDao.getDriveIdForFolderId(newParentFolderId);
            const owner = yield this.getOwnerForDriveId(destFolderDriveId);
            yield this.assertOwnerAddress(owner);
            const originalFileMetaData = yield this.getPublicFile({ fileId });
            if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveToDifferentDrive);
            }
            if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
            }
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPublicEntityNamesInFolder(newParentFolderId);
            if (entityNamesInParentFolder.includes(originalFileMetaData.name)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const fileTransactionData = new arfs_trx_data_types_1.ArFSPublicFileMetadataTransactionData(originalFileMetaData.name, originalFileMetaData.size, originalFileMetaData.lastModifiedDate, originalFileMetaData.dataTxId, originalFileMetaData.dataContentType);
            const moveFileBaseCosts = yield this.estimateAndAssertCostOfMoveFile(fileTransactionData);
            const fileMetaDataBaseReward = { reward: moveFileBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };
            // Move file will create a new meta data tx with identical meta data except for a new parentFolderId
            const moveFileResult = yield this.arFsDao.movePublicFile({
                originalMetaData: originalFileMetaData,
                transactionData: fileTransactionData,
                newParentFolderId,
                metaDataBaseReward: fileMetaDataBaseReward
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'file',
                        metadataTxId: moveFileResult.metaDataTrxId,
                        dataTxId: moveFileResult.dataTrxId,
                        entityId: fileId
                    }
                ],
                tips: [],
                fees: {
                    [`${moveFileResult.metaDataTrxId}`]: moveFileResult.metaDataTrxReward
                }
            });
        });
    }
    movePrivateFile({ fileId, newParentFolderId, driveKey }) {
        return __awaiter(this, void 0, void 0, function* () {
            const destFolderDriveId = yield this.arFsDao.getDriveIdForFolderId(newParentFolderId);
            const owner = yield this.getOwnerForDriveId(destFolderDriveId);
            yield this.assertOwnerAddress(owner);
            const originalFileMetaData = yield this.getPrivateFile({ fileId, driveKey });
            if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveToDifferentDrive);
            }
            if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
            }
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPrivateEntityNamesInFolder(newParentFolderId, driveKey);
            if (entityNamesInParentFolder.includes(originalFileMetaData.name)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const fileTransactionData = yield arfs_trx_data_types_1.ArFSPrivateFileMetadataTransactionData.from(originalFileMetaData.name, originalFileMetaData.size, originalFileMetaData.lastModifiedDate, originalFileMetaData.dataTxId, originalFileMetaData.dataContentType, fileId, driveKey);
            const moveFileBaseCosts = yield this.estimateAndAssertCostOfMoveFile(fileTransactionData);
            const fileMetaDataBaseReward = { reward: moveFileBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };
            // Move file will create a new meta data tx with identical meta data except for a new parentFolderId
            const moveFileResult = yield this.arFsDao.movePrivateFile({
                originalMetaData: originalFileMetaData,
                transactionData: fileTransactionData,
                newParentFolderId,
                metaDataBaseReward: fileMetaDataBaseReward
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'file',
                        metadataTxId: moveFileResult.metaDataTrxId,
                        dataTxId: moveFileResult.dataTrxId,
                        entityId: fileId,
                        key: common_1.urlEncodeHashKey(moveFileResult.fileKey)
                    }
                ],
                tips: [],
                fees: {
                    [`${moveFileResult.metaDataTrxId}`]: moveFileResult.metaDataTrxReward
                }
            });
        });
    }
    movePublicFolder({ folderId, newParentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (folderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.folderCannotMoveIntoItself);
            }
            const destFolderDriveId = yield this.arFsDao.getDriveIdForFolderId(newParentFolderId);
            const owner = yield this.getOwnerForDriveId(destFolderDriveId);
            yield this.assertOwnerAddress(owner);
            const originalFolderMetaData = yield this.getPublicFolder({ folderId });
            if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveToDifferentDrive);
            }
            if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
            }
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPublicEntityNamesInFolder(newParentFolderId);
            if (entityNamesInParentFolder.includes(originalFolderMetaData.name)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const childrenFolderIds = yield this.arFsDao.getPublicChildrenFolderIds({
                folderId,
                driveId: destFolderDriveId,
                owner
            });
            if (childrenFolderIds.some((fid) => fid.equals(newParentFolderId))) {
                throw new Error(error_message_1.errorMessage.cannotMoveParentIntoChildFolder);
            }
            const folderTransactionData = new arfs_trx_data_types_1.ArFSPublicFolderTransactionData(originalFolderMetaData.name);
            const { metaDataBaseReward: baseReward } = yield this.estimateAndAssertCostOfFolderUpload(folderTransactionData);
            const folderMetaDataBaseReward = { reward: baseReward, feeMultiple: this.feeMultiple };
            // Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
            const moveFolderResult = yield this.arFsDao.movePublicFolder({
                originalMetaData: originalFolderMetaData,
                transactionData: folderTransactionData,
                newParentFolderId,
                metaDataBaseReward: folderMetaDataBaseReward
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'folder',
                        metadataTxId: moveFolderResult.metaDataTrxId,
                        entityId: folderId
                    }
                ],
                tips: [],
                fees: {
                    [`${moveFolderResult.metaDataTrxId}`]: moveFolderResult.metaDataTrxReward
                }
            });
        });
    }
    movePrivateFolder({ folderId, newParentFolderId, driveKey }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (folderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.folderCannotMoveIntoItself);
            }
            const destFolderDriveId = yield this.arFsDao.getDriveIdForFolderId(newParentFolderId);
            const owner = yield this.getOwnerForDriveId(destFolderDriveId);
            yield this.assertOwnerAddress(owner);
            const originalFolderMetaData = yield this.getPrivateFolder({ folderId, driveKey });
            if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveToDifferentDrive);
            }
            if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
                throw new Error(error_message_1.errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
            }
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPrivateEntityNamesInFolder(newParentFolderId, driveKey);
            if (entityNamesInParentFolder.includes(originalFolderMetaData.name)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const childrenFolderIds = yield this.arFsDao.getPrivateChildrenFolderIds({
                folderId,
                driveId: destFolderDriveId,
                driveKey,
                owner
            });
            if (childrenFolderIds.some((fid) => fid.equals(newParentFolderId))) {
                throw new Error(error_message_1.errorMessage.cannotMoveParentIntoChildFolder);
            }
            const folderTransactionData = yield arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from(originalFolderMetaData.name, driveKey);
            const { metaDataBaseReward: baseReward } = yield this.estimateAndAssertCostOfFolderUpload(folderTransactionData);
            const folderMetaDataBaseReward = { reward: baseReward, feeMultiple: this.feeMultiple };
            // Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
            const moveFolderResult = yield this.arFsDao.movePrivateFolder({
                originalMetaData: originalFolderMetaData,
                transactionData: folderTransactionData,
                newParentFolderId,
                metaDataBaseReward: folderMetaDataBaseReward
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'folder',
                        metadataTxId: moveFolderResult.metaDataTrxId,
                        entityId: folderId,
                        key: common_1.urlEncodeHashKey(moveFolderResult.driveKey)
                    }
                ],
                tips: [],
                fees: {
                    [`${moveFolderResult.metaDataTrxId}`]: moveFolderResult.metaDataTrxReward
                }
            });
        });
    }
    uploadPublicFile({ parentFolderId, wrappedFile, destinationFileName, conflictResolution = types_2.upsertOnConflicts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const driveId = yield this.arFsDao.getDriveIdForFolderId(parentFolderId);
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId);
            yield this.assertOwnerAddress(owner);
            // Derive destination name and names already within provided destination folder
            const destFileName = destinationFileName !== null && destinationFileName !== void 0 ? destinationFileName : wrappedFile.getBaseFileName();
            const filesAndFolderNames = yield this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId);
            // Files cannot overwrite folder names
            if (filesAndFolderNames.folders.find((f) => f.folderName === destFileName)) {
                if (conflictResolution === types_2.skipOnConflicts) {
                    // Return empty result if resolution set to skip on FILE to FOLDER name conflicts
                    return types_2.emptyArFSResult;
                }
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const conflictingFileName = filesAndFolderNames.files.find((f) => f.fileName === destFileName);
            if (conflictingFileName) {
                if (conflictResolution === types_2.skipOnConflicts) {
                    // File has the same name, skip the upload
                    return types_2.emptyArFSResult;
                }
                if (conflictResolution === types_2.upsertOnConflicts &&
                    conflictingFileName.lastModifiedDate.valueOf() === wrappedFile.lastModifiedDate.valueOf()) {
                    // These files have the same name and last modified date, skip the upload
                    return types_2.emptyArFSResult;
                }
                // TODO: Handle this.conflictResolution === 'ask' PE-639
            }
            // File is a new revision if destination name conflicts
            // with an existing file in the destination folder
            const existingFileId = conflictingFileName === null || conflictingFileName === void 0 ? void 0 : conflictingFileName.fileId;
            const uploadBaseCosts = yield this.estimateAndAssertCostOfFileUpload(new types_1.ByteCount(wrappedFile.fileStats.size), this.stubPublicFileMetadata(wrappedFile, destinationFileName), 'public');
            const fileDataRewardSettings = { reward: uploadBaseCosts.fileDataBaseReward, feeMultiple: this.feeMultiple };
            const metadataRewardSettings = { reward: uploadBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };
            const uploadFileResult = yield this.arFsDao.uploadPublicFile({
                parentFolderId,
                wrappedFile,
                driveId,
                fileDataRewardSettings,
                metadataRewardSettings,
                destFileName: destinationFileName,
                existingFileId
            });
            const { tipData, reward: communityTipTrxReward } = yield this.sendCommunityTip({
                communityWinstonTip: uploadBaseCosts.communityWinstonTip
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'file',
                        metadataTxId: uploadFileResult.metaDataTrxId,
                        dataTxId: uploadFileResult.dataTrxId,
                        entityId: uploadFileResult.fileId
                    }
                ],
                tips: [tipData],
                fees: {
                    [`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
                    [`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
                    [`${tipData.txId}`]: communityTipTrxReward
                }
            });
        });
    }
    createPublicFolderAndUploadChildren({ parentFolderId, wrappedFolder, destParentFolderName, conflictResolution = types_2.upsertOnConflicts }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const driveId = yield this.arFsDao.getDriveIdForFolderId(parentFolderId);
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId);
            yield this.assertOwnerAddress(owner);
            // Derive destination name and names already within provided destination folder
            const destFolderName = destParentFolderName !== null && destParentFolderName !== void 0 ? destParentFolderName : wrappedFolder.getBaseFileName();
            const filesAndFolderNames = yield this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId);
            // Folders cannot overwrite file names
            if (filesAndFolderNames.files.find((f) => f.fileName === destFolderName)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            // Use existing folder id if the intended destination name
            // conflicts with an existing folder in the destination folder
            wrappedFolder.existingId = (_a = filesAndFolderNames.folders.find((f) => f.folderName === destFolderName)) === null || _a === void 0 ? void 0 : _a.folderId;
            wrappedFolder.destinationName = destParentFolderName;
            // Check for conflicting names and assign existing IDs for later use
            yield this.checkAndAssignExistingPublicNames(wrappedFolder);
            // Estimate and assert the cost of the entire bulk upload
            // This will assign the calculated base costs to each wrapped file and folder
            const bulkEstimation = yield this.estimateAndAssertCostOfBulkUpload(wrappedFolder, conflictResolution);
            // TODO: Add interactive confirmation of price estimation before uploading
            const results = yield this.recursivelyCreatePublicFolderAndUploadChildren({
                parentFolderId,
                wrappedFolder,
                driveId,
                owner: yield this.wallet.getAddress(),
                conflictResolution
            });
            if (bulkEstimation.communityWinstonTip.isGreaterThan(types_1.W(0))) {
                // Send community tip only if communityWinstonTip has a value
                // This can be zero when a user uses this method to upload empty folders
                const { tipData, reward: communityTipTrxReward } = yield this.sendCommunityTip({
                    communityWinstonTip: bulkEstimation.communityWinstonTip
                });
                return Promise.resolve({
                    created: results.entityResults,
                    tips: [tipData],
                    fees: Object.assign(Object.assign({}, results.feeResults), { [`${tipData.txId}`]: communityTipTrxReward })
                });
            }
            return Promise.resolve({
                created: results.entityResults,
                tips: [],
                fees: results.feeResults
            });
        });
    }
    recursivelyCreatePublicFolderAndUploadChildren({ parentFolderId, wrappedFolder, driveId, owner, conflictResolution }) {
        var e_1, _a, e_2, _b;
        var _c;
        return __awaiter(this, void 0, void 0, function* () {
            let uploadEntityFees = {};
            let uploadEntityResults = [];
            let folderId;
            if (wrappedFolder.existingFileAtDestConflict) {
                // Folder names cannot conflict with file names
                // Return an empty result to continue other parts of upload
                return { entityResults: [], feeResults: {} };
            }
            else if (wrappedFolder.existingId) {
                // Re-use existing parent folder ID for bulk upload if it exists
                folderId = wrappedFolder.existingId;
            }
            else {
                // Create the parent folder
                const folderData = new arfs_trx_data_types_1.ArFSPublicFolderTransactionData((_c = wrappedFolder.destinationName) !== null && _c !== void 0 ? _c : wrappedFolder.getBaseFileName());
                const createFolderResult = yield this.arFsDao.createPublicFolder({
                    folderData: folderData,
                    driveId,
                    rewardSettings: {
                        reward: wrappedFolder.getBaseCosts().metaDataBaseReward,
                        feeMultiple: this.feeMultiple
                    },
                    parentFolderId,
                    syncParentFolderId: false,
                    owner
                });
                const { metaDataTrxId, folderId: newFolderId, metaDataTrxReward } = createFolderResult;
                // Capture parent folder results
                uploadEntityFees = { [`${metaDataTrxId}`]: metaDataTrxReward };
                uploadEntityResults = [
                    {
                        type: 'folder',
                        metadataTxId: metaDataTrxId,
                        entityId: newFolderId
                    }
                ];
                folderId = newFolderId;
            }
            try {
                // Upload all files in the folder
                for (var _d = __asyncValues(wrappedFolder.files), _e; _e = yield _d.next(), !_e.done;) {
                    const wrappedFile = _e.value;
                    if (
                    // Conflict resolution is set to skip and there is an existing file
                    (conflictResolution === types_2.skipOnConflicts && wrappedFile.existingId) ||
                        // Conflict resolution is set to upsert and an existing file has the same last modified date
                        (conflictResolution === types_2.upsertOnConflicts && wrappedFile.hasSameLastModifiedDate) ||
                        // File names cannot conflict with folder names
                        wrappedFile.existingFolderAtDestConflict) {
                        // Continue loop, don't upload this file
                        continue;
                    }
                    const fileDataRewardSettings = {
                        reward: wrappedFile.getBaseCosts().fileDataBaseReward,
                        feeMultiple: this.feeMultiple
                    };
                    const metadataRewardSettings = {
                        reward: wrappedFile.getBaseCosts().metaDataBaseReward,
                        feeMultiple: this.feeMultiple
                    };
                    const uploadFileResult = yield this.arFsDao.uploadPublicFile({
                        parentFolderId: folderId,
                        wrappedFile,
                        driveId,
                        fileDataRewardSettings,
                        metadataRewardSettings,
                        existingFileId: wrappedFile.existingId
                    });
                    // Capture all file results
                    uploadEntityFees = Object.assign(Object.assign({}, uploadEntityFees), { [`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward, [`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward });
                    uploadEntityResults = [
                        ...uploadEntityResults,
                        {
                            type: 'file',
                            metadataTxId: uploadFileResult.metaDataTrxId,
                            dataTxId: uploadFileResult.dataTrxId,
                            entityId: uploadFileResult.fileId
                        }
                    ];
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) yield _a.call(_d);
                }
                finally { if (e_1) throw e_1.error; }
            }
            try {
                // Upload folders, and children of those folders
                for (var _f = __asyncValues(wrappedFolder.folders), _g; _g = yield _f.next(), !_g.done;) {
                    const childFolder = _g.value;
                    // Recursion alert, will keep creating folders of all nested folders
                    const results = yield this.recursivelyCreatePublicFolderAndUploadChildren({
                        parentFolderId: folderId,
                        wrappedFolder: childFolder,
                        driveId,
                        owner,
                        conflictResolution
                    });
                    // Capture all folder results
                    uploadEntityFees = Object.assign(Object.assign({}, uploadEntityFees), results.feeResults);
                    uploadEntityResults = [...uploadEntityResults, ...results.entityResults];
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_g && !_g.done && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_2) throw e_2.error; }
            }
            return {
                entityResults: uploadEntityResults,
                feeResults: uploadEntityFees
            };
        });
    }
    /** Computes the size of a private file encrypted with AES256-GCM */
    encryptedDataSize(dataSize) {
        // TODO: Refactor to utils?
        if (+dataSize > Number.MAX_SAFE_INTEGER - 16) {
            throw new Error(`Max un-encrypted dataSize allowed is ${Number.MAX_SAFE_INTEGER - 16}!`);
        }
        return new types_1.ByteCount((+dataSize / 16 + 1) * 16);
    }
    uploadPrivateFile({ parentFolderId, wrappedFile, driveKey, destinationFileName, conflictResolution = types_2.upsertOnConflicts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const driveId = yield this.arFsDao.getDriveIdForFolderId(parentFolderId);
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);
            yield this.assertOwnerAddress(owner);
            // Derive destination name and names already within provided destination folder
            const destFileName = destinationFileName !== null && destinationFileName !== void 0 ? destinationFileName : wrappedFile.getBaseFileName();
            const filesAndFolderNames = yield this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey);
            // Files cannot overwrite folder names
            if (filesAndFolderNames.folders.find((f) => f.folderName === destFileName)) {
                if (conflictResolution === types_2.skipOnConflicts) {
                    // Return empty result if resolution set to skip on FILE to FOLDER name conflicts
                    return types_2.emptyArFSResult;
                }
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            const conflictingFileName = filesAndFolderNames.files.find((f) => f.fileName === destFileName);
            if (conflictingFileName) {
                if (conflictResolution === types_2.skipOnConflicts) {
                    // File has the same name, skip the upload
                    return types_2.emptyArFSResult;
                }
                if (conflictResolution === types_2.upsertOnConflicts &&
                    conflictingFileName.lastModifiedDate.valueOf() === wrappedFile.lastModifiedDate.valueOf()) {
                    // These files have the same name and last modified date, skip the upload
                    return types_2.emptyArFSResult;
                }
                // TODO: Handle this.conflictResolution === 'ask' PE-639
            }
            // File is a new revision if destination name conflicts
            // with an existing file in the destination folder
            const existingFileId = conflictingFileName === null || conflictingFileName === void 0 ? void 0 : conflictingFileName.fileId;
            const uploadBaseCosts = yield this.estimateAndAssertCostOfFileUpload(new types_1.ByteCount(wrappedFile.fileStats.size), yield this.stubPrivateFileMetadata(wrappedFile, destinationFileName), 'private');
            const fileDataRewardSettings = {
                reward: uploadBaseCosts.fileDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            const metadataRewardSettings = {
                reward: uploadBaseCosts.metaDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            // TODO: Add interactive confirmation of AR price estimation
            const uploadFileResult = yield this.arFsDao.uploadPrivateFile({
                parentFolderId,
                wrappedFile,
                driveId,
                driveKey,
                fileDataRewardSettings,
                metadataRewardSettings,
                destFileName: destinationFileName,
                existingFileId
            });
            const { tipData, reward: communityTipTrxReward } = yield this.sendCommunityTip({
                communityWinstonTip: uploadBaseCosts.communityWinstonTip
            });
            return Promise.resolve({
                created: [
                    {
                        type: 'file',
                        metadataTxId: uploadFileResult.metaDataTrxId,
                        dataTxId: uploadFileResult.dataTrxId,
                        entityId: uploadFileResult.fileId,
                        key: common_1.urlEncodeHashKey(uploadFileResult.fileKey)
                    }
                ],
                tips: [tipData],
                fees: {
                    [`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
                    [`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
                    [`${tipData.txId}`]: communityTipTrxReward
                }
            });
        });
    }
    createPrivateFolderAndUploadChildren({ parentFolderId, wrappedFolder, driveKey, destParentFolderName, conflictResolution = types_2.upsertOnConflicts }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // Retrieve drive ID from folder ID
            const driveId = yield this.arFsDao.getDriveIdForFolderId(parentFolderId);
            // Get owner of drive, will error if no drives are found
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);
            // Assert that the provided wallet is the owner of the drive
            yield this.assertOwnerAddress(owner);
            // Derive destination name and names already within provided destination folder
            const destFolderName = destParentFolderName !== null && destParentFolderName !== void 0 ? destParentFolderName : wrappedFolder.getBaseFileName();
            const filesAndFolderNames = yield this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey);
            // Folders cannot overwrite file names
            if (filesAndFolderNames.files.find((f) => f.fileName === destFolderName)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            // Use existing folder id if the intended destination name
            // conflicts with an existing folder in the destination folder
            wrappedFolder.existingId = (_a = filesAndFolderNames.folders.find((f) => f.folderName === destFolderName)) === null || _a === void 0 ? void 0 : _a.folderId;
            wrappedFolder.destinationName = destParentFolderName;
            // Check for conflicting names and assign existing IDs for later use
            yield this.checkAndAssignExistingPrivateNames(wrappedFolder, driveKey);
            // Estimate and assert the cost of the entire bulk upload
            // This will assign the calculated base costs to each wrapped file and folder
            const bulkEstimation = yield this.estimateAndAssertCostOfBulkUpload(wrappedFolder, conflictResolution, driveKey);
            // TODO: Add interactive confirmation of price estimation before uploading
            const results = yield this.recursivelyCreatePrivateFolderAndUploadChildren({
                parentFolderId,
                wrappedFolder,
                driveKey,
                driveId,
                owner,
                conflictResolution
            });
            if (bulkEstimation.communityWinstonTip.isGreaterThan(types_1.W(0))) {
                // Send community tip only if communityWinstonTip has a value
                // This can be zero when a user uses this method to upload empty folders
                const { tipData, reward: communityTipTrxReward } = yield this.sendCommunityTip({
                    communityWinstonTip: bulkEstimation.communityWinstonTip
                });
                return Promise.resolve({
                    created: results.entityResults,
                    tips: [tipData],
                    fees: Object.assign(Object.assign({}, results.feeResults), { [`${tipData.txId}`]: communityTipTrxReward })
                });
            }
            return Promise.resolve({
                created: results.entityResults,
                tips: [],
                fees: results.feeResults
            });
        });
    }
    checkAndAssignExistingPublicNames(wrappedFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            yield wrappedFolder.checkAndAssignExistingNames((parentFolderId) => this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId));
        });
    }
    checkAndAssignExistingPrivateNames(wrappedFolder, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield wrappedFolder.checkAndAssignExistingNames((parentFolderId) => this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey));
        });
    }
    recursivelyCreatePrivateFolderAndUploadChildren({ wrappedFolder, driveId, parentFolderId, driveKey, owner, conflictResolution }) {
        var e_3, _a, e_4, _b;
        var _c;
        return __awaiter(this, void 0, void 0, function* () {
            let uploadEntityFees = {};
            let uploadEntityResults = [];
            let folderId;
            if (wrappedFolder.existingFileAtDestConflict) {
                // Folder names cannot conflict with file names
                // Return an empty result to continue other parts of upload
                return { entityResults: [], feeResults: {} };
            }
            else if (wrappedFolder.existingId) {
                // Re-use existing parent folder ID for bulk upload if it exists
                folderId = wrappedFolder.existingId;
            }
            else {
                // Create parent folder
                const folderData = yield arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from((_c = wrappedFolder.destinationName) !== null && _c !== void 0 ? _c : wrappedFolder.getBaseFileName(), driveKey);
                const createFolderResult = yield this.arFsDao.createPrivateFolder({
                    folderData: folderData,
                    driveId,
                    rewardSettings: {
                        reward: wrappedFolder.getBaseCosts().metaDataBaseReward,
                        feeMultiple: this.feeMultiple
                    },
                    parentFolderId,
                    driveKey,
                    syncParentFolderId: false,
                    owner
                });
                const { metaDataTrxId, folderId: newFolderId, metaDataTrxReward } = createFolderResult;
                // Capture parent folder results
                uploadEntityFees = { [`${metaDataTrxId}`]: metaDataTrxReward };
                uploadEntityResults = [
                    {
                        type: 'folder',
                        metadataTxId: metaDataTrxId,
                        entityId: newFolderId,
                        key: common_1.urlEncodeHashKey(driveKey)
                    }
                ];
                folderId = newFolderId;
            }
            try {
                // Upload all files in the folder
                for (var _d = __asyncValues(wrappedFolder.files), _e; _e = yield _d.next(), !_e.done;) {
                    const wrappedFile = _e.value;
                    if (
                    // Conflict resolution is set to skip and there is an existing file
                    (conflictResolution === types_2.skipOnConflicts && wrappedFile.existingId) ||
                        // Conflict resolution is set to upsert and an existing file has the same last modified date
                        (conflictResolution === types_2.upsertOnConflicts && wrappedFile.hasSameLastModifiedDate) ||
                        // File names cannot conflict with folder names
                        wrappedFile.existingFolderAtDestConflict) {
                        // Continue loop, don't upload this file
                        continue;
                    }
                    const fileDataRewardSettings = {
                        reward: wrappedFile.getBaseCosts().fileDataBaseReward,
                        feeMultiple: this.feeMultiple
                    };
                    const metadataRewardSettings = {
                        reward: wrappedFile.getBaseCosts().metaDataBaseReward,
                        feeMultiple: this.feeMultiple
                    };
                    const uploadFileResult = yield this.arFsDao.uploadPrivateFile({
                        parentFolderId: folderId,
                        wrappedFile,
                        driveId,
                        driveKey,
                        fileDataRewardSettings,
                        metadataRewardSettings,
                        existingFileId: wrappedFile.existingId
                    });
                    // Capture all file results
                    uploadEntityFees = Object.assign(Object.assign({}, uploadEntityFees), { [`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward, [`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward });
                    uploadEntityResults = [
                        ...uploadEntityResults,
                        {
                            type: 'file',
                            metadataTxId: uploadFileResult.metaDataTrxId,
                            dataTxId: uploadFileResult.dataTrxId,
                            entityId: uploadFileResult.fileId,
                            key: common_1.urlEncodeHashKey(uploadFileResult.fileKey)
                        }
                    ];
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) yield _a.call(_d);
                }
                finally { if (e_3) throw e_3.error; }
            }
            try {
                // Upload folders, and children of those folders
                for (var _f = __asyncValues(wrappedFolder.folders), _g; _g = yield _f.next(), !_g.done;) {
                    const childFolder = _g.value;
                    // Recursion alert, will keep creating folders of all nested folders
                    const results = yield this.recursivelyCreatePrivateFolderAndUploadChildren({
                        parentFolderId: folderId,
                        wrappedFolder: childFolder,
                        driveId,
                        driveKey,
                        owner,
                        conflictResolution
                    });
                    // Capture all folder results
                    uploadEntityFees = Object.assign(Object.assign({}, uploadEntityFees), results.feeResults);
                    uploadEntityResults = [...uploadEntityResults, ...results.entityResults];
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (_g && !_g.done && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_4) throw e_4.error; }
            }
            return {
                entityResults: uploadEntityResults,
                feeResults: uploadEntityFees
            };
        });
    }
    uploadPublicManifest({ folderId, driveId, destManifestName = 'DriveManifest.json', maxDepth = Number.MAX_SAFE_INTEGER }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!driveId) {
                if (!folderId) {
                    throw new Error('Must provide either a drive ID or a folder ID to!');
                }
                driveId = yield this.arFsDao.getDriveIdForFolderId(folderId);
            }
            const owner = yield this.getOwnerForDriveId(driveId);
            yield this.assertOwnerAddress(owner);
            const drive = yield this.arFsDao.getPublicDrive(driveId, owner);
            folderId !== null && folderId !== void 0 ? folderId : (folderId = drive.rootFolderId);
            // TODO: Handle collision with existing manifest. New manifest will always be a new file, with
            // upsert by default this means it will only skip here on --skip conflict
            const filesAndFolderNames = yield this.arFsDao.getPublicNameConflictInfoInFolder(folderId);
            // Manifest becomes a new revision if the destination name
            // conflicts with an existing file in the destination folder
            const existingFileId = (_a = filesAndFolderNames.files.find((f) => f.fileName === destManifestName)) === null || _a === void 0 ? void 0 : _a.fileId;
            const children = yield this.arFsDao.listPublicFolder({
                folderId,
                maxDepth,
                includeRoot: true,
                owner
            });
            const sortedChildren = children.sort((a, b) => exports_1.alphabeticalOrder(a.path, b.path));
            // Slice and replace path to compare above pattern
            const baseFolderPath = sortedChildren[0].path;
            const castedChildren = sortedChildren;
            // TODO: Fix base types so deleting un-used values is not necessary; Tickets: PE-525 + PE-556
            castedChildren.map((fileOrFolderMetaData) => {
                if (fileOrFolderMetaData.entityType === 'folder') {
                    delete fileOrFolderMetaData.lastModifiedDate;
                    delete fileOrFolderMetaData.size;
                    delete fileOrFolderMetaData.dataTxId;
                    delete fileOrFolderMetaData.dataContentType;
                }
            });
            // TURN SORTED CHILDREN INTO MANIFEST
            const pathMap = {};
            castedChildren.forEach((child) => {
                if (child.dataTxId && child.path && child.dataContentType !== types_1.MANIFEST_CONTENT_TYPE) {
                    const path = child.path
                        // Slice off base folder path and the leading "/" so manifest URLs path correctly
                        .slice(baseFolderPath.length + 1)
                        // Replace spaces with underscores for sharing links
                        .replace(/ /g, '_');
                    pathMap[path] = { id: `${child.dataTxId}` };
                }
            });
            // Use index.html in the specified folder if it exists, otherwise show first file found
            const indexPath = Object.keys(pathMap).includes(`index.html`) ? `index.html` : Object.keys(pathMap)[0];
            const arweaveManifest = new arfs_file_wrapper_1.ArFSManifestToUpload({
                manifest: 'arweave/paths',
                version: '0.1.0',
                index: {
                    path: indexPath
                },
                paths: pathMap
            });
            const uploadBaseCosts = yield this.estimateAndAssertCostOfFileUpload(arweaveManifest.size, this.stubPublicFileMetadata(arweaveManifest, destManifestName), 'public');
            const fileDataRewardSettings = { reward: uploadBaseCosts.fileDataBaseReward, feeMultiple: this.feeMultiple };
            const metadataRewardSettings = { reward: uploadBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };
            const uploadFileResult = yield this.arFsDao.uploadPublicFile({
                parentFolderId: folderId,
                wrappedFile: arweaveManifest,
                driveId,
                fileDataRewardSettings,
                metadataRewardSettings,
                destFileName: destManifestName,
                existingFileId
            });
            const { tipData, reward: communityTipTrxReward } = yield this.sendCommunityTip({
                communityWinstonTip: uploadBaseCosts.communityWinstonTip
            });
            const fileLinks = Object.keys(arweaveManifest.manifest.paths).map((path) => `arweave.net/${uploadFileResult.dataTrxId}/${path}`);
            return Promise.resolve({
                created: [
                    {
                        type: 'file',
                        metadataTxId: uploadFileResult.metaDataTrxId,
                        dataTxId: uploadFileResult.dataTrxId,
                        entityId: uploadFileResult.fileId
                    }
                ],
                tips: [tipData],
                fees: {
                    [`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
                    [`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
                    [`${tipData.txId}`]: communityTipTrxReward
                },
                links: [`arweave.net/${uploadFileResult.dataTrxId}`, ...fileLinks]
            });
        });
    }
    createPublicFolder({ folderName, driveId, parentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId);
            yield this.assertOwnerAddress(owner);
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPublicEntityNamesInFolder(parentFolderId);
            if (entityNamesInParentFolder.includes(folderName)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            // Assert that there's enough AR available in the wallet
            const folderData = new arfs_trx_data_types_1.ArFSPublicFolderTransactionData(folderName);
            const { metaDataBaseReward } = yield this.estimateAndAssertCostOfFolderUpload(folderData);
            // Create the folder and retrieve its folder ID
            const { metaDataTrxId, metaDataTrxReward, folderId } = yield this.arFsDao.createPublicFolder({
                folderData,
                driveId,
                rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
                parentFolderId,
                owner
            });
            // IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
            return Promise.resolve({
                created: [
                    {
                        type: 'folder',
                        metadataTxId: metaDataTrxId,
                        entityId: folderId
                    }
                ],
                tips: [],
                fees: {
                    [`${metaDataTrxId}`]: metaDataTrxReward
                }
            });
        });
    }
    createPrivateFolder({ folderName, driveId, driveKey, parentFolderId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const owner = yield this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);
            yield this.assertOwnerAddress(owner);
            // Assert that there are no duplicate names in the destination folder
            const entityNamesInParentFolder = yield this.arFsDao.getPrivateEntityNamesInFolder(parentFolderId, driveKey);
            if (entityNamesInParentFolder.includes(folderName)) {
                // TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
                throw new Error(error_message_1.errorMessage.entityNameExists);
            }
            // Assert that there's enough AR available in the wallet
            const folderData = yield arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from(folderName, driveKey);
            const { metaDataBaseReward } = yield this.estimateAndAssertCostOfFolderUpload(folderData);
            // Create the folder and retrieve its folder ID
            const { metaDataTrxId, metaDataTrxReward, folderId } = yield this.arFsDao.createPrivateFolder({
                folderData,
                driveId,
                rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
                driveKey,
                parentFolderId,
                owner
            });
            // IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
            return Promise.resolve({
                created: [
                    {
                        type: 'folder',
                        metadataTxId: metaDataTrxId,
                        entityId: folderId,
                        key: common_1.urlEncodeHashKey(driveKey)
                    }
                ],
                tips: [],
                fees: {
                    [`${metaDataTrxId}`]: metaDataTrxReward
                }
            });
        });
    }
    createPublicDrive({ driveName }) {
        return __awaiter(this, void 0, void 0, function* () {
            // Assert that there's enough AR available in the wallet
            // Use stub data to estimate costs since actual data requires entity IDs generated by ArFSDao
            const stubRootFolderData = new arfs_trx_data_types_1.ArFSPublicFolderTransactionData(driveName);
            const stubDriveData = new arfs_trx_data_types_1.ArFSPublicDriveTransactionData(driveName, constants_1.fakeEntityId);
            const driveUploadCosts = yield this.estimateAndAssertCostOfDriveCreation(stubDriveData, stubRootFolderData);
            const driveRewardSettings = {
                reward: driveUploadCosts.driveMetaDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            const rootFolderRewardSettings = {
                reward: driveUploadCosts.rootFolderMetaDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            const createDriveResult = yield this.arFsDao.createPublicDrive(driveName, driveRewardSettings, rootFolderRewardSettings, 
            // There is no need to assert ownership during drive creation
            yield this.wallet.getAddress());
            return Promise.resolve({
                created: [
                    {
                        type: 'drive',
                        metadataTxId: createDriveResult.metaDataTrxId,
                        entityId: createDriveResult.driveId
                    },
                    {
                        type: 'folder',
                        metadataTxId: createDriveResult.rootFolderTrxId,
                        entityId: createDriveResult.rootFolderId
                    }
                ],
                tips: [],
                fees: {
                    [`${createDriveResult.metaDataTrxId}`]: createDriveResult.metaDataTrxReward,
                    [`${createDriveResult.rootFolderTrxId}`]: createDriveResult.rootFolderTrxReward
                }
            });
        });
    }
    createPrivateDrive({ driveName, newPrivateDriveData }) {
        return __awaiter(this, void 0, void 0, function* () {
            // Assert that there's enough AR available in the wallet
            const stubRootFolderData = yield arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from(driveName, newPrivateDriveData.driveKey);
            const stubDriveData = yield arfs_trx_data_types_1.ArFSPrivateDriveTransactionData.from(driveName, constants_1.fakeEntityId, newPrivateDriveData.driveKey);
            const driveCreationCosts = yield this.estimateAndAssertCostOfDriveCreation(stubDriveData, stubRootFolderData);
            const driveRewardSettings = {
                reward: driveCreationCosts.driveMetaDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            const rootFolderRewardSettings = {
                reward: driveCreationCosts.rootFolderMetaDataBaseReward,
                feeMultiple: this.feeMultiple
            };
            const createDriveResult = yield this.arFsDao.createPrivateDrive(driveName, newPrivateDriveData, driveRewardSettings, rootFolderRewardSettings, 
            // Ownership of drive has been verified by assertValidPassword successfully decrypting
            yield this.wallet.getAddress());
            // IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
            return Promise.resolve({
                created: [
                    {
                        type: 'drive',
                        metadataTxId: createDriveResult.metaDataTrxId,
                        entityId: createDriveResult.driveId,
                        key: common_1.urlEncodeHashKey(createDriveResult.driveKey)
                    },
                    {
                        type: 'folder',
                        metadataTxId: createDriveResult.rootFolderTrxId,
                        entityId: createDriveResult.rootFolderId,
                        key: common_1.urlEncodeHashKey(createDriveResult.driveKey)
                    }
                ],
                tips: [],
                fees: {
                    [`${createDriveResult.metaDataTrxId}`]: createDriveResult.metaDataTrxReward,
                    [`${createDriveResult.rootFolderTrxId}`]: createDriveResult.rootFolderTrxReward
                }
            });
        });
    }
    /**
     * Utility function to estimate and assert the cost of a bulk upload
     *
     * @remarks This function will recurse into the folder contents of the provided folderToUpload
     *
     * @throws when the wallet does not contain enough AR for the bulk upload
     *
     * @param folderToUpload The wrapped folder to estimate the cost of
     * @param driveKey Optional parameter to determine whether to estimate the cost of a private or public upload
     * @param isParentFolder Boolean to determine whether to Assert the total cost. This parameter
     *   is only to be handled as false internally within the recursive function. Always use default
     *   of TRUE when calling this method
     *  */
    estimateAndAssertCostOfBulkUpload(folderToUpload, conflictResolution, driveKey, isParentFolder = true) {
        var e_5, _a, e_6, _b;
        return __awaiter(this, void 0, void 0, function* () {
            let totalPrice = types_1.W(0);
            let totalFilePrice = types_1.W(0);
            if (folderToUpload.existingFileAtDestConflict) {
                // Return an empty estimation, folders CANNOT overwrite files
                return { totalPrice: types_1.W('0'), totalFilePrice: types_1.W('0'), communityWinstonTip: types_1.W('0') };
            }
            // Don't estimate cost of folder metadata if using existing folder
            if (!folderToUpload.existingId) {
                const folderMetadataTrxData = yield (() => __awaiter(this, void 0, void 0, function* () {
                    var _g;
                    const folderName = (_g = folderToUpload.destinationName) !== null && _g !== void 0 ? _g : folderToUpload.getBaseFileName();
                    if (driveKey) {
                        return arfs_trx_data_types_1.ArFSPrivateFolderTransactionData.from(folderName, driveKey);
                    }
                    return new arfs_trx_data_types_1.ArFSPublicFolderTransactionData(folderName);
                }))();
                const metaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(folderMetadataTrxData.sizeOf());
                const parentFolderWinstonPrice = metaDataBaseReward;
                // Assign base costs to folder
                folderToUpload.baseCosts = { metaDataBaseReward: parentFolderWinstonPrice };
                totalPrice = totalPrice.plus(parentFolderWinstonPrice);
            }
            try {
                for (var _c = __asyncValues(folderToUpload.files), _d; _d = yield _c.next(), !_d.done;) {
                    const file = _d.value;
                    if ((conflictResolution === types_2.skipOnConflicts && file.existingId) ||
                        (conflictResolution === types_2.upsertOnConflicts && file.hasSameLastModifiedDate) ||
                        file.existingFolderAtDestConflict) {
                        // File will skipped, don't estimate it; continue the loop
                        continue;
                    }
                    const fileSize = driveKey ? file.encryptedDataSize() : new types_1.ByteCount(file.fileStats.size);
                    const fileDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(fileSize);
                    const stubFileMetaData = driveKey
                        ? yield this.stubPrivateFileMetadata(file, file.getBaseFileName())
                        : this.stubPublicFileMetadata(file, file.getBaseFileName());
                    const metaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(stubFileMetaData.sizeOf());
                    totalPrice = totalPrice.plus(fileDataBaseReward);
                    totalPrice = totalPrice.plus(metaDataBaseReward);
                    totalFilePrice = totalFilePrice.plus(fileDataBaseReward);
                    // Assign base costs to the file
                    file.baseCosts = {
                        fileDataBaseReward: fileDataBaseReward,
                        metaDataBaseReward: metaDataBaseReward
                    };
                }
            }
            catch (e_5_1) { e_5 = { error: e_5_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) yield _a.call(_c);
                }
                finally { if (e_5) throw e_5.error; }
            }
            try {
                for (var _e = __asyncValues(folderToUpload.folders), _f; _f = yield _e.next(), !_f.done;) {
                    const folder = _f.value;
                    const childFolderResults = yield this.estimateAndAssertCostOfBulkUpload(folder, conflictResolution, driveKey, false);
                    totalPrice = totalPrice.plus(childFolderResults.totalPrice);
                    totalFilePrice = totalFilePrice.plus(childFolderResults.totalFilePrice);
                }
            }
            catch (e_6_1) { e_6 = { error: e_6_1 }; }
            finally {
                try {
                    if (_f && !_f.done && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_6) throw e_6.error; }
            }
            const totalWinstonPrice = totalPrice;
            let communityWinstonTip = types_1.W(0);
            if (isParentFolder) {
                if (totalFilePrice.isGreaterThan(types_1.W(0))) {
                    communityWinstonTip = yield this.communityOracle.getCommunityWinstonTip(totalFilePrice);
                }
                // Check and assert balance of the total bulk upload if this folder is the parent folder
                const walletHasBalance = yield this.walletDao.walletHasBalance(this.wallet, communityWinstonTip.plus(totalWinstonPrice));
                if (!walletHasBalance) {
                    const walletBalance = yield this.walletDao.getWalletWinstonBalance(this.wallet);
                    throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for data upload of size ${folderToUpload.getTotalByteCount(driveKey !== undefined)} bytes!`);
                }
            }
            return {
                totalPrice,
                totalFilePrice,
                communityWinstonTip
            };
        });
    }
    assertOwnerAddress(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner.equals(yield this.wallet.getAddress())) {
                throw new Error('Supplied wallet is not the owner of this drive!');
            }
        });
    }
    getPrivateDrive({ driveId, driveKey, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.getOwnerForDriveId(driveId);
            }
            yield this.assertOwnerAddress(owner);
            return this.arFsDao.getPrivateDrive(driveId, driveKey, owner);
        });
    }
    getPrivateFolder({ folderId, driveKey, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFolderId(folderId);
            }
            yield this.assertOwnerAddress(owner);
            return this.arFsDao.getPrivateFolder(folderId, driveKey, owner);
        });
    }
    getPrivateFile({ fileId, driveKey, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFileId(fileId);
            }
            yield this.assertOwnerAddress(owner);
            return this.arFsDao.getPrivateFile(fileId, driveKey, owner);
        });
    }
    /**
     * Lists the children of certain private folder
     * @param {FolderID} folderId the folder ID to list children of
     * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPrivateFolder({ folderId, driveKey, maxDepth = 0, includeRoot = false, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFolderId(folderId);
            }
            yield this.assertOwnerAddress(owner);
            const children = this.arFsDao.listPrivateFolder({ folderId, driveKey, maxDepth, includeRoot, owner });
            return children;
        });
    }
    estimateAndAssertCostOfMoveFile(fileTransactionData) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileMetaTransactionDataReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(fileTransactionData.sizeOf());
            const walletHasBalance = yield this.walletDao.walletHasBalance(this.wallet, fileMetaTransactionDataReward);
            if (!walletHasBalance) {
                const walletBalance = yield this.walletDao.getWalletWinstonBalance(this.wallet);
                throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${fileMetaTransactionDataReward}) for moving file!`);
            }
            return { metaDataBaseReward: fileMetaTransactionDataReward };
        });
    }
    estimateAndAssertCostOfFileUpload(decryptedFileSize, metaData, drivePrivacy) {
        return __awaiter(this, void 0, void 0, function* () {
            let fileSize = decryptedFileSize;
            if (drivePrivacy === 'private') {
                fileSize = this.encryptedDataSize(fileSize);
            }
            let totalPrice = types_1.W(0);
            let fileDataBaseReward = types_1.W(0);
            let communityWinstonTip = types_1.W(0);
            if (fileSize) {
                fileDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(fileSize);
                communityWinstonTip = yield this.communityOracle.getCommunityWinstonTip(fileDataBaseReward);
                const tipReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(new types_1.ByteCount(0));
                totalPrice = totalPrice.plus(fileDataBaseReward);
                totalPrice = totalPrice.plus(communityWinstonTip);
                totalPrice = totalPrice.plus(tipReward);
            }
            const metaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(metaData.sizeOf());
            totalPrice = totalPrice.plus(metaDataBaseReward);
            const totalWinstonPrice = totalPrice;
            const walletHasBalance = yield this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);
            if (!walletHasBalance) {
                const walletBalance = yield this.walletDao.getWalletWinstonBalance(this.wallet);
                throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for data upload of size ${fileSize} bytes!`);
            }
            return {
                fileDataBaseReward: fileDataBaseReward,
                metaDataBaseReward: metaDataBaseReward,
                communityWinstonTip
            };
        });
    }
    estimateAndAssertCostOfFolderUpload(metaData) {
        return __awaiter(this, void 0, void 0, function* () {
            const metaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(metaData.sizeOf());
            const totalWinstonPrice = metaDataBaseReward;
            const walletHasBalance = yield this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);
            if (!walletHasBalance) {
                const walletBalance = yield this.walletDao.getWalletWinstonBalance(this.wallet);
                throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for folder creation!`);
            }
            return {
                metaDataBaseReward: totalWinstonPrice
            };
        });
    }
    estimateAndAssertCostOfDriveCreation(driveMetaData, rootFolderMetaData) {
        return __awaiter(this, void 0, void 0, function* () {
            let totalPrice = types_1.W(0);
            const driveMetaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(driveMetaData.sizeOf());
            totalPrice = totalPrice.plus(driveMetaDataBaseReward);
            const rootFolderMetaDataBaseReward = yield this.priceEstimator.getBaseWinstonPriceForByteCount(rootFolderMetaData.sizeOf());
            totalPrice = totalPrice.plus(rootFolderMetaDataBaseReward);
            const totalWinstonPrice = totalPrice;
            const walletHasBalance = yield this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);
            if (!walletHasBalance) {
                const walletBalance = yield this.walletDao.getWalletWinstonBalance(this.wallet);
                throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${totalPrice}) for drive creation!`);
            }
            return {
                driveMetaDataBaseReward,
                rootFolderMetaDataBaseReward
            };
        });
    }
    getDriveIdForFileId(fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.arFsDao.getDriveIdForFileId(fileId);
        });
    }
    getDriveIdForFolderId(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.arFsDao.getDriveIdForFolderId(folderId);
        });
    }
    // Provides for stubbing metadata during cost estimations since the data trx ID won't yet be known
    stubPublicFileMetadata(wrappedFile, destinationFileName) {
        const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();
        return new arfs_trx_data_types_1.ArFSPublicFileMetadataTransactionData(destinationFileName !== null && destinationFileName !== void 0 ? destinationFileName : wrappedFile.getBaseFileName(), fileSize, lastModifiedDateMS, types_1.stubTransactionID, dataContentType);
    }
    // Provides for stubbing metadata during cost estimations since the data trx and File IDs won't yet be known
    stubPrivateFileMetadata(wrappedFile, destinationFileName) {
        return __awaiter(this, void 0, void 0, function* () {
            const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();
            return yield arfs_trx_data_types_1.ArFSPrivateFileMetadataTransactionData.from(destinationFileName !== null && destinationFileName !== void 0 ? destinationFileName : wrappedFile.getBaseFileName(), fileSize, lastModifiedDateMS, types_1.stubTransactionID, dataContentType, constants_1.fakeEntityId, yield crypto_1.deriveDriveKey('stubPassword', `${constants_1.fakeEntityId}`, JSON.stringify(this.wallet.getPrivateKey())));
        });
    }
    assertValidPassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.arFsDao.assertValidPassword(password);
        });
    }
}
exports.ArDrive = ArDrive;
