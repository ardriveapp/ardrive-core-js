export interface WebFileToUpload {
	name: string;
	size: number; // bytes
	lastModifiedDateMS: number; // epoch ms
	contentType: string;
	// Original source (optional for consumers that need it)
	file?: File | Blob;
	getBytes: () => Promise<Uint8Array>;
}

export function wrapFile(file: File, customContentType?: string): WebFileToUpload {
	const contentType = customContentType || file.type || 'application/octet-stream';
	return {
		name: file.name,
		size: file.size,
		lastModifiedDateMS: file.lastModified ?? Date.now(),
		contentType,
		file,
		async getBytes() {
			const buf = await file.arrayBuffer();
			return new Uint8Array(buf);
		}
	};
}

export function wrapFiles(files: FileList | File[], customContentType?: string): WebFileToUpload[] {
	const arr: File[] = Array.isArray(files) ? files : Array.from(files);
	return arr.map((f) => wrapFile(f, customContentType));
}
