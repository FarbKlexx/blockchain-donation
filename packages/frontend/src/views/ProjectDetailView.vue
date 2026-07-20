<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Funding, Project } from '@/types/project'
import {
  getProject,
  voteOnMilestone,
  payoutMilestone,
  payoutRest,
  voteProjectSetup,
  createProjectNews,
  getMyProjectVotes,
  estimateVoteMilestoneGas,
  estimateVoteSetupGas,
  estimatePayoutMilestoneGas,
  estimatePayoutRestGas,
  getRemainingBalance,
  refund,
  estimateRefundGas,
  getRefundInfo,
  markAsFailedFunding,
  estimateMarkAsFailedFundingGas,
  markAsFailedDueToExpiredVoting,
  estimateMarkAsFailedExpiredVotingGas,
  type TxGasEstimate,
  type RefundInfo,
} from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import { formatDate, formatAmount, hasEnded } from '@/utils/format'
import ProjectHero from '@/components/project/ProjectHero.vue'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'
import FundingCard from '@/components/project/FundingCard.vue'
import SmartContractCard from '@/components/project/SmartContractCard.vue'
import ValidatorsCard from '@/components/project/ValidatorsCard.vue'
import MilestoneCard from '@/components/project/MilestoneCard.vue'
import ProjectDetailSkeleton from '@/components/project/ProjectDetailSkeleton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import ImageSlider from '@/components/ui/ImageSlider.vue'

const props = defineProps<{ id: string }>()

type TabKey = 'beschreibung' | 'meilensteine' | 'neuigkeiten'
const tabs: { key: TabKey; label: string }[] = [
  { key: 'beschreibung', label: 'Beschreibung' },
  { key: 'meilensteine', label: 'Meilensteine' },
  { key: 'neuigkeiten', label: 'Neuigkeiten' },
]

const project = ref<Project | null>(null)
const loading = ref(true)
const activeTab = ref<TabKey>('beschreibung')

// Owner of THIS project (from the session's cached memberships) → may edit its
// off-chain metadata. UI gating only; the save is authorized by the backend.
const wallet = useWalletStore()
const isOwner = computed(
  () => !!project.value && wallet.roleInProject(project.value.contract.address).isOwner,
)
// Validator of THIS project → may vote on its current milestone.
const isValidator = computed(
  () => !!project.value && wallet.roleInProject(project.value.contract.address).isValidator,
)

const notifications = useNotificationStore()

// This account's current votes, hydrated from chain in load() (so they survive
// reloads) and set optimistically after a vote. mySetupVote is the project-setup
// equivalent. The authoritative counts come from the chain re-read on load().
const myVotes = ref<Record<number, 'approve' | 'reject'>>({})
const mySetupVote = ref<'approve' | 'reject' | null>(null)

// This account's refund position on a FAILED project (donor's contribution +
// reclaimable share), hydrated from chain in load(). null when not applicable.
const myRefund = ref<RefundInfo | null>(null)

// ── Confirmation overlay for on-chain owner/validator/donor actions ──────────
// Votes, payouts, refunds and the mark-as-failed transitions all cost gas, so
// each goes through one shared checkout overlay showing the gas estimate first.
type PendingTx =
  | { kind: 'vote-setup'; approve: boolean }
  | { kind: 'vote-milestone'; index: number; approve: boolean }
  | { kind: 'payout-milestone'; index: number }
  | { kind: 'payout-rest' }
  | { kind: 'refund' }
  | { kind: 'mark-failed-funding' }
  | { kind: 'mark-failed-voting' }

const pendingTx = ref<PendingTx | null>(null)
const txConfirmOpen = ref(false)
const txEstimating = ref(false)
const txEstimate = ref<TxGasEstimate | null>(null)
const txEstimateError = ref<string | null>(null)
const txSubmitting = ref(false)
// The amount credited to the caller on a payout/refund (info row); null otherwise.
const txPayoutAmount = ref<string | null>(null)

// Which milestone the owner may pay next: Payout phase, current index, previous
// milestone approved (milestone 0 is gated instead by the setup vote).
const payableIndex = computed(() => {
  const p = project.value
  if (!p || p.contractStatus !== 'Payout') return -1
  const k = p.currentMilestoneIndex
  if (k >= p.milestones.length) return -1
  if (k === 0) return 0
  return p.milestones[k - 1]?.status === 'completed' ? k : -1
})

// Fully paid out and closed → the owner may sweep any residual contract balance.
const projectClosed = computed(
  () => !!project.value && project.value.contractStatus === 'Closed',
)

// ── Failure & refund state ───────────────────────────────────────────────────
const projectFailed = computed(() => !!project.value && project.value.contractStatus === 'Failed')
// Donor can reclaim while failed and their balance is still unclaimed.
const canRefund = computed(
  () => projectFailed.value && !!myRefund.value && myRefund.value.donated !== '0',
)
const alreadyRefunded = computed(
  () => projectFailed.value && !!myRefund.value && myRefund.value.donated === '0',
)
// Failable-but-not-yet-failed states anyone may flip so refunds unlock: the
// funding period ended below goal, or a vote deadline passed while awaiting one.
const canMarkFailedFunding = computed(
  () =>
    !!project.value &&
    project.value.contractStatus === 'Funding' &&
    project.value.status === 'abgelaufen',
)
const canMarkFailedVoting = computed(() => {
  const p = project.value
  if (!p) return false
  if (p.contractStatus !== 'ToBeApproved' && p.contractStatus !== 'Payout') return false
  return p.votingDeadline > 0 && hasEnded(p.votingDeadline)
})
const canMarkFailed = computed(() => canMarkFailedFunding.value || canMarkFailedVoting.value)

