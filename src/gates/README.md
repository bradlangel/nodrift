# Gate Library

NoDrift extensions are built around compiled-in access gates. The gate registry makes these available to Settings and the block page. The active gate is configured by the user to interrupt autopilot requests.

Available gates include:

- **Temporary Allow (`temporary-allow/`)**: One-click temporary allow grants domain access for the configured duration.
- **Local Intent (`local-intent/`)**: Reviews the stated purpose locally with no provider setup required.
- **AI Reviewed (`llm-reviewed/`)**: Uses an explicit provider configuration (Chrome local AI or external providers like OpenAI) to review your request against a policy.
- **If-Then Intention (`if-then-intention/`)**: Requires a concrete plan ("If X happens, I will do Y") to gain access.
- **Gate Builder (`built-gate/`)**: Uses your OpenAI provider settings to generate an editable gate program that runs locally.
- **GitHub Contribution (`github-contribution/`)**: Requires you to review or perform a GitHub contribution check before proceeding.
- **AI Study Quiz (`ai-study-quiz/`)**: Blocks access until you successfully answer an AI-generated study quiz.

Adding a new gate mostly means adding a folder here, exporting its module, and registering it in `registry.ts`. See [ARCHITECTURE.md](../../ARCHITECTURE.md) for detailed registry flow and extension points.
