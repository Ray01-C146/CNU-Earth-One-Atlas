# Atlas website editor

This update is prepared for Ray01-C146/CNU-Earth-One-Atlas, main branch.
It has NOT been pushed or deployed, and no password or GitHub token has been set.

## Files and placement

Keep these files at the repository root, alongside your existing README:

- index.html: the existing interface plus Edit button and password dialog.
- editor.js: editor controls, authenticated requests, local drafts and preview.
- site-content.json: publicly readable site content and colors. Publishing changes this file.
- editor-backend/: a separate private-configuration Node service. GitHub Pages does not execute it.
- EDITOR-SETUP.md: these instructions.

The ZIP has index.html at its root, with no source/ wrapper. It contains twelve small files, so it fits within a single browser upload. Preserve editor-backend/ as a folder when uploading. Your existing README need not be replaced.

The page remains viewable before the backend is connected. The editor explains that it is not connected rather than pretending a browser password can protect GitHub publishing.

## 1. Host the backend

Deploy editor-backend/ to an HTTPS host that runs Node 22 or newer. It has no npm dependencies. Set its root directory to editor-backend and its start command to npm start. A Dockerfile is also included if the host accepts Docker deployments.

The host must keep this process running and provide a public HTTPS URL. Set the following in the host's private environment/secret settings, never in index.html or a committed .env file:

- EDITOR_PASSWORD_HASH: generate this as described below.
- GITHUB_TOKEN: a fine-grained GitHub personal access token restricted to ONLY CNU-Earth-One-Atlas, with Contents read/write permission. No Workflows permission is needed. Set an expiry and rotate it when necessary. Branch protection can prevent direct commits; the target branch must allow this token to update site-content.json.
- ALLOWED_ORIGIN: https://ray01-c146.github.io (no trailing slash or repository path). If your site uses a custom domain, set that exact origin instead.
- GITHUB_BRANCH: main.
- PORT: use the value required by your host. If it supplies PORT automatically, keep that. The fallback is 8001.

To generate the hash locally, open a terminal inside editor-backend and run:

    npm run password

Type a password of at least 16 characters at the hidden prompt. Copy the resulting salt:hash into the backend host's EDITOR_PASSWORD_HASH secret. Do not send your password or token in chat. Restart the service after changing secrets.

The backend is locked to this repository and site-content.json in code. Clients cannot choose another file or repository. It cannot change the HTML, JavaScript, CSS, workflow files or arbitrary repository files.

Keep this as a single service instance. Password throttling and sessions are kept in process memory. A restart logs out everyone and clears throttling. Multiple instances require a shared session/rate-limit store or host-level access control before scaling. Behind a proxy, the built-in IP throttle can be shared across visitors because it deliberately does not trust forwarded-IP headers. Configure host-level throttling too.

## 2. Connect the page

Once the backend has an HTTPS address, edit this line near the top of index.html:

    <meta name="atlas-editor-api" content="">

Put the backend's public base URL inside content, for example:

    <meta name="atlas-editor-api" content="https://YOUR-BACKEND-HOST">

This URL is public configuration, not a password. The backend must expose /login, /session, /logout, /content and /publish directly at that base URL. /health supports the host's health check.

Upload the changed files to the existing repository and keep GitHub Pages deploying main / root. No custom Pages build is required.

## 3. Use the editor

Open the published page and click Edit in the footer. Enter the password. The editor retrieves the latest content directly from GitHub and tracks its revision.

- Edit the site name, news, two colors, section labels/headings/descriptions and event titles/descriptions.
- Preview changes applies the fields only to the current page. Close the dialog to inspect them; open Edit again to continue.
- Save draft stores an unpublished copy in this browser. It is not encrypted, so use a trusted browser profile. It does not store your password, session token or GitHub credential.
- Load draft restores a draft only if its GitHub revision matches. A stale draft is refused to protect newer published edits.
- Export saved draft downloads the last saved browser draft as JSON for recovery, including stale drafts. There is no automatic import/merge yet.
- Publish to GitHub asks for confirmation, updates site-content.json on main, and displays the resulting commit link. It does NOT rewrite index.html. Pages then needs time to deploy the commit.
- Reload from GitHub replaces the form with the latest published content after confirmation. Save/export an important draft first.
- Lock editor revokes the server session and restores the last published view.

Sessions expire after two hours, and refresh/reopening the page requires signing in again. Closing the editor dialog alone does not log out; use Lock editor on a shared device.

When a conflict appears, save/export your draft, reload the latest version and reapply your intended changes. Never force an overwrite. If publishing times out, check the repository commit history before retrying; the commit may have completed even though the response was lost.

## What password protection means

GitHub publishing requires the backend-verified session. Login attempts are throttled, passwords are checked using scrypt, and the GitHub token stays on the backend. The browser keeps the short-lived session token only in memory. Every write checks authentication, validates a restricted JSON schema and verifies the expected file revision.

The public page, its code and published content remain readable. Anyone can alter a temporary copy of a page in their own browser; this cannot update your repository. A password does not conceal a public website's source.

## Verification

Run these in editor-backend:

    npm test

The backend tests use a mock GitHub service. They cover unauthorized requests, allowed origins, password failures, logout, expiry, throttling, content validation, first-file creation handling, publishing payloads and revision conflicts. They do not make real commits.

No real credentials are included, so a live GitHub publish has not been tested. Browser visual testing was unavailable in this workspace. A DOM interaction check passed for public rendering, actual backend login, preview, text escaping, section navigation, local drafts, publishing against a simulated GitHub response, and logout. This checks behavior but does not replace a browser visual audit.

## References

GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
GitHub file read/update API and Contents permissions: https://docs.github.com/en/rest/repos/contents
