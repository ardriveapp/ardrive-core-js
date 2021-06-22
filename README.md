# ardrive-core-js

ArDrive Core is a TypeScript library that contains the essential back end application features to support the ArDrive CLI and Desktop apps, such as file management, Permaweb upload/download, wallet management, and other common functions.

## Development Environment Setup

We use nvm to manage our Node engine version and, if necessary, to install an npm version that we can then use to install Yarn.

<ol>
<li>Install nvm [using the instructions here](https://github.com/nvm-sh/nvm).</li>
<li>Ensure that the correct Node version is installed and activated by performing `nvm install` and then `nvm use`</li>
<li>We use Yarn 2.x please [follow the installation guidelines here](https://yarnpkg.com/getting-started/install)</li>
<li>We use husky 6.x to manage the git commit hooks that help to improve the quality of our commits. Please run:
  `yarn husky install`
  to enable git hooks for this local repository. Without doing so, you risk committing non-compliant code to the repository.
</li>
<li>Install all node package dependencies by running `yarn install --check-cache`</li>
</ol>

## Building the Library

Simply run `yarn build`. This will clean the project and compile the TypeScript library.

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

## Testing the library

This library is setup for [Mocha] testing with [Chai], and [Sinon].

To run all of the tests use:

```shell
yarn test
```

Or, to run a specific test use Mocha's [grep] command:

```shell
yarn test -g 'my specific unit test'
```

### Coverage

[Istanbul.js (nyc)][nyc] has been added for code coverage. On each `yarn test`, it will output a summary in the terminal. In addition, a more detailed HTML version will output to the `/coverage` directory. Simply run `/coverage/index.html` in your browser to view the HTML version.

Alternatively, you can view a verbose coverage output in the terminal by running:

```shell
yarn coverage
```

### Using Power-Assert

[Power-Assert] is setup as another testing tool. The library can be used to provide a very detailed output of your failing test cases. This can become super useful while debugging a test.

To use this tool, it must be imported using this syntax:

```ts
import assert = require('assert');
```

Then use `assert` in your error throwing test case:

```ts
describe('My test case', () => {
    it('should be working', () => {
        // ...
        assert(failingOutput === expectedOutput);
    });
});
```

And finally, to view the detailed error output:

```shell
yarn power-assert -g 'my failing test case'
```

Here is some more [information on power-assert's options][power-assert-api]

[mocha]: https://github.com/mochajs/mocha
[chai]: https://github.com/chaijs/chai
[sinon]: https://github.com/sinonjs/sinon
[power-assert]: https://github.com/power-assert-js/power-assert
[nyc]: https://github.com/istanbuljs/nyc
[grep]: https://mochajs.org/#-grep-regexp-g-regexp
[power-assert-api]: https://github.com/power-assert-js/power-assert#api

## Package:

Npm package:

npm add ardrive-core-js

[![Gitopia](https://img.shields.io/endpoint?style=&url=https://gitopia.org/mirror-badge.json)](gitopia-repo)
