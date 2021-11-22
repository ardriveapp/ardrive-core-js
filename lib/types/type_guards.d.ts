import { UnionOfObjectPropertiesType } from './type_conditionals';
export declare const cipherTypeValues: {
    readonly AES_GCM_256: "aes-gcm-256";
    readonly AES_256_GCM: "AES256-GCM";
};
export declare const entityTypeValues: {
    readonly DRIVE: "drive";
    readonly FILE: "file";
    readonly FOLDER: "folder";
};
export declare const contentTypeValues: {
    readonly APPLICATION_JSON: "application/json";
    readonly APPLICATION_OCTET_STREAM: "application/octet-stream";
};
export declare const drivePrivacyValues: {
    readonly PRIVATE: "private";
    readonly PUBLIC: "public";
};
export declare const driveAuthModeValues: {
    readonly PASSWORD: "password";
};
export declare const driveSharingValues: {
    readonly SHARED: "shared";
    readonly PERSONAL: "personal";
};
export declare const syncStatusValues: {
    readonly READY_TO_DOWNLOAD: 0;
    readonly READY_TO_UPLOAD: 1;
    readonly GETTING_MINED: 2;
    readonly SUCCESSFULLY_UPLOADED: 3;
};
export declare const yesNoIntegerValues: {
    readonly NO: 0;
    readonly YES: 1;
};
export declare type CipherType = UnionOfObjectPropertiesType<typeof cipherTypeValues>;
export declare type EntityType = UnionOfObjectPropertiesType<typeof entityTypeValues>;
export declare type ContentType = UnionOfObjectPropertiesType<typeof contentTypeValues>;
export declare type DrivePrivacy = UnionOfObjectPropertiesType<typeof drivePrivacyValues>;
export declare type DriveAuthMode = UnionOfObjectPropertiesType<typeof driveAuthModeValues>;
export declare type DriveSharing = UnionOfObjectPropertiesType<typeof driveSharingValues>;
export declare type SyncStatus = UnionOfObjectPropertiesType<typeof syncStatusValues>;
export declare type YesNoInteger = UnionOfObjectPropertiesType<typeof yesNoIntegerValues>;
