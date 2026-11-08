// MIT License
// Copyright (c) 2024-2026 Ronan Le Meillat - SCTG Development
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * File utility functions for handling file operations and formatting.
 */
import type { PlaygroundFile } from '../../types/playground-types';
import type { AiProtocol, CrawlerProtocol } from '../../types/ai-config';

/** Maximum size for inline base64 file payloads (8 MB). */
export const MAX_CONTEXT_FILE_BYTES = 256 * 1024;

/**
 * Formats a byte count into a human-readable string with the appropriate unit (B, KB, MB).
 *
 * @param bytes - The number of bytes to format.
 * @returns A formatted string like `"1.5 MB"` or `"512 B"`.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Maps a language name to its file extension.
 *
 * @param language - The language identifier (case-insensitive, e.g. `"markdown"`, `"python"`).
 * @returns The file extension (e.g. `"md"`, `"py"`), or `"txt"` if unknown.
 */
export const getFileExtension = (language: string): string => ({
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  css: 'css',
  html: 'html',
  javascript: 'js',
  js: 'js',
  json: 'json',
  markdown: 'md',
  md: 'md',
  python: 'py',
  sh: 'sh',
  shell: 'sh',
  ts: 'ts',
  tsx: 'tsx',
  typescript: 'ts',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yml',
}[language.toLowerCase()] ?? 'txt');

/**
 * Generates a unique filename by appending a numeric suffix if the name is already taken.
 *
 * @param filename - The original filename.
 * @param usedNames - A Set of filenames already used in this context.
 * @returns A unique filename, modifying `usedNames` as a side effect.
 */
export const makeUniqueFilename = (filename: string, usedNames: Set<string>): string => {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }

  const dotIndex = filename.lastIndexOf('.');
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  let suffix = 2;
  let candidate = `${basename}-${suffix}${extension}`;

  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${basename}-${suffix}${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
};

/**
 * Generates a Markdown filename from the first heading of the content,
 * or falls back to `"assistant-response-N.md"`.
 *
 * @param content - The Markdown source text.
 * @param index - Zero-based index used for the fallback name.
 * @returns A slugified filename ending in `.md`.
 */
