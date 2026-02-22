# Storage Adapter Design

## Goal

Replace the standalone `src/lib/s3.ts` utility with a proper storage adapter following the project's adapter pattern: interface in `src/lib/protocol/interfaces/`, implementation in `src/adapters/`.

## Design

### `src/lib/protocol/interfaces/storage.interface.ts`

Abstract contract for storage operations. Does not import from adapters.

```typescript
export interface StorageConfig {
  bucket: string;
  baseUrl?: string; // defaults to "/storage"
}

export interface Storage {
  uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string>;
  uploadAvatar(buffer: Buffer, userId: string, extension: string, contentType: string): Promise<string>;
  uploadBase64Image(base64Image: string, folder?: string): Promise<string>;
  getUrl(key: string): string;
}
```

### `src/adapters/storage.adapter.ts`

S3 implementation. Structurally aligns with the `Storage` interface but does not import it.

- Constructor receives S3 client config (endpoint, region, credentials) + bucket + optional baseUrl
- `getUrl(key)` returns `${baseUrl}/${key}` (baseUrl defaults to `/storage`)
- Avatar keys follow pattern: `avatars/{userId}/{uuid}.{ext}`
- Base64 upload: parses data URI prefix for content type, falls back to raw base64 with `image/png` default

### `upload.controller.ts`

Replace direct `import { uploadAvatarToS3 } from '../lib/s3'` with constructor-injected storage adapter.

### Deletion

Remove `src/lib/s3.ts`.

## Decisions

- **Keep all three methods** (uploadBuffer, uploadAvatar, uploadBase64Image) even though uploadBase64Image is currently unused
- **Constructor injection** for S3 config (not env vars directly)
- **Configurable base URL** for storage URL generation
- **No import between interface and adapter** — structural alignment only
