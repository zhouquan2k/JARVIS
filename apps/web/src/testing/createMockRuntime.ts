import type { ProviderConfig } from '@packages/core/config';
import type { IModelProvider } from '@packages/core/src/interfaces/IModelProvider';
import type { ProviderRuntime } from '@packages/core/src/runtime/types';

const MOCK_PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini-api',
    name: 'Gemini (Mock)',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Mock)' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Mock)' }
    ],
    defaultModel: 'gemini-2.5-flash',
    supportedRuntimeModes: ['web']
  },
  {
    id: 'mock-second',
    name: 'Second Provider (Mock)',
    models: [
      { id: 'second-fast', name: 'Second Fast' },
      { id: 'second-precise', name: 'Second Precise' }
    ],
    defaultModel: 'second-fast',
    supportedRuntimeModes: ['web']
  }
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractByLabel(text: string, label: string): string {
  const index = text.indexOf(label);
  if (index === -1) {
    return '';
  }

  const nextLineIndex = text.indexOf('\n', index + label.length);
  if (nextLineIndex === -1) {
    return text.slice(index + label.length).trim();
  }
  return text.slice(index + label.length, nextLineIndex).trim();
}

function excerpt(text: string, maxLen = 96): string {
  if (!text) return '';
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`;
}

class MockStreamingProvider implements IModelProvider {
  public id: string;
  private aborted = false;

  constructor(providerId: string) {
    this.id = providerId;
  }

  async checkAuth(): Promise<boolean> {
    return true;
  }

  async sendMessage(
    prompt: string,
    options: {
      context?: { parentMessageId?: string; conversationId?: string };
      modelId?: string;
    } = {},
    onUpdate: (chunk: string) => void
  ): Promise<{ text: string; conversationId: string; messageId: string }> {
    this.aborted = false;

    const isAnalysisPrompt = prompt.includes('User prompt:') && prompt.includes('Model A output:') && prompt.includes('Model B output:');
    const userPrompt = extractByLabel(prompt, 'User prompt:');
    const outputA = extractByLabel(prompt, 'Model A output:');
    const outputB = extractByLabel(prompt, 'Model B output:');

    const finalText = isAnalysisPrompt
      ? this.buildAnalysisText(userPrompt, outputA, outputB)
      : this.buildNativeText(prompt, options.modelId);

    let partial = '';
    for (const char of finalText) {
      if (this.aborted) {
        throw new Error('Request aborted');
      }
      partial += char;
      onUpdate(partial);
      await sleep(2);
    }

    return {
      text: finalText,
      conversationId: options.context?.conversationId || crypto.randomUUID(),
      messageId: crypto.randomUUID()
    };
  }

  abort(): void {
    this.aborted = true;
  }

  private buildNativeText(prompt: string, modelId?: string): string {
    if (prompt.includes('TRIGGER_MARKDOWN_NATIVE')) {
      return [
        `## ${this.id}/${modelId || 'default'} Markdown`,
        '',
        '- 第一条要点',
        '- 第二条要点',
        '',
        '```ts',
        "console.log('markdown from model')",
        '```'
      ].join('\n');
    }

    return `${this.id}/${modelId || 'default'} => ${prompt}`;
  }

  private buildAnalysisText(userPrompt: string, outputA: string, outputB: string): string {
    if (userPrompt.includes('TRIGGER_BAD_ANALYSIS')) {
      return 'INVALID_ANALYSIS_PAYLOAD';
    }

    if (userPrompt.includes('TRIGGER_MD_ARRAY_ANALYSIS')) {
      return [
        '```json',
        JSON.stringify(
          {
            agreements: [
              `共同问题原文：${userPrompt || 'N/A'}`,
              `A原文片段：${excerpt(outputA)}`,
              `B原文片段：${excerpt(outputB)}`
            ],
            conflictsA: [`${excerpt(outputA)}`],
            conflictsB: [`${excerpt(outputB)}`],
            uniqueA: [`${excerpt(outputA)}（A特有片段）`],
            uniqueB: [`${excerpt(outputB)}（B特有片段）`]
          },
          null,
          2
        ),
        '```'
      ].join('\n');
    }

    return JSON.stringify({
      agreements: `共同问题原文：${userPrompt || 'N/A'}`,
      conflictsA: excerpt(outputA),
      conflictsB: excerpt(outputB),
      uniqueA: `${excerpt(outputA)}（A特有片段）`,
      uniqueB: `${excerpt(outputB)}（B特有片段）`
    });
  }
}

export function createMockRuntime(): ProviderRuntime {
  const cache = new Map<string, IModelProvider>();

  return {
    getAvailableProviders() {
      return MOCK_PROVIDERS;
    },

    getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider {
      const providerConfig = MOCK_PROVIDERS.find((item) => item.id === providerId);
      if (!providerConfig) {
        throw new Error(`Mock provider '${providerId}' is not available`);
      }

      if (options?.fresh) {
        return new MockStreamingProvider(providerId);
      }

      const cached = cache.get(providerId);
      if (cached) {
        return cached;
      }

      const instance = new MockStreamingProvider(providerId);
      cache.set(providerId, instance);
      return instance;
    }
  };
}
