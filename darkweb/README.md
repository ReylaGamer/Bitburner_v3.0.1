# Darkweb stack

This directory contains the darkweb automation stack and the files that are version-managed together.

Runtime ownership:
- `dark-startup.js` is the authoritative release launcher on `home`.
- `dark-agent.js` is the deployment and remote-process coordinator.
- `dark-status.js` is a home-only monitoring script.
- `dark-password-review.js` is a home-only credential review script.
- worker scripts are started remotely and inherit the same deployment version.

Important:
- `dark-status.js` and `dark-password-review.js` are intentionally not part of the remote bundle.
- `dark-agent.js` is the only startup process that propagates the remote dark web worker bundle.
- Version changes are driven entirely from `dark-startup.js` through `ns.args[0]`.
