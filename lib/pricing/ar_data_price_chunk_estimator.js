"use strict";
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
exports.ARDataPriceChunkEstimator = void 0;
const gateway_oracle_1 = require("./gateway_oracle");
const ar_data_price_estimator_1 = require("./ar_data_price_estimator");
const types_1 = require("../types");
const byteCountOfChunk = new types_1.ByteCount(Math.pow(2, 10) * 256); // 256 KiB
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave base fee and cost of a chunk to use for estimations.
 */
class ARDataPriceChunkEstimator extends ar_data_price_estimator_1.AbstractARDataPriceAndCapacityEstimator {
    /**
     * Creates a new estimator. Fetches pricing data proactively unless `skipSetup` is true.
     *
     * @param skipSetup allows for instantiation without pre-fetching pricing data from the oracle
     * @param oracle a data source for Arweave data pricing
     */
    constructor(skipSetup = false, oracle = new gateway_oracle_1.GatewayOracle()) {
        super();
        this.oracle = oracle;
        if (!skipSetup) {
            this.refreshPriceData();
        }
    }
    /**
     * Updates the pricing info with updated data from the pricing oracle
     *
     * @returns Promise for a ChunkPricingInfo
     */
    refreshPriceData() {
        return __awaiter(this, void 0, void 0, function* () {
            // Don't kick off another refresh while refresh is in progress
            if (this.setupPromise) {
                return this.setupPromise;
            }
            this.setupPromise = (() => __awaiter(this, void 0, void 0, function* () {
                const basePrice = yield this.oracle.getWinstonPriceForByteCount(new types_1.ByteCount(0));
                const oneChunkPrice = yield this.oracle.getWinstonPriceForByteCount(new types_1.ByteCount(1));
                this.pricingInfo = {
                    baseWinstonPrice: basePrice.plus(types_1.W(2)),
                    oneChunkWinstonPrice: oneChunkPrice,
                    perChunkWinstonPrice: oneChunkPrice.minus(basePrice)
                };
                return this.pricingInfo;
            }))();
            yield this.setupPromise;
            if (this.pricingInfo === undefined) {
                throw new Error('Pricing information could not be determined from gateway...');
            }
            return this.pricingInfo;
        });
    }
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     *
     * @remarks Will fetch pricing data if it has not been fetched
     */
    getBaseWinstonPriceForByteCount(byteCount) {
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.pricingInfo) {
                yield this.refreshPriceData();
                if (!this.pricingInfo) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            if (byteCount.valueOf() === 0) {
                // Return base price for 0 byte uploads
                return this.pricingInfo.baseWinstonPrice;
            }
            const numberOfChunksToUpload = Math.ceil(byteCount.valueOf() / byteCountOfChunk.valueOf());
            // Every 5th chunk, arweave.net pricing adds 1 Winston, which they define as a
            // mining reward as a proportion of the estimated transaction storage costs
            const minerFeeShareResidual = types_1.W(Math.floor(numberOfChunksToUpload / 5));
            const predictedPrice = this.pricingInfo.perChunkWinstonPrice
                .times(numberOfChunksToUpload)
                .plus(this.pricingInfo.baseWinstonPrice)
                .plus(minerFeeShareResidual);
            return predictedPrice;
        });
    }
    /**
     * Estimates the number of bytes that can be stored for a given amount of Winston
     *
     * @throws On invalid winston values and on any issues generating pricing models
     *
     * @remarks Will fetch pricing data if it has not been fetched
     * @remarks The ArDrive community fee is not considered in this estimation
     */
    getByteCountForWinston(winston) {
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.pricingInfo) {
                yield this.refreshPriceData();
                if (!this.pricingInfo) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            const { oneChunkWinstonPrice, baseWinstonPrice, perChunkWinstonPrice } = this.pricingInfo;
            if (winston.isGreaterThanOrEqualTo(oneChunkWinstonPrice)) {
                const winstonToSpend = winston.minus(baseWinstonPrice);
                const fifthChunks = winstonToSpend
                    .dividedBy(perChunkWinstonPrice.toString(), 'ROUND_DOWN')
                    .dividedBy(5, 'ROUND_DOWN');
                const actualWinstonToSpend = winstonToSpend.minus(fifthChunks);
                const numChunks = actualWinstonToSpend.dividedBy(perChunkWinstonPrice.toString(), 'ROUND_DOWN');
                return new types_1.ByteCount(+numChunks.times(byteCountOfChunk.toString()));
            }
            // Return 0 if winston price given does not cover the base winston price for a 1 chunk transaction
            return new types_1.ByteCount(0);
        });
    }
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Will fetch pricing data if it has not been fetched
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arPrice, { minWinstonFee, tipPercentage }) {
        const _super = Object.create(null, {
            getByteCountForAR: { get: () => super.getByteCountForAR }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.pricingInfo) {
                yield this.refreshPriceData();
                if (!this.pricingInfo) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            return _super.getByteCountForAR.call(this, arPrice, { minWinstonFee, tipPercentage });
        });
    }
}
exports.ARDataPriceChunkEstimator = ARDataPriceChunkEstimator;
