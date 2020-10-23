/* eslint-disable import/prefer-default-export */
// arweave.js
import * as fs from 'fs';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { getWinston, appName, appVersion, asyncForEach, arFSVersion, Utf8ArrayToStr, webAppName } from './common';
import { ArDriveUser, ArFSDriveMetaData, ArFSEncryptedData, ArFSFileMetaData, Wallet } from './types';
import { updateFileMetaDataSyncStatus, updateFileDataSyncStatus, setFileUploaderObject, updateDriveInDriveTable } from './db';
import Community from 'community-js';
import Arweave from 'arweave';
import { deriveDriveKey, driveDecrypt, driveEncrypt, fileEncrypt } from './crypto';

// var concat = require('concat-stream')

const arweave = Arweave.init({
  host: 'arweave.net', // Arweave Gateway
  port: 443,
  protocol: 'https',
  timeout: 600000,
});

// ArDrive Profit Sharing Community Smart Contract
const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

// eslint-disable-next-line new-cap
const community = new Community(arweave);

const getAddressForWallet = async (walletPrivateKey: JWKInterface) => {
  return arweave.wallets.jwkToAddress(walletPrivateKey);
};

// Creates a new Arweave wallet
const generateWallet = async (): Promise<Wallet> => {
  const walletPrivateKey = await arweave.wallets.generate();
  const walletPublicKey = await getAddressForWallet(walletPrivateKey);
  return { walletPrivateKey, walletPublicKey };
};

// Gets a signing key based off a user's JWK
async function getWalletSigningKey (jwk: JWKInterface, data: Uint8Array): Promise<Uint8Array> {
  return await arweave.crypto.sign(jwk, data);
}

// Imports an existing wallet on a local drive
const getLocalWallet = async (existingWalletPath: string) => {
  const walletPrivateKey : JWKInterface = JSON.parse(fs.readFileSync(existingWalletPath).toString());
  const walletPublicKey = await getAddressForWallet(walletPrivateKey);
  return { walletPrivateKey, walletPublicKey };
};

// Gets all of the ardrive IDs from a user's wallet
// Uses the Entity type to only search for Drive tags
const getAllMyPublicArDriveIds = async (walletPublicKey: any) => {
  try {
    let allPublicDrives : ArFSDriveMetaData[] = [];
    // Create the Graphql Query to search for all drives relating to the User wallet
    const query = {
      query: `query {
      transactions(
        first: 1000
        sort: HEIGHT_ASC
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "App-Name", values: ["${appName}", "${webAppName}"] }
          { name: "Entity-Type", values: "drive" }
          { name: "Drive-Privacy", values: "public" }
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`,
    };

    // Call the Arweave Graphql Endpoint
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);  // This must be updated to production when available
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;

    // Iterate through each returned transaction and pull out the private drive IDs
    await asyncForEach(edges, async (edge: any) => {
      const { node } = edge;
      const { tags } = node;
      let drive : ArFSDriveMetaData = {
        id: 0,
        login: '',
        appName: '',
        appVersion: '',
        driveName: '',
        rootFolderId: '',
        cipher: '',
        cipherIV: '',
        unixTime: 0,
        arFS: '',
        driveId: '',
        drivePrivacy: '',
        driveAuthMode: '',
        metaDataTxId: '',
        metaDataSyncStatus: 3,
        permaWebLink: '',
      }
      // Iterate through each tag and pull out each drive ID as well the drives privacy status
      tags.forEach((tag: any) => {
        const key = tag.name;
        const { value } = tag;
        switch (key) {
          case 'App-Name':
            drive.appName = value;
            break;
          case 'App-Version':
            drive.appVersion = value;
            break;
          case 'Unix-Time':
            drive.unixTime = value;
            break;
          case 'Drive-Id':
            drive.driveId = value;
            break;
          case 'ArFS':
            drive.arFS = value;
            break;
          case 'Drive-Privacy':
            drive.drivePrivacy = value;
            break;
          default:
            break;
        }
      });
      // Capture the TX of the public drive metadata tx
      drive.metaDataTxId = node.id;
      // Download the File's Metadata using the metadata transaction ID
      let data : string | Uint8Array = await getTransactionData(drive.metaDataTxId);
      let dataString = await Utf8ArrayToStr(data);
      let dataJSON = await JSON.parse(dataString);

      // Get the drive name and root folder id
      drive.driveName = dataJSON.name;
      drive.rootFolderId = dataJSON.rootFolderId;
      allPublicDrives.push(drive)
    });
    return allPublicDrives;
  } catch (err) {
    return Promise.reject(err);
  }
};

