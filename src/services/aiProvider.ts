import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export type AIProvider = 'openai' | 'deepseek' | 'gemini' | 'groq';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  assistantId?: string;
  threadId?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
  image?: string;
}

export interface AIResponse {
  content: string;
  done: boolean;
}

// Provider configurations
const PROVIDER_CONFIGS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    models: {
      text: 'gpt-4o-mini',
      vision: 'gpt-4o-mini'
    }
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    models: {
      text: 'deepseek-chat',
      vision: 'deepseek-chat' // DeepSeek doesn't have vision yet
    }
  },
  gemini: {
    models: {
      text: 'gemini-2.0-flash',
      vision: 'gemini-2.0-flash'
    }
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    models: {
      text: 'llama-3.3-70b-versatile',
      vision: 'meta-llama/llama-4-scout-17b-16e-instruct'
    }
  }
};

export class AIProviderManager {
  private config: AIConfig;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;

  constructor(providerOverride?: AIProvider) {
    const provider = providerOverride || ((import.meta.env.VITE_AI_PROVIDER || 'openai') as AIProvider);
    this.config = this.getProviderConfig(provider);
    this.initializeClients();
  }

  private getProviderConfig(provider: AIProvider): AIConfig {
    const configMap = {
      openai: {
        provider: 'openai' as const,
        apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
        model: PROVIDER_CONFIGS.openai.models.text,
        assistantId: import.meta.env.VITE_OPENAI_ASSISTANT_ID,
        threadId: import.meta.env.VITE_OPENAI_THREAD_ID
      },
      deepseek: {
        provider: 'deepseek' as const,
        apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
        model: PROVIDER_CONFIGS.deepseek.models.text
      },
      gemini: {
        provider: 'gemini' as const,
        apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
        model: PROVIDER_CONFIGS.gemini.models.text
      },
      groq: {
        provider: 'groq' as const,
        apiKey: import.meta.env.VITE_GROQ_API_KEY || '',
        model: PROVIDER_CONFIGS.groq.models.text
      }
    };

    return configMap[provider];
  }

