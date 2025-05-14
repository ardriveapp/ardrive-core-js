import { EntityID, Winston, FeeMultiple } from '.';
import { EntityKey } from './entity_key';

export const JSON_CONTENT_TYPE = 'application/json';
export const PRIVATE_CONTENT_TYPE = 'application/octet-stream';
export const MANIFEST_CONTENT_TYPE = 'application/x.arweave-manifest+json';

export type PublicKey = string;

export type NetworkReward = Winston;

export type FolderID = EntityID;
export type FileID = EntityID;
export type DriveID = EntityID;
export type AnyEntityID = DriveID | FolderID | FileID;
export type EntityIDTypeForEntityType<T extends 'file' | 'folder'> = T extends 'file' ? FileID : FolderID;

export type CipherIV = string;
export type FileKey = EntityKey;

export type DataContentType = string;

export type SourceUri = string;
export type EntityName = string;

export type JsonSerializable =
	| string
	| number
	| boolean
	| null
	| { [member: string]: JsonSerializable }
	| JsonSerializable[];

/** Data JSON of a MetaData Transaction */
export type EntityMetaDataTransactionData = Record<string, JsonSerializable>;

export interface ArDriveCommunityTip {
	tipPercentage: number;
	minWinstonFee: Winston;
}

export type TipType = 'data upload';

export type GQLCursor = string;

export type RewardSettings = {
	reward?: Winston;
	feeMultiple?: FeeMultiple;
};

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
export type MakeOptional<T, K> = Omit<T, K> & Partial<T>;
export type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

export enum DriveSignatureType {
	v1 = 1,
	v2 = 2
}

export enum SignatureFormat {
	v1 = '1'
}

export type DriveSignatureInfo = {
	driveSignatureType: DriveSignatureType;
	encryptedSignatureData?: {
		cipherIV: string;
		encryptedData: Buffer;
	};
};
