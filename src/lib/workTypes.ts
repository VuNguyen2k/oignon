/**
 * Maps OpenAlex work `type` values to a small set of UI buckets used by the
 * type-filter toggles in the settings panel.
 *
 * OpenAlex types: article, book, book-chapter, dataset, dissertation,
 * editorial, erratum, grant, letter, monograph, paratext, peer-review,
 * preprint, reference-entry, report, review, standard, supplementary-materials.
 */

export type WorkTypeBucket =
  | 'article'
  | 'review'
  | 'preprint'
  | 'peer-review'
  | 'book'
  | 'dataset'
  | 'other'

export const WORK_TYPE_BUCKETS: readonly WorkTypeBucket[] = [
  'article',
  'review',
  'preprint',
  'peer-review',
  'book',
  'dataset',
  'other',
] as const

export const DEFAULT_DISABLED_BUCKETS: readonly WorkTypeBucket[] = ['preprint', 'peer-review']

export const WORK_TYPE_LABELS: Record<WorkTypeBucket, string> = {
  article: 'Articles',
  review: 'Reviews',
  preprint: 'Preprints',
  'peer-review': 'Peer reviews',
  book: 'Books / chapters',
  dataset: 'Datasets',
  other: 'Other',
}

export function bucketForType(rawType: string | undefined | null): WorkTypeBucket {
  if (!rawType) return 'other'
  const t = rawType.toLowerCase()
  switch (t) {
    case 'article':
    case 'journal-article':
      return 'article'
    case 'review':
      return 'review'
    case 'preprint':
      return 'preprint'
    case 'peer-review':
      return 'peer-review'
    case 'book':
    case 'book-chapter':
    case 'monograph':
    case 'reference-entry':
      return 'book'
    case 'dataset':
      return 'dataset'
    default:
      return 'other'
  }
}
