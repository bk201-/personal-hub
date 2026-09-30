---
name: local-plan
description: Draft local requirements, implementation phases, or work items for personal-hub. Use when planning a feature, turning a PRD into vertical slices, or preparing tickets without publishing them.
---

# Local planning

1. Identify the requested output: requirements, phased plan or work items. Read root and affected app guidance plus any source PRD. Confirm the problem, affected users, scope and non-goals; mark unresolved assumptions explicitly.
2. Inspect the relevant implementation. Separate verified behavior from historical proposals and unchecked criteria. Record the owning app and any genuinely reusable package boundary; keep databases and auth identities independent.
3. For requirements, draft the problem, desired behavior, numbered user stories, durable decisions, test strategy and non-goals. For phases/work items, map each user story to a thin end-to-end slice with observable acceptance criteria, dependencies and any human decision needed.
4. Review the result for missing stories, dependency cycles and claims unsupported by code. A slice is complete only when its acceptance criteria can be demonstrated; leave planned work unchecked.
5. Present the draft locally in the conversation. Write Markdown only when the user explicitly supplies or approves a file path; place app plans under root `plans/<app>/`. Preserve the source/provenance and distinguish proposed changes from completed work when updating an existing plan.

Completion: every requested story has an owner and a verifiable criterion; unknowns and dependencies are visible. This workflow performs no remote issue/PR creation, publishing, Git writes or implementation changes.
