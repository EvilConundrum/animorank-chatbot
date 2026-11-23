import { describe, expect, it } from 'vitest';
import systemPrompt from '../content/system_prompt.md?raw';
import { renderSystemPrompt, type ChatbotContext } from './content';

const context: ChatbotContext = {
  problem: {
    name: 'Sum of Two Numbers',
    description: 'Read two integers and print their sum.',
    starter_code: 'int main(void) {}',
    language: 'C'
  },
  code: {
    language: 'c',
    value: 'int main(void) { return 0; }'
  },
  test_cases: [
    { index: 1, type: 'stdio', data: { input: '1 2', output: '3' } },
    { index: 2, type: 'stdio', data: { input: '5 -2', output: '3' } }
  ]
};

describe('renderSystemPrompt', () => {
  it('puts the authored prompt first and every context section after it', () => {
    const prompt = renderSystemPrompt(context);

    expect(prompt.startsWith(systemPrompt.trim())).toBe(true);
    expect(prompt).toContain('**Sum of Two Numbers**');
    expect(prompt).toContain('Read two integers and print their sum.');
    expect(prompt).toContain('int main(void) { return 0; }');
    expect(prompt).toContain('"input":"1 2"');
    expect(prompt).toContain('### Test case 2 (stdio)');
  });

  it('says so when the problem has no public test cases', () => {
    const prompt = renderSystemPrompt({ ...context, test_cases: [] });

    expect(prompt).toContain('This problem has no public test cases.');
  });
});
