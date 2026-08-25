# Linear Initiative Tree

A workspace-agnostic, read-only, collapsible visualization of live Linear data:

```text
root initiative → sub-initiatives → projects → issues
```

Use the initiative picker to render several roots on the same canvas. Shared projects are deduplicated and keep all applicable connectors. The orientation control switches the forest between left-to-right and top-to-bottom without losing selection or expansion state.

Selected root initiatives are stored locally in the browser and restored on the next visit. Stored IDs are validated against the current live Linear workspace before use.

Zoom with the canvas controls or use a trackpad pinch / `Ctrl` or `Cmd` plus mouse wheel. Pointer-based zoom keeps the content under the cursor anchored while scaling.

Projects are arranged in shelves of up to three columns per initiative. Use the **Group** control to order and label cards by health, project lead, or alphabetically; the choice is stored locally. Below 72% zoom, each shelf becomes an aggregate health summary unless it contains explicitly expanded issues; select the summary to keep its project cards expanded. The issue layer follows the widest active shelf instead of always reserving three columns. Project and issue cards outside the visible canvas window are not mounted, while their layout space and connectors remain stable.

The app first loads lightweight initiative metadata for navigation. It then requests projects only for the selected initiative subtrees and fully paginates issues only for those projects. Changing the initiative selection cancels an obsolete in-flight execution request and loads the new scope.

## Use the hosted app

Open <https://domjancik.github.io/linear-tree-visualizer/> and paste a personal Linear API key. The key is stored in that browser's `localStorage`, sent directly to `https://api.linear.app`, and never committed to this repository or sent to an application server.

Use **Forget token** in the sidebar to remove it. Browser storage is accessible to JavaScript running on the page, so OAuth is the preferred authentication model for broad public use. A Linear OAuth client can be added later without changing the visualization data model.

## Run locally

Install and run:

```bash
npm install
npm run dev
```

Open the URL Vite prints and connect with your own Linear token.

## Build and deployment

```bash
npm run build
npm run preview
```

Pushes to `main` deploy the `dist` build through GitHub Actions and GitHub Pages. Initiative, project, and selected-project issue connections are fully paginated. Large GraphQL filters are chunked to keep each request bounded.

No Linear token is needed at build time and no token belongs in GitHub Actions secrets.
