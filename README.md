# ardrive-core-js

ArDrive Core is a TypeScript library that contains the essential back end application features to support the ArDrive CLI and Desktop apps, such as file management, Permaweb upload/download, wallet management, and other common functions.

Engage with the community in [Discord](https://discord.gg/7RuTBckX) for more information.

## Integrating with ArDrive Core

To add the ArDrive Core library to your project, simply add it as a dependency:

```shell
yarn add ardrive-core-js
```

The recommended approach for integrating with ArDrive Core as a dependency in your project is to construct and use the methods provided on the `ArDrive` class. Developers can use the convenience function `arDriveFactory` to construct the `ArDrive` class.

Below are a few common examples of interacting with Core:

```ts
import { readJWKFile, arDriveFactory } from 'ardrive-core-js';

// Read wallet from file
const myWallet = readJWKFile('/path/to/wallet');

// Construct ArDrive class
const arDrive = arDriveFactory({ wallet: myWallet });

// Create a public drive and its root folder
const createDriveResult = await arDrive.createPublicDrive({ driveName: 'My-Drive' });
```

```ts
import { wrapFileOrFolder, EID } from 'ardrive-core-js';

// Wrap file for upload
const wrappedEntity = wrapFileOrFolder('path/to/file');

// Construct a safe Entity ID Type
const destFolderId = EID('10108b54a-eb5e-4134-8ae2-a3946a428ec7');

// Upload a public file to destination folder
const uploadFileResult = await arDrive.uploadAllEntities({
    entitiesToUpload: [{ wrappedEntity, destFolderId }]
});
```

```ts
import { deriveDriveKey } from 'ardrive-core-js';

// Derive a private drive key from password, wallet, and drive ID
const driveKey = await deriveDriveKey(
    'mySecretPassWord',
    '12345674a-eb5e-4134-8ae2-a3946a428ec7',
    JSON.stringify((myWallet as JWKWallet).getPrivateKey())
);

// Create a private folder
const createFolderResult = await arDrive.createPrivateFolder({
    folderName: 'My New Private Folder',
    driveKey,
    parentFolderId: EID('47162534a-eb5e-4134-8ae2-a3946a428ec7')
});
```

```ts
import { wrapFileOrFolder, EntityKey, EID } from 'ardrive-core-js';

// Derive a private drive key from raw drive key string
const driveKey = new EntityKey(Buffer.from('MyAwesomeDriveKeyZZZZZZZZZZZZZZZZZZZZFAKE/s', 'base64'));

// Wrap folder and all of its contents for upload
const wrappedFolder = wrapFileOrFolder('path/to/folder');

// Upload a private folder and all its contents
const uploadFileResult = await arDrive.uploadAllEntities({
    entitiesToUpload: [
        {
            wrappedEntity: wrappedFolder,
            destFolderId: EID('76543214a-eb5e-4134-8ae2-a3946a428ec7'),
            driveKey
        },
        // And some other public file to a different destination 🤯
        {
          wrappedEntity: someOtherWrappedFile
          destFolderId: EID('675489321-eb5e-4134-8ae2-a3946a428ec7')
        }
    ]
});
```

## Development Environment Setup

We use nvm to manage our Node engine version and, if necessary, to install an npm version that we can then use to install Yarn.

Note for Windows: **We recommend using WSL** for setting up NVM on Windows using the [instructions described here][wsl-install] then continue the steps below.

1. Install nvm [using their instructions][nvm-install].
2. Ensure that the correct Node version is installed and activated by performing `nvm install` and then `nvm use`
3. We use Yarn 2.x please [follow the installation guidelines here][yarn-install]
4. We use husky 6.x to manage the git commit hooks that help to improve the quality of our commits. Please run:
   `yarn husky install`
   to enable git hooks for this local repository. Without doing so, you risk committing non-compliant code to the repository.

5. Install all node package dependencies by running `yarn install --check-cache`

### Recommended Visual Studio Code extensions

To ensure your environment is compatible, we also recommend the following VSCode extensions:

-   [ES-Lint][eslint-vscode]
-   [Editor-Config][editor-config-vscode]
-   [Prettier][prettier-vscode]
-   [ZipFS][zipfs-vscode]

## Building the Library

Simply run `yarn build`. This will clean the project and compile the TypeScript library.

## Testing the Library

This library is setup for [Mocha] testing with [Chai] and [Sinon]. Configuration for Mocha can be found in `.mocharc.js`

To run all of the tests use:

```shell
yarn test
```

To run a specific test, use Mocha's [grep] command. This will cause Mocha to only run the tests that contain the provided RegExp.

The `-g` command will **only** match the characters used in the `describe()` and `it()` title arguments. It will **not** match files names or folders.

For example:

```shell
yarn test -g 'My specific unit test'
```

Will run this test:

```ts
describe('My specific unit test', () => {
    it('functions correctly', () => {
        // ...
    });
});
```

### Coverage

[Istanbul.js (nyc)][nyc] has been added for code coverage reporting. Configuration for the nyc package can be found in `nyc.config.js`

On each `yarn test` command, nyc will output a code coverage summary in the terminal. In addition, a more detailed HTML version will output to the `/coverage` directory. Simply run `/coverage/index.html` in your browser to view the HTML version.

Alternatively, you can view a verbose coverage output in the terminal by running:

```shell
yarn coverage
```

### Adding tests

There are many different syntax options available with the Chai library, which can be found in their [documentation][chai-doc]. For examples on unit testing, visit `src/example.test.ts`, and for integration testing: `tests/example.test.ts`.

Unit tests should be located adjacent (or right next to) the file they are referencing. They should also be named the same with the `.test.ts` extension. In contrast, integration tests will live in the `/tests` directory.

For example:

```shell
ardrive-core-js/
├── src
│   ├── fileToTest.ts
│   └── fileToTest.test.ts   <-- Unit test
└── tests
    └── bestApi.test.ts   <----- Integration test
```

### Using Sinon

Sinon can be used to create spies, mocks, fakes, stubs, and more. There are some basic examples of using the library shown in the example test files shared above.

For more information on what you can do with Sinon, visit their [documentation][sinon-doc].

### Debugging with Power-Assert

[Power-Assert] is setup as another testing tool. The library can be used to provide a very detailed output of your failing test cases. This can become super useful while debugging a test.

To use this tool, it must be imported using this syntax:

```ts
import assert = require('assert');
```

Then use `assert` in your error throwing test case. Commenting out the Chai assertion will produce a cleaner output:

```ts
// expect(failingOutput).to.equal(expectedOutput);
assert(failingOutput === expectedOutput);
```

And finally, to view the detailed error messages in your terminal:

```shell
yarn power-assert -g 'My test case'
```

### Progress Logging of Transaction Uploads

Progress logging of transaction uploads to stderr can be enabled by setting the `ARDRIVE_PROGRESS_LOG` environment variable to `1`:

```shell
Uploading file transaction 1 of total 2 transactions...
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 0%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 35%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 66%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 100%
Uploading file transaction 2 of total 2 transactions...
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 0%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 13%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 28%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 42%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 60%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 76%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 91%
Transaction nA1stCdTkuf290k0qsqvmJ78isEC0bwgrAi3D8Cl1LU Upload Progress: 100%
```

### Persistent Caching of ArFS Entity Metadata

To avoid redundant requests to the Arweave network for immutable ArFS entity metadata, a persistent file cache is created and maintained at:

```
Windows: <os.homedir()>/ardrive-caches/metadata
Non-Windows: <os.homedir()>/.ardrive/caches/metadata
```

The `XDG_CACHE_HOME` environment variable is honored, where applicable, and will be used in place of `os.homedir()` in the scenarios described above.

Metadata cache logging to stderr can be enabled by setting the `ARDRIVE_CACHE_LOG` environment variable to `1`.

Cache performance is UNDEFINED for multi-process scenarios, but is presumed to be generally usable.

The cache can be manually cleared safely at any time that any integrating app is not in operation.

### Applying Custom MetaData to ArFS File Transactions

ArDrive Core has the capability of attaching custom metadata to ArFS File Transactions. This metadata can be applied to either the GQL tags on the MetaData Transaction or into the MetaData Transaction's Data JSON.

All custom tags can be accessed by using by using `ArDrive` class read methods such as `getPublicFile`, `getPrivateFile`, `listPrivateFolder`, etc.

When the custom metadata is attached to the MetaData Transaction's GQL tags, they will become visible on any Arweave GQL gateway and also third party tools that read GQL data.

When these tags are added to the MetaData Transaction's Data JSON they can be read by downloading the JSON data directly from `https://arweave.net/METADATA_TX_ID`.

To add this custom metadata to your file metadata transactions, users can pass an object containing custom tags when wrapping content to upload:

```ts
const fileToUpload = wrapFileOrFolder(
    'path/to/file/on/system', // File or Folder Path
    'application/custom-content-type', // Custom Content Type
    customMetaData: { // Custom MetaData
        metaDataJson: { ['My-Custom-Tag-Name']: 'Single-Custom-Value' },
        metaDataGqlTags: {
            ['Another-Custom-Tag']: ['First-Custom-Value', 'Second-Custom-Value', 'Third-Custom-Value']
        }
    }
);
```

[yarn-install]: https://yarnpkg.com/getting-started/install
[nvm-install]: https://github.com/nvm-sh/nvm#installing-and-updating
[wsl-install]: https://code.visualstudio.com/docs/remote/wsl
[editor-config-vscode]: https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig
[prettier-vscode]: https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode
[zipfs-vscode]: https://marketplace.visualstudio.com/items?itemName=arcanis.vscode-zipfs
[eslint-vscode]: https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint
[mocha]: https://github.com/mochajs/mocha
[chai]: https://github.com/chaijs/chai
[sinon]: https://github.com/sinonjs/sinon
[power-assert]: https://github.com/power-assert-js/power-assert
[nyc]: https://github.com/istanbuljs/nyc
[grep]: https://mochajs.org/#-grep-regexp-g-regexp
[chai-doc]: https://www.chaijs.com/api/bdd/
[sinon-doc]: https://sinonjs.org/releases/latest
