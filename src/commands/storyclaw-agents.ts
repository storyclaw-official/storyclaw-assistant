import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions.js";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { shortenHomePath } from "../utils.js";
import { applyAgentConfig, findAgentEntryIndex, listAgentEntries } from "./agents.config.js";

type StoryclawAgentDef = {
  id: string;
  name: string;
  skills: string[];
  identity: string;
  userPrefs: string;
};

const STORYCLAW_AGENTS: StoryclawAgentDef[] = [
  {
    id: "main",
    name: "AI Assistant | AI 助理",
    skills: [
      "browser-use",
      "web-search",
      "web-scraping",
      "frontend-design",
      "remotion",
      "summarize",
      "pdf",
      "docx",
      "xlsx",
      "pptx",
      "imap-smtp-email",
      "local-tools",
      "scheduled-task",
      "weather",
      "films-search",
      "music-search",
      "clawdstrike",
      "find-skills",
      "skill-creator",
      "session-logs",
      "agent-reach",
      "tavily-search",
      "tavily-research",
      "tavily-extract",
      "tavily-crawl",
      "giggle-files-management",
    ],
    identity: `# IDENTITY.md - Who Am I?

- **Name:** AI Assistant | AI 助理
- **Creature:** AI Smart Assistant — research, intel, writing, learning, monitoring, decision support, team coordination hub
- **Vibe:** Warm and efficient, remembers you, conclusions first; proactive but not overstepping
- **Emoji:** 🗂
`,
    userPrefs: `# User Preferences — AI Assistant

## Work Style
- Urgent items notified immediately, don't wait for daily report
- Status markers: ✅ Done / 🔄 In Progress / ❌ Blocked / ⚠️ Watch
- Each role's report no more than 5 lines
`,
  },
  {
    id: "director",
    name: "AI Director | AI 导演",
    skills: [
      "giggle-video",
      "ai-director",
      "browser-use",
      "web-search",
      "canvas-design",
      "frontend-design",
      "openai-image-gen",
      "nano-banana-pro",
      "video-frames",
      "speech",
      "speech-to-text",
      "remotion",
      "pdf",
      "pptx",
      "scheduled-task",
      "clawdstrike",
      "find-skills",
      "skill-creator",
      "session-logs",
      "tavily-search",
      "tavily-research",
      "tavily-extract",
      "tavily-crawl",
      "giggle-files-management",
    ],
    identity: `# IDENTITY.md - Who Am I?

- **Name:** AI Director | AI 导演
- **Creature:** AI Director
- **Vibe:** Creative, aesthetic, offers choices not single answers; thinks in director language, communicates clearly
- **Emoji:** 🎬
`,
    userPrefs: `# User Preferences — AI Director

## Format
- Markdown preferred, important params in tables
- Creative proposals provide 2-3 directions to choose from

## Approval
- Creative direction needs user confirmation before production
- Single API call cost > $5 requires advance notice
`,
  },
  {
    id: "trader",
    name: "AI Trader | AI 交易员",
    skills: [
      "market-monitor",
      "trade-executor",
      "alpaca-trading",
      "polymarket-trading",
      "browser-use",
      "web-search",
      "web-scraping",
      "xlsx",
      "pdf",
      "scheduled-task",
      "imap-smtp-email",
      "weather",
      "clawdstrike",
      "find-skills",
      "skill-creator",
      "session-logs",
      "tavily-search",
      "tavily-research",
      "tavily-extract",
      "tavily-crawl",
      "giggle-files-management",
    ],
    identity: `# IDENTITY.md - Who Am I?

- **Name:** AI Trader | AI 交易员
- **Creature:** AI Investment Advisor — dual stock & crypto markets, risk-controlled trading coach
- **Vibe:** Quiet and reliable, data-driven; rules over feelings, helping you not lose matters more than helping you win
- **Emoji:** 📈
`,
    userPrefs: `# User Preferences — AI Trader

## Risk Preference
- Conservative trading style
- Single trade risk no more than 2% of total capital
- Prefer limit orders, no leverage

## Approval
- Trades exceeding 200 USDT require user confirmation
- Alert at 80% of risk limit
`,
  },
  {
    id: "publisher",
    name: "AI Publisher | AI 发布员",
    skills: [
      "x2c-publish",
      "x-manager",
      "browser-use",
      "web-search",
      "web-scraping",
      "summarize",
      "docx",
      "pdf",
      "pptx",
      "imap-smtp-email",
      "scheduled-task",
      "clawdstrike",
      "find-skills",
      "skill-creator",
      "session-logs",
      "tavily-search",
      "tavily-research",
      "tavily-extract",
      "tavily-crawl",
      "giggle-files-management",
    ],
    identity: `# IDENTITY.md - Who Am I?

- **Name:** AI Publisher | AI 发布员
- **Creature:** AI Content Publisher — content distribution, social media management, platform publishing
- **Vibe:** Efficient and strategic, understands platforms and audiences; proactive with scheduling but always confirms before posting
- **Emoji:** 📢
`,
    userPrefs: `# User Preferences — AI Publisher

## Work Style
- All publishing actions require user confirmation before execution
- Provide content preview before posting to any platform
- Track publishing schedule and remind about upcoming posts

## Approval
- Never post content without explicit approval
- Social media campaigns need full plan review first
`,
  },
  {
    id: "listing",
    name: "AI Listing Officer | AI 上架官",
    skills: [
      "x2c-publish",
      "browser-use",
      "web-search",
      "web-scraping",
      "summarize",
      "xlsx",
      "docx",
      "pdf",
      "scheduled-task",
      "clawdstrike",
      "find-skills",
      "skill-creator",
      "session-logs",
      "tavily-search",
      "tavily-research",
      "tavily-extract",
      "tavily-crawl",
      "giggle-files-management",
    ],
    identity: `# IDENTITY.md - Who Am I?

- **Name:** AI Listing Officer | AI 上架官
- **Creature:** AI Content Catalog Manager — content listing, SEO optimization, platform catalog management
- **Vibe:** Meticulous and data-driven, obsessed with discoverability; knows how to make content stand out in search results
- **Emoji:** 📋
`,
    userPrefs: `# User Preferences — AI Listing Officer

## Work Style
- Provide data-backed SEO recommendations
- Track listing performance metrics
- Regular catalog health reports

## Approval
- Listing changes require user review before submission
- SEO strategy changes need confirmation
`,
  },
];

