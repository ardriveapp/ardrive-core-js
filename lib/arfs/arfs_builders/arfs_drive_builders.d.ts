import Arweave from 'arweave';
import { PrivateKeyData } from '../private_key_data';
import { CipherIV, DriveKey, FolderID, EntityID, DriveAuthMode, DrivePrivacy, GQLNodeInterface, GQLTagInterface } from '../../types';
import { ArFSPublicDrive, ArFSPrivateDrive, ArFSDriveEntity } from '../arfs_entities';
import { ArFSMetadataEntityBuilder, ArFSMetadataEntityBuilderParams, ArFSPrivateMetadataEntityBuilderParams } from './arfs_builders';
export declare class ArFSPublicDriveBuilder extends ArFSMetadataEntityBuilder<ArFSPublicDrive> {
    drivePrivacy?: DrivePrivacy;
    rootFolderId?: FolderID;
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave): ArFSPublicDriveBuilder;
    getGqlQueryParameters(): GQLTagInterface[];
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
    protected buildEntity(): Promise<ArFSPublicDrive>;
}
export declare class ArFSPrivateDriveBuilder extends ArFSMetadataEntityBuilder<ArFSPrivateDrive> {
    drivePrivacy?: DrivePrivacy;
    rootFolderId?: FolderID;
    driveAuthMode?: DriveAuthMode;
    cipher?: string;
    cipherIV?: CipherIV;
    private readonly driveKey;
    constructor({ entityId: driveId, arweave, key: driveKey, owner }: ArFSPrivateMetadataEntityBuilderParams);
    getGqlQueryParameters(): GQLTagInterface[];
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave, driveKey: DriveKey): ArFSPrivateDriveBuilder;
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
    protected buildEntity(): Promise<ArFSPrivateDrive>;
}
export declare class EncryptedEntityID extends EntityID {
    constructor();
}
export interface SafeArFSPrivateMetadataEntityBuilderParams extends ArFSMetadataEntityBuilderParams {
    privateKeyData: PrivateKeyData;
}
export declare class SafeArFSDriveBuilder extends ArFSMetadataEntityBuilder<ArFSDriveEntity> {
    drivePrivacy?: DrivePrivacy;
    rootFolderId?: FolderID;
    driveAuthMode?: DriveAuthMode;
    cipher?: string;
    cipherIV?: CipherIV;
    private readonly privateKeyData;
    constructor({ entityId: driveId, arweave, privateKeyData }: SafeArFSPrivateMetadataEntityBuilderParams);
    getGqlQueryParameters(): GQLTagInterface[];
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave, privateKeyData: PrivateKeyData): SafeArFSDriveBuilder;
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
    protected buildEntity(): Promise<ArFSDriveEntity>;
}