// Gets the root folder ID for a Public Drive
const getPublicDriveRootFolderTxId = async (walletPublicKey: string, driveId: string, folderId: string) : Promise<string> => {
  try {
    let metaDataTxId = '0';
    const query = {
      query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "ArFS", values: "${arFSVersion}" }
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
          }
        }
      }
    }`,
    };
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;
    await asyncForEach(edges, async (edge: any) => {
      const { node } = edge;
      metaDataTxId = node.id;
    });
    return metaDataTxId;
  }
  catch (err) {
    console.log (err);
    return "Error";
  }
}

// Gets the root folder ID for a Private Drive and includes the Cipher and IV
const getPrivateDriveRootFolderTxId = async (walletPublicKey: string, driveId: string, folderId: string) => {
  let metaDataTxId = '0';
  let cipher = '';
  let cipherIV = '';
  try {
    const query = {
      query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "ArFS", values: "${arFSVersion}" }
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`,
    };
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;
    await asyncForEach(edges, async (edge: any) => {
      const { node } = edge;
      const { tags } = node;
      metaDataTxId = node.id;
      tags.forEach((tag: any) => {
        const key = tag.name;
        const { value } = tag;
        switch (key) {
          case 'Cipher':
            cipher = value;
            break;
          case 'Cipher-IV':
            cipherIV = value;
            break;
        }
      });
    });
    return {metaDataTxId, cipher, cipherIV}
  }
  catch (err) {
    console.log (err);
    return {metaDataTxId, cipher, cipherIV}
  }
}

// Gets all of the private ardrive IDs from a user's wallet, using the Entity type to only search for Drive tags
// Only returns Private drives from graphql
const getAllMyPrivateArDriveIds = async (user: ArDriveUser) => {
  try {
    let allPrivateDrives : ArFSDriveMetaData[] = [];
    const query = {
      query: `query {
      transactions(
        first: 1000
        sort: HEIGHT_ASC
        owners: ["${user.walletPublicKey}"]
        tags: [
          { name: "ArFS", values: "${arFSVersion}" }
          { name: "Entity-Type", values: "drive" }
          { name: "Drive-Privacy", values: "private" }
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`,
    };

    // Call the Arweave Graphql Endpoint
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;

    // Iterate through each returned transaction and pull out the private drive IDs
    await asyncForEach(edges, async (edge: any) => {
      const { node } = edge;
      const { tags } = node;
      let drive : ArFSDriveMetaData = {
        id: 0,
        login: '',
        appName: '',
        appVersion: '',
        driveName: '',
        rootFolderId: '',
        cipher: '',
        cipherIV: '',
        unixTime: 0,
        arFS: '',
        driveId: '',
        drivePrivacy: '',
        driveAuthMode: '',
        metaDataTxId: '',
        metaDataSyncStatus: 3,
        permaWebLink: '',
      }
      // Iterate through each tag and pull out each drive ID as well the drives privacy status
      tags.forEach((tag: any) => {
        const key = tag.name;
        const { value } = tag;
        switch (key) {
          case 'App-Name':
            drive.appName = value;
            break;
          case 'App-Version':
            drive.appVersion = value;
            break;
          case 'Unix-Time':
            drive.unixTime = value;
            break;
          case 'Drive-Id':
            drive.driveId = value;
            break;
          case 'ArFS':
            drive.arFS = value;
            break;
          case 'Drive-Privacy':
            drive.drivePrivacy = value;
            break;
          case 'Drive-Auth-Mode':
            drive.driveAuthMode = value;
            break;
          case 'Cipher':
            drive.cipher = value;
            break;
          case 'Cipher-IV':
            drive.cipherIV = value;
            break;
          default:
            break;
        }
      });
      // Capture the TX of the public drive metadata tx
      drive.metaDataTxId = node.id;
      console.log ("TX is: ", node.id)
      // Download the File's Metadata using the metadata transaction ID
      let data : string | Uint8Array = await getTransactionData(drive.metaDataTxId);
      const dataBuffer = Buffer.from(data);

      // Since this is a private drive, we must decrypt the JSON data
      const driveKey : Buffer = await deriveDriveKey(user.dataProtectionKey, drive.driveId, user.walletPrivateKey);
      const decryptedDriveBuffer : Buffer = await driveDecrypt(drive.cipherIV, driveKey, dataBuffer);
      const decryptedDriveString : string = await Utf8ArrayToStr(decryptedDriveBuffer)
      let decryptedDriveJSON = await JSON.parse(decryptedDriveString);

      // Get the drive name and root folder id
      drive.driveName = decryptedDriveJSON.name;
      drive.rootFolderId = decryptedDriveJSON.rootFolderId;
      allPrivateDrives.push(drive)
    });
    return allPrivateDrives;
  } catch (err) {
    return Promise.reject(err);
  }
};

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID.
const getAllMyDataFileTxs = async (walletPublicKey: any, arDriveId: any) => {
  try {
    const query = {
      query: `query {
      transactions(
        first: 1000
        sort: HEIGHT_ASC
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "App-Name", values: ["${appName}", "${webAppName}"]}
          { name: "Drive-Id", values: "${arDriveId}" }
          { name: "Entity-Type", values: ["file", "folder"]}
        ]
      ) {
        edges {
          node {
            id
            block {
              id
              timestamp
              height
              previous
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`,
    };
    const response = await arweave.api
      .request()
      .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;
    return edges;
  } catch (err) {
    // console.log(err);
    return Promise.reject(err);
  }
};

