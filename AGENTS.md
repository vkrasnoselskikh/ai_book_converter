# Agent Guide

This document describes mandatory rules, processes, and working formats for the Python project.

---

## 1. Quick Commands

### Linting

```bash
uv run ruff check .
```

### Tests

```bash
uv run pytest                      # all tests
```

### Build and Environment

```bash
uv venv
uv sync --dev
```

Also make sure that the environment variables from `.env.example` are present or that a `.env` file is defined in the project.

---

## 2. Mandatory Workflow
## 1. Spec-driven Workflow

### Context Gathering & planning

1. Get the list of specifications in `specs/`
2. Determine relevant specifications
3. For each relevant specification, read:
   - `requirements.md`
   - `design.md`
   - `tasks.md` (if exists)
4. Search for related code
5. Search for existing tests
6. Create a plan for:
   1. specification changes 
   2. code file changes 
   3. list of tests to verify functionality

To do this, perform all necessary diagnostics for plan creation: run tests / execute relevant code.


### Before Completing Any Task

1. Verify that specifications are complete, consistent, and up-to-date
2. Verify code matches requirements and design
3. Run:

```bash
make lint
make test
```

4. Ensure all checks pass:
   - ✅ Ruff check
   - ✅ Ruff format
   - ✅ ty check
   - ✅ Pytest

### Report

Provide a short report in the message, without creating separate files:

```text
Task completed.

Implemented:
- [item 1]

Remaining:
- [item 1] (if any)
```

---

## 3. Working with Specifications

### Specification Structure

All specifications are located in `specs/<feature-name>/`.

```
specs/
  <feature-name>/
    requirements.md
    design.md
    tasks.md          # optional
```

### What to Read Before Starting

Required:

```
specs/<feature>/requirements.md
specs/<feature>/design.md
```

If `tasks.md` exists, it must be read as well.

---

### requirements.md Format

`requirements.md` describes **what** must be implemented.

```markdown
# Requirements Document: <Feature Name>

## Introduction

A brief description of the goal.

## Glossary

- **Term** - definition

## Requirements

### 1. <Requirement Group Name>

**ID:** <feature-id>.1

**User Story:** As a [role], I want [action], so that [goal].

#### Acceptance Criteria

1.1. [Requirement]
1.2. [Requirement]
1.2.1. WHEN [condition], THEN [result]

#### Functional Tests

- `tests/functional/test_<feature>.py` - "test name"
```

Rules:

- ID: `<feature-id>.<group>.<item>`
- Every User Story must have a tests section
- Language: English
- Acceptance criteria must use the EARS format

---

### Separation of requirements/design

- `requirements.md` describes only user behavior and the result
- `requirements.md` must not contain implementation details (class/method names, signatures, internal structures)
- All technical details must be in `design.md`

---

### EARS for Acceptance Criteria

Templates:

**Ubiquitous**

```
<subject> SHALL <action>
```

**Event-driven**

```
WHEN <trigger>, <subject> SHALL <action>
```

**Unwanted behavior**

```
IF <condition>, <subject> SHALL <action>
```

**State-driven**

```
WHILE <state>, <subject> SHALL <action>
```

**Optional feature**

```
WHERE <support condition>, <subject> SHALL <action>
```

**Combined template**

```
WHEN <trigger>, IF <condition>, <subject> SHALL <action>
```

Keywords:

- `SHALL` — mandatory
- `SHOULD` — recommended
- `MAY` — optional
- `SHALL NOT` — prohibited

---

### design.md Format

`design.md` describes **how** the functionality is implemented: architecture, components, data flows.

```markdown
# Design: <Feature Name>

## Overview

A brief architectural approach.

## [Architecture Sections]

For example: "Data Model", "Service Layer", "API Layer", "Background Jobs", "Algorithms".

## Testing Strategy

### Unit Tests

- `tests/unit/test_<module>.py` - what it verifies

### Functional Tests

- `tests/functional/test_<feature>.py` - what it verifies

### Requirements Coverage

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|-------------------|
| feature.1.1 | ✓          | -                 |
| feature.1.2 | ✓          | ✓                 |
```

Rules:

- The coverage table is mandatory and must cover all requirements
- Module/class names must be specified in English and in quotes
- Language: Russian

---

### tasks.md Format

`tasks.md` tracks implementation progress.

```markdown
# Task List: <Feature Name>

## Overview

A brief description and estimate.

**Current status:** Phase N - [name]

---

## CRITICAL RULES

[Must not be violated]

---

## Current State

### Completed

- ✅ Task 1

### In Progress

- 🔄 Task 2

### Planned

#### Phase N: <Name>

- [ ] Task A
    - [ ] Subtask A.1
- [ ] Task B
```

Update rules:

- Move completed tasks to `Completed` with ✅
- Mark started tasks in `In Progress` with 🔄
- Add a brief comment about what was done
- Update `Current status` when a phase is completed

---

### Creating a New Specification

1. Create `specs/<feature-name>/`
2. Create `requirements.md`
3. Create `design.md`
4. Create `tasks.md` if needed
5. Get user confirmation before implementation

Feature naming: lowercase with hyphens, for example `token-management-ui`.

---

### Updating Specifications

When code changes, always update:

- behavior changed -> `requirements.md`
- architecture changed -> `design.md`
- tasks completed -> `tasks.md`
- tests added -> coverage table in `design.md`

Specifications must be complete, consistent, and up to date.

---

## 4. Testing Strategy

### Test Types

