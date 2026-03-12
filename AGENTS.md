# AGENTS.md

## Purpose

This document defines the operational rules, workflow, and engineering standards that all agents must follow when working on this repository.

Agents must prioritize correctness, simplicity, verification, and continuous self-improvement.

---

# Workflow Orchestration

## 1. Planning Default

Agents MUST enter planning mode for:

- Any non-trivial task (3+ steps)
- Architectural decisions
- Refactors
- Debugging sessions

### Requirements

- Write a clear plan before implementation
- Save plan to `tasks/todo.md`
- Break work into checkable items

If execution deviates from plan:

- STOP
- Re-plan
- Do NOT continue blindly

Agents MUST also use planning for:

- Verification steps
- Validation strategy

Goal: Reduce ambiguity and errors.

---

## 2. Subagent Strategy

Agents SHOULD use subagents aggressively.

Purpose:

- Keep main context clean
- Increase parallelism
- Improve reasoning quality

### Rules

- One task per subagent
- Delegate:

  - Research
  - Exploration
  - Code analysis
  - Debugging

- Use more subagents for more complex problems

---

## 3. Self-Improvement Loop

Agents MUST continuously improve.

When user provides correction:

### REQUIRED ACTIONS

1. Update:

2. Record:

- What went wrong
- Why
- Prevention rule

3. Apply prevention rule immediately

4. Review lessons at start of future sessions

Goal: Never repeat same mistake.

---

## 4. Verification Before Completion

Agents MUST prove correctness before marking complete.

Completion checklist:

- Run tests
- Check logs
- Validate outputs
- Confirm requirements satisfied

Agents MUST ask:

> "Would a staff engineer approve this?"

When relevant:

- Diff before vs after behavior
- Demonstrate correctness

NEVER mark complete without verification.

---

## 5. Demand Elegance

Agents MUST prefer clean, maintainable solutions.

When change feels hacky:

STOP and rethink.

Ask:

> "Knowing everything now, what is the correct solution?"

Avoid over-engineering simple fixes.

Balance:

- Elegance
- Simplicity
- Speed

---

## 6. Autonomous Bug Fixing

When bug is reported:

Agents MUST:

- Investigate immediately
- Find root cause
- Fix issue

WITHOUT requiring user hand-holding.

Use:

- Logs
- Errors
- Tests
- CI failures

Agents are responsible for resolution.

---

# Task Management Protocol

Agents MUST follow this workflow:

## Step 1 — Plan

Write plan:

Include:

- Checkboxes
- Clear steps

---

## Step 2 — Verify Plan

Ensure plan is:

- Correct
- Complete

Before implementation.

---

## Step 3 — Track Progress

As work completes:

Mark complete:

```md
- [x] Task name
