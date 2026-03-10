# Replace Next.js with React Router + Vite

**Date**: 2026-03-10
**Status**: Approved
**Goal**: Remove Next.js from frontend. Replace with Vite + React Router v7 for fast builds, simplicity, and Bun compatibility.

## Context

The frontend is overwhelmingly client-side: 13/17 pages are `"use client"`. Next.js server features actually used are minimal — SSG for blog posts, 3 trivial API routes, image optimization, and an API proxy rewrite. The app is an SPA wearing a Next.js costume.

## Architecture

Pure SPA served as static files. Vite for bundling/dev, React Router v7 for routing, Bun for running everything.

```
frontend/
├── index.html                    # SPA entry point
├── vite.config.ts                # Vite config (dev proxy, build settings)
├── build-blog.ts                 # Bun script: markdown -> posts.json + copy media
├── public/
│   └── blog/                     # Pre-built blog assets (images, audio, posts.json)
├── src/
│   ├── main.tsx                  # React entry (providers + RouterProvider)
│   ├── routes.tsx                # Route definitions (replaces file-based routing)
│   ├── app/                      # Page components (migrated from Next.js pages)
│   ├── components/               # Unchanged
│   ├── contexts/                 # Unchanged
│   ├── services/                 # Unchanged
│   └── lib/                      # Unchanged
```

## Key Decisions

| Concern | Approach |
|---------|----------|
| Routing | Explicit route config in `routes.tsx`. ~17 routes, 1:1 map from App Router. |
| API proxy | `vite.config.ts` dev proxy to `localhost:3001`. Production: reverse proxy. |
| Blog posts | `build-blog.ts` at build time: markdown -> `public/blog/posts.json` + copy media. Client fetches at runtime. |
| Blog images | Copied to `public/blog/` during build. No API route needed. |
| Subscribe endpoint | Move to protocol backend as a new controller route. |
| `next/image` | Replace with `<img>` + lazy loading. CDN-level optimization later if needed. |
| `next/link` | React Router `<Link>`. |
| `next/navigation` | `useRouter()` -> `useNavigate()`, `usePathname()` -> `useLocation()`, `useSearchParams()` -> `useSearchParams()`. |
| `next/script` | `<script>` tag in `index.html` for Plausible. |
| Dynamic metadata | Blog OG tags: CDN edge injection or skip (SPA limitation). Non-blog: not currently used. |
| Root layout | Top-level component in `main.tsx` wrapping `<RouterProvider>`. |
| Auth | Better Auth client unchanged. Remove Next.js imports from `AuthContext`. |
| Streaming chat | Uses raw `fetch` + `ReadableStream` — no Next.js dependency. Works as-is. |

## Build Pipeline

```bash
bun run build:blog    # Pre-build blog (markdown -> JSON + copy media)
bun run build         # vite build (outputs dist/)
bun run dev           # vite dev server with API proxy
```

## Dependencies

### Removed
- `next`
- `eslint-config-next`

### Added
- `vite`
- `@vitejs/plugin-react`
- `react-router` (v7)

### Unchanged
- All 37 components, 10 context providers, 13 service files
- `src/lib/api.ts`, auth client
- Tailwind CSS, Radix UI, all UI dependencies

## What Gets Deleted

- `next.config.ts`
- `src/app/api/` (3 route handlers)
- `src/app/layout.tsx` (replaced by `main.tsx`)
- All `"use client"` directives
- Next.js-specific imports (`next/image`, `next/link`, `next/navigation`, `next/script`, `next/headers`)

## Migration Scope

~17 page files need import updates (`next/link` -> `react-router`, etc.). Most component code stays identical — the business logic and UI don't change, only the framework glue.
