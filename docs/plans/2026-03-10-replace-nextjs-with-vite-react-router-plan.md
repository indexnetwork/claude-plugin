# Replace Next.js with Vite + React Router — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Next.js from the frontend and replace with Vite + React Router v7 for fast builds, simplicity, and Bun compatibility.

**Architecture:** Pure SPA served as static files. Vite handles bundling and dev server (with API proxy to protocol backend). React Router v7 handles client-side routing. A Bun build script pre-generates blog content at build time.

**Tech Stack:** React 19, Vite, React Router v7, Tailwind CSS 4, Bun

**Design doc:** `docs/plans/2026-03-10-replace-nextjs-with-vite-react-router.md`

---

### Task 1: Scaffold Vite + React Router project files

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/routes.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/tsconfig.json`

**Step 1: Update package.json**

Remove dependencies:
- `next`
- `eslint-config-next`

Add dependencies:
- `vite`
- `@vitejs/plugin-react`
- `react-router` (v7)

Update scripts:
```json
{
  "dev": "vite --host 127.0.0.1",
  "build": "bun run build:blog && vite build",
  "build:blog": "bun run build-blog.ts",
  "start": "vite preview",
  "lint": "eslint ."
}
```

Run: `cd frontend && bun install`

**Step 2: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Index Network</title>
    <meta name="description" content="A private, intent-driven discovery protocol" />
    <meta property="og:title" content="Index Network" />
    <meta property="og:description" content="A private, intent-driven discovery protocol" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@indexnetwork" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <script defer data-domain="index.network" src="https://plausible.io/js/script.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Note: Copy the exact OG metadata values from the current `layout.tsx` metadata export. The Plausible `data-domain` should match the current `next/script` usage in `layout.tsx`.

**Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.PROTOCOL_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

**Step 4: Create `frontend/src/routes.tsx`**

Define all routes mapping 1:1 from the current App Router structure. Use lazy imports for code splitting:

```tsx
import { createBrowserRouter } from "react-router";

// Lazy-load all page components
const Home = lazy(() => import("@/app/page"));
const About = lazy(() => import("@/app/about/page"));
const BlogList = lazy(() => import("@/app/blog/page"));
const BlogPost = lazy(() => import("@/app/blog/[slug]/page"));
const Chat = lazy(() => import("@/app/chat/page"));
const Discovery = lazy(() => import("@/app/d/[id]/page"));
const IndexDetail = lazy(() => import("@/app/index/[indexId]/page"));
const LinkRedirect = lazy(() => import("@/app/l/[code]/page"));
const Library = lazy(() => import("@/app/library/page"));
const Networks = lazy(() => import("@/app/networks/page"));
const NetworkDetail = lazy(() => import("@/app/networks/[id]/page"));
const PrivacyPolicy = lazy(() => import("@/app/pages/privacy-policy/page"));
const TermsOfUse = lazy(() => import("@/app/pages/terms-of-use/page"));
const Profile = lazy(() => import("@/app/profile/page"));
const SharedSession = lazy(() => import("@/app/s/[token]/page"));
const UserProfile = lazy(() => import("@/app/u/[id]/page"));
const UserChat = lazy(() => import("@/app/u/[id]/chat/page"));
const IntentProposal = lazy(() => import("@/app/dev/intent-proposal/page"));
const NotFound = lazy(() => import("@/app/not-found"));

