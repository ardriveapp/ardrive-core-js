// Public web entry: full API surface compatible with Node.js version

// Web-specific implementations (crypto and wallet only)
export {
	aesGcmEncrypt,
	aesGcmDecrypt,
	deriveDriveKeyV2,
	deriveFileKey,
	generateWalletSignatureV2,
	type Bytes
} from './crypto_web';
export { JWKWalletWeb } from './jwk_wallet_web';
export { wrapFile, wrapFiles, type WebFileToUpload } from './arfs_file_wrapper_web';
export {
	ArDriveWeb,
	type ArDriveWebSettings,
	type UploadPublicFileParams,
	type UploadPublicFileResult
} from './ardrive_web';

// Core classes that work in browser (reuse instead of duplicating)
export { GatewayAPI } from '../utils/gateway_api';
export { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';
export { ArDriveAnonymous } from '../ardrive_anonymous';
export { arDriveAnonymousFactory, arDriveFactory } from './ardrive_factory_web';

// Browser-compatible wallet interface
export { Wallet } from '../wallet';

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
export * from '../utils/wallet_utils';

// Re-export ArFS file wrapper (browser-compatible)
export * from '../arfs/arfs_file_wrapper';
