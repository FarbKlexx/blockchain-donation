// Resolve a stored image reference to a URL an <img> can load.
//
// Project images are SELF-HOSTED (users upload their own; no external URLs). The
// backend/DB stores only a relative KEY — e.g. "uploads/burger-restaurant/cover.jpg"
// — with no host baked in, so rows stay portable across environments. The URL is
// built here from a configurable base:
//   • VITE_MEDIA_BASE_URL set → "<base>/<key>"  (e.g. a media host / CDN in prod)
//   • unset → the app's BASE_URL ("/" by default) → "/uploads/…", which the Vite
//     dev server and build serve straight from public/uploads/.
// Switching where images live (public/ → backend → CDN) is then ONLY a change to
// VITE_MEDIA_BASE_URL — the stored keys, the data model and the components are
// untouched (the same seam pattern used for explorer URLs in utils/address.ts).
export function mediaUrl(ref: string): string {
  if (!ref) return ''
  // Defensive: an already-absolute URL (or protocol-relative) is left untouched.
  if (/^(https?:)?\/\//.test(ref)) return ref
  const base = (import.meta.env.VITE_MEDIA_BASE_URL ?? import.meta.env.BASE_URL ?? '/').replace(
    /\/+$/,
    '',
  )
  return `${base}/${ref.replace(/^\/+/, '')}`
}
