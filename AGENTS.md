# Working on Portfolio

Portfolio is for creating and publishing photo collections. The private photo library makes photos easy to find and select. Add features as actual use reveals a need.

## Workflow

The owner sets scope and makes product and design decisions. Ask before implementing unresolved behavior. Keep chat updates short, and let the owner review issue and PR text before posting.

For small fixes and tweaks, agree on the change in chat, make the edit, and run the relevant checks. Get the owner's approval before committing.

For major features:

1. **Create a draft issue.** Capture the idea in GitHub and apply `needs refinement`.
2. **Refine with EGM.** Use the Elephant Goldfish model with the owner. For major UI changes, use a preview branch and sample data. Once approved, put the finalized design in the issue and remove `needs refinement`. The issue records the agreed scope; keep temporary plans and review notes out of the repository.
3. **Implement in batches.** Use a descriptive `feature/`, `fix/`, `docs/`, or `chore/` branch. Before writing tests, list each proposed test and what it checks, and wait for approval. Confirm the agreed tests fail for the expected reason, implement, and refactor with tests passing. Leave each batch uncommitted for review; commit only after owner approval.
4. **Open the PR.** Explain what changed. Use `Closes #123` for the issue. Include screenshots or material limitations and costs when useful; let CI report automated results.
5. **Address review comments.** When the owner says they have finished reviewing, read the PR comments and make the requested fixes.

## Code

- Build the simplest solution for the agreed cases. Add abstractions when they simplify current code; avoid speculative options and fallbacks.
- Keep components focused and pages responsible for composition. Keep tests beside the behavior they cover, including the code that connects components or packages.
- Use product terms and clear names. Comment on reasons that are not apparent from the code.
- Match nearby formatting and separate logical steps and CSS rules with blank lines. Format Go with `gofmt`.
- Reuse shared colors and motion values from `src/frontend/styles.css`. Keep component-specific styles and constants local; share them when several components need them.
- Enforce permissions on the server. Keep secrets and personal data out of commits, logs, and fixtures; inspect the staged diff before committing.
- Update README.md when setup, architecture, or supported behavior changes.

## UI and UX

- Check changed UI in a browser on phone and desktop, including keyboard use, visible focus, accessible names, cancellation, and error states.
- Keep controls and content in predictable places across loading, editing, and error states.
- Keep motion brief and purposeful, respect reduced motion, and track the pointer directly during dragging. Reuse existing interaction styles.

## Tests

- Test one behavior per case, including distinct failures and permissions. Multiple assertions are useful when they prove the same behavior.
- Use the lowest level that proves the behavior. Use a real browser for layout, focus, dragging, and resizing; use end-to-end tests for behavior across layers.
- Test outcomes rather than incidental markup or internal calls. Keep setup small and separate setup, action, and assertions with blank lines.
- Use plain behavior names. In TypeScript, use `can` for user actions and `should` for expected behavior.
