# Contributing

Four of us work on this repo with different tools: Claude Code, Codex, or an editor by hand. Everything shared lives here as plain files, so any of them works. Start with [docs/README.md](docs/README.md) to find your way around.

## Set up

```bash
git clone git@github.com:beverage/edth-hackathon.git
cd edth-hackathon
```

Then follow [docs/setup.md](docs/setup.md): the coordinator, offline mode with Ollama, and the transmitter on a phone, with a check after each step. It is written so Claude Code or Codex can do it for you: ask yours to "set up this computer by following docs/setup.md". Each server runs in its own console: `npm start` for the coordinator, and in offline mode Ollama and `npm run stt`; `npm run demo` fills a mission without a phone. The short version is [Run locally](README.md#run-locally) in the README. A Mistral key is optional: without one, the guide sets up offline mode with Ollama. The unit tests need no key and no network.

The transmitter app has its own `package.json` and tooling; see [transmitter/README.md](transmitter/README.md). iOS builds need a Mac with Xcode.

## Before you push

```bash
npm test && npx tsc --noEmit && npm run lint
```

If you changed `lib/geo/types.ts`, also run `npx tsc --noEmit` in `transmitter/`. On a fresh clone that has never run `npm run dev`, run `npx next typegen` once first: `tsc` needs the route types it makes, or it stops at `RouteContext` and `LayoutProps`.

## Git workflow

Every change goes through a short branch and a pull request. Nobody commits to `main` directly [173].

1. **One task, one worktree, one branch.** Start each Claude Code session in a worktree: the desktop app's worktree option, or `claude --worktree` in a terminal. It lives in `.claude/worktrees/<name>`, on a branch of its own (`claude/<name>` from the desktop app). With Codex or by hand: `git worktree add .claude/worktrees/<name> -b <you>/<name> origin/main`. Worktrees go nowhere else; a hook refuses one outside that folder. Git, ESLint and Vitest ignore the folder, so the checks in one checkout never run another's copy.
2. **Set the worktree up.** A new worktree has no `node_modules`: run `npm ci` in it, and in `transmitter/` if you work on the app. `.worktreeinclude` copies your `.env.local` into a new session worktree, so hosted mode works there too.
3. **Commit small,** in the style of `git log`: `Area: what changed`. Docs and the decision line go in the same commit as the change.
4. **Catch up by merging, never by rebasing:** `git fetch && git merge origin/main`. Never force-push.
5. **Open a pull request** once the checks pass. The `git-sync` skill commits, merges `main`, runs the checks and pushes; the `pr` skill writes the body.
6. **Merge when CI is green.** GitHub offers merge commits only, and refuses a merge until the three CI jobs pass; **Enable auto-merge** on a pull request merges it as soon as they do. Merged branches are deleted on GitHub. The author merges. Ask someone to look first when the change touches a contract (below) or the extraction prompt.
7. **Clean up.** When a session starts, `cleanup-wt` removes worktrees and local branches already merged into `main`, after writing a list to restore them from.

**Decision numbers.** Two branches can both add decision 172. Whoever merges second renumbers theirs after merging `main` into the branch, and fixes their own references to it. `tests/decisions.test.ts` fails when the numbers repeat or skip, so CI catches a miss.

**Replaced and changed decisions.** When a new decision replaces or changes an earlier one, say so at both ends. The new line names the old one: "replaces decision 21" or "changes decision 49". The old line starts with **Replaced by 46.** when none of it holds any more, or **Changed by 106.** when part of it still does and both must be read. That marker is the only edit an old line gets. Settling a point the old line left open is a change; building what it said was not built yet is not. When you renumber a line, fix the markers that name it too. The same test fails when either end is missing.

## CI

GitHub Actions runs [.github/workflows/ci.yml](.github/workflows/ci.yml) on every push to `main` and on every pull request. It has three jobs, side by side:

- **Tests, types and lint:** the three checks above, and `npm run eval:outcomes -- --check`.
- **Production build:** `npm run build`, which catches what the dev server lets through.
- **Transmitter types:** `npx tsc --noEmit` in `transmitter/`, so a change to `lib/geo/types.ts` that breaks the app shows up even if you did not run it.

It needs no key: nothing in it calls Mistral or Overpass. See the runs on the repo's Actions tab, or with `gh run list`. A ruleset on `main` makes all three jobs a condition for merging a pull request, and refuses direct pushes, force pushes and deleting `main` [173]. If `main` still turns red, fix it or revert it before you go on.

## Working agreements (proposed)

- **Record every choice in [DECISIONS.md](DECISIONS.md):** one numbered line, appended at the end. If two people add one at the same time, keep both lines and renumber yours. When yours replaces or changes an earlier line, mark both ([Git workflow](#git-workflow)).
- **Update the docs in the same commit as the change.** [docs/README.md](docs/README.md) says which file covers what.
- **Secrets live in env vars only.** The repo is public, and so are commit author emails.
- **Contracts change on purpose.** Changing `lib/geo/types.ts` or the fields of `POST /api/report` changes what the transmitter and the command post rely on: say so in the decision line, and tell whoever works on the other side ([contracts](docs/contracts.md)).
- **Leave the `prior-work-fri-1800` tag alone.** It marks the work done before the event.
- **Deploys go through Alex** until the deploy question is settled ([open questions](docs/open-questions.md)).
- **Keep `.claude/launch.json` to entries everyone can use.** Do not commit a preview entry for one worktree.

## Coding agents

[AGENTS.md](AGENTS.md) at the root, plus [transmitter/AGENTS.md](transmitter/AGENTS.md) inside that folder, is the one instruction file for both Claude Code and Codex. Put project rules there, not in a tool-specific file such as `CLAUDE.md`, so every agent sees the same ones. Unit tests need no network or key; anything that calls Mistral or Overpass needs both, so an agent in a sandbox without network can run the tests but not the evaluation or the gazetteer build.

Skills for every agent live in `.agents/skills/`, one folder each; `.claude/skills` links there. Besides `prompt-tune` and `prompt-attack` there are `git-sync` and `pr` (Git workflow, above).

**Guard hooks.** `.agents/hooks/` holds five small Python scripts that Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`) run around an agent's tool calls [174]:

- `guard-secrets` refuses to read `.env` files, keys and credential files, so a key never lands in a transcript. An agent asks you to run such a command yourself.
- `guard-key-literals` refuses an edit that writes a key into a file, and flags one that got in another way. Mistral and Featherless keys have no prefix, so it catches them by their variable name.
- `guard-delete-outside` refuses `rm` and the like outside the repo.
- `guard-worktree-path` refuses a worktree outside `.claude/worktrees/`.
- `cleanup-wt` runs when a session starts (Git workflow, step 7). It keeps a worktree with uncommitted changes, one under a day old, a locked one and one with an open pull request, and it never deletes a branch that is not merged.

They need `python3`, which comes with Apple's command-line tools. A hook that cannot run blocks nothing. `tests/agent-hooks.test.ts` fails when the two hook lists differ, and checks each guard.

## Writing docs

The design docs are in [docs/](docs/README.md), one file per topic. Write plain, short sentences; say when a status was checked; link instead of copying. Do not keep a second copy anywhere else: to share with someone outside the repo, send a GitHub link.
