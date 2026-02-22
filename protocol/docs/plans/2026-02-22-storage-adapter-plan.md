# Storage Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `src/lib/s3.ts` with a proper storage adapter (interface + S3 implementation) following the project's adapter pattern.

**Architecture:** Create `storage.interface.ts` in `src/lib/protocol/interfaces/` defining the abstract storage contract. Create `S3StorageAdapter` in `src/adapters/storage.adapter.ts` that structurally aligns with the interface but does not import it. Inject the adapter into `UploadController` via constructor, then delete `src/lib/s3.ts`.

**Tech Stack:** `@aws-sdk/client-s3`, `uuid`, TypeScript, Bun test

---

## Tasks

### Task 1: Create the storage interface

**Files:**
- Create: `src/lib/protocol/interfaces/storage.interface.ts`

**Step 1: Create `storage.interface.ts`**

```typescript
/**
 * Storage interface for protocol layer (file uploads, avatars).
 * Implementations live in src/adapters (e.g. S3).
 */

export interface StorageConfig {
  /** S3-compatible bucket name */
  bucket: string;
  /** Base URL prefix for generated storage URLs (defaults to "/storage") */
  baseUrl?: string;
}

export interface Storage {
  /**
   * Upload a buffer to storage.
   * @param buffer - The file contents
   * @param key - The storage object key (path)
   * @param contentType - The MIME type
   * @returns The URL to access the file
   */
  uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string>;

  /**
   * Upload an avatar image to storage.
   * @param buffer - The image buffer
   * @param userId - The user's ID
   * @param extension - File extension (e.g., "png", "jpg")
   * @param contentType - The MIME type
   * @returns The URL to access the avatar
   */
  uploadAvatar(buffer: Buffer, userId: string, extension: string, contentType: string): Promise<string>;

  /**
   * Upload a base64-encoded image to storage.
   * @param base64Image - The base64 string (can include data URI prefix)
   * @param folder - The folder path in the bucket (default: "feedback")
   * @returns The URL to access the image
   */
  uploadBase64Image(base64Image: string, folder?: string): Promise<string>;

  /**
   * Generate the URL for a given storage key.
   * @param key - The storage object key
   * @returns The URL to access the file
   */
  getUrl(key: string): string;
}
```

**Step 2: Commit**

```bash
git add src/lib/protocol/interfaces/storage.interface.ts
git commit -m "feat: add storage interface for protocol layer"
```

---

### Task 2: Create the S3 storage adapter

**Files:**
- Create: `src/adapters/storage.adapter.ts`

**Dependencies:** Task 1 (interface exists for reference, but not imported)

**Step 1: Create `storage.adapter.ts`**

The adapter structurally aligns with the `Storage` interface but does NOT import it. It receives all config via constructor.

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

interface S3StorageConfig {
  endpoint?: string;
  region?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  bucket: string;
  baseUrl?: string;
}

/**
 * S3-compatible storage adapter.
 * Structurally aligns with the protocol Storage interface.
 */
export class S3StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private baseUrl: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.baseUrl = config.baseUrl ?? '/storage';
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'auto',
      credentials: config.credentials,
      forcePathStyle: false,
    });
  }

  /**
   * Generate the storage URL for a given key.
   */
  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /**
   * Upload a buffer to S3.
   * @returns The URL to access the uploaded file
   */
  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.client.send(command);
    return this.getUrl(key);
  }

  /**
   * Upload an avatar image to S3.
   * @returns The URL to access the avatar
   */
  async uploadAvatar(
    buffer: Buffer,
    userId: string,
    extension: string,
    contentType: string,
  ): Promise<string> {
    const key = `avatars/${userId}/${uuidv4()}.${extension}`;
    return this.uploadBuffer(buffer, key, contentType);
  }

  /**
   * Upload a base64-encoded image to S3.
   * @returns The URL to access the image
   */
  async uploadBase64Image(base64Image: string, folder: string = 'feedback'): Promise<string> {
    const matches = base64Image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    let buffer: Buffer;
    let contentType = 'image/png';

    if (matches && matches.length === 3) {
      contentType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Image, 'base64');
    }

    const extension = contentType.split('/')[1] || 'png';
    const key = `${folder}/${uuidv4()}.${extension}`;
    return this.uploadBuffer(buffer, key, contentType);
  }
}
```

**Step 2: Commit**

```bash
git add src/adapters/storage.adapter.ts
git commit -m "feat: add S3 storage adapter"
```

---

### Task 3: Write tests for S3StorageAdapter

**Files:**
- Create: `tests/adapters/storage.adapter.spec.ts`

**Dependencies:** Task 2

**Step 1: Write tests**

Test `getUrl` and `uploadBase64Image` parsing logic (the parts that don't need a real S3 connection). Mock the S3Client for `uploadBuffer` and `uploadAvatar`.

```typescript
import { config } from 'dotenv';
config({ path: '.env.development', override: true });

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { S3StorageAdapter } from '../../src/adapters/storage.adapter';

// Mock S3Client.send to avoid real S3 calls
const mockSend = mock(() => Promise.resolve({}));
mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockSend;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

