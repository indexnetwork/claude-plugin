---
trigger: "IND-133 — Clean up dead exports in uploads.config.ts"
type: refactor
branch: refactor/clean-uploads-config
base-branch: dev
created: 2026-03-27
version-bump: patch
linear-issue: IND-133
---

## Related Files
- protocol/src/lib/uploads.config.ts (target file — contains dead exports)
- protocol/src/services/file.service.ts (imports FILE_SIZE_LIMITS, FALLBACK_TEXT_EXTENSIONS)
- protocol/src/controllers/storage.controller.ts (imports validateFileByMetadata, FILE_SIZE_LIMITS)
- protocol/src/lib/tests/uploads.config.spec.ts (test file for validation functions)

## Relevant Docs
None — knowledge base does not cover this area yet.

## Related Issues
- IND-133 Clean up dead exports in uploads.config.ts (Todo)

## Scope
Remove dead exports from protocol/src/lib/uploads.config.ts after the multer removal in PR #481.

### Keep (externally imported)
- FILE_SIZE_LIMITS (file.service.ts, storage.controller.ts)
- validateFileByMetadata (storage.controller.ts)
- FALLBACK_TEXT_EXTENSIONS (file.service.ts)

### Remove or make module-private
- MAX_FILES_PER_UPLOAD
- SUPPORTED_FILE_TYPES (only used internally by validation functions)
- GENERAL_ALLOWED_TYPES (only used internally)
- UploadContext type
- ValidationError enum (only used internally)
- ValidationResult interface (only used internally)
- validateFileTypeByMetadata (only used internally by validateFileByMetadata — also imported in test, update test)
- validateFileSizeByBytes (only used internally)
- validateFileCountByNumber
- validateFilesByMetadata
- getSupportedFileExtensions
- getSupportedFileTypesDisplayText
- isFileExtensionSupported
- getFileCategoryBadge
- getMimeTypesForExtension
- getMimeTypeForExtension (deprecated)

### Consider
- Rename file from uploads.config.ts to file-validation.config.ts (it's no longer about "uploads")
- Update test file accordingly
