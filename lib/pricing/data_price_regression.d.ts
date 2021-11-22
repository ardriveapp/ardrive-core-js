import { Winston, ByteCount } from '../types';
import { ARDataPrice } from './ar_data_price';
/**
 * A prediction tool for estimating the AR price (in Winston) for a data upload of a specified size based
 * on a supplied set of observations of market prices. A linear prediction model is used for estimation.
 */
export declare class ARDataPriceRegression {
    private readonly regression;
    /**
     * Create a new price curve (linear) regression based on the supplied set of input price observations
     * @param pricingData an array of recent data price observations
     * @returns an ARDataPriceRegression that is ready for generating price predictions
     * @throws {@link Error} for an empty pricing data array
     */
    constructor(pricingData: ARDataPrice[]);
    /**
     * Predicts the AR (Winston) price for an upload with the specified size
     * @param numBytes the size, in bytes, of the upload whose price we want to predict
     * @returns the ARDataPrice predicted by the regression model for an upload of size `numBytes`
     * @throws {@link Error} if `numBytes` is negative or not an integer
     */
    predictedPriceForByteCount(numBytes: ByteCount): ARDataPrice;
    /**
     * Returns the current base AR price in Winston for submitting an Arweave transaction,
     * which has been calculated by the regression model
     */
    baseWinstonPrice(): Winston;
    /**
     * Returns the current marginal AR price in Winston (winston price per byte),
     * which has been calculated by the regression model
     */
    marginalWinstonPrice(): number;
}
