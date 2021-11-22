"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARDataPriceRegression = void 0;
const regression_1 = __importDefault(require("regression"));
const types_1 = require("../types");
/**
 * A prediction tool for estimating the AR price (in Winston) for a data upload of a specified size based
 * on a supplied set of observations of market prices. A linear prediction model is used for estimation.
 */
class ARDataPriceRegression {
    /**
     * Create a new price curve (linear) regression based on the supplied set of input price observations
     * @param pricingData an array of recent data price observations
     * @returns an ARDataPriceRegression that is ready for generating price predictions
     * @throws {@link Error} for an empty pricing data array
     */
    constructor(pricingData) {
        if (!pricingData.length) {
            throw new Error('Regression can not be run with an empty ARDataPrice list!');
        }
        const dataPoints = pricingData.map(
        // TODO: BigNumber regressions
        (pricingDatapoint) => [+pricingDatapoint.numBytes, +pricingDatapoint.winstonPrice.toString()]);
        this.regression = regression_1.default.linear(dataPoints);
    }
    /**
     * Predicts the AR (Winston) price for an upload with the specified size
     * @param numBytes the size, in bytes, of the upload whose price we want to predict
     * @returns the ARDataPrice predicted by the regression model for an upload of size `numBytes`
     * @throws {@link Error} if `numBytes` is negative or not an integer
     */
    predictedPriceForByteCount(numBytes) {
        const regressionResult = this.regression.predict(+numBytes);
        // TODO: BigNumber regressions
        return { numBytes: new types_1.ByteCount(regressionResult[0]), winstonPrice: types_1.W(Math.ceil(regressionResult[1])) };
    }
    /**
     * Returns the current base AR price in Winston for submitting an Arweave transaction,
     * which has been calculated by the regression model
     */
    baseWinstonPrice() {
        return types_1.W(this.regression.equation[1]);
    }
    /**
     * Returns the current marginal AR price in Winston (winston price per byte),
     * which has been calculated by the regression model
     */
    marginalWinstonPrice() {
        return this.regression.equation[0];
    }
}
exports.ARDataPriceRegression = ARDataPriceRegression;
