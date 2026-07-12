import { defineStore } from 'pinia'
import { ref } from 'vue'

// A fire-and-forget signal for the app-wide confetti burst. Any component can
// call `celebrate()` to fire it; the single ConfettiCannon (mounted in App.vue)
// watches `token` and launches an animation each time it bumps. Kept as a store
// — rather than a prop/emit chain — because the trigger (a donation deep in the
// tree) and the renderer (a top-level overlay) are far apart, exactly like the
// notifications store.
export const useCelebrationStore = defineStore('celebration', () => {
  // Bumped once per celebration. The value is meaningless; the CHANGE is the
  // event. A counter (not a boolean) lets back-to-back celebrations each fire,
  // even before the previous burst has finished.
  const token = ref(0)

  function celebrate() {
    token.value++
  }

  return { token, celebrate }
})