// Note: lazy() needs React.lazy + Suspense. Import { lazy, Suspense } from "react".
// Each page component must be a default export.

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,  // Provider wrapper + layout shell
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "about", element: <About /> },
      { path: "blog", element: <BlogList /> },
      { path: "blog/:slug", element: <BlogPost /> },
      { path: "chat", element: <Chat /> },
      { path: "d/:id", element: <Discovery /> },
      { path: "index/:indexId", element: <IndexDetail /> },
      { path: "l/:code", element: <LinkRedirect /> },
      { path: "library", element: <Library /> },
      { path: "networks", element: <Networks /> },
      { path: "networks/:id", element: <NetworkDetail /> },
      { path: "pages/privacy-policy", element: <PrivacyPolicy /> },
      { path: "pages/terms-of-use", element: <TermsOfUse /> },
      { path: "profile", element: <Profile /> },
      { path: "s/:token", element: <SharedSession /> },
      { path: "u/:id", element: <UserProfile /> },
      { path: "u/:id/chat", element: <UserChat /> },
      { path: "dev/intent-proposal", element: <IntentProposal /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
```

**Step 5: Create `frontend/src/main.tsx`**

Migrate the provider tree from `layout.tsx` into a React entry point:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./routes";

// Import global CSS (currently imported in layout.tsx)
import "./app/globals.css";

// Providers (same nesting order as current layout.tsx)
import { AuthProvider } from "@/contexts/AuthContext";
import { APIProvider } from "@/contexts/APIContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { DiscoveryFilterProvider } from "@/contexts/DiscoveryFilterContext";
import { AIChatSessionsProvider } from "@/contexts/AIChatSessionsContext";
import { AIChatProvider } from "@/contexts/AIChatContext";

function App() {
  return (
    <AuthProvider>
      <APIProvider>
        <NotificationProvider>
          <DiscoveryFilterProvider>
            <AIChatSessionsProvider>
              <AIChatProvider>
                <RouterProvider router={router} />
              </AIChatProvider>
            </AIChatSessionsProvider>
          </DiscoveryFilterProvider>
        </NotificationProvider>
      </APIProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Note: Check the exact provider tree in `layout.tsx` — the `ClientWrapper` component wraps the router output and includes sidebar/header layout logic. This becomes the `AppLayout` component referenced in routes.tsx. Read `ClientWrapper.tsx` to understand what layout elements it provides and replicate that as the route layout element.

**Step 6: Update `frontend/tsconfig.json`**

- Remove `"plugins": [{ "name": "next" }]`
- Keep the `@/*` path alias
- Ensure `"jsx": "react-jsx"` is set
- Ensure `"moduleResolution": "bundler"` is set

**Step 7: Commit**

```bash
git add frontend/index.html frontend/vite.config.ts frontend/src/main.tsx frontend/src/routes.tsx frontend/package.json frontend/tsconfig.json
git commit -m "feat(frontend): scaffold Vite + React Router project structure"
```

---

### Task 2: Create blog build script

**Files:**
- Create: `frontend/build-blog.ts`
- Existing reference: `frontend/src/lib/blog.ts` (blog utility functions)
- Existing reference: `frontend/content/blog/` (markdown source files)

**Step 1: Create `frontend/build-blog.ts`**

This Bun script runs at build time. It:
1. Reads all blog posts from `content/blog/{slug}/index.md`
2. Parses frontmatter and extracts metadata
3. Outputs `public/blog/posts.json` (array of post metadata)
4. Copies all media files (images, audio) from each post directory to `public/blog/{slug}/`

```typescript
import { readdirSync, readFileSync, mkdirSync, cpSync, writeFileSync, existsSync } from "fs";
import { join, extname } from "path";
import matter from "gray-matter";

const CONTENT_DIR = join(import.meta.dir, "content/blog");
const OUTPUT_DIR = join(import.meta.dir, "public/blog");

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

const slugs = readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const posts: Array<{
  slug: string;
  title: string;
  date: string;
  description?: string;
  image?: string;
}> = [];

const mediaExtensions = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
  ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac",
]);

for (const slug of slugs) {
  const postDir = join(CONTENT_DIR, slug);
  const indexPath = join(postDir, "index.md");

  if (!existsSync(indexPath)) continue;

  const raw = readFileSync(indexPath, "utf-8");
  const { data } = matter(raw);

  posts.push({
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description,
    image: data.image ? `/blog/${slug}/${data.image}` : undefined,
  });

  // Copy media files to public/blog/{slug}/
  const outDir = join(OUTPUT_DIR, slug);
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(postDir);
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (mediaExtensions.has(ext)) {
      cpSync(join(postDir, file), join(outDir, file));
    }
  }
}

// Sort by date descending
posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

writeFileSync(join(OUTPUT_DIR, "posts.json"), JSON.stringify(posts, null, 2));

console.log(`Built ${posts.length} blog posts to ${OUTPUT_DIR}`);
```

**Step 2: Run the script to verify**

Run: `cd frontend && bun run build-blog.ts`
Expected: Outputs "Built N blog posts to .../public/blog" and creates `public/blog/posts.json` + media directories.

**Step 3: Add `public/blog/` to `.gitignore`**

Add to `frontend/.gitignore`:
```
public/blog/
```

This is a build artifact, not source.

**Step 4: Commit**

```bash
git add frontend/build-blog.ts frontend/.gitignore
git commit -m "feat(frontend): add blog build script for pre-generating blog assets"
```

---

### Task 3: Update blog utility and pages for client-side rendering

**Files:**
- Modify: `frontend/src/lib/blog.ts`
- Modify: `frontend/src/app/blog/page.tsx` (blog listing)
- Modify: `frontend/src/app/blog/[slug]/page.tsx` (blog post)

**Step 1: Create a client-side blog utility**

The current `blog.ts` uses Node.js `fs` module which won't work in browser. Create a client-side version that fetches from the pre-built assets:

Replace the contents of `frontend/src/lib/blog.ts` with a client-side API:

```typescript
export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description?: string;
  image?: string;
  content?: string;
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const res = await fetch("/blog/posts.json");
  return res.json();
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const res = await fetch(`/blog/${slug}/index.md`);
  if (!res.ok) return null;
  const raw = await res.text();
  const { data, content } = parseFrontmatter(raw);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description,
    image: data.image ? `/blog/${slug}/${data.image}` : undefined,
    content: transformAssetPaths(content, slug),
  };
}

// Keep the existing parseFrontmatter and transformAssetPaths functions
// but update transformAssetPaths to rewrite paths to /blog/{slug}/ instead of /api/blog-images/{slug}/
```

Note: The build script must also copy `index.md` files to `public/blog/{slug}/index.md` so they can be fetched at runtime. Update `build-blog.ts` to include `.md` files in the copy step.

**Step 2: Migrate blog listing page**

`frontend/src/app/blog/page.tsx`:
- Remove `"use client"` directive
- Remove any `next/link` imports → use `import { Link } from "react-router"`
- The page currently fetches from `/api/blog/posts` — change to `getAllPosts()` from the updated blog utility
- Remove any Next.js-specific imports

**Step 3: Migrate blog post page**

`frontend/src/app/blog/[slug]/page.tsx`:
- Remove `generateStaticParams()` and `generateMetadata()` entirely
- Remove `next/image`, `next/headers`, `next/navigation` imports
- Get slug from React Router params: `const { slug } = useParams()`
- Fetch post content using `getPostBySlug(slug)` in a `useEffect` or data loader
- Replace `Image` component with `<img>` tags
- Replace `notFound()` call with navigation to 404 or showing a not-found state
- Update image/audio paths from `/api/blog-images/{slug}/` to `/blog/{slug}/`
- Keep the markdown rendering logic (react-markdown, remark-gfm, custom components)

**Step 4: Verify blog renders**

Run: `cd frontend && bun run build:blog && bun run dev`
Navigate to `/blog` and `/blog/{any-slug}` to verify posts load and render correctly.

**Step 5: Commit**

```bash
git add frontend/src/lib/blog.ts frontend/src/app/blog/ frontend/build-blog.ts
git commit -m "feat(frontend): migrate blog to client-side rendering with pre-built assets"
```

---

### Task 4: Replace `next/link` across all components (26 files)

**Files to modify (all under `frontend/src/`):**

Search for all files importing `next/link` and replace:
- `import Link from "next/link"` → `import { Link } from "react-router"`
- The `Link` component API differs:
  - Next.js: `<Link href="/path">`
  - React Router: `<Link to="/path">`
  - So every `href=` prop on `<Link>` must become `to=`

**Step 1: Find all files**

Run: `grep -rl "from \"next/link\"" frontend/src/` to get the exact list.

**Step 2: Replace imports and props systematically**

For each file:
1. Replace `import Link from "next/link"` with `import { Link } from "react-router"`
2. Replace all `<Link href=` with `<Link to=`
3. Replace all `<Link\n  href=` (multiline) patterns too

**Step 3: Verify no remaining next/link imports**

Run: `grep -r "next/link" frontend/src/`
Expected: No results.

**Step 4: Commit**

```bash
git add -u frontend/src/
git commit -m "refactor(frontend): replace next/link with react-router Link"
```

---

### Task 5: Replace `next/navigation` hooks across all components (15 files)

**Files to modify:** All files importing from `next/navigation`.

**Mapping:**
| Next.js | React Router |
|---------|-------------|
| `import { useRouter } from "next/navigation"` | `import { useNavigate } from "react-router"` |
| `import { usePathname } from "next/navigation"` | `import { useLocation } from "react-router"` |
| `import { useSearchParams } from "next/navigation"` | `import { useSearchParams } from "react-router"` |
| `import { useParams } from "next/navigation"` | `import { useParams } from "react-router"` |
| `import { notFound } from "next/navigation"` | Navigate to 404 or render not-found state |

**Usage changes:**
- `router.push("/path")` → `navigate("/path")`
- `router.replace("/path")` → `navigate("/path", { replace: true })`
- `router.back()` → `navigate(-1)`
- `pathname` (from `usePathname()`) → `location.pathname` (from `useLocation()`)
- `const params = useParams()` — same API, just different import source
- Dynamic route params: Next.js pages receive `params` as a Promise via `use(params)`. React Router uses `useParams()` hook directly — no `use()` unwrapping needed.

**Step 1: Find all files**

Run: `grep -rl "from \"next/navigation\"" frontend/src/`

**Step 2: Replace in each file**

For each file, update imports and usages per the mapping above. Pay special attention to:
- `frontend/src/contexts/AuthContext.tsx` — uses `useRouter` and `usePathname` heavily
- `frontend/src/components/ClientWrapper.tsx` — uses `usePathname` for route-based UI decisions
- Pages with dynamic params that use `use(params)` pattern — simplify to `useParams()`

**Step 3: Verify no remaining next/navigation imports**

Run: `grep -r "next/navigation" frontend/src/`
Expected: No results.

**Step 4: Commit**

```bash
git add -u frontend/src/
git commit -m "refactor(frontend): replace next/navigation with react-router hooks"
```

---

### Task 6: Replace `next/image` across all components (8 files)

**Files to modify:** All files importing `next/image`.

**Step 1: Find all files**

Run: `grep -rl "from \"next/image\"" frontend/src/`

**Step 2: Replace in each file**

- `import Image from "next/image"` → remove import
- `<Image src={...} alt={...} width={N} height={N} />` → `<img src={...} alt={...} width={N} height={N} loading="lazy" />`
- `<Image ... fill />` → `<img ... style={{ objectFit: "cover", width: "100%", height: "100%" }} loading="lazy" />`
- Remove `unoptimized` prop (not needed without Next.js image optimizer)
- Remove `priority` prop (use `loading="eager"` if above the fold, otherwise `loading="lazy"`)

**Step 3: Verify no remaining next/image imports**

Run: `grep -r "next/image" frontend/src/`
Expected: No results.

**Step 4: Commit**

```bash
git add -u frontend/src/
git commit -m "refactor(frontend): replace next/image with native img elements"
```

---

### Task 7: Replace `next/script` and remove remaining Next.js imports

**Files:**
- Modify: `frontend/src/app/layout.tsx` (remove `next/script` import — Plausible is now in `index.html`)

**Step 1: Clean up layout.tsx**

The root layout file is being replaced by `main.tsx` (Task 1). However, the `ClientWrapper` component and any shared layout elements from `layout.tsx` need to be preserved.

- Check if `layout.tsx` contains any logic beyond the provider tree and metadata that needs migrating
- The `ClientWrapper` component becomes the `AppLayout` component used in `routes.tsx`
- Remove `layout.tsx` once all its concerns are handled by `main.tsx` and `AppLayout`

**Step 2: Remove `next/headers` usage**

Found in `frontend/src/app/blog/[slug]/page.tsx` — already handled in Task 3.

**Step 3: Verify zero Next.js imports remain**

Run: `grep -r "from \"next/" frontend/src/`
Expected: No results.

**Step 4: Commit**

```bash
git add -u frontend/src/
git commit -m "refactor(frontend): remove all remaining Next.js imports"
```

---

### Task 8: Remove `"use client"` directives

**Files:** ~57 files across `frontend/src/`

**Step 1: Remove all `"use client"` directives**

These are Next.js-specific and meaningless in a Vite SPA. Remove them from all files:

Run a search-and-replace to remove lines containing only `"use client"` or `'use client'` (including the trailing newline).

**Step 2: Verify none remain**

Run: `grep -r "use client" frontend/src/`
Expected: No results.

**Step 3: Commit**

```bash
git add -u frontend/src/
git commit -m "refactor(frontend): remove all 'use client' directives"
```

---

### Task 9: Move subscribe endpoint to protocol backend

**Files:**
- Modify or create: `protocol/src/controllers/subscribe.controller.ts`
- Register route in: `protocol/src/main.ts`
- Delete: `frontend/src/app/api/subscribe/route.ts`

**Step 1: Read the current subscribe route**

Read `frontend/src/app/api/subscribe/route.ts` to understand the exact logic (POST to Loops.so API).

**Step 2: Create a subscribe controller in the protocol**

Follow the controller template (`protocol/src/controllers/controller.template.md`). The controller should:
- Accept POST `/api/subscribe`
- Forward to Loops.so newsletter service (same logic as current frontend route)
- No auth guard needed (public endpoint)

**Step 3: Register the controller in `main.ts`**

Add the new controller to the route registry in `protocol/src/main.ts`.

**Step 4: Delete the frontend API routes directory**

Delete entire `frontend/src/app/api/` directory (all 3 routes are now handled: blog routes by build script, subscribe by protocol).

**Step 5: Commit**

```bash
git add protocol/src/controllers/subscribe.controller.ts protocol/src/main.ts
git rm -r frontend/src/app/api/
git commit -m "feat(protocol): move subscribe endpoint from frontend to protocol backend"
```

---

### Task 10: Clean up Next.js config and artifacts

**Files:**
- Delete: `frontend/next.config.ts`
- Delete: `frontend/next-env.d.ts` (if exists)
- Delete: `frontend/src/app/layout.tsx` (replaced by `main.tsx`)
- Modify: `frontend/.gitignore` (remove Next.js entries, add Vite entries)
- Modify: `frontend/tsconfig.json` (final cleanup)

**Step 1: Delete Next.js config files**

```bash
rm frontend/next.config.ts
rm -f frontend/next-env.d.ts
```

**Step 2: Delete the old layout.tsx**

Only after confirming all provider/layout logic has been migrated to `main.tsx` and the `AppLayout` component.

**Step 3: Update .gitignore**

Remove Next.js entries (`.next/`, `next-env.d.ts`), add Vite entries (`dist/`).

**Step 4: Verify the project builds**

Run: `cd frontend && bun run build`
Expected: Vite builds successfully, outputs to `dist/`.

**Step 5: Commit**

```bash
git add -u frontend/ && git add frontend/
git commit -m "chore(frontend): remove Next.js config and artifacts"
```

---

### Task 11: Migrate page components to use React Router params

**Files:** All page components with dynamic route params.

Pages with dynamic params that need `useParams()`:
- `frontend/src/app/d/[id]/page.tsx` → `useParams<{ id: string }>()`
- `frontend/src/app/index/[indexId]/page.tsx` → `useParams<{ indexId: string }>()`
- `frontend/src/app/l/[code]/page.tsx` → `useParams<{ code: string }>()`
- `frontend/src/app/networks/[id]/page.tsx` → `useParams<{ id: string }>()`
- `frontend/src/app/s/[token]/page.tsx` → `useParams<{ token: string }>()`
- `frontend/src/app/u/[id]/page.tsx` → `useParams<{ id: string }>()`
- `frontend/src/app/u/[id]/chat/page.tsx` → `useParams<{ id: string }>()`

**Step 1: Update each page**

For each page:
1. Remove the `use(params)` pattern (Next.js async params unwrapping)
2. Add `import { useParams } from "react-router"`
3. Get params via `const { id } = useParams()` at the top of the component
4. Ensure the component is a default export (required for lazy loading in routes.tsx)

**Step 2: Verify all pages have default exports**

Every file referenced in `routes.tsx` lazy imports must have a `export default` component.

**Step 3: Commit**

```bash
git add -u frontend/src/app/
git commit -m "refactor(frontend): migrate page components to React Router params"
```

---

### Task 12: Update not-found page and error handling

**Files:**
- Modify: `frontend/src/app/not-found.tsx`

**Step 1: Update not-found component**

- Replace `import Link from "next/link"` with `import { Link } from "react-router"`
- Replace `href` with `to` on Link components
- Ensure it's a default export
- This component is used as `errorElement` in routes.tsx

**Step 2: Commit**

```bash
git add frontend/src/app/not-found.tsx
git commit -m "refactor(frontend): update not-found page for React Router"
```

---

### Task 13: Update Tailwind CSS configuration for Vite

**Files:**
- Check: `frontend/tailwind.config.ts` or `frontend/src/app/globals.css` (Tailwind v4 uses CSS-based config)
- Modify if needed: `frontend/postcss.config.js` or `vite.config.ts`

**Step 1: Check current Tailwind setup**

Tailwind CSS v4 uses `@import "tailwindcss"` in CSS. Verify:
- How Tailwind is currently configured (CSS-based config in v4 vs. `tailwind.config.ts`)
- Whether PostCSS is needed or if Tailwind's Vite plugin handles it

If using Tailwind v4 with Vite, add `@tailwindcss/vite` plugin:
```bash
cd frontend && bun add @tailwindcss/vite
```

Update `vite.config.ts`:
```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ...
});
```

**Step 2: Verify styles render correctly**

Run: `cd frontend && bun run dev`
Check that Tailwind styles apply correctly on all pages.

**Step 3: Commit**

```bash
git add frontend/vite.config.ts frontend/package.json
git commit -m "chore(frontend): configure Tailwind CSS for Vite"
```

---

### Task 14: Update ESLint configuration

**Files:**
- Modify: `frontend/eslint.config.mjs` (or `.eslintrc.*`)

**Step 1: Remove Next.js ESLint config**

- Remove `eslint-config-next` from extends/imports
- Keep TypeScript and React ESLint rules
- Ensure `eslint` runs without errors

**Step 2: Run lint**

Run: `cd frontend && bun run lint`
Expected: Passes (or only pre-existing warnings).

**Step 3: Commit**

```bash
git add frontend/eslint.config.mjs frontend/package.json
git commit -m "chore(frontend): update ESLint config for Vite (remove next config)"
```

---

### Task 15: Update root monorepo scripts

**Files:**
- Modify: root `package.json` (if it references Next.js-specific frontend commands)
- Modify: root worktree scripts (if they reference Next.js)

**Step 1: Check root package.json**

Verify `bun run dev`, `bun run worktree:dev`, and `bun run worktree:build` still work with the new Vite-based frontend.

**Step 2: Update any Next.js-specific references**

The root `dev` script likely runs `next dev` for frontend — update to `vite`.

**Step 3: Verify from root**

Run: `bun run dev` from repo root and select the worktree.
Expected: Both protocol and frontend dev servers start.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: update root monorepo scripts for Vite frontend"
```

---

### Task 16: Smoke test all routes

**No files to modify — verification only.**

**Step 1: Start dev servers**

Run protocol and frontend dev servers.

**Step 2: Test each route**

Navigate to each route and verify it loads:
- `/` — Home
- `/about` — About
- `/blog` — Blog listing
- `/blog/{slug}` — Blog post (pick one)
- `/chat` — Chat (requires auth)
- `/library` — Library (requires auth)
- `/networks` — Networks
- `/profile` — Profile (requires auth)
- `/pages/privacy-policy` — Privacy policy
- `/pages/terms-of-use` — Terms

**Step 3: Test auth flow**

- Login via the auth modal
- Verify JWT token is attached to API calls
- Verify protected routes redirect properly

**Step 4: Test blog build**

Run: `cd frontend && bun run build`
Expected: `bun run build:blog` runs first, then `vite build` outputs to `dist/`.

**Step 5: Document any issues found and fix them**

---

### Task 17: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update frontend sections**

Update all references to Next.js in CLAUDE.md:
- Frontend tech stack: Vite + React Router v7 (not Next.js 15)
- Frontend commands: `vite` instead of `next`
- Remove references to App Router, server components, `generateStaticParams`, etc.
- Update the architecture overview
- Update the frontend directory structure
- Update key dependencies section

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Vite + React Router frontend"
```