// Per-target in-flight flags the cards/buttons/panels read for their loading state.
const votingMilestoneIndex = computed(() =>
  txSubmitting.value && pendingTx.value?.kind === 'vote-milestone' ? pendingTx.value.index : null,
)
const payingMilestoneIndex = computed(() =>
  txSubmitting.value && pendingTx.value?.kind === 'payout-milestone' ? pendingTx.value.index : null,
)
const setupVoteSubmitting = computed(
  () => txSubmitting.value && pendingTx.value?.kind === 'vote-setup',
)
const payoutRestSubmitting = computed(
  () => txSubmitting.value && pendingTx.value?.kind === 'payout-rest',
)
const refundSubmitting = computed(() => txSubmitting.value && pendingTx.value?.kind === 'refund')
const markFailedSubmitting = computed(
  () =>
    txSubmitting.value &&
    (pendingTx.value?.kind === 'mark-failed-funding' ||
      pendingTx.value?.kind === 'mark-failed-voting'),
)

// Overlay display, derived from the pending action.
function txErrorTitle(kind: PendingTx['kind']): string {
  switch (kind) {
    case 'payout-milestone':
    case 'payout-rest':
      return 'Auszahlung fehlgeschlagen'
    case 'refund':
      return 'Rückzahlung fehlgeschlagen'
    case 'mark-failed-funding':
    case 'mark-failed-voting':
      return 'Aktion fehlgeschlagen'
    default:
      return 'Abstimmung fehlgeschlagen'
  }
}
const txConfirmTitle = computed(() => {
  switch (pendingTx.value?.kind) {
    case 'payout-milestone':
    case 'payout-rest':
      return 'Auszahlung bestätigen'
    case 'refund':
      return 'Rückzahlung bestätigen'
    case 'mark-failed-funding':
    case 'mark-failed-voting':
      return 'Projekt als gescheitert markieren'
    default:
      return 'Abstimmung bestätigen'
  }
})
const txConfirmLabel = computed(() => {
  const pt = pendingTx.value
  switch (pt?.kind) {
    case 'vote-setup':
    case 'vote-milestone':
      return pt.approve ? 'Zustimmen' : 'Ablehnen'
    case 'payout-milestone':
    case 'payout-rest':
      return 'Auszahlen'
    case 'refund':
      return 'Zurückfordern'
    case 'mark-failed-funding':
    case 'mark-failed-voting':
      return 'Als gescheitert markieren'
    default:
      return 'Bestätigen'
  }
})
const txSubmittingLabel = computed(() => {
  switch (pendingTx.value?.kind) {
    case 'payout-milestone':
    case 'payout-rest':
      return 'Zahle aus …'
    case 'refund':
      return 'Fordere an …'
    case 'mark-failed-funding':
    case 'mark-failed-voting':
      return 'Markiere …'
    default:
      return 'Stimme ab …'
  }
})
const txConfirmHint = computed(() => {
  switch (pendingTx.value?.kind) {
    case 'payout-milestone':
    case 'payout-rest':
      return 'Bei der Auszahlung zahlst du nur die Netzwerkgebühr (Gas); der freigegebene Betrag wird dir gutgeschrieben. Die tatsächlichen Kosten können niedriger ausfallen.'
    case 'refund':
      return 'Du zahlst nur die Netzwerkgebühr (Gas); deine anteilige Rückzahlung wird dir gutgeschrieben. Die tatsächlichen Kosten können niedriger ausfallen.'
    case 'mark-failed-funding':
    case 'mark-failed-voting':
      return 'Damit wird das Projekt als gescheitert markiert und Rückzahlungen an die Spender werden freigeschaltet. Es fällt nur die Netzwerkgebühr (Gas) an.'
    default:
      return 'Für diese Abstimmung fällt nur die Netzwerkgebühr (Gas) an – es wird kein Betrag überwiesen. Die tatsächlichen Kosten können niedriger ausfallen.'
  }
})
const txConfirmRows = computed<{ label: string; value: string }[]>(() => {
  const pt = pendingTx.value
  if (!pt) return []
  const currency = project.value?.currency ?? ''
  const msLabel = (i: number) => `Meilenstein ${String(i + 1).padStart(2, '0')}`
  switch (pt.kind) {
    case 'vote-setup':
      return [{ label: 'Abstimmung', value: `Projektstart · ${pt.approve ? 'Zustimmen' : 'Ablehnen'}` }]
    case 'vote-milestone':
      return [{ label: 'Abstimmung', value: `${msLabel(pt.index)} · ${pt.approve ? 'Zustimmen' : 'Ablehnen'}` }]
    case 'payout-milestone':
    case 'payout-rest': {
      const target = pt.kind === 'payout-milestone' ? msLabel(pt.index) : 'Restliche Vertragsmittel'
      const rows = [{ label: 'Auszahlung', value: target }]
      if (txPayoutAmount.value !== null) {
        rows.push({ label: 'Betrag an dich', value: `${txPayoutAmount.value} ${currency}` })
      }
      return rows
    }
    case 'refund': {
      const rows = [{ label: 'Grund', value: 'Projekt gescheitert' }]
      if (myRefund.value) {
        rows.push({ label: 'Rückzahlung an dich', value: `${myRefund.value.refundable} ${currency}` })
      }
      return rows
    }
    case 'mark-failed-funding':
      return [{ label: 'Aktion', value: 'Als gescheitert markieren (Ziel nicht erreicht)' }]
    case 'mark-failed-voting':
      return [{ label: 'Aktion', value: 'Als gescheitert markieren (Frist abgelaufen)' }]
  }
  return []
})

