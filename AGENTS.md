# Working on Portfolio

Portfolio is for creating and publishing photo collections. The private photo library supports that work by making photos easy to find and select.

## Workflow

The owner sets the scope and makes product and design decisions. The agent writes the code and tests. Let the owner review issue and PR text before posting. If a missing decision would change the behavior, ask the owner before implementing that part.

For small fixes and tweaks, agree on the change in chat, make the edit, and run the checks it needs. Get the owner’s approval before committing.

Use the full workflow below for major features.

1. **Create a draft issue.** Use GitHub issues as the roadmap. Give the issue a short description, such as “Add photo upload,” and apply the `needs refinement` label.
2. **Agree on the plan.** Discuss the behavior, high-level implementation, architecture, external APIs, and libraries with the owner. For a major UI or interaction change, use a separate preview branch and sample data so the owner can try the design.

   After the owner approves the plan, update the issue with the agreed behavior and key decisions and remove `needs refinement`. Keep the approved issue as the record of the scope. Discuss implementation in chat or the PR, and keep temporary plans and review notes out of the repository.
3. **Implement in batches.** Create a descriptive branch with a `feature/`, `fix/`, `docs/`, or `chore/` prefix. Work on one logical batch at a time, such as a single API endpoint or a small group of UI components.
   1. Write the tests for the batch. Show the owner each test name and a short, plain-English description of what it checks.
   2. After the owner approves the tests, run them and confirm they fail for the expected reason. Implement the batch, confirm the tests pass, and refactor with the tests passing.
   3. Leave the batch uncommitted for the owner's review.
   4. After the owner approves the changes, commit the batch and repeat until the feature is complete.
4. **Open the PR.** Use `Closes #123` to link the issue and close it on merge. Write a short description in plain English that says what changed and how to try it. Include a screenshot, limitation, or infrastructure cost when it helps the reviewer. Let CI report automated test results.
5. **Address PR comments.** The owner leaves comments directly on the PR. When they say they’ve finished reviewing, read the comments and make the requested fixes.

## Code Style

- Use the simplest implementation that covers the agreed cases. Add a helper or abstraction when it makes current code easier to understand. Remove unused code and avoid options, fallbacks, or configuration for hypothetical uses.
- Use short, familiar words that match the product. Prefer clear names and small functions with one job. Comment only when the reason for a decision would otherwise be hard to see.
- Match nearby code and use the standard formatter for the language. Put blank lines between logical steps and between CSS rules, including inside media queries. Review spacing after formatting.
- Keep shared styles and settings in one place. Define common colors, spacing, and motion values in shared CSS. Put constants used by several modules in a shared module close to that code. Keep values used by one component with that component.
- Use standard HTTP methods and status codes. Use GET for reads and POST for creation. Use 201 for successful creation, 400 for invalid input, 401 for a missing or invalid session, 403 for denied access, and 404 for missing resources where appropriate. Enforce permissions on the server.
- Keep secrets and personal data out of commits, fixtures, logs, and generated files. Use fictional test identities and inspect the staged diff before committing.

### UI and UX

- Support phone and desktop layouts. Check both in a browser. For controls, check keyboard focus, accessible names, and what happens when the user cancels or encounters an error.
- Keep the same layout between states where possible so controls and content stay in predictable places.
- When an interaction needs animation, ease out on entrances. Use 150–250 ms for dropdown entrances and make exits about 20% shorter than their entrances.
- Start popovers at 0.95 scale. Animate them in from their trigger and back toward it on exit.
- Scale pressable controls to 0.97 while pressed. Track pointer movement directly while an object is held. Ease in and out for movement after release, and use an arc when an object visibly travels between places.
- Stagger newly appearing list rows by 30 ms when they enter together. Let old and new states briefly overlap during swaps, crossfade changing icons, and use a mask when content or color reveals across an area.
- Use a single pulse to confirm success when it helps. Keep everyday UI free of bounce. Use resistance beyond a drag boundary or up to 12% stretch on a moving knob when it helps show the gesture.
- Respect reduced-motion settings. Keep feedback visible with an immediate state change or a simple fade.

## Test-Driven Development

- Test one behavior per case. Start with the normal path and add separate cases for distinct failures, permissions, or edge cases. If two assertions could fail for unrelated reasons, split the test.
- Test the behavior at the lowest level that can prove it. Use a real browser when layout, focus, dragging, or resizing is what matters. Use an end-to-end test when the interaction between steps or layers is the behavior under test.
- Make each test earn its place. Avoid repeating the same assertion across layers, checking incidental markup or internal calls, or mocking code the test never uses.
- Keep setup small, check setup errors, and use blank lines between setup, action, and assertions. Use plain behavior names and follow the framework’s conventions. For example, use `it('adds a photo to the draft')` in Vitest and `TestOwnerCanCreateDraft` in Go.
