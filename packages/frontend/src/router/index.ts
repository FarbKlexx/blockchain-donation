import { createRouter, createWebHistory } from 'vue-router'
import ProjectOverviewView from '@/views/ProjectOverviewView.vue'
import { useWalletStore } from '@/stores/wallet'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: ProjectOverviewView,
    },
    {
      path: '/projects/:id',
      name: 'project-detail',
      // Lazy-loaded: separate chunk for the detail page.
      component: () => import('@/views/ProjectDetailView.vue'),
      props: true,
    },
    {
      path: '/meine-projekte',
      name: 'my-projects',
      component: () => import('@/views/MyProjectsView.vue'),
      // Requires a connected account. Roles still gate the UI, not access — this
      // only avoids rendering the page with no session. Session is restored
      // before mount (main.ts), so a hard refresh here keeps the user in.
      beforeEnter: () => {
        if (!useWalletStore().isConnected) return { name: 'home' }
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router
