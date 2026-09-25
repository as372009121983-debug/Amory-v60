---
name: Workspace dependency scope
description: Keep JavaScript dependencies in the workspace package that imports them.
---

Add app-specific dependencies to their owning artifact package rather than the pnpm workspace root.

**Why:** A root-scoped package addition was rejected with `ERR_PNPM_ADDING_TO_ROOT`; the artifact package owns its dependency manifest.

**How to apply:** Target `@workspace/<artifact>` when adding package-specific dependencies, and reserve root dependencies for tooling shared by the workspace.