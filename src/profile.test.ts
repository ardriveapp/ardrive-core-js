import { getLocalWallet } from './arweave';
import { setupDatabase } from './db';
import { getUser, setUser, setupArDriveSyncFolder} from './profile';
import { ArDriveUser } from './types';

async function main() {
    // Setup database if it doesnt exist
    try {
        await setupDatabase('./.ardrive-test.db');
    } catch (err) {
        console.error(err);
        return;
    }

    // Sample user profile
    const wallet = await getLocalWallet("C:\\Stuff\\ardrive_test_key.json")
    const loginPassword: string = "dudeworduppasword"
    const testUser: ArDriveUser = {
        login: "Vilenarios",
        privateArDriveId: "d87da4e4-76f9-4872-9a14-94e10ba73e1d",
        privateArDriveTx: "FsrovoXaV7U-IMfJOAr1Fiv8iXwTwJTdL9lSUDr2WQg",
        publicArDriveId: "81a73abd-2aff-4989-9b57-4e7fbf8ce825",
        publicArDriveTx: "sjZV344k9BxPw1xjI1meZgCjm73tM5Ac86uN5Pwtxog",
        dataProtectionKey: "aSUPERstr0ngZOOM1023(",
        walletPrivateKey: wallet.walletPrivateKey,
        walletPublicKey: wallet.walletPublicKey,
        syncFolderPath: "C:\\ArDriveSyncFolder_Test\\"
      };

    // Testing Sync Folder Creation
    console.log ("Testing setupArDriveSyncFolder using %s", testUser.syncFolderPath);
    console.log ("Sync Folder Setup Results: %s", await setupArDriveSyncFolder(testUser.syncFolderPath));

    // Testing Setting New User Profile
    console.log ("Set New User results are: %s", await setUser(loginPassword, testUser))

    // Testing Getting Existing User Profile
    const newUser = await getUser(testUser.walletPublicKey, loginPassword)
    console.log ("Get User Profile results are")
    console.log (newUser);
}
main();