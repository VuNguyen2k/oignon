import { Container, Sprite, Texture } from 'pixi.js'
import { BatchedCurveMesh } from './BatchedCurveMesh'
import type { CurveData } from './BatchedCurveGeometry'
import { AnimationRunner, animateProgress } from './AnimationRunner'
import { easeInOutCubic } from './easing'
import { TypeFilter } from './TypeFilter'

// Higher alpha for selection curves since fewer curves = less additive buildup
const SELECTION_CURVE_ALPHA = 0.45

// Endpoint fade animation duration
const ENDPOINT_FADE_DURATION = 400

/**
 * Snapshot of clone alphas + per-curve progress at the moment a filter
 * animation starts, so the renderer's animation can lerp from these stable
 * starting values to the new filter targets.
 */
export interface SelectionFilterStartState {
  cloneAlphas: Map<string, number>
  selectionCurveProgress: Float32Array | null
}

export interface CurveNodeMapping {
  curveIndex: number
  sourceNodeId: string
  targetNodeId: string
}

/**
 * Manages node selection state and visuals
 * - Adds/removes selection rings on nodes
 * - Creates filtered curve mesh for selected nodes
 * - Clones connected endpoint nodes to a top layer
 * - Animates curve drawing when selection changes
 */
export class SelectionManager {
  private selectedIds = new Set<string>()
  private connectedIds = new Set<string>()
  private selectionRingTexture: Texture | null = null
  private nodeContainers: Map<string, Container> = new Map()
  private isDarkMode = true

  // Selection curves
  readonly selectionCurvesContainer: Container
  private selectionCurvesMesh: BatchedCurveMesh | null = null
  private selectionCurveAnimationRunner = new AnimationRunner()

  // Selected endpoint nodes (cloned above curves)
  readonly selectedEndpointsContainer: Container
  private endpointClones: Map<string, Container> = new Map()
  private endpointAnimationRunner = new AnimationRunner()

  // Per-curve mapping for the SELECTION mesh (its own indexing, not the main
  // mesh's curve indices). Built alongside the mesh so the filter animation
  // can drive each entry's progress.
  private selectionMeshMappings: { sourceNodeId: string; targetNodeId: string }[] = []

  // Reference to the shared TypeFilter (single source of truth for filter
  // queries). Initialised by init() — never null after that.
  private typeFilter: TypeFilter | null = null

  constructor() {
    this.selectionCurvesContainer = new Container()
    this.selectedEndpointsContainer = new Container()
  }

  /**
   * Initialize with texture, node container references, and the shared
   * TypeFilter that drives clone alpha and selection-curve visibility.
   */
  init(
    selectionRingTexture: Texture,
    nodeContainers: Map<string, Container>,
    typeFilter: TypeFilter,
  ) {
    this.selectionRingTexture = selectionRingTexture
    this.nodeContainers = nodeContainers
    this.typeFilter = typeFilter
  }

  /**
   * Capture clone alphas + selection-curve progress at the moment a type-
   * filter animation begins, so the renderer can lerp from these stable
   * starting values to the new filter targets without us having to animate
   * here.
   */
  captureFilterStartState(): SelectionFilterStartState {
    const cloneAlphas = new Map<string, number>()
    for (const [id, clone] of this.endpointClones) {
      cloneAlphas.set(id, clone.alpha)
    }

    let selectionCurveProgress: Float32Array | null = null
    if (this.selectionCurvesMesh && this.selectionMeshMappings.length > 0) {
      const mesh = this.selectionCurvesMesh
      const values = new Float32Array(this.selectionMeshMappings.length)
      for (let i = 0; i < values.length; i++) {
        values[i] = mesh.getProgress(i)
      }
      selectionCurveProgress = values
    }

    return { cloneAlphas, selectionCurveProgress }
  }

