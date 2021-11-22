"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assumedMetadataTxARPrice = exports.communityTxId = exports.minArDriveCommunityARTip = exports.fakeEntityId = exports.defaultCipher = exports.webAppName = exports.appName = exports.graphQLURL = exports.gatewayURL = exports.stagingAppUrl = exports.prodAppUrl = exports.DEFAULT_APP_VERSION = exports.DEFAULT_APP_NAME = exports.CURRENT_ARFS_VERSION = exports.ArFS_O_11 = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: DEFAULT_APP_VERSION } = require('../../package.json');
exports.DEFAULT_APP_VERSION = DEFAULT_APP_VERSION;
const types_1 = require("../types");
exports.ArFS_O_11 = '0.11';
exports.CURRENT_ARFS_VERSION = exports.ArFS_O_11;
exports.DEFAULT_APP_NAME = 'ArDrive-Core';
exports.prodAppUrl = 'https://app.ardrive.io';
exports.stagingAppUrl = 'https://staging.ardrive.io';
exports.gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';
exports.graphQLURL = 'https://arweave.net/graphql';
exports.appName = 'ArDrive-Desktop';
exports.webAppName = 'ArDrive-Web';
exports.defaultCipher = 'AES256-GCM';
exports.fakeEntityId = types_1.EID('00000000-0000-0000-0000-000000000000');
/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 *
 * Voted on by the ArDrive community (vote #82):
 * https://community.xyz/#-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ/votes/
 */
exports.minArDriveCommunityARTip = 0.00001;
// ArDrive Profit Sharing Community Smart Contract
exports.communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';
/** Estimated AR price for most metadata transactions */
exports.assumedMetadataTxARPrice = 0.0000025;
//Note: Just to easily copy paste later where it's needed
//import {prodAppUrl,stagingAppUrl,gatewayURL,appName,webAppName,appVersion,arFSVersion,cipher} from './constants';
