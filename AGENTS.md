# Working on Portfolio

Portfolio is for organizing a private photo library and publishing collections.

## Workflow

- The owner sets scope and decides unresolved product behavior. Get approval before committing or posting issue or PR text.
- For major features, draft an issue labeled `needs refinement`, refine it with EGM, and record the agreed scope in the issue. Use a preview branch and sample data for major UI changes.
- Work in reviewable batches. For major features, agree on proposed test cases before writing them.

## Code

- Prefer the simplest solution for the current behavior. Follow established patterns so a new change has an obvious home.
- Enforce stable conventions with formatters and lint rules. Use product terms, group related statements, and comment only when the reason is unclear.
- Enforce permissions on the server. Keep secrets and personal data out of commits, logs, and fixtures.
- Check changed interactions in a browser on desktop and phone, including keyboard and focus behavior.

## Tests

- Keep the smallest suite that would let someone recreate the functional flows from the tests and fixtures alone if the application code were deleted.
- Group tests by feature. Each case should catch a distinct wrong outcome through the interface its caller uses.
- Assert what the caller can observe, including saved changes, permissions, and recovery from failures. Leave appearance and implementation choices open.
- Name tests for the expected behavior, for example `test('should keep saved items when a collection is renamed', …)`.