// Open the overlay for an action and estimate its gas (nothing signed yet).
async function openTxConfirm(pt: PendingTx) {
  if (!project.value || txSubmitting.value) return
  const addr = project.value.contract.address
  pendingTx.value = pt
  txEstimate.value = null
  txEstimateError.value = null
  // Show what the caller receives, when known locally (milestone amount / refund).
  txPayoutAmount.value =
    pt.kind === 'payout-milestone'
      ? formatAmount(project.value.milestones[pt.index]?.allocated ?? 0)
      : null
  txConfirmOpen.value = true
  txEstimating.value = true
  try {
    if (pt.kind === 'payout-rest') {
      txPayoutAmount.value = await getRemainingBalance(addr)
    }
    switch (pt.kind) {
      case 'vote-setup':
        txEstimate.value = await estimateVoteSetupGas(addr, pt.approve)
        break
      case 'vote-milestone':
        txEstimate.value = await estimateVoteMilestoneGas(addr, pt.index, pt.approve)
        break
      case 'payout-milestone':
        txEstimate.value = await estimatePayoutMilestoneGas(addr, pt.index)
        break
      case 'payout-rest':
        txEstimate.value = await estimatePayoutRestGas(addr)
        break
      case 'refund':
        txEstimate.value = await estimateRefundGas(addr)
        break
      case 'mark-failed-funding':
        txEstimate.value = await estimateMarkAsFailedFundingGas(addr)
        break
      case 'mark-failed-voting':
        txEstimate.value = await estimateMarkAsFailedExpiredVotingGas(addr)
        break
    }
  } catch (e) {
    txEstimateError.value = toUserMessage(e, 'Die Gaskosten konnten nicht geschätzt werden.')
  } finally {
    txEstimating.value = false
  }
}

function closeTxConfirm() {
  txConfirmOpen.value = false
  pendingTx.value = null
  txEstimate.value = null
  txEstimateError.value = null
  txPayoutAmount.value = null
}

function cancelTx() {
  if (txSubmitting.value) return
  closeTxConfirm()
}

// Confirmed in the overlay → sign and send the pending action.
async function confirmTx() {
  const pt = pendingTx.value
  if (!project.value || !pt || txSubmitting.value) return
  const addr = project.value.contract.address
  txSubmitting.value = true
  try {
    let message = ''
    switch (pt.kind) {
      case 'vote-setup':
        await voteProjectSetup(addr, pt.approve)
        mySetupVote.value = pt.approve ? 'approve' : 'reject'
        message = 'Deine Stimme zum Projektstart wurde gezählt.'
        break
      case 'vote-milestone':
        await voteOnMilestone(addr, pt.index, pt.approve)
        myVotes.value[pt.index] = pt.approve ? 'approve' : 'reject'
        message = 'Deine Stimme wurde gezählt.'
        break
      case 'payout-milestone':
        await payoutMilestone(addr, pt.index)
        message = 'Der Meilenstein wurde ausgezahlt.'
        break
      case 'payout-rest':
        await payoutRest(addr)
        message = 'Die restlichen Mittel wurden ausgezahlt.'
        break
      case 'refund':
        await refund(addr)
        message = 'Deine Rückzahlung wurde veranlasst.'
        break
      case 'mark-failed-funding':
        await markAsFailedFunding(addr)
        message = 'Das Projekt wurde als gescheitert markiert.'
        break
      case 'mark-failed-voting':
        await markAsFailedDueToExpiredVoting(addr)
        message = 'Das Projekt wurde als gescheitert markiert.'
        break
    }
    // Re-read: any of these can change the lifecycle (unlock payout, close, fail).
    await load()
    // Votes/payouts/refunds all move the caller's balance — refresh the chip.
    void wallet.refreshBalance()
    notifications.success(message)
    closeTxConfirm()
  } catch (e) {
    notifications.error(toUserMessage(e), txErrorTitle(pt.kind))
  } finally {
    txSubmitting.value = false
  }
}

// Action buttons → open the confirmation overlay.
function onVote(index: number, approve: boolean) {
  openTxConfirm({ kind: 'vote-milestone', index, approve })
}
function onPayout(index: number) {
  openTxConfirm({ kind: 'payout-milestone', index })
}
function onPayoutRest() {
  openTxConfirm({ kind: 'payout-rest' })
}
function onRefund() {
  openTxConfirm({ kind: 'refund' })
}
function onMarkFailed() {
  if (canMarkFailedFunding.value) openTxConfirm({ kind: 'mark-failed-funding' })
  else if (canMarkFailedVoting.value) openTxConfirm({ kind: 'mark-failed-voting' })
}

// Validator: approve/reject the PROJECT SETUP while the campaign is in
// ToBeApproved (the one-time vote that must pass before any milestone is paid).

// Show the setup-vote panel only while the vote is actually open on-chain.
const setupVoteOpen = computed(
  () => !!project.value && project.value.contractStatus === 'ToBeApproved',
)
// A validator may vote AND change their vote while the setup poll is open — the
// contract only rejects re-submitting the identical choice.
const canVoteSetup = computed(() => setupVoteOpen.value && isValidator.value)

