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
      path: '/projects/:id/bearbeiten',
      name: 'project-edit',
      component: () => import('@/views/ProjectEditView.vue'),
      props: true,
      // Must own at least one project to reach an edit page; the view itself
      // re-checks ownership of THIS specific project (and shows "denied"
      // otherwise). Like all role checks, this only gates UI — the backend must
      // authorize the actual save.
      beforeEnter: (to) => {
        const wallet = useWalletStore()
        if (!wallet.isConnected) return { name: 'home' }
        if (!wallet.roles.owner) return { name: 'project-detail', params: { id: to.params.id } }
      },
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
