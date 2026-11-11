# MCP Servers & Skills used by Rocket's OpenCode

Updated 2026-11-11. Config: global `~/.config/opencode/opencode.jsonc` (MCP servers) and plugins array.

## MCP Servers (22)

| Name | Source / Homepage | What it does |
|---|---|---|
| context7 | https://mcp.context7.com · https://github.com/upstash/context7 | Up-to-date library/SDK docs + code examples |
| deepwiki | https://mcp.deepwiki.com · https://github.com/cognition-labs/deepwiki-open | AI Q&A and wiki for GitHub repos |
| rea | https://github.com/morluto/rea · npm: `rea-agents` | Reverse-engineering: native binaries, JS/ASAR, archives, captures |
| playwright | https://github.com/microsoft/playwright-mcp · npm: `@playwright/mcp` | 25 real-browser automation tools (runs via msedge here) |
| windows | https://pypi.org/project/windows-mcp/ | Desktop control: mouse/keyboard/windows/files |
| ddg-search | https://pypi.org/project/duckduckgo-mcp-server/ · https://github.com/nickclyde/duckduckgo-mcp-server | Web search + content fetch (fallback for native search) |
| sequential-thinking | https://github.com/modelcontextprotocol/servers | Stepwise reflective reasoning tool |
| memory | https://github.com/modelcontextprotocol/servers | Knowledge-graph memory |
| time | https://pypi.org/project/mcp-server-time/ | Timezones, conversions, "time ago" |
| fetch | https://pypi.org/project/mcp-server-fetch/ | URL fetch → markdown |
| git | https://pypi.org/project/mcp-server-git/ | 14 git operations |
| arxiv | https://pypi.org/project/arxiv-mcp-server/ · https://github.com/blazickjp/arxiv-mcp-server | Paper search, download, citation graph, topic watches |
| wikipedia | https://pypi.org/project/mcp-server-wikipedia/ | Progressive article retrieval (search → toc → section → page) |
| weather | https://pypi.org/project/openmeteo-mcp-server/ | Forecasts, air quality, marine, historical (Open-Meteo) |
| repomix | https://github.com/yamadashy/repomix · npm: `repomix` | Pack codebases into AI-readable bundles |
| calculator | https://pypi.org/project/mcp-server-calculator/ | Precise expression evaluation |
| markitdown | https://github.com/microsoft/markitdown | Convert PDF/Office/URIs to markdown |
| commands | https://github.com/g0t4/mcp-server-commands · npm: `mcp-server-commands` | Process execution (shell or strict argv) |
| webresearch | https://github.com/mzxrai/mcp-webresearch · npm: `@mzxrai/mcp-webresearch` | Google search, page visits, screenshots |
| hn | **custom** — local `~/.config/opencode/hn-mcp/` (built in-house; all PyPI HN packages were broken) | Hacker News feeds, search, threads |
| yt-mcp | **custom** — local `~/.config/opencode/yt-mcp/` (uses bundled yt-dlp: https://github.com/yt-dlp/yt-dlp) | YouTube metadata + transcripts |
| self-prompt | **custom** — local `~/.config/opencode/self-prompt-mcp/` | Self-prompting, scheduled prompts, cancellable jobs |

## Plugins (12)

| Name | Source |
|---|---|
| operator-memory (@aerovato/operator-opencode-v2) | https://github.com/aerovato-research/operator |
| superpowers (obra) | https://github.com/obra/superpowers |
| opencode-copilot-auto (@opeoginni) | npm: `@opeoginni/opencode-copilot-auto` |
| opencode-dcp (@tarquinen) — dynamic context pruning | npm: `@tarquinen/opencode-dcp` |
| opencode-subagent-statusline | npm: `opencode-subagent-statusline` |
| opencode-skills-collection (@latest) — ~2,400-skill vault, ~110 category pointers | npm: `opencode-skills-collection` |
| @max10240/opencode-plugin-unicorn | npm: `@max10240/opencode-plugin-unicorn` |
| copilot-diag, copilot-free-enable, opencode-review | local plugins in `~/.config/opencode/plugins/` |

## Skills

| Skill | Source |
|---|---|
| superpowers pack (brainstorming, systematic-debugging, TDD, verification, plan writing, code review, worktrees, …) | https://github.com/obra/superpowers |
| reverse-engineer-anything | https://github.com/morluto/rea (bundled skill; local copy in `~/.operator/user/reverse-engineer-anything/`) |
| opencode-skills-collection vault (~2,400 skills behind ~110 category pointer skills, risk-filtered) | npm: `opencode-skills-collection` |
