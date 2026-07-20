<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCelebrationStore } from '@/stores/celebration'

// App-wide confetti burst. Mounted once (App.vue); watches the celebration
// store and fires a particle animation each time `token` bumps. Everything is
// self-contained (a single <canvas>, no libraries), teleported to <body> so it
// overlays the whole page and is never clipped, and pointer-events:none so it
// never blocks clicks. Sits BELOW the toast stack (z-index) so the "thank you"
// success toast stays readable through the celebration.
const celebration = useCelebrationStore()

const canvas = ref<HTMLCanvasElement | null>(null)

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  ratio: number // height/width — flat strips flutter more convincingly than squares
  color: string
  round: boolean
}

// Lead with the "funded" green, then complementary festive accents. The brand
// black gives a few high-contrast flecks so it reads on light and dark alike.
const COLORS = [
  '#10b981',
  '#34d399',
  '#f59e0b',
  '#fbbf24',
  '#60a5fa',
  '#f472b6',
  '#a78bfa',
  '#26272a',
]

const GRAVITY = 0.22 // downward accel, px per frame² at 60fps
const DRAG = 0.992 // horizontal air resistance per frame
const MAX_LIFE_MS = 4500 // hard stop even if a particle lingers off-screen

let particles: Particle[] = []
let raf = 0
let lastTs = 0
let startTs = 0
let ctx: CanvasRenderingContext2D | null = null
let dpr = 1

/** Match the backing buffer to the viewport (CSS px × devicePixelRatio) so the
 *  strips render crisp on HiDPI screens. */
function resize() {
  const c = canvas.value
  if (!c) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.floor(window.innerWidth * dpr)
  c.height = Math.floor(window.innerHeight * dpr)
  ctx = c.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Two bottom-corner "cannons" firing up and inward — the classic celebratory
 *  spray. Velocities are per-frame-at-60fps units; the loop scales by dt. */
function spawnBurst() {
  const w = window.innerWidth
  const h = window.innerHeight
  const perSide = 70
  const origins = [
    { x: 0, y: h, baseAngle: -Math.PI / 3 }, // bottom-left → up-right
    { x: w, y: h, baseAngle: (-2 * Math.PI) / 3 }, // bottom-right → up-left
  ]
  for (const o of origins) {
    for (let i = 0; i < perSide; i++) {
      const angle = o.baseAngle + (rnd() - 0.5) * (Math.PI / 3)
      const speed = 14 + rnd() * 12
      const size = 6 + rnd() * 6
      particles.push({
        x: o.x,
        y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: rnd() * Math.PI,
        vr: (rnd() - 0.5) * 0.4,
        size,
        ratio: 0.4 + rnd() * 0.8,
        color: COLORS[Math.floor(rnd() * COLORS.length)] ?? '#10b981',
        round: rnd() < 0.25,
      })
    }
  }
}

// A local PRNG-free random is fine here (browser Math.random is available); a
// helper keeps the intent ("just jitter") obvious at each call site.
function rnd() {
  return Math.random()
}

function frame(ts: number) {
  const g = ctx
  if (!g || !canvas.value) return
  const dt = lastTs ? Math.min((ts - lastTs) / (1000 / 60), 3) : 1
  lastTs = ts
  const h = window.innerHeight

  g.clearRect(0, 0, window.innerWidth, h)

  particles = particles.filter((p) => {
    p.vy += GRAVITY * dt
    p.vx *= Math.pow(DRAG, dt)
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt

    // Drop once it has fallen well past the bottom edge.
    if (p.y - p.size > h) return false

    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.rot)
    g.fillStyle = p.color
    if (p.round) {
      g.beginPath()
      g.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      g.fill()
    } else {
      const wdt = p.size
      const hgt = p.size * p.ratio
      g.fillRect(-wdt / 2, -hgt / 2, wdt, hgt)
    }
    g.restore()
    return true
  })

  const elapsed = ts - startTs
  if (particles.length > 0 && elapsed < MAX_LIFE_MS) {
    raf = requestAnimationFrame(frame)
  } else {
    stop()
  }
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  lastTs = 0
  particles = []
  if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
}

function launch() {
  // Honor the OS "reduce motion" setting — no confetti for those users.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (!canvas.value) return
  resize()
  spawnBurst()
  // If a burst is already running, spawnBurst() just added more particles to the
  // live loop; only kick off a new rAF when idle.
  if (!raf) {
    startTs = 0
    lastTs = 0
    raf = requestAnimationFrame((ts) => {
      startTs = ts
      frame(ts)
    })
  }
}

watch(
  () => celebration.token,
  () => launch(),
)

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  stop()
})
</script>

<template>
  <Teleport to="body">
    <canvas ref="canvas" class="confetti" aria-hidden="true" />
  </Teleport>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  z-index: 1900;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
