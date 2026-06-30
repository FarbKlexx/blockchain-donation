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
      path: '/projekt-erstellen',
      name: 'project-create',
      component: () => import('@/views/ProjectCreateView.vue'),
      // Any connected account may create (no role required); the creator becomes
      // the on-chain owner. Only gates that a session exists.
      beforeEnter: () => {
        if (!useWalletStore().isConnected) return { name: 'home' }
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
    // ── Coupon subsystem (independent of the donation system) ──
    {
      path: '/gutscheine',
      name: 'coupons',
      // Lazy-loaded: separate chunk for the coupon landing page.
      component: () => import('@/views/CouponView.vue'),
    },
    {
      // The e-mail claim-link target. Auth = this token (right page) + wallet
      // (rightful owner); the view drives the login + reveal.
      path: '/gutschein/:token',
      name: 'coupon-claim',
      component: () => import('@/views/CouponClaimView.vue'),
      props: true,
    },
    {
      // Stand-in merchant checkout where a coupon is redeemed (anyone with the
      // key). Optional ?id=&key= prefill from the claim page.
      path: '/gutschein-einloesen',
      name: 'coupon-redeem',
      component: () => import('@/views/CouponRedeemView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router
