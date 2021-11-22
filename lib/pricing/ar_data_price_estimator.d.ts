import { ArDriveCommunityTip, AR, ByteCount, Winston } from '../types';
export declare const arPerWinston = 1e-12;
export interface ARDataPriceEstimator {
    getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
    getARPriceForByteCount: (byteCount: ByteCount, arDriveCommunityTip: ArDriveCommunityTip) => Promise<AR>;
}
export declare abstract class AbstractARDataPriceEstimator implements ARDataPriceEstimator {
    abstract getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
    /**
     * Estimates the price in AR for a given byte count, including the ArDrive community tip
     */
    getARPriceForByteCount(byteCount: ByteCount, { minWinstonFee, tipPercentage }: ArDriveCommunityTip): Promise<AR>;
}
export interface ARDataCapacityEstimator {
    getByteCountForWinston: (winston: Winston) => Promise<ByteCount>;
    getByteCountForAR: (arPrice: AR, arDriveCommunityTip: ArDriveCommunityTip) => Promise<ByteCount>;
}
export declare abstract class AbstractARDataPriceAndCapacityEstimator extends AbstractARDataPriceEstimator implements ARDataCapacityEstimator {
    abstract getByteCountForWinston(winston: Winston): Promise<ByteCount>;
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arAmount: AR, { minWinstonFee, tipPercentage }: ArDriveCommunityTip): Promise<ByteCount>;
}
