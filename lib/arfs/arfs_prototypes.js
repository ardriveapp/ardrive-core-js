"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSPrivateFileDataPrototype = exports.ArFSPublicFileDataPrototype = exports.ArFSFileDataPrototype = exports.ArFSPrivateFileMetaDataPrototype = exports.ArFSPublicFileMetaDataPrototype = exports.ArFSFileMetaDataPrototype = exports.ArFSPrivateFolderMetaDataPrototype = exports.ArFSPublicFolderMetaDataPrototype = exports.ArFSFolderMetaDataPrototype = exports.ArFSPrivateDriveMetaDataPrototype = exports.ArFSPublicDriveMetaDataPrototype = exports.ArFSDriveMetaDataPrototype = exports.ArFSEntityMetaDataPrototype = exports.ArFSObjectMetadataPrototype = void 0;
const types_1 = require("../types");
class ArFSObjectMetadataPrototype {
    // Implementation should throw if any protected tags are identified
    assertProtectedTags(tags) {
        tags.forEach((tag) => {
            if (this.protectedTags.includes(tag.name)) {
                throw new Error(`Tag ${tag.name} is protected and cannot be used in this context!`);
            }
        });
    }
}
exports.ArFSObjectMetadataPrototype = ArFSObjectMetadataPrototype;
class ArFSEntityMetaDataPrototype extends ArFSObjectMetadataPrototype {
    constructor() {
        super();
        // Get the current time so the app can display the "created" data later on
        this.unixTime = new types_1.UnixTime(Math.round(Date.now() / 1000));
    }
}
exports.ArFSEntityMetaDataPrototype = ArFSEntityMetaDataPrototype;
class ArFSDriveMetaDataPrototype extends ArFSEntityMetaDataPrototype {
    get protectedTags() {
        return ['Content-Type', 'Entity-Type', 'Unix-Time', 'Drive-Id', 'Drive-Privacy'];
    }
    addTagsToTransaction(transaction) {
        transaction.addTag('Content-Type', this.contentType);
        transaction.addTag('Entity-Type', 'drive');
        transaction.addTag('Unix-Time', this.unixTime.toString());
        transaction.addTag('Drive-Id', `${this.driveId}`);
        transaction.addTag('Drive-Privacy', this.privacy);
    }
}
exports.ArFSDriveMetaDataPrototype = ArFSDriveMetaDataPrototype;
class ArFSPublicDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
    constructor(objectData, driveId) {
        super();
        this.objectData = objectData;
        this.driveId = driveId;
        this.privacy = 'public';
        this.contentType = types_1.JSON_CONTENT_TYPE;
    }
}
exports.ArFSPublicDriveMetaDataPrototype = ArFSPublicDriveMetaDataPrototype;
class ArFSPrivateDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
    constructor(driveId, objectData) {
        super();
        this.driveId = driveId;
        this.objectData = objectData;
        this.privacy = 'private';
        this.contentType = types_1.PRIVATE_CONTENT_TYPE;
    }
    get protectedTags() {
        return ['Cipher', 'Cipher-IV', 'Drive-Auth-Mode', ...super.protectedTags];
    }
    addTagsToTransaction(transaction) {
        super.addTagsToTransaction(transaction);
        transaction.addTag('Cipher', this.objectData.cipher);
        transaction.addTag('Cipher-IV', this.objectData.cipherIV);
        transaction.addTag('Drive-Auth-Mode', this.objectData.driveAuthMode);
    }
}
exports.ArFSPrivateDriveMetaDataPrototype = ArFSPrivateDriveMetaDataPrototype;
class ArFSFolderMetaDataPrototype extends ArFSEntityMetaDataPrototype {
    get protectedTags() {
        return ['Content-Type', 'Entity-Type', 'Unix-Time', 'Drive-Id', 'Folder-Id', 'Parent-Folder-Id'];
    }
    addTagsToTransaction(transaction) {
        transaction.addTag('Content-Type', this.contentType);
        transaction.addTag('Entity-Type', 'folder');
        transaction.addTag('Unix-Time', this.unixTime.toString());
        transaction.addTag('Drive-Id', `${this.driveId}`);
        transaction.addTag('Folder-Id', `${this.folderId}`);
        if (this.parentFolderId) {
            // Root folder transactions do not have Parent-Folder-Id
            transaction.addTag('Parent-Folder-Id', `${this.parentFolderId}`);
        }
    }
}
exports.ArFSFolderMetaDataPrototype = ArFSFolderMetaDataPrototype;
class ArFSPublicFolderMetaDataPrototype extends ArFSFolderMetaDataPrototype {
    constructor(objectData, driveId, folderId, parentFolderId) {
        super();
        this.objectData = objectData;
        this.driveId = driveId;
        this.folderId = folderId;
        this.parentFolderId = parentFolderId;
        this.contentType = types_1.JSON_CONTENT_TYPE;
    }
}
exports.ArFSPublicFolderMetaDataPrototype = ArFSPublicFolderMetaDataPrototype;
class ArFSPrivateFolderMetaDataPrototype extends ArFSFolderMetaDataPrototype {
    constructor(driveId, folderId, objectData, parentFolderId) {
        super();
        this.driveId = driveId;
        this.folderId = folderId;
        this.objectData = objectData;
        this.parentFolderId = parentFolderId;
        this.privacy = 'private';
        this.contentType = types_1.PRIVATE_CONTENT_TYPE;
    }
    get protectedTags() {
        return ['Cipher', 'Cipher-IV', ...super.protectedTags];
    }
    addTagsToTransaction(transaction) {
        super.addTagsToTransaction(transaction);
        transaction.addTag('Cipher', this.objectData.cipher);
        transaction.addTag('Cipher-IV', this.objectData.cipherIV);
    }
}
exports.ArFSPrivateFolderMetaDataPrototype = ArFSPrivateFolderMetaDataPrototype;
class ArFSFileMetaDataPrototype extends ArFSEntityMetaDataPrototype {
    get protectedTags() {
        return ['Content-Type', 'Entity-Type', 'Unix-Time', 'Drive-Id', 'File-Id', 'Parent-Folder-Id'];
    }
    addTagsToTransaction(transaction) {
        transaction.addTag('Content-Type', this.contentType);
        transaction.addTag('Entity-Type', 'file');
        transaction.addTag('Unix-Time', this.unixTime.toString());
        transaction.addTag('Drive-Id', `${this.driveId}`);
        transaction.addTag('File-Id', `${this.fileId}`);
        transaction.addTag('Parent-Folder-Id', `${this.parentFolderId}`);
    }
}
exports.ArFSFileMetaDataPrototype = ArFSFileMetaDataPrototype;
class ArFSPublicFileMetaDataPrototype extends ArFSFileMetaDataPrototype {
    constructor(objectData, driveId, fileId, parentFolderId) {
        super();
        this.objectData = objectData;
        this.driveId = driveId;
        this.fileId = fileId;
        this.parentFolderId = parentFolderId;
        this.contentType = types_1.JSON_CONTENT_TYPE;
    }
}
exports.ArFSPublicFileMetaDataPrototype = ArFSPublicFileMetaDataPrototype;
class ArFSPrivateFileMetaDataPrototype extends ArFSFileMetaDataPrototype {
    constructor(objectData, driveId, fileId, parentFolderId) {
        super();
        this.objectData = objectData;
        this.driveId = driveId;
        this.fileId = fileId;
        this.parentFolderId = parentFolderId;
        this.contentType = types_1.PRIVATE_CONTENT_TYPE;
    }
    get protectedTags() {
        return ['Cipher', 'Cipher-IV', ...super.protectedTags];
    }
    addTagsToTransaction(transaction) {
        super.addTagsToTransaction(transaction);
        transaction.addTag('Cipher', this.objectData.cipher);
        transaction.addTag('Cipher-IV', this.objectData.cipherIV);
    }
}
exports.ArFSPrivateFileMetaDataPrototype = ArFSPrivateFileMetaDataPrototype;
class ArFSFileDataPrototype extends ArFSObjectMetadataPrototype {
    get protectedTags() {
        return ['Content-Type'];
    }
    addTagsToTransaction(transaction) {
        transaction.addTag('Content-Type', this.contentType);
    }
}
exports.ArFSFileDataPrototype = ArFSFileDataPrototype;
class ArFSPublicFileDataPrototype extends ArFSFileDataPrototype {
    constructor(objectData, contentType) {
        super();
        this.objectData = objectData;
        this.contentType = contentType;
    }
}
exports.ArFSPublicFileDataPrototype = ArFSPublicFileDataPrototype;
class ArFSPrivateFileDataPrototype extends ArFSFileDataPrototype {
    constructor(objectData) {
        super();
        this.objectData = objectData;
        this.contentType = types_1.PRIVATE_CONTENT_TYPE;
    }
    get protectedTags() {
        return ['Cipher', 'Cipher-IV', ...super.protectedTags];
    }
    addTagsToTransaction(transaction) {
        super.addTagsToTransaction(transaction);
        transaction.addTag('Cipher', this.objectData.cipher);
        transaction.addTag('Cipher-IV', this.objectData.cipherIV);
    }
}
exports.ArFSPrivateFileDataPrototype = ArFSPrivateFileDataPrototype;
