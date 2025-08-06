import { Base64String, PublicArweaveAddress } from '@ardrive/turbo-sdk';
import * as B64js from 'base64-js';
import { createHash } from 'crypto';

export function bufferTob64Url(buffer: Uint8Array): string {
	return b64UrlEncode(bufferTob64(buffer));
}

export function b64UrlEncode(b64UrlString: string): string {
	return b64UrlString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function bufferTob64(buffer: Uint8Array): string {
	return B64js.fromByteArray(new Uint8Array(buffer));
}

export function b64UrlToBuffer(b64UrlString: string): Uint8Array {
	return new Uint8Array(B64js.toByteArray(b64UrlDecode(b64UrlString)));
}

export function b64UrlDecode(b64UrlString: string): string {
	b64UrlString = b64UrlString.replace(/-/g, '+').replace(/_/g, '/');
	let padding;
	b64UrlString.length % 4 == 0 ? (padding = 0) : (padding = 4 - (b64UrlString.length % 4));
	return b64UrlString.concat('='.repeat(padding));
}

export function ownerToAddress(owner: Base64String): PublicArweaveAddress {
	return sha256B64Url(Buffer.from(b64UrlToBuffer(owner)));
}

export function sha256B64Url(input: Buffer): string {
	return bufferTob64Url(createHash('sha256').update(Uint8Array.from(input)).digest());
}

export function toB64Url(buffer: Buffer): string {
	return bufferTob64Url(Uint8Array.from(buffer));
}
