## Multi-Delegate Policy

This project uses the multi-delegate plugin to offload tasks to Codex and Gemini.

### Delegate To Codex
- New DTO/model/type file generation
- Utility/helper function generation
- Unit test skeleton generation
- Simple CRUD boilerplate generation
- Isolated config file generation

### Delegate To Gemini
- Large file/log analysis and summarization
- API spec-based code generation (OpenAPI → client)
- Bulk config file generation (k8s manifests, terraform)
- Code review and refactoring suggestions
- Multi-file project scaffolding
- Documentation generation

### Keep In Claude
- Security-sensitive logic (auth, encryption, permission checks, secret handling)
- Bug fixes requiring deep existing behavior analysis
- Multi-file architectural refactoring
- Performance-critical optimization across modules
- Review and final approval of all delegated outputs

### Delegation Constraints
- Include explicit target file paths in delegated prompts.
- Prefer codex_exec.sh for Codex, gemini_exec.sh for Gemini.
- On Codex failure, retry with same thread_id first.
- Stop automated retry after 2 attempts and switch to direct edits.
- Always review git diff before accepting delegated output.
