---
description: Project coding workflow with 7 phases
mode: primary
---
Always set to-dos clearly to follow these seven phases. No excuses. 

---

## Phase 1: Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

---

## Phase 2: WRITE TESTS

Write tests FIRST, before any production code. Set standards to make sure the tests files meet what user asks.

- For a bug fix: write a test that reproduces the bug - watch it fail - then fix
- For a new feature: write tests for the desired behavior - watch them fail - then implement
- For a refactor: ensure existing tests pass before and after

**Use the MCP tool `test_checklist`.** Write both widget tests (UI) and unit tests (logic) - one cannot substitute for the other.

When writing tests, use `test_checklist` MCP tools:
1. `test_checklist_init` - create checklist with a unique name and all applicable test items (load template from tool description)
2. `test_checklist_check` - check off an item by index when done and verified
3. `test_checklist_mark_na` - mark an item N/A if not applicable
4. `test_checklist_status` - view progress at any time
5. Before reporting done, run `test_checklist_status` to verify all items are [x] or [-], no [ ] items remain.

---

## Phase 3: EDIT

1. Follow the patterns: Read other current codes to understand existing patterns first. Use the same logic or UI etc.

2. **Data Migration**: Design a data migration if old data format cannot match new design. Please note that some may seem harmless, but when you install a new version, it will crash, though it won't when there is no old version data. The migration should start when new version installed and app launched. Use a pop to show user the progress and let user know the app restarts to take effect. Use new format only - no compatibility layer. Migration must be idempotent and atomic where possible.

3. **Simplicity First**

**Minimum code that solves the problem. Nothing speculative.**

- Match existing code style
- Every changed line must trace to the user's request
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- After writing: re-read the diff - is there anything unnecessary?
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

If your changes make the single code file big, take it apart. No large files.

4. **Surgical Changes**

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

---

## Phase 4: REVIEW - 5 rounds

You are the LEAD. Dispatch 2 subagents per round for 5 rounds. Set the subagents to `reviewer`.

Issue Triage:
LEAD reviews each issue and decides: fix needed or over-engineering.
- Fix needed - LEAD applies the fix directly (reviewer already identified root cause). After fix - next round.
- Over-engineering - discard. Log for DONE report.

---

## Phase 5: RUN TESTS

Runs all tests you've made in `2. WRITE TEST` and fix all the issues found. Not full suite, just what you've written to test the changes.

**If all pass:**
- Go to step 6 (REPORT DONE)

**If any fail (including compilation errors):**
1. Read the failure carefully - understand root cause
2. Decide: is production code wrong, or is the test wrong?
   - Production code wrong - fix the code, keep the test
   - Test wrong - fix the test assertion, preserve the test intent
3. Never: delete tests, comment them out, or weaken assertions to make the suite green
4. After fix - run full suite again
5. If same root cause fails 3 times - go to the next phase (REPORT FAILED)

---

## Phase 6: CI CHECK

1. Draft a PR: Follow the skill `commit-and-pr` to write commit and pr message. Keep PR in draft state instead of open.

2. Loop: Wait a few minutes for the CI to run after PR drafted. Fix errors CI finds. Loop until CI passes.

Make sure all CI tests pass before enter the next phase.

---

## Phase 7: DONE

Check if all 6 steps completely finished without forgetting any small steps before enter this stage.

Report to user:
- What was implemented
- How function will work: before and after
- What you have done in the 6 phases above, and whether you have followed these in the right order
- What issues or problems you have encountered during the session (not trivial problems like you made a grammar mistake or so)

