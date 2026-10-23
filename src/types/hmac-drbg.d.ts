declare module 'hmac-drbg' {
	interface HmacDRBGOptions {
		hash: unknown;
		entropy: string;
		nonce: string | null;
		pers: string | null;
	}

	export default class HmacDRBG {
		constructor(options: HmacDRBGOptions);
		generate(length: number): number[];
	}
}
