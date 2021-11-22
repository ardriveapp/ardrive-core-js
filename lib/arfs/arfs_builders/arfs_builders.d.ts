import Arweave from 'arweave';
import { ArFSEntity, ArFSFileOrFolderEntity } from '../arfs_entities';
import { ArweaveAddress, DriveID, AnyEntityID, EntityKey, FolderID, TransactionID, UnixTime, ContentType, EntityType, GQLNodeInterface, GQLTagInterface } from '../../types';
export interface ArFSMetadataEntityBuilderParams {
    entityId: AnyEntityID;
    arweave: Arweave;
    owner?: ArweaveAddress;
}
export declare type ArFSPublicMetadataEntityBuilderParams = ArFSMetadataEntityBuilderParams;
export interface ArFSPrivateMetadataEntityBuilderParams extends ArFSMetadataEntityBuilderParams {
    key: EntityKey;
}
export declare type ArFSMetadataEntityBuilderFactoryFunction<T extends ArFSEntity, B extends ArFSMetadataEntityBuilder<T>, P extends ArFSMetadataEntityBuilderParams> = (params: P) => B;
export declare abstract class ArFSMetadataEntityBuilder<T extends ArFSEntity> {
    appName?: string;
    appVersion?: string;
    arFS?: string;
    contentType?: ContentType;
    driveId?: DriveID;
    entityType?: EntityType;
    name?: string;
    txId?: TransactionID;
    unixTime?: UnixTime;
    protected readonly entityId: AnyEntityID;
    protected readonly arweave: Arweave;
    protected readonly owner?: ArweaveAddress;
    constructor({ entityId, arweave, owner }: ArFSMetadataEntityBuilderParams);
    abstract getGqlQueryParameters(): GQLTagInterface[];
    protected abstract buildEntity(): Promise<T>;
    /**
     * Parses data for builder fields from either the provided GQL tags, or from a fresh request to Arweave for tag data
     *
     * @param node (optional) a pre-fetched GQL node containing the txID and tags that will be parsed out of the on-chain data
     *
     * @param owner (optional) filter all transactions out by owner's public arweave address
     *
     * @returns an array of unparsed tags
     */
    protected parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]>;
    build(node?: GQLNodeInterface): Promise<T>;
}
export declare abstract class ArFSFileOrFolderBuilder<T extends ArFSFileOrFolderEntity> extends ArFSMetadataEntityBuilder<T> {
    parentFolderId?: FolderID;
    protected parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]>;
}
