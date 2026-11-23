/**
 * The one place that reads the chatbot's authored content: the system prompt
 * and the context templates.
 *
 * Both are imported as raw text — the `?raw` pattern the plugin loader uses for
 * `manifest.json`, inlined into the plugin's server bundle at build time — so
 * they are edited in place and need no runtime file read. The templates stay a
 * mapping of name to nunjucks source; the same engine CLive's prompts use.
 */
import nunjucks from 'nunjucks';
import { parse } from 'yaml';
import systemPromptSource from '../content/system_prompt.md?raw';
import contextTemplatesSource from '../content/context_templates.yaml?raw';
import { ChatError } from './errors';

/** The problem as a template reads it. */
export interface ProblemForPrompt {
  name: string;
  description: string;
  starter_code: string;
  language: string;
}

/** The student's work as a template reads it. */
export interface CodeForPrompt {
  language: string;
  value: string;
}

/** One public test case as a template reads it. */
export interface TestCaseForPrompt {
  index: number;
  type: string;
  data: unknown;
}

/** Everything a context template may read. */
export interface ChatbotContext {
  problem: ProblemForPrompt;
  code: CodeForPrompt;
  test_cases: TestCaseForPrompt[];
}

const env = new nunjucks.Environment(null, {
  autoescape: false,
  trimBlocks: true,
  lstripBlocks: true,
  throwOnUndefined: false
});

// Templates print test case definitions as JSON. `JSON.stringify` keeps
// non-ASCII text intact, where Jinja's `tojson` would escape it.
env.addFilter('tojson', (value: unknown) => JSON.stringify(value) ?? 'null');

/** The parsed templates, read once; `undefined` until the first chat request. */
let templates: Record<string, string> | undefined;

/**
 * The system message: the authored prompt, then each context template's output.
 * Throws a {@link ChatError} naming the file at fault, so a malformed template
 * is something the page can report instead of a 500 with no explanation.
 */
export function renderSystemPrompt(context: ChatbotContext): string {
  const prompt = systemPromptSource.trim();
  if (!prompt) {
    throw new ChatError('The chatbot system prompt is empty. Fill in plugins/plugin-chatbot/content/system_prompt.md.');
  }

  const sections: string[] = [prompt];
  for (const [name, template] of Object.entries(loadTemplates())) {
    let rendered: string;
    try {
      rendered = env.renderString(template, context).trim();
    } catch (cause) {
      throw new ChatError(
        `Context template '${name}' could not be rendered: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
    if (rendered) sections.push(rendered);
  }

  return sections.join('\n\n');
}

/** The context templates, parsed on first use and kept for the process's life. */
function loadTemplates(): Record<string, string> {
  templates ??= parseTemplates();
  return templates;
}

function parseTemplates(): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = parse(contextTemplatesSource);
  } catch (cause) {
    throw new ChatError(
      `Context templates are not valid YAML: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ChatError('Context templates must be a mapping of template name to template text.');
  }

  const parsedTemplates: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new ChatError(`Context template '${name}' must be text.`);
    }
    parsedTemplates[name] = value;
  }
  return parsedTemplates;
}