// Gets the CipherIV tag of a private data transaction
const getPrivateTransactionCipherIV = async (txid: string) : Promise<string> => {
  try {
    let dataCipherIV = '';
    const query = {
      query: `query {
        transactions(ids: ["${txid}"]) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`,
    };
    // Call the Arweave Graphql Endpoint
    const response = await arweave.api
    .request()
    .post('https://arweave.net/graphql', query);
    const { data } = response.data;
    const { transactions } = data;
    const { edges } = transactions;
    const { node } = edges[0];
    const { tags } = node;
    tags.forEach((tag: any) => {
      const key = tag.name;
      const { value } = tag;
      switch (key) {
        case 'Cipher-IV':
          dataCipherIV = value;
          break;
        default:
          break;
      }
    })
    return dataCipherIV;
  }
  catch (err) {
    console.log (err)
    return "Error"
  }
}
// Gets only the transaction information, with no data
const getTransaction = async (txid: string): Promise<any> => {
  try {
    const tx = await arweave.transactions.get(txid);
    return tx;
  } catch (err) {
    // console.error(err);
    return Promise.reject(err);
  }
};

// Gets only the data of a given ArDrive Data transaction (U8IntArray)
const getTransactionData = async (txid: string) => {
  try {
    const data = await arweave.transactions.getData(txid, { decode: true });
    return data;
  } catch (err) {
    console.log(err);
    return Promise.reject(err);
  }
};

// Get the latest status of a transaction
const getTransactionStatus = async (txid: string) => {
  try {
    const response = await arweave.transactions.getStatus(txid);
    return response.status;
  } catch (err) {
    // console.log(err);
    return 0;
  }
};

// Get the balance of an Arweave wallet
const getWalletBalance = async (walletPublicKey: string) => {
  try {
    let balance = await arweave.wallets.getBalance(walletPublicKey);
    balance = await arweave.ar.winstonToAr(balance);
    return balance;
  } catch (err) {
    console.log(err);
    return 0;
  }
};

