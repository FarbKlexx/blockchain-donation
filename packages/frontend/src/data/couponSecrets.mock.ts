// DEV-ONLY MOCK of SOURCE 2 for the COUPON subsystem: the off-chain secret
// store the backend would hold (PII + secrets that must NEVER live on-chain).
//
// SECURITY / SCOPE:
//  • These are THROWAWAY demo coupon keypairs — they hold no funds and are NOT
//    wallet keys. They exist only so the claim → reveal → redeem demo verifies
//    end to end (each `privateKey` derives the matching `couponAddress` in
//    couponContractData.json).
//  • This is the SOURCE 2 mock: couponsService reads it through fetch-shaped
//    placeholder functions (see services/couponsService.ts, SOURCE 2). It is
//    imported at module top-level today, so it WOULD be bundled into a build as-is
//    — that is acceptable only because these are throwaway demo keys. Before any
//    production build, SOURCE 2 must be swapped to the AUTHENTICATED backend
//    (private keys encrypted at rest, revealed only after the caller is verified
//    as the owner); that swap is the real safeguard, and it removes this file
//    from the bundle entirely.
//
// Join key: `id` → ContractCoupon.id. The raw `token` is what an e-mail claim
// link carries; its keccak256 hash is the on-chain `claimTokenHash`.

import type { CouponSecret } from '@/types/coupon-sources'

export const COUPON_SECRETS: CouponSecret[] = [
  {
    id: 1,
    email: 'subscriber1@example.com',
    privateKey: '0x1ca63c73d49c52052c0dff480b00d1258c14480f194b0223038be85fb22fc5bb',
    token: 'welcome-aktiv-001',
  },
  {
    id: 2,
    email: 'subscriber2@example.com',
    privateKey: '0x5473de800f8dd099d5ba03b27b4d6c40be2a2cbe4d5c6f051915275209f6c060',
    token: 'welcome-aktiv-002',
  },
  {
    id: 3,
    email: 'subscriber3@example.com',
    privateKey: '0x280f8da3c473c6506c7c3df892c7f1e46bbb6b3075c7ec0728ff0ad1ed026b9a',
    token: 'welcome-aktiv-003',
  },
  {
    id: 4,
    email: 'subscriber4@example.com',
    privateKey: '0xb7b1343fa106c3b118eec17de5c6c57724212d3aef644802c942ac41fa8513e4',
    token: 'welcome-used-004',
  },
  {
    // The demo "unclaimed" coupon — open /gutschein/DEMO-CLAIM-TOKEN-5 to walk
    // the claim flow (connect a wallet → it binds as owner → the code is revealed).
    id: 5,
    email: 'subscriber5@example.com',
    privateKey: '0x6352048185bcc2bbdd179af677918478ed4119945ccf71793a3b74f3181b6a9d',
    token: 'DEMO-CLAIM-TOKEN-5',
  },
]
