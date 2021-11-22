import Arweave from 'arweave';
import { ArFSFileOrFolderBuilder } from './arfs_builders';
import { ArweaveAddress, CipherIV, DriveKey, FolderID, EntityID, GQLNodeInterface, GQLTagInterface } from '../../types';
import { ArFSPublicFolder, ArFSPrivateFolder } from '../arfs_entities';
export declare const ROOT_FOLDER_ID_PLACEHOLDER = "root folder";
export declare class RootFolderID extends EntityID {
    constructor();
}
export declare abstract class ArFSFolderBuilder<T extends ArFSPublicFolder | ArFSPrivateFolder> extends ArFSFileOrFolderBuilder<T> {
    getGqlQueryParameters(): GQLTagInterface[];
}
export declare class ArFSPublicFolderBuilder extends ArFSFolderBuilder<ArFSPublicFolder> {
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave): ArFSPublicFolderBuilder;
    protected buildEntity(): Promise<ArFSPublicFolder>;
}
export declare class ArFSPrivateFolderBuilder extends ArFSFolderBuilder<ArFSPrivateFolder> {
    readonly folderId: FolderID;
    readonly arweave: Arweave;
    protected readonly driveKey: DriveKey;
    readonly owner?: ArweaveAddress | undefined;
    cipher?: string;
    cipherIV?: CipherIV;
    constructor(folderId: FolderID, arweave: Arweave, driveKey: DriveKey, owner?: ArweaveAddress | undefined);
    static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave, driveKey: DriveKey): ArFSPrivateFolderBuilder;
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
    protected buildEntity(): Promise<ArFSPrivateFolder>;
}
