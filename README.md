# ardrive-core-js

ArDrive Core is a TypeScript library that contains the essential back end application features to support the ArDrive CLI and Desktop apps, such as file management, Permaweb upload/download, wallet management, and other common functions.

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

### VSCode/VSCodium integration:

-   Make sure to open ardrive-core.code-workspace
-   Install recomended extensions (

arcanis.vscode-zipfs

dbaeumer.vscode-eslint

esbenp.prettier-vscode

On repo main folder run: `yarn`

Remember to use

```
yarn install --check-cache
```

for external PR

## Package:

Npm package:

npm add ardrive-core-js

[![Gitopia](https://img.shields.io/endpoint?style=&url=https://gitopia.org/mirror-badge.json)](gitopia-repo)

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
