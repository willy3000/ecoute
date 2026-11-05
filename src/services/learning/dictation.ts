import { normalize } from '../../utils/text';

export type WordResult =
  | { kind: 'correct'; expected: string; typed: string }
  /** Right letters, wrong or missing accents. Capitals are ignored entirely. */
  | { kind: 'accent'; expected: string; typed: string }
  | { kind: 'wrong'; expected: string; typed: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; typed: string };

export interface DictationResult {
  words: WordResult[];
  /** 0 to 1, where accent-only slips count as half an error. */
  score: number;
  perfect: boolean;
}

/** Splits on spaces and elisions while keeping each word's original spelling. */
export function tokenize(text: string): string[] {
  return text
    .replace(/[’`´]/g, "'")
    .replace(/ /g, ' ')
    .replace(/[.,!?;:«»"()…—–]/g, ' ')
    .replace(/'/g, "' ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

const exactKey = (w: string) => w.toLowerCase().replace(/’/g, "'");

/** Word-level alignment between the expected sentence and what was typed. */
export function compareDictation(expected: string, typed: string): DictationResult {
  const a = tokenize(expected);
  const b = tokenize(typed);
  const n = a.length;
  const m = b.length;

  // Edit-distance table where a loose match costs less than a substitution, so
  // an accent slip aligns with its word instead of being treated as a new one.
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => cost[i]![j]!;
  for (let i = 0; i <= n; i++) cost[i]![0] = i * 2;
  for (let j = 0; j <= m; j++) cost[0]![j] = j * 2;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i]![j] = Math.min(at(i - 1, j - 1) + subCost(a[i - 1]!, b[j - 1]!), at(i - 1, j) + 2, at(i, j - 1) + 2);
    }
  }

  const words: WordResult[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && at(i, j) === at(i - 1, j - 1) + subCost(a[i - 1]!, b[j - 1]!)) {
      words.unshift(classify(a[i - 1]!, b[j - 1]!));
      i--;
      j--;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + 2) {
      words.unshift({ kind: 'missing', expected: a[i - 1]! });
      i--;
    } else {
      words.unshift({ kind: 'extra', typed: b[j - 1]! });
      j--;
    }
  }

  let errors = 0;
  for (const w of words) {
    if (w.kind === 'accent') errors += 0.5;
    else if (w.kind !== 'correct') errors += 1;
  }
  const score = n === 0 ? 0 : Math.max(0, 1 - errors / Math.max(n, m));
  return { words, score, perfect: errors === 0 && n > 0 };
}

function subCost(x: string, y: string): number {
  if (exactKey(x) === exactKey(y)) return 0;
  if (normalize(x) === normalize(y)) return 1;
  return 3;
}

function classify(expected: string, typed: string): WordResult {
  if (exactKey(expected) === exactKey(typed)) return { kind: 'correct', expected, typed };
  if (normalize(expected) === normalize(typed)) return { kind: 'accent', expected, typed };
  return { kind: 'wrong', expected, typed };
}