export const getMarkdownFilename = (content: string, index: number): string => {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${heading || `assistant-response-${index + 1}`}.md`;
};

/**
 * Builds a user-content string that combines the prompt text with attached context files.
 *
 * @param prompt - The main user prompt text.
 * @param files - Optional array of legacy file objects to include as context.
 * @returns A combined string with the prompt and XML-wrapped file contents.
 */
export const buildUserContent = (prompt: string, files: PlaygroundFile[] = []): string => {
  if (files.length === 0) return prompt;

  const fileContext = files
    .map((file) => [
      `<file name="${file.name}" type="${file.type || 'text/plain'}" size="${file.size}">`,
      file.content,
      '</file>',
    ].join('\n'))
    .join('\n\n');

  return [
    prompt,
    '',
    'Attached context files:',
    fileContext,
  ].join('\n');
};

/**
 * Extracts the representative text from a legacy message object for token estimation.
 *
 * @param message - A message with `content` text and optional `files`.
 * @returns The combined text including file contexts, or just the content.
 */
export const messageTokenText = (message: { content: string; files?: PlaygroundFile[] }): string =>
  buildUserContent(message.content, message.files);

/**
 * Extracts fenced code blocks from text content and converts them into file objects.
 * Each fenced block with a `filename=` or `path=` annotation becomes a named file;
 * otherwise a generic name like `"generated-1.ts"` is used.
 *
 * @param content - The text containing fenced code blocks.
 * @returns An array of `{ name, content }` file objects.
 */
export const extractGeneratedFiles = (content: string) => {
  const files: Array<{ name: string; content: string }> = [];
  const usedNames = new Set<string>();
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = fencePattern.exec(content)) !== null) {
    const info = match[1]?.trim() ?? '';
    const code = match[2] ?? '';
    const filename = info.match(/(?:file(?:name)?|path|title)=["']?([^"'\s]+)["']?/i)?.[1];
    const language = info.split(/\s+/)[0] || 'txt';

    if (filename) {
      files.push({
        name: makeUniqueFilename(filename, usedNames),
        content: code.replace(/\n$/, ''),
      });
    } else {
      files.push({
        name: makeUniqueFilename(`generated-${index + 1}.${getFileExtension(language)}`, usedNames),
        content: code.replace(/\n$/, ''),
      });
    }

    index += 1;
  }

  return files;
};

/** Result of validating an AI configuration file. */
export interface AiConfigValidationResult {
  /** True when the configuration matches the expected schema. */
  valid: boolean;
  /** Human-readable, path-precise descriptions of every validation problem found. */
  errors: string[];
}

const VALID_PROTOCOLS: AiProtocol[] = [
  'openai', 'groq', 'sambanova', 'anthropic', 'gemini',
  'mistral','vibe', 'openrouter', 'morph', 'cohere', 'poolside'
];
const VALID_CRAWLER_PROTOCOLS: CrawlerProtocol[] = ['firecrawl', 'exa', 'scrapegraphai'];
const VALID_KEY_TYPES = ['expired', 'free', 'paid', 'premium', 'unlimited'];
const VALID_MODEL_USAGES = ['chat', 'embedding', 'transcription', 'tts', 'image-generation'];
const VALID_INPUT_MODALITIES = ['text', 'image', 'audio', 'video'];
const VALID_OUTPUT_MODALITIES = ['text', 'image', 'audio'];

const enumMessage = (label: string, allowed: readonly string[]): string =>
  `${label} must be one of: ${allowed.join(', ')}.`;

/**
 * Validates that a parsed JSON object matches the expected AI configuration schema.
 * Collects every problem found and reports it with a JSON path so the file can be fixed.
 *
 * @param config - The parsed configuration object to validate.
 * @returns A result object containing `valid` and a list of precise `errors`.
 */
export const validateAiConfigSchema = (config: any): AiConfigValidationResult => {
  const errors: string[] = [];

  // Check basic structure
  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: ['Configuration root must be a JSON object.'] };
  }
  if (typeof config.version !== 'number') {
    errors.push('Root field "version" must be a number.');
  }
  if (typeof config.providers !== 'object' || config.providers === null) {
    errors.push('Root field "providers" must be an object.');
  }
  if (typeof config.crawlers !== 'object' || config.crawlers === null) {
    errors.push('Root field "crawlers" must be an object.');
  }

  const validateKey = (key: any, base: string) => {
    if (typeof key !== 'object' || key === null) {
      errors.push(`${base} must be an object.`);
      return;
    }
    if (typeof key.key !== 'string' || !key.key.trim()) {
      errors.push(`${base}.key must be a non-empty string.`);
    }
    if (key.owner !== undefined && typeof key.owner !== 'string') {
      errors.push(`${base}.owner must be a string when provided.`);
    }
    if (key.type !== undefined && !VALID_KEY_TYPES.includes(key.type)) {
      errors.push(enumMessage(`${base}.type`, VALID_KEY_TYPES));
    }
  };

  const validateModel = (model: any, index: number, providerId: string) => {
    const prefix = `providers["${providerId}"].models[${index}]`;
    if (typeof model !== 'object' || model === null) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    if (typeof model.id !== 'string' || !model.id.trim()) {
      errors.push(`${prefix}.id must be a non-empty string.`);
    }
    if (!VALID_MODEL_USAGES.includes(model.usage)) {
      errors.push(enumMessage(`${prefix}.usage`, VALID_MODEL_USAGES));
    }
    if (typeof model.contextWindow !== 'number' || model.contextWindow <= 0) {
      errors.push(`${prefix}.contextWindow must be a positive number.`);
    }
    if (typeof model.maxOutputTokens !== 'number' || model.maxOutputTokens < 0) {
      errors.push(`${prefix}.maxOutputTokens must be a non-negative number.`);
    }
    if (model.tpmLimit !== null && (typeof model.tpmLimit !== 'number' || model.tpmLimit <= 0)) {
      errors.push(`${prefix}.tpmLimit must be null or a positive number.`);
    }
    if (typeof model.priority !== 'number') {
      errors.push(`${prefix}.priority must be a number.`);
    }

    if (model.tags !== undefined && (!Array.isArray(model.tags) || !model.tags.every((tag: any) => typeof tag === 'string'))) {
      errors.push(`${prefix}.tags must be an array of strings.`);
    }
    if (model.gatewayPrefix !== undefined && typeof model.gatewayPrefix !== 'string') {
      errors.push(`${prefix}.gatewayPrefix must be a string.`);
    }
    if (model.supportsImages !== undefined && typeof model.supportsImages !== 'boolean') {
      errors.push(`${prefix}.supportsImages must be a boolean.`);
    }
    if (model.supportsPromptCache !== undefined && typeof model.supportsPromptCache !== 'boolean') {
      errors.push(`${prefix}.supportsPromptCache must be a boolean.`);
    }
    if (model.supportsTools !== undefined && typeof model.supportsTools !== 'boolean') {
      errors.push(`${prefix}.supportsTools must be a boolean.`);
    }
    if (model.supportsReasoning !== undefined && typeof model.supportsReasoning !== 'boolean') {
      errors.push(`${prefix}.supportsReasoning must be a boolean.`);
    }
    if (model.inputModalities !== undefined && (!Array.isArray(model.inputModalities) || !model.inputModalities.every((modality: any) => VALID_INPUT_MODALITIES.includes(modality)))) {
      errors.push(enumMessage(`${prefix}.inputModalities`, VALID_INPUT_MODALITIES));
    }
    if (model.outputModalities !== undefined && (!Array.isArray(model.outputModalities) || !model.outputModalities.every((modality: any) => VALID_OUTPUT_MODALITIES.includes(modality)))) {
      errors.push(enumMessage(`${prefix}.outputModalities`, VALID_OUTPUT_MODALITIES));
    }
  };

  // Validate providers
  if (config.providers && typeof config.providers === 'object') {
    for (const [providerId, provider] of Object.entries(config.providers)) {
      if (!providerId.trim()) {
        errors.push(`providers["${providerId}"].id (provider key) must be a non-empty string.`);
      }

      if (typeof provider !== 'object' || provider === null) {
        errors.push(`providers["${providerId}"] must be an object.`);
        continue;
      }

      const providerObj = provider as any;
      const base = `providers["${providerId}"]`;

      if (!VALID_PROTOCOLS.includes(providerObj.protocol)) {
        errors.push(enumMessage(`${base}.protocol`, VALID_PROTOCOLS));
      }
      if (typeof providerObj.endpoint !== 'string' || !providerObj.endpoint.trim()) {
        errors.push(`${base}.endpoint must be a non-empty string.`);
      }

      if (!Array.isArray(providerObj.keys)) {
        errors.push(`${base}.keys must be an array.`);
      } else {
        providerObj.keys.forEach((key: any, index: number) => validateKey(key, `${base}.keys[${index}]`));
      }

      if (!Array.isArray(providerObj.models)) {
        errors.push(`${base}.models must be an array.`);
      } else {
        providerObj.models.forEach((model: any, index: number) => validateModel(model, index, providerId));
      }

      // Optional provider fields
      if (providerObj.gatewayEndpoint !== undefined && typeof providerObj.gatewayEndpoint !== 'string') {
        errors.push(`${base}.gatewayEndpoint must be a string.`);
      }
      if (providerObj.gatewayModelPrefix !== undefined && typeof providerObj.gatewayModelPrefix !== 'string') {
        errors.push(`${base}.gatewayModelPrefix must be a string.`);
      }
      if (providerObj.gatewayKey !== undefined && typeof providerObj.gatewayKey !== 'string') {
        errors.push(`${base}.gatewayKey must be a string.`);
      }
      if (providerObj.modelCardEndpoint !== undefined && typeof providerObj.modelCardEndpoint !== 'string') {
        errors.push(`${base}.modelCardEndpoint must be a string.`);
      }
      if (providerObj.userAgent !== undefined && typeof providerObj.userAgent !== 'string') {
        errors.push(`${base}.userAgent must be a string.`);
      }
    }
  }

  // Validate crawlers
  if (config.crawlers && typeof config.crawlers === 'object') {
    for (const [crawlerId, crawler] of Object.entries(config.crawlers)) {
      if (!crawlerId.trim()) {
        errors.push(`crawlers["${crawlerId}"].id (crawler key) must be a non-empty string.`);
      }

      if (typeof crawler !== 'object' || crawler === null) {
        errors.push(`crawlers["${crawlerId}"] must be an object.`);
        continue;
      }

      const crawlerObj = crawler as any;
      const base = `crawlers["${crawlerId}"]`;

      if (!VALID_CRAWLER_PROTOCOLS.includes(crawlerObj.protocol)) {
        errors.push(enumMessage(`${base}.protocol`, VALID_CRAWLER_PROTOCOLS));
      }
      if (typeof crawlerObj.endpoint !== 'string' || !crawlerObj.endpoint.trim()) {
        errors.push(`${base}.endpoint must be a non-empty string.`);
      }

      if (!Array.isArray(crawlerObj.keys)) {
        errors.push(`${base}.keys must be an array.`);
      } else {
        crawlerObj.keys.forEach((key: any, index: number) => validateKey(key, `${base}.keys[${index}]`));
      }
    }
  }

  return { valid: errors.length === 0, errors };
};
