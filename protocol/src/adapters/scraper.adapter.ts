/**
 * Scraper adapter for web search and URL extraction.
 * Only imports from lib/parallel/.
 */

import { searchUser, extractUrlContent } from '../lib/parallel/parallel';

/**
 * Scraper adapter for web search and URL extraction.
 * Used for profile enrichment (e.g. Chat Graph, Profile Graph).
 */
export class ScraperAdapter {
  /**
   * Scrapes the web for information related to the given objective.
   * @param objective - The search objective/query
   * @returns Formatted search results as a string
   */
  async scrape(objective: string): Promise<string> {
    try {
      const response = await searchUser({ objective });
      const formattedResults = response.results
        .map((r) => `Title: ${r.title}\nURL: ${r.url}\nExcerpts:\n${r.excerpts.join('\n')}`)
        .join('\n\n');
      if (!formattedResults) {
        return `No information found for objective: ${objective}`;
      }
      return `Objective: ${objective}\n\nSearch Results:\n${formattedResults}`;
    } catch (error: unknown) {
      console.error('ScraperAdapter error:', error);
      return `Objective: ${objective}\n\n(Search failed: ${error instanceof Error ? error.message : String(error)})`;
    }
  }

  /**
   * Extracts content from a URL.
   * @param url - The URL to extract content from
   * @returns The extracted content as a string, or null if extraction failed
   */
  async extractUrlContent(url: string): Promise<string | null> {
    return extractUrlContent(url);
  }
}