// Setup vote button → open the confirmation overlay.
function onVoteSetup(approve: boolean) {
  openTxConfirm({ kind: 'vote-setup', approve })
}

// Owner: pay out the next milestone. The milestone the owner may pay is
// `currentMilestoneIndex`, but only in the Payout phase and once the previous
// milestone is approved (its card shows 'completed'). Milestone 0 is gated by
// the project-setup vote — reflected by contractStatus already being 'Payout'.
const payingOut = ref(false)
const payoutError = ref<string | null>(null)

const payableIndex = computed(() => {
  const p = project.value
  if (!p || p.contractStatus !== 'Payout') return -1
  const k = p.currentMilestoneIndex
  if (k >= p.milestones.length) return -1
  if (k === 0) return 0
  return p.milestones[k - 1]?.status === 'completed' ? k : -1
})

async function onPayout(index: number) {
  if (!project.value || payingOut.value) return
  payingOut.value = true
  payoutError.value = null
  try {
    await payoutMilestone(project.value.contract.address, index)
    // Paying a milestone opens its validator vote — re-read to show it.
    await load()
  } catch (e) {
    payoutError.value =
      e instanceof Error ? e.message : 'Auszahlung fehlgeschlagen. Bitte erneut versuchen.'
  } finally {
    payingOut.value = false
  }
}

// Validator: approve/reject the PROJECT SETUP while the campaign is in
// ToBeApproved (the one-time vote that must pass before any milestone is paid).
const mySetupVote = ref<'approve' | 'reject' | null>(null)
const setupVoting = ref(false)
const setupError = ref<string | null>(null)

// Show the setup-vote panel only while the vote is actually open on-chain.
const setupVoteOpen = computed(
  () => !!project.value && project.value.contractStatus === 'ToBeApproved',
)
const canVoteSetup = computed(
  () => setupVoteOpen.value && isValidator.value && !mySetupVote.value,
)

async function onVoteSetup(approve: boolean) {
  if (!project.value || setupVoting.value) return
  setupVoting.value = true
  setupError.value = null
  try {
    await voteProjectSetup(project.value.contract.address, approve)
    mySetupVote.value = approve ? 'approve' : 'reject'
    // A decisive vote flips the project to Payout (or Failed) — re-read.
    await load()
  } catch (e) {
    setupError.value =
      e instanceof Error ? e.message : 'Abstimmung fehlgeschlagen. Bitte erneut versuchen.'
  } finally {
    setupVoting.value = false
  }
}

// Lifecycle gate (Spende → Stimme → Auszahlung): validators may only vote on
// milestones once the funding goal is reached. The milestone UI keys off this,
// so it can never present confirmations before the goal is met.
const goalReached = computed(
  () => !!project.value && project.value.funding.raised >= project.value.funding.goal,
)

// Sliding underline: tabs are variable-width, so we measure the active tab's
// position/width and move a single underline there (animated via CSS).
const tabRow = ref<HTMLElement | null>(null)
const indicator = ref({ left: 0, width: 0 })

function updateIndicator() {
  const row = tabRow.value
  if (!row) return
  const idx = tabs.findIndex((t) => t.key === activeTab.value)
  const el = row.children[idx] as HTMLElement | undefined
  if (el) indicator.value = { left: el.offsetLeft, width: el.offsetWidth }
}

// Re-fetch the project from chain + backend. Used both on first load and after
// a vote/payout — a same-project reload keeps the active tab (only `enterProject`
// resets that, on a real navigation).
async function load() {
  loading.value = true
  try {
    const p = await getProject(props.id)
    project.value = p
    // Derive THIS account's votes from chain so they survive a reload and reflect
    // any change — the contract, not session memory, is the source of truth for
    // "you already voted X". Only validators of this project have votes to read.
    if (p && wallet.address && wallet.roleInProject(p.contract.address).isValidator) {
      try {
        const mine = await getMyProjectVotes(p.contract.address, wallet.address)
        mySetupVote.value = mine.setup
        myVotes.value = mine.milestones
      } catch (e) {
        // Non-fatal: the page still renders without the pre-filled vote state.
        console.error('Fehler beim Laden der eigenen Stimmen:', e)
        mySetupVote.value = null
        myVotes.value = {}
      }
    } else {
      mySetupVote.value = null
      myVotes.value = {}
    }
    // On a FAILED project, load THIS donor's reclaimable share so the refund
    // panel can show it (non-fatal — the page still renders without it).
    if (
      p &&
      p.contractStatus === 'Failed' &&
      wallet.address &&
      wallet.roleInProject(p.contract.address).isDonor
    ) {
      try {
        myRefund.value = await getRefundInfo(p.contract.address, wallet.address)
      } catch (e) {
        console.error('Fehler beim Laden der Rückzahlungsdaten:', e)
        myRefund.value = null
      }
    } else {
      myRefund.value = null
    }
  } finally {
    loading.value = false
  }
  await nextTick()
  updateIndicator()
}

// Switch to a (possibly different) project: clear per-project local UI state,
// then load.
function enterProject() {
  activeTab.value = 'beschreibung'
  myVotes.value = {}
  mySetupVote.value = null
  myRefund.value = null
  closeTxConfirm()
  newsOpen.value = false
  resetNewsForm()
  load()
}

// Apply the authoritative funding the service returns AFTER the tx confirmed
// (a fresh chain read) — no client-side arithmetic on money here.
function onDonated(funding: Funding) {
  if (project.value) {
    project.value.funding = funding
  }
}

