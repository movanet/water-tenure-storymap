/**
 * Bundled copy of the tenure vocabulary. The source of truth is the API's
 * api/app/data/tenure_vocab.json; `tenure_vocab.json` in this folder is a
 * verbatim copy used for labels and colours, so the map legend and the
 * typology page work even when the API is unreachable. If you change the
 * API vocabulary (or point VOCAB_PATH at your own), copy the same file here
 * and rebuild the web app. A test (api/tests/test_vocab_sync.py) fails when
 * the two copies differ.
 */

import vocabJson from "./tenure_vocab.json";

export type SecurityRating = 1 | 2 | 3 | 4 | "NA" | "NR" | string;

export interface TenureType {
  id: string;
  fao_key?: string | null;
  fao_name?: string;
  family?: string;
  category: string;
  label: string;
  definition: string;
  color?: string;
  analyzed: boolean;
  legal_security: SecurityRating;
  perceived_security: SecurityRating;
  examples: string[];
  sensitivity_default?: "public" | "aggregate_only";
}

export interface VocabItem {
  id: string;
  label: string;
}

export interface TenureVocab {
  version: string;
  source: string;
  tenure_types: TenureType[];
  use_types: VocabItem[];
  actor_groups: Array<string | VocabItem>;
  di_schemes: Array<string | VocabItem>;
  seasons: Array<string | VocabItem>;
  confidence_levels: Array<string | VocabItem>;
  security_scale: Record<string, string>;
  sensitivity_levels: Array<string | VocabItem>;
}

export const TENURE_VOCAB = vocabJson as unknown as TenureVocab;

/** Controlled-list entries as {id, label}, whether the JSON uses strings or objects. */
export function vocabItems(list: Array<string | VocabItem> | undefined): VocabItem[] {
  return (list ?? []).map((item) =>
    typeof item === "string" ? { id: item, label: item } : { id: item.id, label: item.label ?? item.id }
  );
}

export function getTenureType(id: string | undefined): TenureType | undefined {
  if (!id) return undefined;
  return TENURE_VOCAB.tenure_types.find((t) => t.id === id);
}

export function getUseTypeLabel(id: string | undefined): string {
  if (!id) return "";
  return TENURE_VOCAB.use_types.find((u) => u.id === id)?.label ?? id;
}

/** Label of an entry in a controlled list (seasons, actor groups, ...). */
export function itemLabel(list: Array<string | VocabItem> | undefined, id: string): string {
  return vocabItems(list).find((item) => item.id === id)?.label ?? id;
}

/** Human label for a security rating value (handles NA/NR and prose ratings). */
export function securityLabel(value: unknown): string {
  const key = String(value ?? "");
  return TENURE_VOCAB.security_scale[key] ?? key;
}
