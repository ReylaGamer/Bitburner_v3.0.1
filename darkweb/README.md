# Darkweb system

This directory contains the darkweb automation stack and its release-managed scripts.

Expected files:

- `dark-startup.js` — home-only release launcher.
- `dark-agent.js` — deployment and remote worker controller.
- `dark-status.js` — home-only status service.
- `dark-password-review.js` — home-only password review service.
- `dark-cache.js` — remote worker.
- `dark-phishing.js` — remote worker.
- `dark-collect.js` — remote worker.

The propagation bundle is intentionally limited to the agent and remote workers. Home-only services are not copied to remote nodes.