  private initializeClients() {
    if (this.config.provider === 'openai' || this.config.provider === 'deepseek' || this.config.provider === 'groq') {
      this.openaiClient = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: PROVIDER_CONFIGS[this.config.provider].baseURL,
        dangerouslyAllowBrowser: true
      });
    }

    if (this.config.provider === 'gemini') {
      this.geminiClient = new GoogleGenerativeAI(this.config.apiKey);
    }
  }

  async *chat(
    messages: ChatMessage[],
    systemPrompt: string,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<AIResponse> {
    switch (this.config.provider) {
      case 'openai':
      case 'deepseek':
      case 'groq':
        yield* this.handleOpenAIChat(messages, systemPrompt, onChunk);
        break;
      case 'gemini':
        yield* this.handleGeminiChat(messages, systemPrompt, onChunk);
        break;
    }
  }

  private async *handleOpenAIChat(
    messages: ChatMessage[],
    systemPrompt: string,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<AIResponse> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    try {
      // Only OpenAI's chat model supports multimodal content in the chat path.
      // Groq (Llama 3.3) and DeepSeek are text-only — strip images from history.
      const supportsVisionInChat = this.config.provider === 'openai';
      const formattedMessages = this.formatMessagesForOpenAI(messages, systemPrompt, supportsVisionInChat);

      const stream = await this.openaiClient.chat.completions.create({
        model: this.config.model!,
        messages: formattedMessages as any, // Type assertion for compatibility
        stream: true,
        temperature: 0.7,
        max_tokens: 2000
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk?.(content);
          yield { content: fullContent, done: false };
        }
      }
      yield { content: fullContent, done: true };
    } catch (error) {
      console.error('OpenAI/DeepSeek chat error:', error);
      throw error;
    }
  }

  private async *handleGeminiChat(
    messages: ChatMessage[],
    systemPrompt: string,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<AIResponse> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    try {
      const model = this.geminiClient.getGenerativeModel({
        model: this.config.model!,
        systemInstruction: systemPrompt
      });

      const formattedMessages = this.formatMessagesForGemini(messages);

      const result = await model.generateContentStream(formattedMessages);

      let fullContent = '';
      for await (const chunk of result.stream) {
        const content = chunk.text();
        if (content) {
          fullContent += content;
          onChunk?.(content);
          yield { content: fullContent, done: false };
        }
      }
      yield { content: fullContent, done: true };
    } catch (error) {
      console.error('Gemini chat error:', error);
      throw error;
    }
  }

  async processImage(imageDataUrl: string, prompt: string, systemPrompt?: string): Promise<string> {
    switch (this.config.provider) {
      case 'openai':
        return this.processImageWithOpenAICompat(imageDataUrl, prompt, PROVIDER_CONFIGS.openai.models.vision, systemPrompt);
      case 'groq':
        return this.processImageWithOpenAICompat(imageDataUrl, prompt, PROVIDER_CONFIGS.groq.models.vision, systemPrompt);
      case 'gemini':
        return this.processImageWithGemini(imageDataUrl, prompt, systemPrompt);
      case 'deepseek':
        throw new Error('DeepSeek does not support image processing yet');
      default:
        throw new Error(`Image processing not supported for ${this.config.provider}`);
    }
  }

  private async processImageWithOpenAICompat(
    imageDataUrl: string,
    prompt: string,
    model: string,
    systemPrompt?: string
  ): Promise<string> {
    if (!this.openaiClient) throw new Error('OpenAI-compatible client not initialized');

    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      });

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages,
        max_tokens: 2000
      });

      return response.choices[0]?.message?.content || 'Error processing image';
    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }
  }

  private async processImageWithGemini(imageDataUrl: string, prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    try {
      const model = this.geminiClient.getGenerativeModel({
        model: PROVIDER_CONFIGS.gemini.models.vision,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {})
      });

      // Convert data URL to proper format for Gemini
      const imageData = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.split(';')[0].split(':')[1];

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageData,
            mimeType: mimeType
          }
        }
      ]);

      return result.response.text();
    } catch (error) {
      console.error('Gemini image processing error:', error);
      throw error;
    }
  }

  private formatMessagesForOpenAI(
    messages: ChatMessage[],
    systemPrompt: string,
    supportsVision: boolean = true
  ): any[] {
    const formatted: any[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
      if (msg.image && supportsVision) {
        // Multimodal content array — only works on vision-capable models.
        formatted.push({
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || 'Please analyze this image:' },
            { type: 'image_url', image_url: { url: msg.image } }
          ]
        });
      } else {
        // Text-only model: drop the image data, keep a plain-string content.
        // If there was no text on the image message, leave a short placeholder
        // so the assistant has context that a screenshot happened.
        formatted.push({
          role: msg.role,
          content:
            msg.content ||
            (msg.image ? '[A screenshot was shared earlier — not visible to this text-only model.]' : '')
        });
      }
    }

    return formatted;
  }

  private formatMessagesForGemini(messages: ChatMessage[]) {
    const formatted = [];

    for (const msg of messages) {
      if (msg.image) {
        // Handle image messages for Gemini
        const imageData = msg.image.split(',')[1];
        const mimeType = msg.image.split(';')[0].split(':')[1];

        formatted.push({
          text: msg.content || 'Please analyze this image:'
        });
        formatted.push({
          inlineData: {
            data: imageData,
            mimeType: mimeType
          }
        });
      } else {
        formatted.push(msg.content);
      }
    }

    return formatted;
  }

  getCurrentProvider(): AIProvider {
    return this.config.provider;
  }

  getAvailableProviders(): AIProvider[] {
    return ['openai', 'deepseek', 'gemini', 'groq'];
  }
}