  /**
   * Drive the selection overlay's filter animation for one tick. Called from
   * Renderer.setTypeFilter; uses the shared TypeFilter to look up per-node
   * and per-curve targets so the filter logic only lives in one place.
   */
  applyFilterTick(t: number, start: SelectionFilterStartState) {
    if (!this.typeFilter) return

    // Endpoint clones — selected nodes always animate toward 1, others
    // toward their filter target.
    for (const [id, clone] of this.endpointClones) {
      const startAlpha = start.cloneAlphas.get(id) ?? clone.alpha
      const target = this.cloneTargetAlpha(id)
      clone.alpha = startAlpha + (target - startAlpha) * t
    }

    // Selection curve mesh — respect the filter so curves to filtered
    // neighbours fade out alongside the main mesh.
    const mesh = this.selectionCurvesMesh
    if (mesh && start.selectionCurveProgress) {
      for (let i = 0; i < this.selectionMeshMappings.length; i++) {
        const m = this.selectionMeshMappings[i]!
        const startP = start.selectionCurveProgress[i] ?? 1
        const target = this.typeFilter
          ? this.typeFilter.curveTargetProgress(m.sourceNodeId, m.targetNodeId)
          : 1
        mesh.setProgress(i, startP + (target - startP) * t)
      }
      mesh.updateProgress()
    }
  }

  /**
   * Update selection ring color for dark/light mode.
   * Ring texture is white; tint to black in light mode for contrast.
   */
  setDarkMode(isDark: boolean) {
    if (isDark === this.isDarkMode) return
    this.isDarkMode = isDark
    const tint = isDark ? 0xffffff : 0x000000

    // Re-tint rings on existing selected endpoint clones.
    // Ring is the last child added after the 3 base sprites (shadow, fill, overlay).
    for (const id of this.selectedIds) {
      const clone = this.endpointClones.get(id)
      if (!clone) continue
      const ring = clone.children[clone.children.length - 1]
      if (ring instanceof Sprite) {
        ring.tint = tint
      }
    }
  }

  /**
   * Update selection, rebuilding selection curves and cloning connected endpoint nodes
   * Selection ring is now added to cloned endpoints, not original nodes
   * @returns true if selection changed
   */
  setSelected(
    nodeIds: Set<string>,
    curveDataCache: CurveData[],
    curveNodeMappings: CurveNodeMapping[],
  ): boolean {
    const changed =
      nodeIds.size !== this.selectedIds.size ||
      ![...nodeIds].every((id) => this.selectedIds.has(id))

    if (!changed) return false

    // Capture previous state before updating
    const previousSelectedIds = this.selectedIds
    const previousConnectedIds = this.connectedIds

    // Update selectedIds
    this.selectedIds = new Set(nodeIds)

    // Calculate connected node IDs and rebuild visuals
    this.connectedIds = this.calculateConnectedIds(nodeIds, curveNodeMappings)
    this.rebuildSelectionCurves(nodeIds, curveDataCache, curveNodeMappings)
    this.rebuildSelectedEndpoints(previousConnectedIds, previousSelectedIds)

    return true
  }

  /**
   * Get all node IDs connected to the selection (selected + their neighbors)
   */
  private calculateConnectedIds(
    nodeIds: Set<string>,
    curveNodeMappings: CurveNodeMapping[],
  ): Set<string> {
    if (nodeIds.size === 0) return new Set()

    const connected = new Set<string>()

    for (const mapping of curveNodeMappings) {
      const sourceSelected = nodeIds.has(mapping.sourceNodeId)
      const targetSelected = nodeIds.has(mapping.targetNodeId)

      if (sourceSelected || targetSelected) {
        connected.add(mapping.sourceNodeId)
        connected.add(mapping.targetNodeId)
      }
    }

    return connected
  }

  /**
   * Get the current set of connected node IDs (for external use)
   */
  getConnectedIds(): Set<string> {
    return new Set(this.connectedIds)
  }

  /**
   * Update colors of cloned endpoint nodes (call after colormap change)
   */
  updateEndpointColors() {
    for (const [nodeId, clone] of this.endpointClones) {
      const original = this.nodeContainers.get(nodeId)
      if (!original) continue

      // Copy tint from original fill sprite (index 1) to clone fill sprite
      const originalFill = original.children[1] as Sprite
      const cloneFill = clone.children[1] as Sprite
      if (originalFill && cloneFill) {
        cloneFill.tint = originalFill.tint
      }
    }
  }

