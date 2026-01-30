/**
 * Interface for scraping web content.
 */
export interface Scraper {
  /**
   * Scrapes the content from the given URL.
   * @param url The URL to scrape.
   * @returns The scraped text content.
   */
  scrape(url: string): Promise<string>;

  /**
   * Extracts content from a URL using Parallel.ai API.
   * @param url The URL to extract content from.
   * @returns The extracted content as a string, or null if extraction failed.
   */
  extractUrlContent(url: string): Promise<string | null>;
}
