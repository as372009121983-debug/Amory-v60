# AMORY Mobile Rebuild

This build keeps the existing desktop UI and rebuilds the mobile shell around independent screen scroll surfaces.

- Fixed mobile app frame with safe-area support.
- Fixed top header and bottom navigation.
- Each route has its own scroll container instead of scrolling the whole document.
- Responsive spacing and one-column fallback for narrow phones (down to ~320px).
- 16px mobile form controls to prevent browser zoom.
- Invoice action bar stays above bottom navigation.
- Invoice item picker remains a centered card with its own result scroll.
- Long Arabic/Latin names wrap instead of being visually clipped.
- Existing cloud/offline/import/PDF features are preserved from the supplied V9-derived build.

Build note: dependency installation in the local sandbox timed out, so a full Vite production build could not be executed here. The source ZIP is prepared for Vercel, where dependencies are installed during deployment.