// Creates an arweave transaction to upload public ardrive metadata
const createPublicDriveTransaction = async (
  walletPrivateKey: string,
  drive: ArFSDriveMetaData
) : Promise<string> => {
  try {

    // Create a JSON file, containing necessary drive metadata
    const arDriveMetadataJSON = {
      name: drive.driveName,
      rootFolderId: drive.rootFolderId,
    }
    const arDriveMetaData = JSON.stringify(arDriveMetadataJSON);

    // Create transaction
    const transaction = await arweave.createTransaction({ data: arDriveMetaData }, JSON.parse(walletPrivateKey));
    const txSize = transaction.get('data_size');
    const winston = await getWinston(txSize);
    const arPrice = +winston * 0.000000000001;
    console.log('Uploading new Public Drive (name: %s) at %s to the Permaweb', drive.driveName, arPrice);

    console.log ("Drive unix time: %s", drive.unixTime.toString())
    // Tag file
    transaction.addTag('App-Name', appName);
    transaction.addTag('App-Version', appVersion);
    transaction.addTag('Unix-Time', drive.unixTime.toString());
    transaction.addTag('Content-Type', 'application/json');
    transaction.addTag('ArFS', arFSVersion);
    transaction.addTag('Entity-Type', 'drive');
    transaction.addTag('Drive-Id', drive.driveId);
    transaction.addTag('Drive-Privacy', 'public')

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);

    // Update the Profile table to include the default /Public/ ArDrive
    await updateDriveInDriveTable(transaction.id, drive.cipher, drive.cipherIV, drive.driveId)

    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
    }
    console.log('SUCCESS Public Drive was submitted with TX %s', transaction.id);
    return 'Success';
  } catch (err) {
    console.log(err);
    return 'Error';
  }
};

// Creates an arweave transaction to upload file data (and no metadata) to arweave
// Saves the upload chunk of the object in case the upload has to be restarted
const createArDrivePublicDataTransaction = async (
  walletPrivateKey: string,
  filePath: string,
  contentType: string,
  id: any,
) : Promise<string> => {
  try {
    const fileToUpload = fs.readFileSync(filePath);
    const transaction = await arweave.createTransaction(
      { data: arweave.utils.concatBuffers([fileToUpload]) }, // How to replace this?
      JSON.parse(walletPrivateKey),
    );
    // Tag file
    transaction.addTag('Content-Type', contentType);

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);
    await setFileUploaderObject(JSON.stringify(uploader), id)
    const fileToUpdate = {
      fileDataSyncStatus: '2',
      dataTxId: transaction.id,
      dataCipherIV: '',
      cipher: '',
      id,
    };
    // Update the queue since the file is now being uploaded
    await updateFileDataSyncStatus(fileToUpdate);
    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
      await setFileUploaderObject(JSON.stringify(uploader), id)
      console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
    }
    console.log('SUCCESS %s was submitted with TX %s', filePath, transaction.id);
    return transaction.id;
  } catch (err) {
    console.log(err);
    return "Transaction failed";
  }
};

// Creates an arweave transaction to upload only file metadata to arweave
const createArDrivePublicMetaDataTransaction = async (
  walletPrivateKey: string,
  fileToUpload: ArFSFileMetaData,
  secondaryFileMetaDataJSON: any,
) => {
  try {
    const transaction = await arweave.createTransaction({ data: secondaryFileMetaDataJSON }, JSON.parse(walletPrivateKey));
    const txSize = transaction.get('data_size');
    const winston = await getWinston(txSize);
    const arPrice = +winston * 0.000000000001;
    console.log('Uploading %s (%d bytes) at %s to the Permaweb', fileToUpload.fileName, txSize, arPrice);

    // Tag file
    transaction.addTag('App-Name', appName);
    transaction.addTag('App-Version', appVersion);
    transaction.addTag('Unix-Time', fileToUpload.unixTime.toString());
    transaction.addTag('Content-Type', 'application/json');
    transaction.addTag('ArFS', arFSVersion);
    transaction.addTag('Entity-Type', fileToUpload.entityType);
    transaction.addTag('Drive-Id', fileToUpload.driveId);
    if (fileToUpload.entityType === 'file') {
      transaction.addTag('File-Id', fileToUpload.fileId);
      transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
    } else {
      transaction.addTag('Folder-Id', fileToUpload.fileId);
      if (fileToUpload.parentFolderId !== '0') {
        transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
      }
    }


    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);
    const fileMetaDataToUpdate = {
      id: fileToUpload.id,
      fileMetaDataSyncStatus: '2',
      metaDataCipherIV: '',
      cipher: '',
      metaDataTxId: transaction.id,
    };
    // Update the queue since the file metadata is now being uploaded
    await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
    }
    console.log('SUCCESS %s metadata was submitted with TX %s', fileToUpload.filePath, transaction.id);
    return arPrice;
  } catch (err) {
    console.log(err);
    return 0;
  }
};

