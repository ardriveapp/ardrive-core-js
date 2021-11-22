"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yesNoIntegerValues = exports.syncStatusValues = exports.driveSharingValues = exports.driveAuthModeValues = exports.drivePrivacyValues = exports.contentTypeValues = exports.entityTypeValues = exports.cipherTypeValues = void 0;
exports.cipherTypeValues = {
    AES_GCM_256: 'aes-gcm-256',
    AES_256_GCM: 'AES256-GCM'
};
exports.entityTypeValues = {
    DRIVE: 'drive',
    FILE: 'file',
    FOLDER: 'folder'
};
exports.contentTypeValues = {
    APPLICATION_JSON: 'application/json',
    APPLICATION_OCTET_STREAM: 'application/octet-stream'
};
exports.drivePrivacyValues = {
    PRIVATE: 'private',
    PUBLIC: 'public'
};
exports.driveAuthModeValues = {
    PASSWORD: 'password'
};
exports.driveSharingValues = {
    SHARED: 'shared',
    PERSONAL: 'personal'
};
exports.syncStatusValues = {
    READY_TO_DOWNLOAD: 0,
    READY_TO_UPLOAD: 1,
    GETTING_MINED: 2,
    SUCCESSFULLY_UPLOADED: 3
};
exports.yesNoIntegerValues = {
    NO: 0,
    YES: 1
};
