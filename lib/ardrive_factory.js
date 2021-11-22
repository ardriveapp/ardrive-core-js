"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.arDriveAnonymousFactory = exports.arDriveFactory = void 0;
const arweave_1 = __importDefault(require("arweave"));
const ardrive_community_oracle_1 = require("./community/ardrive_community_oracle");
const arfsdao_1 = require("./arfs/arfsdao");
const arfsdao_anonymous_1 = require("./arfs/arfsdao_anonymous");
const constants_1 = require("./utils/constants");
const ardrive_1 = require("./ardrive");
const ardrive_anonymous_1 = require("./ardrive_anonymous");
const wallet_dao_1 = require("./wallet_dao");
const ar_data_price_chunk_estimator_1 = require("./pricing/ar_data_price_chunk_estimator");
const defaultArweave = arweave_1.default.init({
    host: 'arweave.net',
    //host: 'arweave.dev', // Arweave Dev Gateway
    port: 443,
    protocol: 'https',
    timeout: 600000
});
function arDriveFactory({ arweave = defaultArweave, priceEstimator = new ar_data_price_chunk_estimator_1.ARDataPriceChunkEstimator(true), communityOracle = new ardrive_community_oracle_1.ArDriveCommunityOracle(arweave), wallet, walletDao, dryRun, feeMultiple, arfsDao, appName = constants_1.DEFAULT_APP_NAME, appVersion = constants_1.DEFAULT_APP_VERSION }) {
    return new ardrive_1.ArDrive(wallet, walletDao !== null && walletDao !== void 0 ? walletDao : new wallet_dao_1.WalletDAO(arweave, appName, appVersion), arfsDao !== null && arfsDao !== void 0 ? arfsDao : new arfsdao_1.ArFSDAO(wallet, arweave, dryRun, appName, appVersion), communityOracle, appName, appVersion, priceEstimator, feeMultiple, dryRun);
}
exports.arDriveFactory = arDriveFactory;
function arDriveAnonymousFactory({ arweave = defaultArweave, appName = constants_1.DEFAULT_APP_NAME, appVersion = constants_1.DEFAULT_APP_VERSION }) {
    return new ardrive_anonymous_1.ArDriveAnonymous(new arfsdao_anonymous_1.ArFSDAOAnonymous(arweave, appName, appVersion));
}
exports.arDriveAnonymousFactory = arDriveAnonymousFactory;
