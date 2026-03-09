import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";

/**
 * Previously configured 5 hardcoded StoryClaw agents. Agent definitions are now
 * managed externally via TalentHub CLI (`talenthub agent install <name>`).
 *
 * This function is kept as a no-op to avoid breaking the onboarding call site.
 * Existing agents in openclaw.json are preserved; new installs should use:
 *   npm i -g @storyclaw/talenthub
 *   talenthub agent install main
 *   talenthub agent install director
 *   ...
 */
export async function ensureStoryclawAgents(
  config: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  runtime.log(
    "Agent definitions are now managed by TalentHub. " +
      "Install agents with: npx @storyclaw/talenthub agent install <name>",
  );
  return config;
}
