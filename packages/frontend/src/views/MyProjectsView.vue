<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Project } from '@/types/project'
import { listProjects } from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import ProjectCard from '@/components/project/ProjectCard.vue'
import ProjectCardSkeleton from '@/components/project/ProjectCardSkeleton.vue'

// "Meine Projekte": the projects the connected account relates to, grouped by
// role. Membership comes from the session (one scan at login) — this page does
// NOT re-scan the chain; it just filters the full list by the cached address
// sets. Each section renders only when the account has that role.
const wallet = useWalletStore()
const notifications = useNotificationStore()

const projects = ref<Project[]>([])
const loading = ref(true)

function inSet(set: string[], address: string) {
  const a = address.toLowerCase()
  return set.some((x) => x.toLowerCase() === a)
}

const sections = computed(() => {
  const byMembership = (set: string[]) =>
    projects.value.filter((p) => inSet(set, p.contract.address))
  return [
    { key: 'donor', title: 'Von mir unterstützt', show: wallet.roles.donor, items: byMembership(wallet.donorOf) },
    { key: 'validator', title: 'Ich bin Validator', show: wallet.roles.validator, items: byMembership(wallet.validatorOf) },
    { key: 'owner', title: 'Von mir erstellt', show: wallet.roles.owner, items: byMembership(wallet.ownerOf) },
  ].filter((s) => s.show)
})

async function load() {
  loading.value = true
  try {
    // The full set once; sections are derived from it via the session memberships.
    projects.value = await listProjects({ filter: 'alle' })
  } catch (e) {
    notifications.error(toUserMessage(e), 'Projekte konnten nicht geladen werden')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mine">
    <header class="mine__header">
      <h1 class="mine__title">Meine Projekte</h1>
      <p class="mine__subtitle">Projekte, in denen du eine Rolle hast.</p>
    </header>

    <div v-if="loading" class="mine__grid">
      <ProjectCardSkeleton v-for="n in 3" :key="n" />
    </div>

    <template v-else-if="sections.length">
      <section v-for="s in sections" :key="s.key" class="mine__section">
        <h2 class="mine__section-title">{{ s.title }} <span class="mine__count">{{ s.items.length }}</span></h2>
        <div v-if="s.items.length" class="mine__grid">
          <ProjectCard v-for="p in s.items" :key="p.id" :project="p" />
        </div>
        <p v-else class="mine__empty">Noch keine Projekte in dieser Rolle.</p>
      </section>
    </template>

    <p v-else class="mine__empty">
      Du hast aktuell keine Rollen. Sobald du ein Projekt unterstützt oder als Validator eingetragen
      bist, erscheinen sie hier.
    </p>
  </div>
</template>

<style scoped>
.mine {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 32px var(--bd-page-gutter);
}

.mine__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mine__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--bd-black);
}

.mine__subtitle {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.mine__section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mine__section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 800;
  color: var(--bd-black);
}

.mine__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--bd-radius-pill);
  background: var(--bd-grey);
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-grey-text);
}

.mine__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 32px;
}

.mine__empty {
  padding: 24px 0;
  color: var(--bd-grey-text);
}
</style>
