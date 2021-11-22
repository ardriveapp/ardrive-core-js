/// <reference types="node" />
import Arweave from 'arweave';
import { ArweaveAddress, CipherIV, DriveKey, FileID, ByteCount, TransactionID, UnixTime, ContentType, GQLNodeInterface, GQLTagInterface } from '../../types';
import { ArFSPublicFile, ArFSPrivateFile } from '../arfs_entities';
import { ArFSFileOrFolderBuilder } from './arfs_builders';
export declare abstract class ArFSFileBuilder<T extends ArFSPublicFile | ArFSPrivateFile> extends ArFSFileOrFolderBuilder<T> {
    size?: ByteCount;
    lastModifiedDate?: UnixTime;
    dataTxId?: TransactionID;
    dataContentType?: ContentType;
    getGqlQueryParameters(): GQLTagInterface[];
}
export declare class ArFSPublicFileBuilder extends ArFSFileBuilder<ArFSPublicFile> {
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave): ArFSPublicFileBuilder;
    protected buildEntity(): Promise<ArFSPublicFile>;
}
export declare class ArFSPrivateFileBuilder extends ArFSFileBuilder<ArFSPrivateFile> {
    readonly fileId: FileID;
    readonly arweave: Arweave;
    private readonly driveKey;
    readonly owner?: ArweaveAddress | undefined;
    readonly fileKey?: Buffer | undefined;
    cipher?: string;
    cipherIV?: CipherIV;
    constructor(fileId: FileID, arweave: Arweave, driveKey: DriveKey, owner?: ArweaveAddress | undefined, fileKey?: Buffer | undefined);
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave, driveKey: DriveKey): ArFSPrivateFileBuilder;
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
    protected buildEntity(): Promise<ArFSPrivateFile>;
}
