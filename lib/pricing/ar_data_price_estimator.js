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
exports.AbstractARDataPriceAndCapacityEstimator = exports.AbstractARDataPriceEstimator = exports.arPerWinston = void 0;
const types_1 = require("../types");
exports.arPerWinston = 1e-12;
class AbstractARDataPriceEstimator {
    /**
     * Estimates the price in AR for a given byte count, including the ArDrive community tip
     */
    getARPriceForByteCount(byteCount, { minWinstonFee, tipPercentage }) {
        return __awaiter(this, void 0, void 0, function* () {
            const winstonPrice = yield this.getBaseWinstonPriceForByteCount(byteCount);
            const communityWinstonFee = types_1.Winston.max(winstonPrice.times(tipPercentage), minWinstonFee);
            const totalWinstonPrice = winstonPrice.plus(communityWinstonFee);
            return new types_1.AR(totalWinstonPrice);
        });
    }
}
exports.AbstractARDataPriceEstimator = AbstractARDataPriceEstimator;
// prettier-ignore
class AbstractARDataPriceAndCapacityEstimator extends AbstractARDataPriceEstimator {
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arAmount, { minWinstonFee, tipPercentage }) {
        return __awaiter(this, void 0, void 0, function* () {
            const totalWinstonAmount = arAmount.toWinston();
            // communityWinstonFee is either the minimum amount OR the amount based on the network's assessed data cost
            const communityWinstonFee = types_1.Winston.max(totalWinstonAmount.minus(totalWinstonAmount.dividedBy(1 + tipPercentage)), minWinstonFee);
            if (totalWinstonAmount.isGreaterThan(communityWinstonFee)) {
                const networkCost = totalWinstonAmount.minus(communityWinstonFee);
                return this.getByteCountForWinston(networkCost);
            }
            // Specified `arPrice` does not cover provided `minimumWinstonFee`
            return new types_1.ByteCount(0);
        });
    }
}
exports.AbstractARDataPriceAndCapacityEstimator = AbstractARDataPriceAndCapacityEstimator;
