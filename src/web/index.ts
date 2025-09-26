// Public web entry: full API surface compatible with Node.js version

// Web-specific implementations
export { GatewayAPIWeb } from './gateway_api_web';
export { ArFSMetadataCacheWeb } from './arfs_metadata_cache_web';
export { wrapFile, wrapFiles, type WebFileToUpload } from './arfs_file_wrapper_web';
export {
	aesGcmEncrypt,
	aesGcmDecrypt,
	deriveDriveKeyV2,
	deriveFileKey,
	generateWalletSignatureV2,
	type Bytes
} from './crypto_web';
export {
	ArFSDAOAnonymousWeb,
	type WebPublicDrive,
	type WebPublicFolder,
	type WebPublicFile,
	type WebPublicEntity
} from './arfsdao_anonymous_web';
export { ArDriveAnonymousWeb } from './ardrive_anonymous_web';
export { arDriveAnonymousFactory, arDriveFactory } from './ardrive_factory_web';
export {
	ArDriveWeb,
	type ArDriveWebSettings,
	type UploadPublicFileParams,
	type UploadPublicFileResult
} from './ardrive_web';
export { JWKWalletWeb } from './jwk_wallet_web';

// Re-export all core types (browser-compatible)
export * from '../types';

// Re-export ArFS entities and builders (browser-compatible)
export * from '../arfs/arfs_entities';
export * from '../arfs/arfs_entity_result_factory';
export * from '../arfs/arfs_meta_data_factory';
export * from '../arfs/tx/arfs_prototypes';
export * from '../arfs/tx/arfs_tx_data_types';
export * from '../arfs/folder_hierarchy';
export * from '../arfs/arfs_builders/arfs_builders';
export * from '../arfs/arfs_builders/arfs_drive_builders';
export * from '../arfs/arfs_builders/arfs_file_builders';
export * from '../arfs/arfs_builders/arfs_folder_builders';
export * from '../arfs/private_key_data';

// Re-export pricing (browser-compatible)
export * from '../pricing/ar_data_price';
export * from '../pricing/ar_data_price_estimator';
export * from '../pricing/ar_data_price_chunk_estimator';
export * from '../pricing/ar_data_price_oracle_estimator';
export * from '../pricing/arweave_oracle';
export * from '../pricing/data_price_regression';
export * from '../pricing/gateway_oracle';

// Re-export community features (browser-compatible)
export * from '../community/ardrive_community_oracle';
export * from '../community/ardrive_contract_oracle';
export * from '../community/community_oracle';
export * from '../community/contract_oracle';
export * from '../community/contract_types';
export * from '../community/smartweave_contract_oracle';
export * from '../community/pds_contract_oracle';

// Re-export browser-compatible utilities
export * from '../utils/common';
export * from '../utils/error_message';
export * from '../utils/filter_methods';
export * from '../utils/mapper_functions';
export * from '../utils/query';
export * from '../utils/sort_functions';
export * from '../utils/upload_conflict_resolution';
