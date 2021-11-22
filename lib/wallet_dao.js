"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletDAO = void 0;
const jwk_wallet_1 = require("./jwk_wallet");
const types_1 = require("./types");
const mnemonicKeys = __importStar(require("arweave-mnemonic-keys"));
class WalletDAO {
    constructor(arweave, appName = types_1.DEFAULT_APP_NAME, appVersion = types_1.DEFAULT_APP_VERSION) {
        this.arweave = arweave;
        this.appName = appName;
        this.appVersion = appVersion;
    }
    generateSeedPhrase() {
        return __awaiter(this, void 0, void 0, function* () {
            const seedPhrase = yield mnemonicKeys.generateMnemonic();
            return Promise.resolve(seedPhrase);
        });
    }
    generateJWKWallet(seedPhrase) {
        return __awaiter(this, void 0, void 0, function* () {
            const jwkWallet = yield mnemonicKeys.getKeyFromMnemonic(seedPhrase.toString());
            return Promise.resolve(new jwk_wallet_1.JWKWallet(jwkWallet));
        });
    }
    getWalletWinstonBalance(wallet) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getAddressWinstonBalance(yield wallet.getAddress());
        });
    }
    getAddressWinstonBalance(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.resolve(types_1.W(+(yield this.arweave.wallets.getBalance(address.toString()))));
        });
    }
    walletHasBalance(wallet, winstonPrice) {
        return __awaiter(this, void 0, void 0, function* () {
            const walletBalance = yield this.getWalletWinstonBalance(wallet);
            return walletBalance.isGreaterThan(winstonPrice);
        });
    }
    sendARToAddress(arAmount, fromWallet, toAddress, rewardSettings = {}, dryRun = false, [{ value: appName = this.appName }, { value: appVersion = this.appVersion }, { value: trxType = 'transfer' }, ...otherTags], assertBalance = false) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Figure out how this works for other wallet types
            const jwkWallet = fromWallet;
            const winston = arAmount.toWinston();
            // Create transaction
            const trxAttributes = {
                target: toAddress.toString(),
                quantity: winston.toString()
            };
            // If we provided our own reward settings, use them now
            if (rewardSettings.reward) {
                trxAttributes.reward = rewardSettings.reward.toString();
            }
            // TODO: Use a mock arweave server instead
            if (process.env.NODE_ENV === 'test') {
                trxAttributes.last_tx = 'STUB';
            }
            const transaction = yield this.arweave.createTransaction(trxAttributes, jwkWallet.getPrivateKey());
            if ((_a = rewardSettings.feeMultiple) === null || _a === void 0 ? void 0 : _a.wouldBoostReward()) {
                transaction.reward = rewardSettings.feeMultiple.boostReward(transaction.reward);
            }
            if (assertBalance) {
                const fromAddress = yield fromWallet.getAddress();
                const balanceInWinston = yield this.getAddressWinstonBalance(fromAddress);
                const total = types_1.W(transaction.reward).plus(types_1.W(transaction.quantity));
                if (total.isGreaterThan(balanceInWinston)) {
                    throw new Error([
                        `Insufficient funds for this transaction`,
                        `quantity: ${transaction.quantity}`,
                        `minerReward: ${transaction.reward}`,
                        `balance: ${balanceInWinston}`,
                        `total: ${total}`,
                        `difference: ${types_1.Winston.difference(total, balanceInWinston)}`
                    ].join('\n\t'));
                }
            }
            // Tag file with data upload Tipping metadata
            transaction.addTag('App-Name', appName);
            transaction.addTag('App-Version', appVersion);
            transaction.addTag('Type', trxType);
            if ((_b = rewardSettings.feeMultiple) === null || _b === void 0 ? void 0 : _b.wouldBoostReward()) {
                transaction.addTag('Boost', rewardSettings.feeMultiple.toString());
            }
            otherTags === null || otherTags === void 0 ? void 0 : otherTags.forEach((tag) => {
                transaction.addTag(tag.name, tag.value);
            });
            // TODO: CHECK TAG LIMITS - i.e. upper limit of 2048bytes for all names and values
            // Sign file
            yield this.arweave.transactions.sign(transaction, jwkWallet.getPrivateKey());
            // Submit the transaction
            const response = yield (() => __awaiter(this, void 0, void 0, function* () {
                if (dryRun) {
                    return { status: 200, statusText: 'OK', data: '' };
                }
                else {
                    return this.arweave.transactions.post(transaction);
                }
            }))();
            if (response.status === 200 || response.status === 202) {
                return Promise.resolve({
                    trxID: types_1.TxID(transaction.id),
                    winston,
                    reward: types_1.W(transaction.reward)
                });
            }
            else {
                throw new Error(`Transaction failed. Response: ${response}`);
            }
        });
    }
}
exports.WalletDAO = WalletDAO;
