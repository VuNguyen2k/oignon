<script setup lang="ts">
import { computed } from 'vue'
import { COLORMAPS, type Colormap } from '@/lib/colormap'
import { useGraphStore } from '@/stores/graph'
import { WORK_TYPE_BUCKETS, WORK_TYPE_LABELS, type WorkTypeBucket } from '@/lib/workTypes'

const store = useGraphStore()

const isLandscape = computed(() => store.effectiveLayoutMode === 'landscape')

const emit = defineEmits<{
  colormapChange: [index: number]
  toggleParticles: []
  toggleTypeBucket: [bucket: WorkTypeBucket]
}>()

function stopToRgb(stop: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(stop.r * 255)}, ${Math.round(stop.g * 255)}, ${Math.round(stop.b * 255)})`
}

function getGradientStyle(colormap: Colormap): string {
  const stops = colormap.stops.map((s) => `${stopToRgb(s)} ${s.t * 100}%`).join(', ')
  return `linear-gradient(135deg, ${stops})`
}

function selectColormap(index: number) {
  emit('colormapChange', index)
}

function isBucketEnabled(bucket: WorkTypeBucket): boolean {
  return !store.disabledTypeBuckets.has(bucket)
}
</script>

<template>
  <div class="controls-content" :class="{ landscape: isLandscape }">
    <div class="controls-group" :class="{ landscape: isLandscape }">
      <!-- Colormap + particles stack (1st column / 1st row) -->
      <div class="colormap-stack" :class="{ landscape: isLandscape }">
        <div class="colormap-buttons" :class="{ landscape: isLandscape }">
          <button
            v-for="(colormap, index) in COLORMAPS"
            :key="colormap.name"
            class="colormap-btn"
            :class="{ active: store.activeColormap === index }"
            :style="{ background: getGradientStyle(colormap) }"
            :title="colormap.name"
            @click="selectColormap(index)"
          >
            <span class="colormap-gloss" />
          </button>
        </div>
        <!-- Particles toggle (only in dark mode) -->
        <button
          v-if="store.isDarkMode"
          class="particles-btn"
          :class="{ active: store.particlesEnabled }"
          title="Toggle particles"
          @click="emit('toggleParticles')"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="6" cy="12" r="3" />
            <circle cx="14" cy="7" r="2.5" />
            <circle cx="17" cy="15" r="2" />
          </svg>
        </button>
      </div>

      <!-- Work-type filter buttons (2nd column / 2nd row) -->
      <div class="type-filter-buttons" :class="{ landscape: isLandscape }">
        <button
          v-for="bucket in WORK_TYPE_BUCKETS"
          :key="bucket"
          class="type-btn"
          :class="{ active: isBucketEnabled(bucket) }"
          :title="WORK_TYPE_LABELS[bucket]"
          @click="emit('toggleTypeBucket', bucket)"
        >
          <!-- article: document with lines -->
          <svg
            v-if="bucket === 'article'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
            <line x1="8" y1="9" x2="10" y2="9" />
          </svg>
          <!-- review: magazine / collection of works -->
          <svg
            v-else-if="bucket === 'review'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6z" />
          </svg>
          <!-- preprint: document with asterisk -->
          <svg
            v-else-if="bucket === 'preprint'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="13" x2="12" y2="19" />
            <line x1="9.5" y1="14.5" x2="14.5" y2="17.5" />
            <line x1="14.5" y1="14.5" x2="9.5" y2="17.5" />
          </svg>
          <!-- peer-review: comment bubble with checkmark -->
          <svg
            v-else-if="bucket === 'peer-review'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <polyline points="8 10 11 13 16 7" />
          </svg>
          <!-- book / book-chapter -->
          <svg
            v-else-if="bucket === 'book'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <!-- dataset: hard drive -->
          <svg
            v-else-if="bucket === 'dataset'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="22" y1="12" x2="2" y2="12" />
            <path
              d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
            />
            <line x1="6" y1="16" x2="6.01" y2="16" />
            <line x1="10" y1="16" x2="10.01" y2="16" />
          </svg>
          <!-- other: ellipsis -->
          <svg
            v-else
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  gap: clamp(12px, 4vw, 24px);
}

/* Portrait: stack type-filter row on top, colormap underneath
   (column-reverse since DOM lists colormap first for landscape ordering).
   Landscape: place colormap column on the left, type-filter column on the right. */
.controls-group {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2.5vw, 18px);
}

.controls-group.landscape {
  flex-direction: row;
}

/* Type-filter buttons: row in portrait, column in landscape */
.type-filter-buttons {
  display: flex;
  flex-direction: row;
  gap: clamp(6px, 2vw, 10px);
}

.type-filter-buttons.landscape {
  flex-direction: column;
}

.type-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-item);
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  color: var(--text-dim);
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    opacity var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.type-btn:active {
  transform: scale(0.9);
}

.type-btn.active {
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.type-btn:not(.active) {
  opacity: 0.5;
}

/* Colormap stack: row in portrait (colormap then particles), column in landscape */
.colormap-stack {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: clamp(12px, 4vw, 24px);
}

.colormap-stack.landscape {
  flex-direction: column;
}

.colormap-buttons {
  display: flex;
  flex-direction: row;
  gap: clamp(8px, 3vw, 16px);
}

.colormap-buttons.landscape {
  flex-direction: column;
}

.colormap-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.colormap-btn:active {
  transform: scale(0.9);
}

.colormap-btn.active {
  border-color: var(--text-primary);
  transform: scale(0.9);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
}

.colormap-gloss {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.3) 0%,
    rgba(255, 255, 255, 0.1) 40%,
    rgba(0, 0, 0, 0.05) 60%,
    rgba(0, 0, 0, 0.15) 100%
  );
  pointer-events: none;
}

.particles-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-item);
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  color: var(--text-dim);
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    opacity var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.particles-btn:active {
  transform: scale(0.9);
}

.particles-btn.active {
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.particles-btn:not(.active) {
  opacity: 0.5;
}
</style>