// Creates an arweave transaction to upload encrypted private ardrive metadata
const createPrivateDriveTransaction = async (
  driveKey: Buffer,
  walletPrivateKey: string,
  drive: ArFSDriveMetaData
) : Promise<string> => {
  try {

    // Create a JSON file, containing necessary drive metadata
    const driveMetadataJSON = {
      name: drive.driveName,
      rootFolderId: drive.rootFolderId,
    }

    // Turn the JSON into a string, and then encrypt it
    const driveMetaData : Buffer = Buffer.from(JSON.stringify(driveMetadataJSON));
    const encryptedDriveMetaData : ArFSEncryptedData = await driveEncrypt(driveKey, driveMetaData)

    // Create transaction
    const transaction = await arweave.createTransaction({ data: encryptedDriveMetaData.data }, JSON.parse(walletPrivateKey));
    const txSize = transaction.get('data_size');
    const winston = await getWinston(txSize);
    const arPrice = +winston * 0.000000000001;
    console.log('Uploading new Private Drive (name: %s) at %s to the Permaweb', drive.driveName, arPrice);

    // Tag file
    transaction.addTag('App-Name', appName);
    transaction.addTag('App-Version', appVersion);
    transaction.addTag('Unix-Time', drive.unixTime.toString());
    transaction.addTag('Content-Type', 'application/octet-stream');
    transaction.addTag('ArFS', arFSVersion);
    transaction.addTag('Entity-Type', 'drive');
    transaction.addTag('Drive-Id', drive.driveId);
    transaction.addTag('Drive-Privacy', drive.drivePrivacy)
    transaction.addTag('Drive-Auth-Mode', drive.driveAuthMode)
    transaction.addTag('Cipher', encryptedDriveMetaData.cipher)
    transaction.addTag('Cipher-IV', encryptedDriveMetaData.cipherIV)

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);

    // Update the Drive table to include this transaction information
    await updateDriveInDriveTable(transaction.id, encryptedDriveMetaData.cipher, encryptedDriveMetaData.cipherIV, drive.driveId);

    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
    }
    console.log('SUCCESS Private Drive was submitted with TX %s', transaction.id);
    return 'Success';
  } catch (err) {
    console.log(err);
    return 'Error';
  }
};

// Creates an arweave transaction to encrypt and upload file data (and no metadata) to arweave
const createArDrivePrivateDataTransaction = async (
  fileKey: Buffer,
  fileToUpload: ArFSFileMetaData,
  walletPrivateKey: string,
) => {
  try {
    const data = fs.readFileSync(fileToUpload.filePath);
    const encryptedData : ArFSEncryptedData = await fileEncrypt(fileKey, data)
    const transaction = await arweave.createTransaction({ data: encryptedData.data }, JSON.parse(walletPrivateKey));

    // Tag file with Content-Type, Cipher and Cipher-IV
    transaction.addTag('Content-Type', 'application/octet-stream');
    transaction.addTag('Cipher', encryptedData.cipher);
    transaction.addTag('Cipher-IV', encryptedData.cipherIV)

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);
    const fileToUpdate = {
      id: fileToUpload.id,
      fileDataSyncStatus: '2',
      dataTxId: transaction.id,
      dataCipherIV: encryptedData.cipherIV,
      cipher: encryptedData.cipher,
    };
    // Update the queue since the file is now being uploaded
    await updateFileDataSyncStatus(fileToUpdate);
    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
      await setFileUploaderObject(JSON.stringify(uploader), fileToUpload.id)
      console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
    }
    console.log('SUCCESS %s was submitted with TX %s', fileToUpload.filePath, transaction.id);
    return transaction.id;
  } catch (err) {
    console.log(err);
    return 'Error';
  }
};