// ── Owner: publish a news update ─────────────────────────────────────────────
// Appends ONE entry via POST /api/projects/:id/news, so a quick update never
// rewrites the project's other news (the bulk edit in ProjectEditView still does
// a full replace). After it lands we re-read the project so the new entry shows
// alongside the existing ones.
const newsOpen = ref(false)
const publishing = ref(false)
const newsForm = reactive<{ date: string; title: string; body: string; images: string[] }>({
  date: '',
  title: '',
  body: '',
  images: [],
})

// Local date as YYYY-MM-DD (input[type=date] value / backend `date` string).
function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function resetNewsForm() {
  newsForm.date = ''
  newsForm.title = ''
  newsForm.body = ''
  newsForm.images = []
}

function openNewsComposer() {
  newsForm.date = todayIso()
  newsOpen.value = true
}

function closeNewsComposer() {
  newsOpen.value = false
  resetNewsForm()
}

// Images are uploads only (no external URLs). Prototype: the file isn't actually
// uploaded — we record the chosen filename as the placeholder key the backend
// would assign. Mirrors the create/edit views.
function normalizeUploadPath(fileName: string, projectId?: string): string {
  if (!fileName) return ''
  if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith('/')) return fileName
  if (fileName.startsWith('uploads/')) return fileName
  const folder = projectId ? projectId.replace(/^\/|\/$/g, '') : ''
  return folder ? `uploads/${folder}/${fileName}` : `uploads/${fileName}`
}

function onNewsImages(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    newsForm.images.push(
      ...Array.from(input.files).map((f) => normalizeUploadPath(f.name, project.value?.id)),
    )
  }
  input.value = ''
}

// The backend accepts a title-or-body; we require at least a title (it's the
// entry's heading) so an empty update can't be published by mistake.
const canPublish = computed(() => newsForm.title.trim().length > 0)

async function publishNews() {
  if (!project.value || publishing.value || !canPublish.value) return
  publishing.value = true
  try {
    await createProjectNews(project.value.id, {
      date: newsForm.date || todayIso(),
      title: newsForm.title.trim(),
      body: newsForm.body.trim(),
      images: newsForm.images.map((s) => s.trim()).filter(Boolean),
    })
    closeNewsComposer()
    // Re-read (keeps the active tab) so the appended entry appears with the rest.
    await load()
    notifications.success('Deine Neuigkeit wurde veröffentlicht.')
  } catch (e) {
    notifications.error(toUserMessage(e), 'Veröffentlichen fehlgeschlagen')
  } finally {
    publishing.value = false
  }
}

// Re-measure the underline when the tab changes, the window resizes, or the
// web font finishes loading (which changes text widths).
watch(activeTab, () => nextTick(updateIndicator))
watch(() => props.id, enterProject)

onMounted(() => {
  enterProject()
  window.addEventListener('resize', updateIndicator)
  document.fonts?.ready.then(updateIndicator)
})
onUnmounted(() => window.removeEventListener('resize', updateIndicator))
</script>