  private rebuildSelectionCurves(
    nodeIds: Set<string>,
    curveDataCache: CurveData[],
    curveNodeMappings: CurveNodeMapping[],
  ) {
    // Destroy existing mesh
    if (this.selectionCurvesMesh) {
      this.selectionCurvesContainer.removeChild(this.selectionCurvesMesh)
      this.selectionCurvesMesh.destroy()
      this.selectionCurvesMesh = null
    }
    this.selectionMeshMappings = []

    if (nodeIds.size === 0) return

    // Find curves connected to selected nodes
    const selectionCurves: CurveData[] = []
    for (let i = 0; i < curveNodeMappings.length; i++) {
      const mapping = curveNodeMappings[i]!
      const curveData = curveDataCache[i]
      if (curveData && (nodeIds.has(mapping.sourceNodeId) || nodeIds.has(mapping.targetNodeId))) {
        selectionCurves.push(curveData)
        this.selectionMeshMappings.push({
          sourceNodeId: mapping.sourceNodeId,
          targetNodeId: mapping.targetNodeId,
        })
      }
    }

    if (selectionCurves.length === 0) return

    // Create new mesh
    this.selectionCurvesMesh = new BatchedCurveMesh({
      curves: selectionCurves,
      segments: 32,
      defaultWidth: 3,
      alpha: SELECTION_CURVE_ALPHA,
    })

    this.selectionCurvesContainer.addChild(this.selectionCurvesMesh)
    this.animateSelectionCurvesIn()
  }

  /**
   * Animate the selection mesh in. Selected node clones bypass the filter,
   * but selection curves themselves respect it: a curve is drawn only if
   * both its endpoints would be visible per the filter. If everything is
   * filtered, the user still sees the selected node highlighted but no
   * dangling connection lines.
   */
  private animateSelectionCurvesIn(duration = 500) {
    if (!this.selectionCurvesMesh) return

    const mesh = this.selectionCurvesMesh
    const mappings = this.selectionMeshMappings
    const filter = this.typeFilter

    animateProgress(this.selectionCurveAnimationRunner, duration, easeInOutCubic, (progress) => {
      if (this.selectionCurvesMesh === mesh) {
        for (let i = 0; i < mappings.length; i++) {
          const m = mappings[i]!
          const target = filter ? filter.curveTargetProgress(m.sourceNodeId, m.targetNodeId) : 1
          mesh.setProgress(i, target * progress)
        }
        mesh.updateProgress()
      }
    })
  }

  /**
   * Target alpha for an endpoint clone. Selected nodes override the filter
   * so clicking a filtered node still produces a visible selection.
   */
  private cloneTargetAlpha(id: string): number {
    if (this.selectedIds.has(id)) return 1
    return this.typeFilter ? this.typeFilter.nodeTargetAlpha(id) : 1
  }

