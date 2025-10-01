// Public web entry: full API surface compatible with Node.js version

// Web-specific implementations (crypto and wallet only)
export {
	aesGcmEncrypt,
	aesGcmDecrypt,
	deriveDriveKeyV2,
	deriveDriveKeyWithSigner,
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

// Re-export signer types and classes for convenience
export type { ArweaveSigner, Signer } from '@dha-team/arbundles';
export { ArconnectSigner } from '@dha-team/arbundles';

// Export ArDriveSigner interface for browser wallet implementations
export type { ArDriveSigner, DataItemToSign, SignDataItemOptions } from './ardrive_signer';
export { isArDriveSigner } from './ardrive_signer';

// Browser-compatible implementations
export { WalletDAOWeb } from './wallet_dao_web';
export { CommunityOracleWeb } from './community_oracle_web';

// Core classes that work in browser (reuse instead of duplicating)
export { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';
// Note: ArFSDAO is not exported - it requires Node.js-specific Arweave types
// Use arDriveFactory() which creates ArFSDAO internally with browser-compatible dependencies
export { ArDriveAnonymous } from '../ardrive_anonymous';
export { GatewayAPI } from '../utils/gateway_api';
// Note: ArDrive class is not exported directly - use arDriveFactory() instead
// ArDrive requires Node.js-specific WalletDAO, so we provide a factory that uses browser-compatible dependencies
// Export web-specific factories
export { arDriveAnonymousFactory, arDriveFactory } from './ardrive_factory_web';
export type { ArDriveSettingsAnonymousWeb, ArDriveSettingsWeb } from './ardrive_factory_web';

// Browser-compatible wallet interface
export { Wallet } from '../wallet';

// Re-export core types (browser-compatible)
// which transitively pulls in smartweave. Export specific type modules instead:
export * from '../types/ar';
// Note: ardrive_types imports from arfsdao_types which has Node.js dependencies
// Note: arfsdao_types imports from arweave/node/lib/transaction and upload_planner_types
export * from '../types/arweave_address';
export * from '../types/base_Types';
export * from '../types/byte_count';
export * from '../types/cipher_iv_query_result';
export * from '../types/custom_metadata_types';
export * from '../types/entity_id';
export * from '../types/entity_key';
export * from '../types/equatable';
export * from '../types/exceptions';
export * from '../types/fee_multiple';
export * from '../types/gql_Types';
export * from '../types/seed_phrase';
export * from '../types/transaction_id';
export * from '../types/type_conditionals';
export * from '../types/type_guards';
export * from '../types/types';
export * from '../types/unix_time';
export * from '../types/upload_conflict_types';
export * from '../types/winston';
// Note: upload_planner_types is NOT exported as it requires CommunityOracle

// Re-export ArFS entities and builders (browser-compatible)
export * from '../arfs/arfs_entities';
export * from '../arfs/arfs_entity_result_factory';
// Note: arfs_meta_data_factory imports from arfs/tx which requires Node.js Arweave types
// Note: arfs/tx modules require Node.js Arweave types (Transaction, CreateTransactionInterface)
// These are used internally by arDriveFactory() but not exported for direct use
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
// Note: Community contract modules require Node.js dependencies (Arweave, smartweave)
// Use CommunityOracleWeb for browser environments instead
// Export only the interface, not contract types or implementations
export type { CommunityOracle } from '../community/community_oracle';

// Re-export browser-compatible utilities
// Note: utils/common requires Node.js Arweave types (JWKInterface from arweave/node/lib/wallet)
// Individual utilities can be imported if needed, but not the whole module
export * from '../utils/error_message';
export * from '../utils/filter_methods';
export * from '../utils/mapper_functions';
export * from '../utils/query';
export * from '../utils/sort_functions';
export * from '../utils/upload_conflict_resolution';
export * from '../utils/wallet_utils';

// Re-export ArFS file wrapper (browser-compatible)
export * from '../arfs/arfs_file_wrapper';
