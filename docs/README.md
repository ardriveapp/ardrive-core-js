# ArDrive Core JS - Documentation

This directory contains architecture and design documentation for AI assistants and developers working on the ArDrive Core JS codebase.

## Documents

### [WEB_BUILD.md](./WEB_BUILD.md)

**Comprehensive Web Build Architecture & Design**

Complete documentation of the browser-compatible web build including:

- Architecture overview and design principles
- Key design decisions and rationale
- Module structure and organization
- API surface and usage patterns
- Build system and process
- Testing infrastructure
- Performance considerations
- Browser compatibility
- Known limitations and future enhancements
- Migration guide and troubleshooting

**Audience**: AI assistants, developers implementing web features, architects reviewing design decisions

**Use Cases**:

- Understanding web build architecture
- Implementing new web features
- Debugging browser-specific issues
- Planning future enhancements
- Onboarding new developers

### [ARDRIVE_SIGNER.md](./ARDRIVE_SIGNER.md)

**ArDriveSigner Interface Documentation**

Detailed documentation of the ArDriveSigner interface for browser wallet integration:

- Interface definition and rationale
- Implementation examples
- Usage in browser applications
- DataItem signing details
- Type guards and utilities
- Migration guide
- Related files and references

**Audience**: Application developers integrating ArDrive with browser wallets

**Use Cases**:

- Implementing browser wallet support
- Understanding private drive access in browsers
- Creating custom signer implementations
- Testing with mock signers
- Troubleshooting wallet integration issues

## Purpose

These documents serve multiple purposes:

1. **AI Context**: Provide comprehensive context for AI coding assistants to understand the codebase architecture and make informed suggestions

2. **Developer Onboarding**: Help new developers understand design decisions and architectural patterns

3. **Design Reference**: Document the rationale behind key technical decisions for future reference

4. **Implementation Guide**: Provide detailed implementation guidance for complex features

5. **Maintenance**: Help maintainers understand the system when making changes or fixing bugs

## Maintenance

These documents should be updated when:

- Major architectural changes are made
- New features are added to the web build
- Design decisions change
- API surface changes
- New patterns or best practices emerge

## Related Documentation

- **[AGENTS.md](../AGENTS.md)**: Repository guidelines and conventions for AI assistants
- **[README.md](../README.md)**: Main project README with usage examples
- **[CHANGELOG.md](../CHANGELOG.md)**: Version history and changes
- **[tests/playwright/README.md](../tests/playwright/README.md)**: Playwright testing documentation

## Contributing

When adding new documentation:

1. Follow the existing structure and format
2. Include code examples where appropriate
3. Explain the "why" not just the "what"
4. Update this README to reference new documents
5. Update AGENTS.md if the document is relevant for AI assistants
