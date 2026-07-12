import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { MessageContent } from '../value-objects/MessageContent';

export interface HelloWorldOptions {
  language?: string;
  format?: string;
  suffix?: string;
}

export class HelloWorldFactory {
  private readonly _translations: Map<string, string>;

  constructor() {
    this._translations = new Map([
      ['en', 'Hello World'],
      ['es', 'Hola Mundo'],
      ['fr', 'Bonjour le monde'],
      ['de', 'Hallo Welt'],
      ['it', 'Ciao Mondo'],
      ['pt', 'Olá Mundo'],
      ['ru', 'Привет мир'],
      ['zh', '你好世界'],
      ['ja', 'こんにちは世界'],
      ['ko', '안녕 세상'],
    ]);
  }

  create(options: HelloWorldOptions = {}): HelloWorldMessage {
    const language = options.language || 'en';
    const format = options.format || 'json';
    const baseText = this._translations.get(language) ?? this._translations.get('en') ?? 'Hello World';
    const text = options.suffix ? `${baseText}${options.suffix}` : baseText;

    const content = MessageContent.create(text);
    return HelloWorldMessage.create(content.value).withLanguage(language).withFormat(format);
  }

  supportsLanguage(language: string): boolean {
    return this._translations.has(language);
  }

  getSupportedLanguages(): string[] {
    return Array.from(this._translations.keys());
  }
}
