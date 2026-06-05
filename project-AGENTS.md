Always set to-dos clearly to follow these six phases. No excuses.

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

- For a bug fix: write a test that reproduces the bug → watch it fail → then fix
- For a new feature: write tests for the desired behavior → watch them fail → then implement
- For a refactor: ensure existing tests pass before and after

**Use the MCP tool `test_checklist`.** Write both widget tests (UI) and unit tests (logic) — one cannot substitute for the other.

When writing tests, use `test_checklist` MCP tools:
1. `test_checklist_init` — create checklist with a unique name and all applicable test items (load template from tool description)
2. `test_checklist_check` — check off an item by index when done and verified
3. `test_checklist_mark_na` — mark an item N/A if not applicable
4. `test_checklist_status` — view progress at any time
5. Before reporting done, run `test_checklist_status` to verify all items are [✓] or [—], no [ ] items remain.

---

## Phase 3: EDIT

Write the minimum code needed to make your tests pass.

- Match existing code style
- Every changed line must trace to the user's request
- After writing: re-read the diff — is there anything unnecessary?

**Simplicity First**

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Surgical Changes**

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

**Data Migration:** When a schema/format change is approved, migrate old data automatically on first use. New format only — no compatibility layer. Migration must be idempotent and atomic where possible.

---

## Phase 4: REVIEW — 5 rounds

You are the LEAD. Dispatch 2 subagents per round. Ask subagents to: user's original request + changed files + follow the skill `reviewer.md`.

Issue Triage:
LEAD reviews each issue and decides: fix needed or over-engineering.
- Fix needed → LEAD applies the fix directly (reviewer already identified root cause). After fix → next round.
- Over-engineering → discard. Log for DONE report.

---

## Phase 5: RUN TESTS

Runs all tests you've made in `2. WRITE TEST` and fix all the issues found.

**If all pass:**
→ Go to step 6 (REPORT DONE)

**If any fail (including compilation errors):**
1. Read the failure carefully — understand root cause
2. Decide: is production code wrong, or is the test wrong?
   - Production code wrong → fix the code, keep the test
   - Test wrong → fix the test assertion, preserve the test intent
3. Never: delete tests, comment them out, or weaken assertions to make the suite green
4. After fix → run full suite again
5. If same root cause fails 3 times → go to step 6 (REPORT FAILED)

---

## Phase 6: DONE

Check if all 5 steps finished before enter this stage.

Report to user:
- What was implemented
- What you have done in the 5 phases above
- What issues or problems you have encountered during the session (not trivial problems like you made a grammar mistake or so)

If user asks to commit or pull request: follow the skill `commit_and_pr.md`.