<template>
  <div class="detail">
    <!-- Always visible (needs no data) — keeps the layout stable across loading. -->
    <div class="detail__topbar">
      <RouterLink :to="{ name: 'home' }" class="detail__back">← Alle Projekte</RouterLink>
      <!-- Owner-only: edit the project's off-chain metadata. -->
      <RouterLink
        v-if="project && isOwner"
        :to="{ name: 'project-edit', params: { id: project.id } }"
        class="detail__edit"
      >
        <AppIcon name="pencil" :size="14" />
        Projekt bearbeiten
      </RouterLink>
    </div>

    <ProjectDetailSkeleton v-if="loading" />

    <template v-else-if="project">
      <div class="detail__hero-wrap">
        <ProjectHero :project="project" @donated="onDonated" />
      </div>

      <!-- Failure & refund: shown when the project failed (donors reclaim their
           share) or is failable-but-not-yet-failed (anyone can flip it). -->
      <div v-if="projectFailed || canMarkFailed" class="detail__failure-wrap">
        <section class="failure">
          <div class="failure__head">
            <AppIcon name="circle-alert" :size="18" />
            <h2 class="failure__title">
              {{
                projectFailed
                  ? 'Projekt gescheitert'
                  : canMarkFailedFunding
                    ? 'Finanzierung nicht erreicht'
                    : 'Abstimmungsfrist abgelaufen'
              }}
            </h2>
          </div>

          <!-- Already failed → donors reclaim their proportional share. -->
          <template v-if="projectFailed">
            <p class="failure__text">
              Dieses Projekt wurde als gescheitert markiert. Spenderinnen und Spender können ihren
              anteiligen Beitrag zurückfordern.
            </p>
            <div v-if="canRefund && myRefund" class="failure__refund">
              <div class="failure__amounts">
                <span>Dein Beitrag: <strong>{{ myRefund.donated }} {{ project.currency }}</strong></span>
                <span>Deine Rückzahlung: <strong>{{ myRefund.refundable }} {{ project.currency }}</strong></span>
              </div>
              <button
                type="button"
                class="failure__btn"
                :disabled="refundSubmitting"
                @click="onRefund"
              >
                {{ refundSubmitting ? 'Fordere an …' : 'Rückzahlung anfordern' }}
              </button>
            </div>
            <p v-else-if="alreadyRefunded" class="failure__note">
              <AppIcon name="circle-check" :size="14" /> Du hast deine Rückzahlung bereits erhalten.
            </p>
          </template>

          <!-- Not yet failed → anyone connected may flip it so refunds unlock. -->
          <template v-else>
            <p class="failure__text">
              {{
                canMarkFailedFunding
                  ? 'Die Finanzierungsphase ist beendet und das Ziel wurde nicht erreicht.'
                  : 'Die Frist für die Validator-Abstimmung ist abgelaufen.'
              }}
              Markiere das Projekt als gescheitert, um Rückzahlungen an die Spender freizuschalten.
            </p>
            <button
              v-if="wallet.isConnected"
              type="button"
              class="failure__btn"
              :disabled="markFailedSubmitting"
              @click="onMarkFailed"
            >
              {{ markFailedSubmitting ? 'Markiere …' : 'Als gescheitert markieren' }}
            </button>
            <p v-else class="failure__note">Zum Fortfahren bitte oben mit einer Wallet einloggen.</p>
          </template>
        </section>
      </div>

      <div class="detail__content">
        <div class="detail__main">
          <h2 class="detail__heading">Über das Projekt</h2>

          <div class="tabs">
            <div ref="tabRow" class="tabs__row" role="tablist">
              <button
                v-for="t in tabs"
                :key="t.key"
                type="button"
                role="tab"
                class="tabs__tab"
                :class="{ 'tabs__tab--active': activeTab === t.key }"
                :aria-selected="activeTab === t.key"
                @click="activeTab = t.key"
              >
                {{ t.label }}
              </button>
              <span
                class="tabs__underline"
                :style="{ width: indicator.width + 'px', transform: `translateX(${indicator.left}px)` }"
                aria-hidden="true"
              />
            </div>
            <div class="tabs__divider" />
          </div>

          <!-- Beschreibung -->
          <div v-if="activeTab === 'beschreibung'" class="prose">
            <p v-for="(para, i) in project.description" :key="i">{{ para }}</p>
          </div>

          <!-- Meilensteine -->
          <div v-else-if="activeTab === 'meilensteine'" class="milestones">
            <p class="milestones__hint">
              <AppIcon :name="goalReached ? 'circle-help' : 'lock'" :size="14" />
              {{
                goalReached
                  ? 'Nach Zielerreichung bestätigen die Validatoren zunächst den Projektstart. Danach zahlt der Eigentümer die Meilensteine nacheinander aus – über jeden ausgezahlten Meilenstein stimmen die Validatoren ab, und erst ihre Freigabe schaltet die Auszahlung des nächsten Meilensteins frei.'
                  : 'Die Abstimmung über die Meilensteine beginnt erst, sobald das Finanzierungsziel erreicht ist.'
              }}
            </p>

            <!-- Project-setup approval: shown while the campaign is ToBeApproved.
                 Validators confirm the project start before any milestone is paid. -->
            <div v-if="setupVoteOpen" class="setup">
              <div class="setup__head">
                <AppIcon name="shield-check" :size="16" />
                <h3 class="setup__title">Projektstart bestätigen</h3>
              </div>
              <p class="setup__text">
                Das Finanzierungsziel ist erreicht. Bevor die erste Auszahlung freigegeben wird,
                bestätigen die Validatoren den Projektstart. Mit
                <strong>{{ project.projectSetup.requiredApprovals }}</strong> von
                {{ project.projectSetup.totalValidators }} Zustimmungen startet die Auszahlungsphase.
              </p>
              <div class="setup__tally">
                {{ project.projectSetup.approvedCount }}/{{ project.projectSetup.totalValidators }}
                bestätigt · {{ project.projectSetup.requiredApprovals }} für Freigabe nötig
              </div>

              <!-- Validators may vote AND change their vote while the poll is open.
                   Both choices stay visible; only the current choice is disabled
                   (re-submitting it reverts on-chain). State comes from chain, so
                   it's correct after a reload. -->
              <div v-if="canVoteSetup" class="setup__vote">
                <span
                  v-if="mySetupVote"
                  class="setup__voted"
                  :class="`setup__voted--${mySetupVote === 'approve' ? 'yes' : 'no'}`"
                >
                  <AppIcon v-if="mySetupVote === 'approve'" name="check" :size="14" />
                  {{ mySetupVote === 'approve' ? 'Du hast den Projektstart bestätigt' : 'Du hast den Projektstart abgelehnt' }}
                </span>
                <div class="setup__actions">
                  <button
                    type="button"
                    class="setup__btn setup__btn--yes"
                    :class="{ 'setup__btn--current': mySetupVote === 'approve' }"
                    :disabled="setupVoteSubmitting || mySetupVote === 'approve'"
                    @click="onVoteSetup(true)"
                  >
                    <AppIcon name="check" :size="14" />
                    {{ mySetupVote === 'approve' ? 'Bestätigt' : 'Projektstart bestätigen' }}
                  </button>
                  <button
                    type="button"
                    class="setup__btn setup__btn--no"
                    :class="{ 'setup__btn--current': mySetupVote === 'reject' }"
                    :disabled="setupVoteSubmitting || mySetupVote === 'reject'"
                    @click="onVoteSetup(false)"
                  >
                    {{ mySetupVote === 'reject' ? 'Abgelehnt' : 'Ablehnen' }}
                  </button>
                </div>
                <p v-if="mySetupVote" class="setup__note">
                  Du kannst deine Stimme ändern, solange die Abstimmung läuft.
                </p>
              </div>
              <p v-else class="setup__note">Nur Validatoren dieses Projekts können abstimmen.</p>
            </div>

            <div class="milestones__list">
              <MilestoneCard
                v-for="(m, i) in project.milestones"
                :key="m.index"
                :milestone="m"
                :validators="project.validators"
                :currency="project.currency"
                :voting-open="goalReached"
                :can-vote="isValidator && m.status === 'in_progress'"
                :my-vote="myVotes[i] ?? null"
                :voting="votingMilestoneIndex === i"
                :can-payout="isOwner && i === payableIndex"
                :paying-out="payingMilestoneIndex === i"
                @vote="onVote(i, $event)"
                @payout="onPayout(i)"
              />
            </div>

            <!-- Owner: sweep any funds left in the contract once the project is
                 closed (all milestones paid out). -->
            <div v-if="isOwner && projectClosed" class="rest">
              <div class="rest__head">
                <AppIcon name="circle-check" :size="16" />
                <h3 class="rest__title">Projekt abgeschlossen</h3>
              </div>
              <p class="rest__text">
                Alle Meilensteine wurden ausgezahlt. Verbliebene Mittel im Vertrag kannst du dir hier
                auszahlen.
              </p>
              <button
                type="button"
                class="rest__btn"
                :disabled="payoutRestSubmitting"
                @click="onPayoutRest"
              >
                {{ payoutRestSubmitting ? 'Zahle aus …' : 'Restliche Mittel auszahlen' }}
              </button>
            </div>
          </div>

          <!-- Neuigkeiten -->
          <div v-else class="news">
            <!-- Owner: publish a new update. Appends a single entry via the news
                 endpoint (no full-project rewrite) and re-reads on success. -->
            <div v-if="isOwner" class="news-publish">
              <button
                v-if="!newsOpen"
                type="button"
                class="news-publish__toggle"
                @click="openNewsComposer"
              >
                <AppIcon name="pencil" :size="14" />
                Update veröffentlichen
              </button>

              <form v-else class="news-publish__form" @submit.prevent="publishNews">
                <div class="news-publish__row">
                  <label class="npf">
                    <span class="npf__label">Titel</span>
                    <input
                      v-model="newsForm.title"
                      class="npf__input"
                      type="text"
                      placeholder="Worum geht es?"
                    />
                  </label>
                  <label class="npf npf--date">
                    <span class="npf__label">Datum</span>
                    <input v-model="newsForm.date" class="npf__input" type="date" />
                  </label>
                </div>
                <label class="npf">
                  <span class="npf__label">Text</span>
                  <textarea
                    v-model="newsForm.body"
                    class="npf__input npf__input--area"
                    rows="3"
                    placeholder="Was gibt es Neues?"
                  />
                </label>
                <div class="npf">
                  <div class="npf__images-head">
                    <span class="npf__label">Bilder</span>
                    <label class="news-publish__filebtn">
                      + Bilder
                      <input type="file" accept="image/*" multiple hidden @change="onNewsImages" />
                    </label>
                  </div>
                  <div v-for="(img, j) in newsForm.images" :key="j" class="npf__chosen">
                    <span class="npf__chosen-name">{{ img }}</span>
                    <button
                      type="button"
                      class="npf__chosen-x"
                      aria-label="Bild entfernen"
                      @click="newsForm.images.splice(j, 1)"
                    >
                      ✕
                    </button>
                  </div>
                  <span class="npf__hint">
                    Nur eigener Upload · im Prototyp Platzhalter (Datei wird nicht gespeichert).
                  </span>
                </div>
                <div class="news-publish__actions">
                  <button
                    type="button"
                    class="news-publish__btn news-publish__btn--ghost"
                    :disabled="publishing"
                    @click="closeNewsComposer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    class="news-publish__btn news-publish__btn--primary"
                    :disabled="publishing || !canPublish"
                  >
                    {{ publishing ? 'Veröffentliche …' : 'Veröffentlichen' }}
                  </button>
                </div>
              </form>
            </div>

            <article v-for="(entry, i) in project.news" :key="i" class="news__entry">
              <p class="news__meta">{{ formatDate(entry.date) }}</p>
              <h3 class="news__title">{{ entry.title }}</h3>
              <ImageSlider
                v-if="entry.images.length"
                :images="entry.images"
                :alt="entry.title"
                class="news__media"
              />
              <p class="news__body">{{ entry.body }}</p>
            </article>
            <p v-if="project.news.length === 0" class="news__empty">
              Noch keine Neuigkeiten.
            </p>
          </div>
        </div>

        <aside class="detail__sidebar">
          <FundingCard :project="project" />
          <SmartContractCard :contract="project.contract" />
          <ValidatorsCard :validators="project.validators" />
        </aside>
      </div>

      <!-- Shared checkout overlay for votes AND payouts (both gas-only). -->
      <TxConfirmDialog
        :open="txConfirmOpen"
        :title="txConfirmTitle"
        :summary="project.title"
        :rows="txConfirmRows"
        total-label="Netzwerkgebühr (max.)"
        :currency="project.currency"
        :hint="txConfirmHint"
        :confirm-label="txConfirmLabel"
        :submitting-label="txSubmittingLabel"
        :estimate="txEstimate"
        :estimating="txEstimating"
        :estimate-error="txEstimateError"
        :submitting="txSubmitting"
        @confirm="confirmTx"
        @cancel="cancelTx"
      />
    </template>

    <div v-else class="detail__state">
      <p>Projekt nicht gefunden.</p>
    </div>
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
}