  /**
   * Update endpoint clones with fade transitions
   */
  private rebuildSelectedEndpoints(
    previousConnectedIds: Set<string>,
    previousSelectedIds: Set<string>,
  ) {
    // Determine which endpoints to add, remove, or rebuild
    const toAdd = new Set<string>()
    const toRemove = new Set<string>()
    const toRebuild = new Set<string>()

    for (const id of this.connectedIds) {
      if (!previousConnectedIds.has(id)) {
        toAdd.add(id)
      } else {
        // Node stays connected - check if selection status changed
        const wasSelected = previousSelectedIds.has(id)
        const isSelected = this.selectedIds.has(id)
        if (wasSelected !== isSelected) {
          toRebuild.add(id)
        }
      }
    }

    for (const id of previousConnectedIds) {
      if (!this.connectedIds.has(id)) {
        toRemove.add(id)
      }
    }

    // Fade out and remove old endpoints
    for (const id of toRemove) {
      const clone = this.endpointClones.get(id)
      if (clone) {
        this.fadeOutAndRemove(clone)
        this.endpointClones.delete(id)
      }
    }

    // Rebuild endpoints whose selection status changed (instant swap, no fade)
    for (const id of toRebuild) {
      const oldClone = this.endpointClones.get(id)
      if (oldClone) {
        this.selectedEndpointsContainer.removeChild(oldClone)
      }
      const original = this.nodeContainers.get(id)
      if (original) {
        const isSelected = this.selectedIds.has(id)
        const clone = this.cloneNodeContainer(original, isSelected)
        // Instant swap. Selected nodes always render at full alpha; connected
        // (non-selected) endpoints honour the filter.
        clone.alpha = this.cloneTargetAlpha(id)
        this.selectedEndpointsContainer.addChild(clone)
        this.endpointClones.set(id, clone)
      }
    }

    // Add and fade in new endpoints
    for (const id of toAdd) {
      const original = this.nodeContainers.get(id)
      if (original) {
        // Pass isSelected=true for selected nodes to add the selection ring
        const isSelected = this.selectedIds.has(id)
        const clone = this.cloneNodeContainer(original, isSelected)
        clone.alpha = 0
        this.selectedEndpointsContainer.addChild(clone)
        this.endpointClones.set(id, clone)
        this.fadeIn(clone, id)
      }
    }
  }

  private fadeIn(container: Container, nodeId?: string) {
    const startAlpha = container.alpha
    const targetAlpha = nodeId !== undefined ? this.cloneTargetAlpha(nodeId) : 1

    animateProgress(new AnimationRunner(), ENDPOINT_FADE_DURATION, easeInOutCubic, (progress) => {
      container.alpha = startAlpha + (targetAlpha - startAlpha) * progress
    })
  }

  private fadeOutAndRemove(container: Container) {
    const startAlpha = container.alpha

    animateProgress(
      new AnimationRunner(),
      ENDPOINT_FADE_DURATION,
      easeInOutCubic,
      (progress) => {
        container.alpha = startAlpha * (1 - progress)
      },
      () => {
        this.selectedEndpointsContainer.removeChild(container)
      },
    )
  }

  /**
   * Clone a node container (shadow, fill, overlay sprites)
   * If isSelected is true, also add the selection ring
   */
  private cloneNodeContainer(original: Container, isSelected: boolean = false): Container {
    const clone = new Container()
    clone.x = original.x
    clone.y = original.y
    clone.scale.copyFrom(original.scale)
    clone.alpha = original.alpha

    // Clone the base sprites (shadow=0, fill=1, overlay=2), skip selection ring if present
    const baseChildCount = 3
    for (let i = 0; i < Math.min(original.children.length, baseChildCount); i++) {
      const child = original.children[i]
      if (child instanceof Sprite) {
        const spriteClone = new Sprite(child.texture)
        spriteClone.anchor.copyFrom(child.anchor)
        spriteClone.tint = child.tint
        clone.addChild(spriteClone)
      }
    }

    // Add selection ring to selected nodes
    if (isSelected && this.selectionRingTexture) {
      const ring = new Sprite(this.selectionRingTexture)
      ring.anchor.set(0.5)
      ring.tint = this.isDarkMode ? 0xffffff : 0x000000
      clone.addChild(ring)
    }

    return clone
  }

  /**
   * Whether any nodes are selected
   */
  get hasSelection(): boolean {
    return this.selectedIds.size > 0
  }

  /**
   * Current selected node IDs
   */
  get selected(): Set<string> {
    return new Set(this.selectedIds)
  }

  /**
   * Clear selection state, destroy curves, and remove endpoint clones
   */
  clear() {
    this.selectionCurveAnimationRunner.cancel()
    this.endpointAnimationRunner.cancel()
    this.selectedIds.clear()
    this.connectedIds.clear()
    this.endpointClones.clear()
    this.selectionMeshMappings = []

    if (this.selectionCurvesMesh) {
      this.selectionCurvesContainer.removeChild(this.selectionCurvesMesh)
      this.selectionCurvesMesh.destroy()
      this.selectionCurvesMesh = null
    }

    this.selectionCurvesContainer.removeChildren()
    this.selectedEndpointsContainer.removeChildren()
  }
}