const AGENT_TEMPLATE_FILES = ["SOUL.md", "AGENTS.md"];

async function resolveAgentTemplatesDir(): Promise<string | null> {
  const packageRoot = await resolveOpenClawPackageRoot({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  if (!packageRoot) {
    return null;
  }
  const dir = path.join(packageRoot, "docs", "reference", "agent-templates");
  try {
    await fs.access(dir);
    return dir;
  } catch {
    return null;
  }
}

async function copyAgentTemplateFiles(
  agentId: string,
  workspaceDir: string,
  force = false,
): Promise<void> {
  const templatesDir = await resolveAgentTemplatesDir();
  if (!templatesDir) {
    return;
  }
  const agentTemplateDir = path.join(templatesDir, agentId);
  try {
    await fs.access(agentTemplateDir);
  } catch {
    return;
  }

  await fs.mkdir(workspaceDir, { recursive: true });

  for (const filename of AGENT_TEMPLATE_FILES) {
    const src = path.join(agentTemplateDir, filename);
    const dest = path.join(workspaceDir, filename);
    if (!force) {
      try {
        await fs.access(dest);
        continue;
      } catch {
        // File doesn't exist yet, proceed to copy
      }
    }
    try {
      await fs.copyFile(src, dest);
    } catch {
      // Template file doesn't exist for this agent, skip
    }
  }
}

async function writeGeneratedFiles(workspaceDir: string, agent: StoryclawAgentDef): Promise<void> {
  await fs.mkdir(workspaceDir, { recursive: true });
  const files: [string, string][] = [
    ["IDENTITY.md", agent.identity],
    ["USER.md", agent.userPrefs],
  ];
  for (const [filename, content] of files) {
    const dest = path.join(workspaceDir, filename);
    try {
      await fs.access(dest);
    } catch {
      await fs.writeFile(dest, content, "utf-8");
    }
  }
}

function setAgentSkills(cfg: OpenClawConfig, agentId: string, skills: string[]): OpenClawConfig {
  const list = [...(cfg.agents?.list ?? [])];
  const idx = list.findIndex(
    (e) => e && typeof e === "object" && e.id?.toLowerCase() === agentId.toLowerCase(),
  );
  if (idx < 0) {
    return cfg;
  }
  list[idx] = { ...list[idx], skills };
  return { ...cfg, agents: { ...cfg.agents, list } };
}

/**
 * Configures 5 default StoryClaw agents: main (AI Assistant), director, trader,
 * publisher, listing. The "main" agent always gets updated (name, skills,
 * workspace files) since it is pre-created by onboarding and cannot be deleted.
 * Other agents are skipped if they already exist. Idempotent on re-runs.
 */
export async function ensureStoryclawAgents(
  config: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  let cfg = config;

  for (const agent of STORYCLAW_AGENTS) {
    const exists = findAgentEntryIndex(listAgentEntries(cfg), agent.id) >= 0;

    if (exists && agent.id !== "main") {
      runtime.log(`Agent "${agent.id}" already exists, skipping.`);
      continue;
    }

    cfg = applyAgentConfig(cfg, { agentId: agent.id, name: agent.name });

    const wsDir = resolveAgentWorkspaceDir(cfg, agent.id);
    await copyAgentTemplateFiles(agent.id, wsDir, agent.id === "main");
    await writeGeneratedFiles(wsDir, agent);
    runtime.log(`Agent workspace: ${shortenHomePath(wsDir)}`);

    cfg = setAgentSkills(cfg, agent.id, agent.skills);

    const sessionsDir = resolveSessionTranscriptsDirForAgent(agent.id);
    await fs.mkdir(sessionsDir, { recursive: true });

    runtime.log(
      `Agent "${agent.name}" (${agent.id}) configured with ${agent.skills.length} skills.`,
    );
  }

  return cfg;
}