.detail__state {
  padding: 80px var(--bd-page-gutter);
  color: var(--bd-grey-text);
}

.detail__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 48px var(--bd-page-gutter) 16px;
}

.detail__edit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
  background: var(--bd-surface);
}

.detail__edit:hover {
  border-color: var(--bd-black);
}

.detail__hero-wrap {
  padding: 0 var(--bd-page-gutter) 32px;
}

/* Failure & refund banner */
.detail__failure-wrap {
  padding: 0 var(--bd-page-gutter) 32px;
}

.failure {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
  background: var(--bd-amber-tint);
  border: 1px solid var(--bd-amber);
  border-radius: var(--bd-radius-md);
}

.failure__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bd-amber);
}

.failure__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.failure__text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
  max-width: 720px;
}

.failure__refund {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
}

.failure__amounts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.failure__amounts strong {
  color: var(--bd-black);
}

.failure__btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.failure__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.failure__note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--bd-grey-text);
}

.detail__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.detail__back:hover {
  color: var(--bd-black);
}

.detail__content {
  display: flex;
  align-items: flex-start;
  gap: 48px;
  padding: 0 var(--bd-page-gutter) 64px;
}

.detail__main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail__heading {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.detail__sidebar {
  flex: 0 0 400px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Tabs */
.tabs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs__row {
  position: relative;
  display: flex;
  gap: 32px;
}

.tabs__tab {
  border: none;
  background: transparent;
  padding: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-grey-text);
  transition: color 0.28s ease;
}

.tabs__tab--active {
  font-weight: 600;
  color: var(--bd-black);
}

/* Single underline that slides/stretches to the active tab. */
.tabs__underline {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--bd-black);
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.tabs__divider {
  height: 1px;
  background: var(--bd-divider);
}

@media (prefers-reduced-motion: reduce) {
  .tabs__underline {
    transition: none;
  }
}

/* Beschreibung */
.prose {
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--bd-grey-text);
  max-width: 664px;
}

