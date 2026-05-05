# Contributing

## Commit Messages

Use Conventional Commits with a scope:

```text
type(scope): concise imperative summary

Explain what changed and why in the body.
```

Common types:

- `fix`: bug fixes
- `feat`: new user-facing functionality
- `chore`: maintenance that does not change behavior
- `docs`: documentation-only changes
- `refactor`: code changes that preserve behavior
- `test`: tests only
- `build`: build system or dependency changes
- `ci`: continuous integration changes
- `perf`: performance improvements

Choose a short lowercase scope for the project or area, such as
`nodrift`, `extension`, `docs`, `release`, or `repo`.

Examples:

```text
fix(extension): wait for temp allow before redirect
feat(nodrift): add focused access flow
docs(repo): document commit message format
chore(release): refresh packaged assets
```

Keep the subject under about 72 characters when practical. Include a body for
every commit. Use it to describe the user-visible behavior, bug, review
feedback, or maintenance reason behind the change.
