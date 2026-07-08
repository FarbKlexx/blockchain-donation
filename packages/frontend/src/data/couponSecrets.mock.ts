// DEV-ONLY MOCK of SOURCE 2 for the COUPON subsystem: the off-chain secret
// store the backend would hold (the coupon private keys — the secret codes that
// must NEVER live on-chain).
//
// SECURITY / SCOPE:
//  • These are THROWAWAY demo coupon keypairs — they hold no funds and are NOT
//    wallet keys. They exist only so the create → reveal → redeem demo verifies
//    end to end (each `privateKey` derives the matching `couponAddress` in
//    couponContractData.json).
//  • This is the SOURCE 2 mock: couponsService reads it through fetch-shaped
//    placeholder functions (see services/couponsService.ts, SOURCE 2). It is
//    imported at module top-level today, so it WOULD be bundled into a build as-is
//    — that is acceptable only because these are throwaway demo keys. Before any
//    production build, SOURCE 2 must be swapped to the AUTHENTICATED backend
//    (private keys encrypted at rest, revealed only after the caller is verified
//    as the coupon's creator); that swap is the real safeguard, and it removes
//    this file from the bundle entirely.
//
// Join key: `id` → ContractCoupon.id. The creator gets these keys back on the
// "Meine Gutscheine" page and distributes them off-site however they like.

import type { CouponSecret } from '@/types/coupon-sources'

export const COUPON_SECRETS: CouponSecret[] = [
  { id: 1, privateKey: '0x1ca63c73d49c52052c0dff480b00d1258c14480f194b0223038be85fb22fc5bb' },
  { id: 2, privateKey: '0x5473de800f8dd099d5ba03b27b4d6c40be2a2cbe4d5c6f051915275209f6c060' },
  { id: 3, privateKey: '0x280f8da3c473c6506c7c3df892c7f1e46bbb6b3075c7ec0728ff0ad1ed026b9a' },
  { id: 4, privateKey: '0xb7b1343fa106c3b118eec17de5c6c57724212d3aef644802c942ac41fa8513e4' },
  { id: 5, privateKey: '0x6352048185bcc2bbdd179af677918478ed4119945ccf71793a3b74f3181b6a9d' },
]
