
const PARALLEL_API_URL = 'https://api.parallel.ai/v1beta/search';

export interface ParallelSearchResponse {
    search_id: string;
    results: {
        url: string;
        title: string;
        publish_date: null;
        excerpts: Array<string>
    }[]
}

/**
 * Searches for a user using Parallel.ai API.
 * @param objective The specific query, e.g. 'seren sandikci, "seren@index.network"'
 */
export async function searchUser(objective: string): Promise<ParallelSearchResponse> {
    const apiKey = process.env.PARALLELS_API_KEY;
    if (!apiKey) {
        throw new Error('PARALLELS_API_KEY is not defined');
    }

    const response = await fetch(PARALLEL_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'parallel-beta': 'search-extract-2025-10-10'
        },
        body: JSON.stringify({
            mode: 'one-shot',
            search_queries: null,
            max_results: 10,
            objective: objective
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Parallel Search API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json() as ParallelSearchResponse;
}
