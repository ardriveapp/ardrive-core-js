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

## Package:

Npm package:

npm add ardrive-core-js

[![Gitopia](https://img.shields.io/endpoint?style=&url=https://gitopia.org/mirror-badge.json)](gitopia-repo)