function createAdapter(baseUrl?: string) {
  return new S3StorageAdapter({
    endpoint: 'https://fake.endpoint',
    region: 'us-east-1',
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
    bucket: 'test-bucket',
    baseUrl,
  });
}

describe('S3StorageAdapter', () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  describe('getUrl', () => {
    it('returns /storage/{key} by default', () => {
      const adapter = createAdapter();
      expect(adapter.getUrl('avatars/123/abc.png')).toBe('/storage/avatars/123/abc.png');
    });

    it('uses custom baseUrl when provided', () => {
      const adapter = createAdapter('https://cdn.example.com');
      expect(adapter.getUrl('avatars/123/abc.png')).toBe('https://cdn.example.com/avatars/123/abc.png');
    });
  });

  describe('uploadBuffer', () => {
    it('calls S3 and returns the storage URL', async () => {
      const adapter = createAdapter();
      const result = await adapter.uploadBuffer(Buffer.from('data'), 'test/file.txt', 'text/plain');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toBe('/storage/test/file.txt');
    });
  });

  describe('uploadAvatar', () => {
    it('uploads under avatars/{userId}/ path and returns URL', async () => {
      const adapter = createAdapter();
      const result = await adapter.uploadAvatar(Buffer.from('img'), 'user-1', 'png', 'image/png');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toStartWith('/storage/avatars/user-1/');
      expect(result).toEndWith('.png');
    });
  });

  describe('uploadBase64Image', () => {
    it('parses data URI prefix and uploads', async () => {
      const adapter = createAdapter();
      const base64 = 'data:image/jpeg;base64,/9j/4AAQ';
      const result = await adapter.uploadBase64Image(base64, 'feedback');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toStartWith('/storage/feedback/');
      expect(result).toEndWith('.jpeg');
    });

    it('handles raw base64 without prefix', async () => {
      const adapter = createAdapter();
      const result = await adapter.uploadBase64Image('iVBOR', 'screenshots');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toStartWith('/storage/screenshots/');
      expect(result).toEndWith('.png');
    });

    it('defaults folder to feedback', async () => {
      const adapter = createAdapter();
      const result = await adapter.uploadBase64Image('iVBOR');
      expect(result).toStartWith('/storage/feedback/');
    });
  });
});
```

**Step 2: Run tests to verify they pass**

```bash
bun test tests/adapters/storage.adapter.spec.ts
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/adapters/storage.adapter.spec.ts
git commit -m "test: add S3StorageAdapter unit tests"
```

---

### Task 4: Inject storage adapter into UploadController

**Files:**
- Modify: `src/controllers/upload.controller.ts` (lines 13, 83, 207-209)
- Modify: `src/main.ts` (lines 12, 69)

**Dependencies:** Task 2

**Step 1: Update `upload.controller.ts`**

Remove the `import { uploadAvatarToS3 } from '../lib/s3'` line. Add a constructor that accepts a storage adapter. Use `this.storage.uploadAvatar(...)` instead of `uploadAvatarToS3(...)`.

Changes to make:

1. Remove line 13: `import { uploadAvatarToS3 } from '../lib/s3';`
2. Add constructor and private field:
   ```typescript
   export class UploadController {
     private storage: { uploadAvatar(buffer: Buffer, userId: string, extension: string, contentType: string): Promise<string> };

     constructor(storage: { uploadAvatar(buffer: Buffer, userId: string, extension: string, contentType: string): Promise<string> }) {
       this.storage = storage;
     }
   ```
3. Line 209: Replace `uploadAvatarToS3(buffer, user.id, ext, mimeType)` with `this.storage.uploadAvatar(buffer, user.id, ext, mimeType)`

**Step 2: Update `main.ts`**

1. Add import: `import { S3StorageAdapter } from './adapters/storage.adapter';`
2. Create the adapter instance before controller instantiation:
   ```typescript
   const storageAdapter = new S3StorageAdapter({
     endpoint: process.env.S3_ENDPOINT,
     region: process.env.S3_REGION,
     credentials: {
       accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
       secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
     },
     bucket: process.env.S3_BUCKET || '',
   });
   ```
3. Change `new UploadController()` to `new UploadController(storageAdapter)`

**Step 3: Commit**

```bash
git add src/controllers/upload.controller.ts src/main.ts
git commit -m "refactor: inject storage adapter into UploadController"
```

---

### Task 5: Delete `src/lib/s3.ts` and verify

**Files:**
- Delete: `src/lib/s3.ts`

**Dependencies:** Task 4

**Step 1: Verify no remaining imports of `src/lib/s3`**

```bash
grep -r "from.*lib/s3" src/ --include="*.ts"
```

Expected: No results.

**Step 2: Delete the file**

```bash
rm src/lib/s3.ts
```

**Step 3: Run the adapter tests to make sure nothing is broken**

```bash
bun test tests/adapters/storage.adapter.spec.ts
```

Expected: All tests pass.

**Step 4: Run lint to check for errors**

```bash
bun run lint
```

Expected: No new errors.

**Step 5: Commit**

```bash
git add -u src/lib/s3.ts
git commit -m "refactor: remove standalone s3 utility in favor of storage adapter"
```
