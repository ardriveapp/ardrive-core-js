import axios, { AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';

export interface CreateAxiosInstanceParams {
	config?: AxiosRequestConfig;
	retries?: number;
	retryDelay?: (retryNumber: number) => number;
}

export const createAxiosInstance = ({
	config = {},
	retries = 8,
	retryDelay = axiosRetry.exponentialDelay
}: CreateAxiosInstanceParams) => {
	const axiosInstance = axios.create(config);
	if (retries > 0) {
		axiosRetry(axiosInstance, {
			retries,
			retryDelay
		});
	}
	return axiosInstance;
};
