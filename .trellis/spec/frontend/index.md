# Frontend Guidelines

These guidelines apply to `src/apps/web`.

## Stack

- Next.js 16 App Router
- React 19.2
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- TanStack Query
- URL query parameters for list state

## Documents

| File | Purpose |
| --- | --- |
| [component-guidelines.md](./component-guidelines.md) | Server/client component boundaries and accessible UI |
| [state-management.md](./state-management.md) | Server state, URL state, and local UI state |
| [hook-guidelines.md](./hook-guidelines.md) | Query and mutation hook patterns |
| [lists.md](./lists.md) | List/table page state, UI, and API responsibility rules |
| [copywriting.md](./copywriting.md) | Chinese UI copy organization and tone rules |
| [quality-guidelines.md](./quality-guidelines.md) | Frontend implementation checklist |

## Core Rules

- Default to Server Components. Add `"use client"` only for interactivity, React hooks, or browser APIs.
- Use semantic HTML. Use `<button>` for actions and links for navigation.
- Use `next/image` for images.
- Use shadcn/ui primitives for common UI controls before creating custom controls.
- Use TanStack Query for server state in client components.
- Store shareable list state in the URL: page, page size, search, filters, and sort.
- Do not introduce an extra table state library unless the project spec is updated first.
