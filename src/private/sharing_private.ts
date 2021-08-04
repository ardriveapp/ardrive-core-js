import { deriveFileKey } from './../crypto';
import { stagingAppUrl } from './../constants';

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
export async function createArFSPrivateFileSharingLink(driveKey: Buffer, fileId: string): Promise<string> {
	let fileSharingUrl = '';
	try {
		const fileKey: Buffer = await deriveFileKey(fileId, driveKey);
		fileSharingUrl = stagingAppUrl.concat('/#/file/', fileId, '/view?fileKey=', fileKey.toString('base64'));
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Private File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}
