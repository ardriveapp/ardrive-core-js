export type emptyString = '';
export const emptyString: emptyString = '';
export const AES256_GCM = 'AES256-GCM';
export type cipherType = 'aes-gcm-256' | 'AES256-GCM';
export enum entityType {
	DRIVE = 'drive',
	FILE = 'file',
	FOLDER = 'folder',
	EMPTY = ''
}
export enum contentType {
	APPLICATION_JSON = 'application/json',
	APPLICATION_OCTET_STREAM = 'application/octet-stream',
	EMPTY = ''
}
export enum drivePrivacy {
	PRIVATE = 'private',
	PUBLIC = 'public',
	EMPTY = ''
}
export type driveAuthMode = 'password';
export enum driveSharing {
	SHARED = 'shared',
	PERSONAL = 'personal'
}
export enum syncStatus {
	READY_TO_DOWNLOAD = 0,
	READY_TO_UPLOAD = 1,
	GETTING_MINED = 2,
	SUCCESSFULLY_UPLOADED = 3
}
export enum yesNoInteger {
	NO = 0,
	YES = 1
}