| Type       | Location                     | Mocks | Goal                               |
|------------|------------------------------|-------|------------------------------------|
| Unit       | `tests/unit/test_*.py`       | ✅ Yes | Isolated logic verification        |
| Functional | `tests/functional/test_*.py` | ❌ No  | End-to-end user scenarios          |

The terms `unit` and `functional` mean unit and functional (end-to-end), respectively.

### Test Rules

**testing.10 — helper functions:** use shared helper utilities from `tests/helpers/`; do not duplicate infrastructure
code in every test.

**testing.11 — waits:** do not use `time.sleep` to wait for state if the state can be checked via retry/awaitable assertions.

```python
# ❌ WRONG
import time

time.sleep(1)
assert service.is_ready()

# ✅ CORRECT
assert wait_until(lambda: service.is_ready(), timeout=2.0)
```

`time.sleep` is allowed only for known timings that cannot be checked otherwise, and must include a required comment
explaining why.

**testing.12 — error checks:** after key actions, verify that the operation completed without unexpected errors/exceptions.

### Coverage Requirements

Minimum:

- Mandatory coverage verification MUST be performed with `uv run pytest --cov=src --cov-fail-under=85`.
- The minimum enforceable overall coverage threshold is 85%.

Exceptions: migrations, configs, declarative types without logic.

### Definitions

- **Edge cases**: boundaries, empty values, `None`, min/max
- **Exceptional situations**: network errors, unavailable resources, timeouts, invalid input

---

## 5. Running Tests

### Preparation

Prepare the environment before running tests:

```bash
uv venv
uv sync --dev
```

Run again when needed:

- Python version changes
- dependency changes
- import/native package errors
- first run after cloning

Restriction:

- ❌ Do not run functional tests in parallel with other heavy checks

---

## 6. Code Writing Rules

### Requirement Comments

Every function, class, and method must have a comment with requirement IDs:

```python
# Requirements: feature-id.1.1, feature-id.1.2
def implement_feature() -> None:
    pass
```

### Typing Rules

Use modern syntax:

- Prefer `list[str]` over `List[str]`
- Use `X | None` instead of `Optional[X]`

### Test Structure

Every test must contain a structured docstring:

```python
def test_should_perform_expected_behavior() -> None:
    """Preconditions: ...
    Action: ...
    Assertions: ...
    Requirements: feature-id.1.1"""
    pass
```

### Logger

Every module creates its own logger using the module name:

```python
import logging

logger = logging.getLogger(__name__)
logger.info("User ID set: abc123")
```

Do not manually duplicate the module name in the log message itself.

### Error Handling

For errors in background processes, use a centralized handler (for example,
`ErrorHandler.handle_background_error`).

```python
def fetch_profile(self) -> UserProfile | None:
    try:
        ...
    except Exception as error:
        ErrorHandler.handle_background_error(error, "Profile Loading")
        return None
```

Local logging without a unified handler is allowed only if it is explicitly described in the design.

---

## 7. Documentation Rules

### Language

| File/content                           | Language |
|----------------------------------------|----------|
| requirements.md                        | Russian  |
| design.md                              | Russian  |
| tasks.md                               | Russian  |
| Code comments                          | English  |
| GitLab-based (issues/MR/review/commit) | English  |
| File/variable names                    | English  |

### Naming

- Module, class, and function names must be in English
- Use `PascalCase` for classes
- Use `snake_case` for functions/variables
- When mentioning components in documents, use quotes

---

## 8. Critical Prohibitions

### Disabling Tests

**Absolute prohibition:** do not use `@pytest.mark.skip`, `@pytest.mark.xfail`, and do not comment out tests without explicit
user permission.

Before disabling a test, you must:

1. Explain why the test cannot be fixed immediately
2. Suggest alternatives
3. Get explicit confirmation

### Report Files

Do not create `VALIDATION_REPORT.md`, `SUMMARY.md`, `WORK_REPORT.md` without a direct user request.

Correct format: a short summary in the message.

### Environment Variables

It is forbidden to introduce new environment variables (`os.environ[...]`) without user approval.

If the variable is approved, it must be declared in the module's `config.py`.
For example: `src/<module>/config.py`

All environment variables must be declared using `Pydantic Settings`.

Each configuration class must contain settings (so it can optionally read from `.env`):
```python
model_config = SettingsConfigDict(validate_default=False, extra="ignore", env_file=".env")
```

Example App configuration:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(validate_default=False, env_prefix="APP_", extra="ignore", env_file=".env")
    
    api_key: str
    port: int = 8000
```

---

## 9. Priorities in Case of Conflicts

1. Data safety
2. Explicit user instructions
3. Minimize unnecessary actions/long runs
4. Efficiency (do not run the entire test suite if targeted tests are enough)
5. Code quality (do not disable tests; fix the cause)

---

## 10. Common Problems and Solutions

| Problem                        | Cause                           | Solution                                                                                                               |
|--------------------------------|---------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `ModuleNotFoundError`          | No venv or dependencies         | `uv venv && uv sync --dev`                                                                                             |
| Test timeout                   | Test takes longer than expected | increase timeout and verify state expectations                                                                         |
| Linter fails                   | Style violation                 | `uv run ruff check . --fix`                                                                                            |
| Low coverage                   | Not enough tests                | run `uv run pytest --cov=src --cov-fail-under=85`, read the coverage report, identify low-coverage files, and add tests |
| Command interrupted by timeout | Long run                        | run in the background and monitor                                                                                      |
| Tests started twice            | Active process was not checked  | check current processes before running tests                                                                           |
