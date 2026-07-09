# Install (consulenza360)

1. Branch first: `git checkout -b chore/agent-harness`
2. Copy AGENTS.md over the existing one → review with `git diff AGENTS.md`
   (all original rules are preserved — relocated, not rewritten)
3. Copy `docs/` contents in (ARCHITECTURE.md, DOMAIN.md, DESIGN.md, ORCHESTRATION.md, templates/)
4. Copy `.agents/` in, then link discovery paths:

   ```bash
   mkdir -p .claude .cursor .gemini
   ln -s ../.agents/skills .claude/skills
   ln -s ../.agents/skills .cursor/skills
   ln -s ../.agents/skills .gemini/skills
   ```

5. Commit. (Codex reads .agents/skills/ natively — nothing to link.)

NOTE: the two SKILL.md files here are the v2 UNIVERSAL versions
(shadcn-luma with the Luma preset mechanics; supabase-migration with per-project
apply paths). Copy these same two files into finduck's .agents/skills/ and the
agent-harness kit, replacing the v1 copies — one skill, every project.