// Creates an arweave transaction to encrypt and upload only file metadata to arweave
const createArDrivePrivateMetaDataTransaction = async (
  fileKey: Buffer,
  walletPrivateKey: string,
  fileToUpload: ArFSFileMetaData,
  secondaryFileMetaDataTags: string,
) => {
  try {

    // Encrypt the file metadata first since this is a private transaction
    const encryptedData : ArFSEncryptedData = await fileEncrypt(fileKey, Buffer.from(secondaryFileMetaDataTags))

    // Setup the transaction and get the price
    const transaction = await arweave.createTransaction({ data: encryptedData.data }, JSON.parse(walletPrivateKey));
    const txSize = transaction.get('data_size');
    const winston = await getWinston(txSize);
    const arPrice = +winston * 0.000000000001;
    console.log('Uploading %s (%d bytes) at %s to the Permaweb', fileToUpload.filePath, txSize, arPrice);

    // Tag file with Private metadata
    transaction.addTag('App-Name', appName);
    transaction.addTag('App-Version', appVersion);
    transaction.addTag('Unix-Time', fileToUpload.unixTime.toString());
    transaction.addTag('Content-Type', 'application/octet-stream');
    transaction.addTag('Cipher', encryptedData.cipher);
    transaction.addTag('Cipher-IV', encryptedData.cipherIV)
    transaction.addTag('ArFS', arFSVersion);
    transaction.addTag('Entity-Type', fileToUpload.entityType);
    transaction.addTag('Drive-Id', fileToUpload.driveId);
    if (fileToUpload.entityType === 'file') {
      transaction.addTag('File-Id', fileToUpload.fileId);
      transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
    } else {
      transaction.addTag('Folder-Id', fileToUpload.fileId);
      // If parent folder ID is 0, then this is a root folder and we do not include this tag.
      if (fileToUpload.parentFolderId !== '0') {
        transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
      }
    }

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
    const uploader = await arweave.transactions.getUploader(transaction);
    const fileMetaDataToUpdate = {
      id: fileToUpload.id,
      fileMetaDataSyncStatus: '2',
      metaDataTxId: transaction.id,
      metaDataCipherIV: encryptedData.cipherIV,
      cipher: encryptedData.cipher,
    };
    // Update the queue since the file metadata is now being uploaded
    await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
    while (!uploader.isComplete) {
      // eslint-disable-next-line no-await-in-loop
      await uploader.uploadChunk();
    }
    console.log('SUCCESS %s metadata was submitted with TX %s', fileToUpload.filePath, transaction.id);
    return arPrice;
  } catch (err) {
    console.log(err);
    return 0;
  }
};

// Create a wallet and return the key and address
const createArDriveWallet = async (): Promise<Wallet> => {
  try {
    const wallet = await generateWallet();
    // TODO: logging is useless we need to store this somewhere.  It is stored in the database - Phil
    console.log('SUCCESS! Your new wallet public address is %s', wallet.walletPublicKey);
    return wallet;
  } catch (err) {
    console.error('Cannot create Wallet');
    console.error(err);
    return Promise.reject(err);
  }
};

// Sends a fee (15% of transaction price) to ArDrive Profit Sharing Community holders
const sendArDriveFee = async (walletPrivateKey: string, arPrice: number) => {
  try {
    await community.setCommunityTx(communityTxId);
    // Fee for all data submitted to ArDrive is 15%
    let fee = arPrice * 0.15;

    if (fee < 0.00001) {
      fee = 0.00001;
    }

    // Probabilistically select the PST token holder
    const holder = await community.selectWeightedHolder();

    // send a fee. You should inform the user about this fee and amount.
    const transaction = await arweave.createTransaction(
      { target: holder, quantity: arweave.ar.arToWinston(fee.toString()) },
      JSON.parse(walletPrivateKey),
    );

    // Sign file
    await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));

    // Submit the transaction
    const response = await arweave.transactions.post(transaction);
    if (response.status === 200 || response.status === 202) {
      console.log('SUCCESS ArDrive fee of %s was submitted with TX %s', fee.toFixed(9), transaction.id);
    } else {
      console.log('ERROR submitting ArDrive fee with TX %s', transaction.id);
    }
    return transaction.id;
  } catch (err) {
    console.log(err);
    return 'ERROR sending ArDrive fee';
  }
};

export {
  getAddressForWallet,
  getWalletSigningKey,
  sendArDriveFee,
  createArDriveWallet,
  createArDrivePublicMetaDataTransaction,
  createArDrivePrivateMetaDataTransaction,
  getPublicDriveRootFolderTxId,
  getPrivateDriveRootFolderTxId,
  createArDrivePrivateDataTransaction,
  createArDrivePublicDataTransaction,
  createPublicDriveTransaction,
  createPrivateDriveTransaction,
  getWalletBalance,
  getPrivateTransactionCipherIV,
  getTransactionStatus,
  getTransactionData,
  getTransaction,
  getAllMyDataFileTxs,
  getAllMyPrivateArDriveIds,
  getAllMyPublicArDriveIds,
  getLocalWallet,
  generateWallet,
};
