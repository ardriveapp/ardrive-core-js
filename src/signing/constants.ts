import { Signer } from './Signer';
import ArweaveSigner from './ArweaveSigner';

interface IndexToType {
	[key: number]: {
		// @ts-ignore
		new(...args): Signer;
		readonly signatureLength: number;
		readonly ownerLength: number;
		verify(pk: string | Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
	};
}

export enum SignatureConfig {
	ARWEAVE = 1
}

interface SignatureMeta {
	sigLength: number;
	pubLength: number;
	sigName: string;
}

export const SIG_CONFIG: Record<SignatureConfig, SignatureMeta> = {
	[SignatureConfig.ARWEAVE]: {
		sigLength: 512,
		pubLength: 512,
		sigName: 'arweave'
	}
};

export const indexToType: IndexToType = {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	1: ArweaveSigner
};
