import { createRouter, createWebHistory } from 'vue-router'
import ProjectOverviewView from '@/views/ProjectOverviewView.vue'

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
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router
