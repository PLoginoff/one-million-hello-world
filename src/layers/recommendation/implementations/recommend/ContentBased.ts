/**
 * ContentBased
 *
 * Content-based recommendation: items are described by text/feature
 * content, turned into TF-IDF vectors, and matched against a user profile
 * built from items the user rated highly.
 */

import {
  RatingMatrix,
  IRecommender,
  ScoredItem,
  RecommendOptions,
  UserId,
  ItemId,
} from './Types';
import { cosineSim, SparseVector } from './Similarity';

export interface ItemContent {
  readonly itemId: ItemId;
  /** raw text content (tokenized internally) */
  readonly text?: string;
  /** explicit numeric features (e.g. genre flags, price bucket) */
  readonly features?: ReadonlyMap<string, number>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((s) => s.length > 0);
}

export class ItemProfileStore {
  private readonly contents: Map<ItemId, ItemContent>;
  private readonly tfidf: Map<ItemId, Map<string, number>>;
  private readonly docFreq: Map<string, number>;

  constructor(contents: readonly ItemContent[] = []) {
    this.contents = new Map();
    this.tfidf = new Map();
    this.docFreq = new Map();
    for (const c of contents) this.add(c);
  }

  add(content: ItemContent): void {
    this.contents.set(content.itemId, content);
    this.rebuild();
  }

  addAll(contents: readonly ItemContent[]): void {
    for (const c of contents) this.contents.set(c.itemId, c);
    this.rebuild();
  }

  private rebuild(): void {
    this.tfidf.clear();
    this.docFreq.clear();
    const n = this.contents.size;
    // document frequency over tokens
    const tokenized = new Map<ItemId, string[]>();
    for (const [id, c] of this.contents) {
      const tokens = c.text !== undefined ? tokenize(c.text) : [];
      tokenized.set(id, tokens);
      for (const t of new Set(tokens)) {
        this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
      }
    }
    for (const [id, c] of this.contents) {
      const vec = new Map<string, number>();
      const tokens = tokenized.get(id) ?? [];
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, tf] of counts) {
        const df = this.docFreq.get(t) ?? 1;
        const idf = Math.log(1 + n / df);
        vec.set(`tok:${t}`, Math.sqrt(tf) * idf);
      }
      if (c.features !== undefined) {
        for (const [k, v] of c.features) {
          vec.set(`feat:${k}`, v);
        }
      }
      this.tfidf.set(id, vec);
    }
  }

  vector(itemId: ItemId): SparseVector {
    return this.tfidf.get(itemId) ?? new Map();
  }

  has(itemId: ItemId): boolean {
    return this.contents.has(itemId);
  }

  items(): ItemId[] {
    return [...this.contents.keys()];
  }
}

export interface ContentBasedOptions {
  /** ratings at or above this count as "liked" for profile building */
  readonly likeThreshold?: number;
  /** weight of a rating in the profile accumulation */
  readonly weightByRating?: boolean;
}

export class ContentBasedRecommender implements IRecommender {
  readonly name = 'content-based';
  private readonly matrix: RatingMatrix;
  private readonly profiles: ItemProfileStore;
  private readonly likeThreshold: number;
  private readonly weightByRating: boolean;

  constructor(
    matrix: RatingMatrix,
    profiles: ItemProfileStore,
    options: ContentBasedOptions = {}
  ) {
    this.matrix = matrix;
    this.profiles = profiles;
    this.likeThreshold = options.likeThreshold ?? 3.5;
    this.weightByRating = options.weightByRating ?? true;
  }

  /** Build the user's content profile = weighted sum of liked item vectors. */
  userProfile(userId: UserId): Map<string, number> {
    const profile = new Map<string, number>();
    const ratings = this.matrix.userRatings(userId);
    for (const [itemId, rating] of ratings) {
      if (rating < this.likeThreshold) continue;
      const vec = this.profiles.vector(itemId);
      const w = this.weightByRating ? rating : 1;
      for (const [k, v] of vec) {
        profile.set(k, (profile.get(k) ?? 0) + v * w);
      }
    }
    return profile;
  }

  score(userId: UserId, itemId: ItemId): number {
    const profile = this.userProfile(userId);
    if (profile.size === 0) return 0;
    const vec = this.profiles.vector(itemId);
    return cosineSim(profile, vec);
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    const topN = options.topN ?? 10;
    const exclude = options.exclude;
    const profile = this.userProfile(userId);
    if (profile.size === 0) return [];
    const out: ScoredItem[] = [];
    const rated = this.matrix.userRatings(userId);
    for (const itemId of this.profiles.items()) {
      if (rated.has(itemId)) continue;
      if (exclude !== undefined && exclude.has(itemId)) continue;
      const score = cosineSim(profile, this.profiles.vector(itemId));
      if (score <= 0) continue;
      out.push({ itemId, score });
    }
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, topN);
  }
}
