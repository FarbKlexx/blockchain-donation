import { defineStore } from 'pinia'
import { ref } from 'vue'

// App-wide toast notifications. The single surface for action feedback —
// failures (normalized via utils/errors.toUserMessage) and success
// confirmations. Rendered by components/ui/ToastHost.vue (mounted once in
// App.vue). Views push messages here instead of dumping raw errors inline.

export type NotificationType = 'error' | 'success' | 'info'

export interface Notification {
  id: number
  type: NotificationType
  /** Short bold heading (context, e.g. "Abstimmung fehlgeschlagen"). */
  title?: string
  /** The readable body message. */
  message: string
}

// Errors linger a little longer than confirmations so they can be read.
const TIMEOUTS: Record<NotificationType, number> = {
  error: 8000,
  success: 4500,
  info: 5000,
}

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let seq = 0

  function dismiss(id: number) {
    items.value = items.value.filter((n) => n.id !== id)
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
  }

  function push(type: NotificationType, message: string, title?: string): number {
    const id = ++seq
    items.value.push({ id, type, message, title })
    const timeout = TIMEOUTS[type]
    if (timeout > 0) {
      timers.set(
        id,
        setTimeout(() => dismiss(id), timeout),
      )
    }
    return id
  }

  /** Show a failure. `message` should already be a readable string
   *  (toUserMessage(e)); `title` gives the action context. */
  const error = (message: string, title = 'Etwas ist schiefgelaufen') => push('error', message, title)
  const success = (message: string, title?: string) => push('success', message, title)
  const info = (message: string, title?: string) => push('info', message, title)

  return { items, push, error, success, info, dismiss }
})
