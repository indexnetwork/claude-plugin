import { useAuthenticatedAPI } from '../lib/api';

/** Info returned when listing API keys (the raw key is never returned after creation). */
export interface ApiKeyInfo {
  id: string;
  name: string | null;
  start: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastRefill: string | null;
}

/** Response from creating a new API key. The `key` field is only shown once. */
export interface CreateApiKeyResponse {
  key: string;
  id: string;
  name: string | null;
  createdAt: string;
}

/** Service factory for API key management via Better Auth endpoints. */
export const createApiKeysService = (api: ReturnType<typeof useAuthenticatedAPI>) => ({
  /** Create a new API key with the given display name. */
  create: async (name: string): Promise<CreateApiKeyResponse> => {
    return api.post<CreateApiKeyResponse>('/auth/api-key/create', { name });
  },

  /** List all API keys for the current user. */
  list: async (): Promise<ApiKeyInfo[]> => {
    // Better Auth returns { apiKeys: [...] }
    const response = await api.get<unknown>('/auth/api-key/list');
    if (Array.isArray(response)) return response as ApiKeyInfo[];
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      if (Array.isArray(obj.apiKeys)) return obj.apiKeys as ApiKeyInfo[];
      // Fallback: find any array property
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) return value as ApiKeyInfo[];
      }
    }
    return [];
  },

  /** Permanently revoke an API key by ID. */
  revoke: async (id: string): Promise<void> => {
    await api.post<{ success: boolean }>('/auth/api-key/delete', { keyId: id });
  },
});
