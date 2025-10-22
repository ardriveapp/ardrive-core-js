/**
 * Browser-compatible utilities extracted from common.ts
 * These functions have no Node.js dependencies and can be used in both Node.js and browser environments
 */

import { ByteCount, DriveSignatureType } from '../types';
import { authTagLength } from './constants';

/** Derives gateway URL from provided Arweave instance */
export function gatewayUrlForArweave(arweave: {
	api: { config: { protocol?: string; host?: string; port?: string | number } };
}): URL {
	const defaultGatewayProtocol = 'https';
	const defaultGatewayHost = 'arweave.net';

	const protocol = arweave.api.config.protocol ?? defaultGatewayProtocol;
	const host = arweave.api.config.host ?? defaultGatewayHost;
	const portStr = arweave.api.config.port ? `:${arweave.api.config.port}` : '';
	return new URL(`${protocol}://${host}${portStr}/`);
}

/** Computes the size of a private file encrypted with AES256-GCM */
export function encryptedDataSize(dataSize: ByteCount): ByteCount {
	if (+dataSize > Number.MAX_SAFE_INTEGER - authTagLength) {
		throw new Error(`Max un-encrypted dataSize allowed is ${Number.MAX_SAFE_INTEGER - authTagLength}!`);
	}
	return new ByteCount((+dataSize / authTagLength + 1) * authTagLength);
}

export const parseDriveSignatureType = (value: string): DriveSignatureType => {
	switch (value) {
		case '1':
			return DriveSignatureType.v1;
		case '2':
			return DriveSignatureType.v2;
		default:
			throw new Error(`Invalid drive signature type: ${value}`);
	}
};

export function BufferToString(buffer: Buffer | Uint8Array): string {
	// to keep our existing logic
	const array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return Uint8ArrayToString(array);
}

export function urlEncodeHashKey(keyBuffer: Buffer): string {
	return keyBuffer.toString('base64').replace('=', '');
}

export function Uint8ArrayToString(array: Uint8Array): string {
	let out, i, c;
	let char2, char3;

	out = '';
	const len = array.length;
	i = 0;
	while (i < len) {
		c = array[i++];
		// eslint-disable-next-line no-bitwise
		switch (c >> 4) {
			case 0:
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
				// 0xxxxxxx
				out += String.fromCharCode(c);
				break;
			case 12:
			case 13:
				// 110x xxxx   10xx xxxx
				char2 = array[i++];
				// eslint-disable-next-line no-bitwise
				out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
				break;
			case 14:
				// 1110 xxxx  10xx xxxx  10xx xxxx
				char2 = array[i++];
				char3 = array[i++];
				// eslint-disable-next-line no-bitwise
				out += String.fromCharCode(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0));
				break;
		}
	}

	return out;
}

/**
 * Get MIME type from file extension
 * Browser-compatible version using a simple mapping
 */
export function extToMime(fullPath: string): string {
	let extension = fullPath.substring(fullPath.lastIndexOf('.') + 1);
	extension = extension.toLowerCase();

	// Basic MIME type mapping for common file types
	// In browser, we can use a simple map instead of the mime-types package
	const mimeMap: Record<string, string> = {
		// Text
		txt: 'text/plain',
		html: 'text/html',
		htm: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		xml: 'application/xml',
		md: 'text/markdown',

		// Images
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
		ico: 'image/x-icon',
		bmp: 'image/bmp',

		// Audio
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		m4a: 'audio/mp4',

		// Video
		mp4: 'video/mp4',
		webm: 'video/webm',
		ogv: 'video/ogg',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',

		// Documents
		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

		// Archives
		zip: 'application/zip',
		tar: 'application/x-tar',
		gz: 'application/gzip',
		'7z': 'application/x-7z-compressed',
		rar: 'application/vnd.rar',

		// Other
		wasm: 'application/wasm'
	};

	return mimeMap[extension] || 'application/octet-stream';
}
