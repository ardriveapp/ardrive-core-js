# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source modules. Public API is exported via `exports.ts` and compiled to `lib/`.
- `src/web/`: Browser-compatible web build modules (see `docs/WEB_BUILD.md`).
- `lib/`: Build output (do not edit by hand).
- `dist/web/`: Web bundle output (JavaScript + TypeScript declarations).
- `tests/`: Integration and example tests (e.g., `tests/integration/*.int.test.ts`).
- `tests/playwright/`: Browser tests using Playwright.
- `docs/`: Architecture and design documentation for AI and developers.
- Config: `.mocharc.js`, `nyc.config.js`, `.eslintrc`, `.prettierrc`, `tsconfig*.json`.

## Build, Test, and Development Commands
- `yarn install --check-cache`: Install dependencies (Yarn 3, Node >= 18).
- `yarn build`: Clean and compile to `lib/`.
- `yarn build:web`: Build browser-compatible web bundle to `dist/web/`.
- `yarn build:all`: Build both Node.js and web versions.
- `yarn dev`: Build in watch mode.
- `yarn test`: Run Mocha tests via NYC.
- `yarn test:playwright`: Run Playwright browser tests.
- `yarn coverage`: Generate coverage report (text + HTML).
- `yarn arlocal-docker-test`: Start ArLocal in Docker, run tests, then stop.
- `yarn lint` / `yarn lintfix`: Lint (and fix) with ESLint.
- `yarn format`: Format with Prettier.
- `yarn typecheck`: TypeScript type checking.

## Coding Style & Naming Conventions
- Language: TypeScript; 4‑space tabs, semicolons, single quotes, `printWidth: 120` (see `.prettierrc`).
- Linting: ESLint with `@typescript-eslint` and Prettier integration; pre‑commit runs `prettier` and `eslint --fix` on `src/**/*.{ts,js,json}`.
- Names: `camelCase` for variables/functions, `PascalCase` for classes/types, `SCREAMING_SNAKE_CASE` for constants.
- Files: Implementation `*.ts`; tests `*.test.ts`; integration tests may use `*.int.test.ts` under `tests/`.

## Testing Guidelines
- Frameworks: Mocha + Chai + Sinon; TypeScript via `ts-node/register` (`.mocharc.js`).
- Locations: `src/**/*.test.ts` and `tests/**/*.test.ts`.
- Run subsets: `yarn test -g "pattern"`.
- Coverage: Managed by NYC; sources included `src/**/*.ts`, tests excluded. HTML report in `coverage/`.
- ArLocal: Requires Docker; use `yarn arlocal-docker-test` for integration flows.

## Commit & Pull Request Guidelines
- Commits: Follow Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep changes focused.
- Before PR: `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn build` must pass. Ensure Node >= 18 and Yarn are used.
- PRs: Provide a clear description, link issues, note breaking changes, and include screenshots/logs when relevant.
- Hooks: Enable once per clone with `yarn husky install`.

## Security & Configuration Tips
- Do not commit real wallets/keys; `tests/test_wallet.json` is for testing only.
- Optional envs: `ARDRIVE_PROGRESS_LOG=1`, `ARDRIVE_CACHE_LOG=1` for verbose logs.
- Cache paths: macOS/Linux `~/.ardrive/caches/metadata`, Windows `%USERPROFILE%/ardrive-caches/metadata`.

## Architecture Overview
- Core: `src/ardrive.ts` defines the `ArDrive` class; construct via `src/ardrive_factory.ts`. Anonymous reads live in `src/ardrive_anonymous.ts`.
- ArFS: `src/arfs/**` contains entity models (drives/folders/files), builders, metadata factories, and tx types.
- Pricing: `src/pricing/**` provides data price estimators and gateway/oracle integrations.
- Community: `src/community/**` implements community tip/oracle logic.
- Wallet & Types: `src/wallet*.ts`, `src/jwk_wallet.ts`, and `src/types/**`. All public exports are wired through `src/exports.ts`.

## CI Tips
- Local CI run: `yarn ci` (runs `arlocal-docker-test` then `build`). Requires Docker installed and available.
- Engines: Node >= 18 (`.nvmrc` present). Use Yarn 3 (`yarn set version berry` if needed) and `yarn install --check-cache` for reproducible installs.
- Pre-flight locally: `yarn lint && yarn typecheck && yarn test && yarn build` before pushing.
- Artifacts: build output in `lib/`; coverage HTML in `coverage/` for inspection.

## Documentation for AI & Developers
The `docs/` folder contains architecture and design documentation:
- `docs/WEB_BUILD.md`: Comprehensive web build architecture, design decisions, and API reference
- `docs/ARDRIVE_SIGNER.md`: ArDriveSigner interface documentation for browser wallet integration

These documents provide context for AI assistants and developers working on the codebase.
