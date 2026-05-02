import { type WorkTypeBucket, bucketForType } from './workTypes'

/** Alpha that filtered-out nodes/clones fade to (rather than disappearing). */
export const TYPE_FILTER_HIDDEN_ALPHA = 0.15

/**
 * Single source of truth for work-type filtering. Owns the per-node bucket
 * mapping and the current set of disabled buckets, and provides query methods
 * used by both the main graph and the selection overlay so the filter logic
 * lives in one place.
 */
export class TypeFilter {
  private nodeBuckets: Map<string, WorkTypeBucket> = new Map()
  private disabled: Set<WorkTypeBucket> = new Set()

  /** Replace the per-node bucket mapping. Called once per graph build. */
  setNodeBuckets(buckets: Map<string, WorkTypeBucket>) {
    this.nodeBuckets = buckets
  }

  /** Helper to derive the bucket from a raw OpenAlex `type` and store it. */
  setNodeType(id: string, rawType: string | undefined | null) {
    this.nodeBuckets.set(id, bucketForType(rawType))
  }

  setDisabled(disabled: Set<WorkTypeBucket>) {
    this.disabled = new Set(disabled)
  }

  /** Whether the node's bucket is currently filtered out. */
  isNodeHidden(id: string): boolean {
    const bucket = this.nodeBuckets.get(id) ?? 'other'
    return this.disabled.has(bucket)
  }

  /** Target alpha for a node container or its endpoint clone. */
  nodeTargetAlpha(id: string): number {
    return this.isNodeHidden(id) ? TYPE_FILTER_HIDDEN_ALPHA : 1
  }

  /** Whether a curve should be hidden because either endpoint is filtered. */
  isCurveHidden(sourceNodeId: string, targetNodeId: string): boolean {
    return this.isNodeHidden(sourceNodeId) || this.isNodeHidden(targetNodeId)
  }

  /** Target per-curve progress (0 = fully un-drawn, 1 = fully drawn). */
  curveTargetProgress(sourceNodeId: string, targetNodeId: string): number {
    return this.isCurveHidden(sourceNodeId, targetNodeId) ? 0 : 1
  }

  /** Current disabled-bucket count, useful for "any filter active" checks. */
  get hasFilter(): boolean {
    return this.disabled.size > 0
  }
}
