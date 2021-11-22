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
exports.ARDataPriceRegressionEstimator = void 0;
const gateway_oracle_1 = require("./gateway_oracle");
const data_price_regression_1 = require("./data_price_regression");
const ar_data_price_estimator_1 = require("./ar_data_price_estimator");
const types_1 = require("../types");
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave data prices to build a linear regression model to use for estimations.
 */
class ARDataPriceRegressionEstimator extends ar_data_price_estimator_1.AbstractARDataPriceAndCapacityEstimator {
    /**
     * Creates a new estimator. Fetches pricing data proactively unless `skipSetup` is true.
     *
     * @param skipSetup allows for instantiation without prefetching pricing data from the oracle
     * @param oracle a datasource for Arweave data pricing
     * @param byteVolumes an array of non-negative byte integers to fetch for pricing data
     *
     * @throws when byteVolumes array has less than 2 values
     * @throws when volumes on byteVolumes array are negative or non-integer decimal values
     *
     * @returns an ARDataPriceEstimator
     */
    constructor(skipSetup = false, oracle = new gateway_oracle_1.GatewayOracle(), byteVolumes = ARDataPriceRegressionEstimator.sampleByteVolumes) {
        super();
        this.oracle = oracle;
        this.byteVolumes = byteVolumes;
        if (byteVolumes.length < 2) {
            throw new Error('Byte volume array must contain at least 2 values to calculate regression');
        }
        if (!skipSetup) {
            this.refreshPriceData();
        }
    }
    /**
     * Updates the regression model with fresh data from the pricing oracle
     *
     * @returns Promise for an {@link ARDataPriceRegression}
     */
    refreshPriceData() {
        return __awaiter(this, void 0, void 0, function* () {
            // Don't kick off another refresh while refresh is in progress
            if (this.setupPromise) {
                return this.setupPromise;
            }
            // Fetch the price for all values in byteVolume array and feed them into a linear regression
            this.setupPromise = Promise.all(
            // TODO: What to do if one fails?
            this.byteVolumes.map((sampleByteCount) => __awaiter(this, void 0, void 0, function* () {
                const winstonPrice = yield this.oracle.getWinstonPriceForByteCount(sampleByteCount);
                return { numBytes: sampleByteCount, winstonPrice };
            }))).then((pricingData) => new data_price_regression_1.ARDataPriceRegression(pricingData));
            this.predictor = yield this.setupPromise;
            return this.predictor;
        });
    }
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     */
    getBaseWinstonPriceForByteCount(byteCount) {
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.predictor) {
                yield this.refreshPriceData();
                if (!this.predictor) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            const predictedPrice = this.predictor.predictedPriceForByteCount(byteCount);
            return predictedPrice.winstonPrice;
        });
    }
    /**
     * Estimates the number of bytes that can be stored for a given amount of Winston
     *
     * @throws On invalid winston values and on any issues generating pricing models
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     * @remarks The ArDrive community fee is not considered in this estimation
     */
    getByteCountForWinston(winston) {
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.predictor) {
                yield this.refreshPriceData();
                if (!this.predictor) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            // Return 0 if winston price given does not cover the base winston price for a transaction
            // TODO: Is number sufficient here vs. BigNumber?
            const baseWinstonPrice = this.predictor.baseWinstonPrice();
            const marginalWinstonPrice = this.predictor.marginalWinstonPrice();
            if (winston.isGreaterThan(baseWinstonPrice)) {
                return new types_1.ByteCount(+winston.minus(baseWinstonPrice).dividedBy(marginalWinstonPrice).toString());
            }
            return new types_1.ByteCount(0);
        });
    }
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arPrice, { minWinstonFee, tipPercentage }) {
        const _super = Object.create(null, {
            getByteCountForAR: { get: () => super.getByteCountForAR }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Lazily generate the price predictor
            if (!this.predictor) {
                yield this.refreshPriceData();
                if (!this.predictor) {
                    throw Error('Failed to generate pricing model!');
                }
            }
            return _super.getByteCountForAR.call(this, arPrice, { minWinstonFee, tipPercentage });
        });
    }
}
exports.ARDataPriceRegressionEstimator = ARDataPriceRegressionEstimator;
ARDataPriceRegressionEstimator.sampleByteVolumes = [
    Math.pow(2, 10) * 100,
    Math.pow(2, 20) * 100,
    Math.pow(2, 30) * 10 // 10 GiB
].map((volume) => new types_1.ByteCount(volume));