/* Meilensteine */
.milestones {
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 664px;
}

.milestones__hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bd-grey-text);
}

.milestones__list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Owner: residual-funds payout once the project is closed */
.rest {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
  border-radius: var(--bd-radius-md);
}

.rest__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bd-green);
}

.rest__title {
  font-size: 16px;
  font-weight: 800;
}

.rest__text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.rest__btn {
  align-self: flex-start;
  padding: 10px 16px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.rest__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Project-setup approval */
.setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
  background: var(--bd-amber-tint);
  border: 1px solid var(--bd-amber);
  border-radius: var(--bd-radius-md);
}

.setup__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bd-black);
}

.setup__title {
  font-size: 16px;
  font-weight: 800;
}

.setup__text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.setup__tally {
  font-size: 13px;
  font-weight: 600;
  color: var(--bd-black);
}

.setup__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setup__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
}

.setup__btn:disabled {
  opacity: 0.6;
}

.setup__vote {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setup__btn--current {
  box-shadow: 0 0 0 2px var(--bd-black);
}

/* The current choice is disabled, but it's the active selection — don't dim it
   like an ordinary disabled button. */
.setup__btn--current:disabled {
  opacity: 1;
}

.setup__btn--yes {
  color: #fff;
  background: var(--bd-green);
}

.setup__btn--no {
  color: var(--bd-grey-text);
  background: var(--bd-surface);
  border-color: var(--bd-stroke);
}

.setup__btn--no:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

.setup__voted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}

.setup__voted--yes {
  color: var(--bd-green);
}

.setup__voted--no {
  color: var(--bd-grey-text);
}

.setup__note {
  font-size: 13px;
  color: var(--bd-grey-text);
}

/* Neuigkeiten */
.news {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 664px;
}

.news__entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.news__meta {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--bd-green);
}

.news__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--bd-black);
}

.news__body {
  font-size: 16px;
  line-height: 1.6;
  color: var(--bd-grey-text);
}

.news__empty {
  font-size: 14px;
  color: var(--bd-grey-text);
}

/* Neuigkeiten: owner publish composer */
.news-publish {
  padding-bottom: 4px;
}

.news-publish__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  background: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
  cursor: pointer;
}

.news-publish__toggle:hover {
  border-color: var(--bd-black);
}

.news-publish__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.news-publish__row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}

.npf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}

.npf--date {
  flex: 0 0 170px;
}

.npf__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.npf__input {
  width: 100%;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  padding: 10px 12px;
}

.npf__input:focus {
  outline: none;
  border-color: var(--bd-black);
}

.npf__input--area {
  resize: vertical;
  line-height: 1.5;
}

.npf__images-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.news-publish__filebtn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-grey);
  color: var(--bd-black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.npf__chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-size: 13px;
}

.npf__chosen-name {
  word-break: break-all;
}

.npf__chosen-x {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--bd-grey-text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.npf__hint {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.news-publish__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.news-publish__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 16px;
  cursor: pointer;
}

.news-publish__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.news-publish__btn--primary {
  background: var(--bd-black);
  color: var(--bd-surface);
}

.news-publish__btn--ghost {
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}

.news-publish__btn--ghost:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

@media (max-width: 640px) {
  .news-publish__row {
    flex-direction: column;
    align-items: stretch;
  }
  .npf--date {
    flex-basis: auto;
  }
}

@media (max-width: 1000px) {
  .detail__content {
    flex-direction: column;
  }
  .detail__sidebar {
    flex-basis: auto;
    max-width: none;
    width: 100%;
  }
}
</style>
