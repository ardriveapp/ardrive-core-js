import { getLocalWallet, createPublicArDriveMetaDataTransaction } from '../src/arweave';
import { setupDatabase, getUserIdFromProfile, getNewDriveFromSyncTable } from '../src/db';
import { getUser, addNewUser, setupArDriveSyncFolder } from '../src/profile';
import { ArDriveUser } from '../src/types';
import { watchFolder } from '../src/files';
async function main() {
	// Setup database if it doesnt exist
	try {
		await setupDatabase('./.ardrive-test.db');
	} catch (err) {
		console.error(err);
		return;
	}

	// Sample user profile
	const wallet = await getLocalWallet('C:\\Stuff\\ardrive_test_key.json');
	const loginPassword = 'dudeworduppasword';
	const testUser: ArDriveUser = {
		login: 'Vilenarios',
		privateArDriveId: '924224b2-6a7b-43a4-8454-aab08abb1944',
		privateArDriveTx: '0',
		publicArDriveId: 'b6de11fb-9d93-4d65-a250-2930d1c4fa98',
		publicArDriveTx: '0',
		dataProtectionKey: 'aSUPERstr0ngZOOM1023(',
		walletPrivateKey: wallet.walletPrivateKey,
		walletPublicKey: wallet.walletPublicKey,
		syncFolderPath: 'C:\\ArDriveSyncFolder_Test'
	};

	// Testing Sync Folder Creation
	console.log('Sync Folder Setup Results: %s', await setupArDriveSyncFolder(testUser.syncFolderPath));

	// Initialize Chokidar Folder Watcher by providing the Sync Folder Path, Private and Public ArDrive IDs
	watchFolder(testUser.syncFolderPath, testUser.privateArDriveId, testUser.publicArDriveId);

	// Testing Setting New User Profile
	await addNewUser(loginPassword, testUser);

	// Testing Getting Existing User Profile
	const userId = await getUserIdFromProfile(testUser.login);
	await getUser(loginPassword, userId.id);

	const publicDriveId = await getNewDriveFromSyncTable('Public');
	if (publicDriveId !== undefined || publicDriveId.length !== 0) {
		// Upload public drive arweave transaction
		createPublicArDriveMetaDataTransaction(wallet.walletPrivateKey, publicDriveId.id);
	}
}
main();
