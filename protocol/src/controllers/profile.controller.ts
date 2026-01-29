import { eq, and } from 'drizzle-orm';
import * as schema from '../lib/schema';
import db from '../lib/db';
import { IndexEmbedder } from '../lib/embedder';
import { ProfileGraphFactory } from '../lib/protocol/graphs/profile/profile.graph';
import { Database, DatabaseCreateOption, DatabaseFilterOption, DatabaseUpdateOption } from '../lib/protocol/interfaces/database.interface';
import { Scraper } from '../lib/protocol/interfaces/scraper.interface';
import { Embedder } from '../lib/protocol/interfaces/embedder.interface';

// --- Adapters ---

import { searchUser } from '../lib/parallel/parallel';

export class DrizzleDatabaseAdapter implements Database {
  private getTable(collection: string) {
    if (collection === 'user_profiles') return schema.userProfiles;
    if (collection === 'users') return schema.users;
    throw new Error(`Unknown collection: ${collection}`);
  }

  private buildFilter(table: any, filter?: Record<string, any>) {
    if (!filter || Object.keys(filter).length === 0) return undefined;

    const conditions = Object.entries(filter).map(([key, value]) => {
      // Handle special case where graph might ask for 'id' but means 'userId' if we want to be smart,
      // but strictly we should follow the field name. 
      // However, looking at profile.graph.ts, there seems to be a mix-up. 
      // We will map fields strictly for now.
      if (table[key]) {
        return eq(table[key], value);
      }
      return undefined;
    }).filter(Boolean);

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions as any[]);
  }

  async get<T>(collection: string, options: DatabaseFilterOption<T>): Promise<T | null> {
    const table = this.getTable(collection);
    const filters = this.buildFilter(table, options.filter);

    // Using simple query API if possible, generic findFirst
    // But since we need dynamic table selection, we might use db.select().from(table).where(...)

    let query = db.select().from(table as any);
    if (filters) {
      query = query.where(filters) as any;
    }
    if (options.limit) {
      query = query.limit(options.limit) as any;
    }

    const results = await query;
    return (results[0] as T) || null;
  }

  async getById<T>(collection: string, id: string): Promise<T | null> {
    return this.get<T>(collection, { filter: { id } });
  }

  async getMany<T>(collection: string, options: DatabaseFilterOption<T> = {}): Promise<T[]> {
    const table = this.getTable(collection);
    const filters = this.buildFilter(table, options?.filter);

    let query = db.select().from(table as any);
    if (filters) {
      query = query.where(filters) as any;
    }
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    const results = await query;
    return results as T[];
  }

  async create<T>(collection: string, options: DatabaseCreateOption<T>): Promise<T> {
    const table = this.getTable(collection);
    const result = await db.insert(table as any).values(options.data as any).returning();
    return result[0] as T;
  }

  async update<T>(collection: string, options: DatabaseUpdateOption<T>): Promise<number> {
    const table = this.getTable(collection);
    const filters = this.buildFilter(table, options.filter);

    if (!filters) throw new Error("Update requires a filter");

    const result = await db.update(table as any)
      .set(options.data as any)
      .where(filters)
      .returning();

    return result.length;
  }

  async count<T>(collection: string, options?: Pick<DatabaseFilterOption<T>, 'filter'>): Promise<number> {
    const table = this.getTable(collection);
    // Rough implementation
    const records = await this.getMany(collection, options);
    return records.length;
  }

  async exists<T>(collection: string, options: Pick<DatabaseFilterOption<T>, 'filter'>): Promise<boolean> {
    const record = await this.get(collection, { ...options, limit: 1 });
    return !!record;
  }

  async delete<T>(collection: string, options: Pick<DatabaseFilterOption<T>, 'filter'>): Promise<number> {
    const table = this.getTable(collection);
    const filters = this.buildFilter(table, options.filter);

    if (!filters) throw new Error("Delete requires a filter");

    const result = await db.delete(table as any).where(filters).returning();
    return result.length;
  }
}

export class ParallelScraperAdapter implements Scraper {
  async scrape(objective: string): Promise<string> {
    try {
      const response = await searchUser({ objective });

      const formattedResults = response.results.map(r => {
        return `Title: ${r.title}\nURL: ${r.url}\nExcerpts:\n${r.excerpts.join('\n')}`;
      }).join('\n\n');

      if (!formattedResults) {
        return `No information found for objective: ${objective}`;
      }

      return `Objective: ${objective}\n\nSearch Results:\n${formattedResults}`;
    } catch (error: any) {
      console.error("ParallelScraperAdapter error:", error);
      // Fallback: return objective so the flow continues, albeit with less info
      return `Objective: ${objective}\n\n(Search failed: ${error.message})`;
    }
  }
}

// --- Controller ---

export class ProfileController {
  private db: Database;
  private embedder: Embedder;
  private scraper: Scraper;
  private factory: ProfileGraphFactory;

  constructor() {
    this.db = new DrizzleDatabaseAdapter();
    // IndexEmbedder (from ../lib/embedder) implements Embedder interface
    this.embedder = new IndexEmbedder();
    this.scraper = new ParallelScraperAdapter();
    this.factory = new ProfileGraphFactory(this.db, this.embedder, this.scraper);
  }

  /**
   * Syncs/Generates a profile for the given user.
   * This is the main entry point to trigger the profile graph.
   */
  async sync(userId: string) {
    const graph = this.factory.createGraph();

    // Invoke the graph
    // The graph expects { userId } in the state.
    const result = await graph.invoke({ userId });

    return result;
  }
}
