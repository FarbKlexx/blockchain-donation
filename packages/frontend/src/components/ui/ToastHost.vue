<script setup lang="ts">
import { useNotificationStore, type NotificationType } from '@/stores/notifications'
import AppIcon from '@/components/ui/AppIcon.vue'

// Renders the app-wide toast stack. Mounted once (App.vue); reads the
// notifications store. Teleported to <body> so it overlays everything and is
// never clipped by a scroll container.
const notifications = useNotificationStore()

const ICONS: Record<NotificationType, 'circle-alert' | 'circle-check' | 'info'> = {
  error: 'circle-alert',
  success: 'circle-check',
  info: 'info',
}
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="region" aria-label="Benachrichtigungen">
      <TransitionGroup name="toast">
        <div
          v-for="n in notifications.items"
          :key="n.id"
          class="toast"
          :class="`toast--${n.type}`"
          :role="n.type === 'error' ? 'alert' : 'status'"
        >
          <AppIcon :name="ICONS[n.type]" :size="20" class="toast__icon" />
          <div class="toast__body">
            <p v-if="n.title" class="toast__title">{{ n.title }}</p>
            <p class="toast__message">{{ n.message }}</p>
          </div>
          <button
            type="button"
            class="toast__close"
            aria-label="Schließen"
            @click="notifications.dismiss(n.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: 84px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-left: 4px solid var(--bd-grey-text);
  border-radius: var(--bd-radius-md);
  box-shadow: var(--bd-shadow-card);
  pointer-events: auto;
}

.toast--error {
  border-left-color: #dc2626;
}
.toast--error .toast__icon {
  color: #dc2626;
}

.toast--success {
  border-left-color: var(--bd-green);
}
.toast--success .toast__icon {
  color: var(--bd-green);
}

.toast--info {
  border-left-color: var(--bd-amber);
}
.toast--info .toast__icon {
  color: var(--bd-amber);
}

.toast__icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.toast__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
}

.toast__message {
  font-size: 13px;
  line-height: 1.45;
  color: var(--bd-grey-text);
  word-break: break-word;
}

.toast__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--bd-grey-text);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
}
.toast__close:hover {
  color: var(--bd-black);
}

/* Enter/leave: slide in from the right + fade; collapse height on leave. */
.toast-enter-active,
.toast-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.28s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateX(120%);
  opacity: 0;
}
.toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 0.2s ease;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
