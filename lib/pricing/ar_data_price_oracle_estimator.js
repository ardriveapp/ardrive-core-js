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
exports.ARDataPriceOracleEstimator = void 0;
const gateway_oracle_1 = require("./gateway_oracle");
const ar_data_price_estimator_1 = require("./ar_data_price_estimator");
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave data prices from an ArweaveOracle each time it's requested
 */
class ARDataPriceOracleEstimator extends ar_data_price_estimator_1.AbstractARDataPriceEstimator {
    constructor(oracle = new gateway_oracle_1.GatewayOracle()) {
        super();
        this.oracle = oracle;
    }
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     */
    getBaseWinstonPriceForByteCount(byteCount) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.oracle.getWinstonPriceForByteCount(byteCount);
        });
    }
}
exports.ARDataPriceOracleEstimator = ARDataPriceOracleEstimator;
