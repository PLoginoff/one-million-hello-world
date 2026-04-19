/**
 * HTTP Parser Factory
 * 
 * Factory for creating HTTP parser components and configurations.
 */

import { ParserConfigBuilder } from '../configuration/builders/ParserConfigBuilder';
import { DefaultConfigs, ParserConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { StrictParsingStrategy } from '../strategies/parsing/StrictParsingStrategy';
import { LenientParsingStrategy } from '../strategies/parsing/LenientParsingStrategy';
import { IParsingStrategy } from '../strategies/parsing/IParsingStrategy';
import { ParserStatistics } from '../statistics/ParserStatistics';
import { HttpMethodValueObject } from '../domain/value-objects/HttpMethodValueObject';
import { HttpVersionValueObject } from '../domain/value-objects/HttpVersionValueObject';
import { ParserStateValueObject } from '../domain/value-objects/ParserStateValueObject';
import { ParseMetricsValueObject } from '../domain/value-objects/ParseMetricsValueObject';
import { HttpRequestEntity } from '../domain/entities/HttpRequestEntity';
import { HttpResponseEntity } from '../domain/entities/HttpResponseEntity';
import { HttpHeaderEntity } from '../domain/entities/HttpHeaderEntity';

export class HttpParserFactory {
  /**
   * Create default parser configuration
   */
  static createDefaultConfig(): ParserConfigOptions {
    return ParserConfigBuilder.create().build();
  }

  /**
   * Create high-performance parser configuration
   */
  static createHighPerformanceConfig(): ParserConfigOptions {
    return ParserConfigBuilder.highPerformance().build();
  }

  /**
   * Create strict security parser configuration
   */
  static createStrictSecurityConfig(): ParserConfigOptions {
    return ParserConfigBuilder.strictSecurity().build();
  }

  /**
   * Create development parser configuration
   */
  static createDevelopmentConfig(): ParserConfigOptions {
    return ParserConfigBuilder.development().build();
  }

  /**
   * Create production parser configuration
   */
  static createProductionConfig(): ParserConfigOptions {
    return ParserConfigBuilder.production().build();
  }

  /**
   * Create custom parser configuration
   */
  static createCustomConfig(options: Partial<ParserConfigOptions>): ParserConfigOptions {
    return ParserConfigBuilder.create()
      .withMaxHeaderSize(options.maxHeaderSize ?? DefaultConfigs.DEFAULT.maxHeaderSize)
      .withMaxBodySize(options.maxBodySize ?? DefaultConfigs.DEFAULT.maxBodySize)
      .withStrictMode(options.strictMode ?? DefaultConfigs.DEFAULT.strictMode)
      .withAllowChunkedEncoding(options.allowChunkedEncoding ?? DefaultConfigs.DEFAULT.allowChunkedEncoding)
      .withMaxHeaderCount(options.maxHeaderCount ?? DefaultConfigs.DEFAULT.maxHeaderCount)
      .withMaxUrlLength(options.maxUrlLength ?? DefaultConfigs.DEFAULT.maxUrlLength)
      .withAllowHttp2(options.allowHttp2 ?? DefaultConfigs.DEFAULT.allowHttp2)
      .withEnableValidation(options.enableValidation ?? DefaultConfigs.DEFAULT.enableValidation)
      .withTimeout(options.timeout ?? DefaultConfigs.DEFAULT.timeout)
      .withKeepAlive(options.keepAlive ?? DefaultConfigs.DEFAULT.keepAlive)
      .withMaxConnections(options.maxConnections ?? DefaultConfigs.DEFAULT.maxConnections)
      .build();
  }

  /**
   * Create strict parsing strategy
   */
  static createStrictParsingStrategy(): IParsingStrategy {
    return new StrictParsingStrategy();
  }

  /**
   * Create lenient parsing strategy
   */
  static createLenientParsingStrategy(): IParsingStrategy {
    return new LenientParsingStrategy();
  }

  /**
   * Create parser statistics
   */
  static createParserStatistics(): ParserStatistics {
    return new ParserStatistics();
  }

  /**
   * Create HTTP method value object
   */
  static createHttpMethod(method: string): HttpMethodValueObject {
    return HttpMethodValueObject.fromString(method);
  }

  /**
   * Create HTTP version value object
   */
  static createHttpVersion(version: string): HttpVersionValueObject {
    return HttpVersionValueObject.fromString(version);
  }

  /**
   * Create parser state value object
   */
  static createParserState(state: string): ParserStateValueObject {
    return ParserStateValueObject.create(state as any);
  }

  /**
   * Create idle parser state
   */
  static createIdleParserState(): ParserStateValueObject {
    return ParserStateValueObject.idle();
  }

  /**
   * Create complete parser state
   */
  static createCompleteParserState(): ParserStateValueObject {
    return ParserStateValueObject.complete();
  }

  /**
   * Create parse metrics value object
   */
  static createParseMetrics(
    parseStartTime: number,
    parseEndTime: number,
    headerParseTime: number,
    bodyParseTime: number,
    validationTime: number,
    memoryUsage: number
  ): ParseMetricsValueObject {
    return ParseMetricsValueObject.create(
      parseStartTime,
      parseEndTime,
      headerParseTime,
      bodyParseTime,
      validationTime,
      memoryUsage
    );
  }

  /**
   * Create empty parse metrics
   */
  static createEmptyParseMetrics(): ParseMetricsValueObject {
    return ParseMetricsValueObject.empty();
  }

  /**
   * Create HTTP request entity
   */
  static createHttpRequestEntity(
    line: any,
    headers: any,
    body: any,
    raw: any
  ): HttpRequestEntity {
    return HttpRequestEntity.create(line, headers, body, raw);
  }

  /**
   * Create HTTP request entity from raw buffer
   */
  static createHttpRequestEntityFromRaw(raw: any): HttpRequestEntity {
    return HttpRequestEntity.fromRaw(raw);
  }

  /**
   * Create HTTP response entity
   */
  static createHttpResponseEntity(
    line: any,
    headers: any,
    body: any
  ): HttpResponseEntity {
    return HttpResponseEntity.create(line, headers, body);
  }

  /**
   * Create HTTP header entity
   */
  static createHttpHeaderEntity(name: string, value: string): HttpHeaderEntity {
    return HttpHeaderEntity.create(name, value);
  }

  /**
   * Create HTTP header entity from line
   */
  static createHttpHeaderEntityFromLine(line: string): HttpHeaderEntity {
    return HttpHeaderEntity.fromLine(line);
  }

  /**
   * Create complete HTTP parser stack with default configuration
   */
  static createDefaultParserStack(): {
    config: ParserConfigOptions;
    strategy: IParsingStrategy;
    statistics: ParserStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      strategy: this.createStrictParsingStrategy(),
      statistics: this.createParserStatistics(),
    };
  }

  /**
   * Create high-performance HTTP parser stack
   */
  static createHighPerformanceParserStack(): {
    config: ParserConfigOptions;
    strategy: IParsingStrategy;
    statistics: ParserStatistics;
  } {
    return {
      config: this.createHighPerformanceConfig(),
      strategy: this.createLenientParsingStrategy(),
      statistics: this.createParserStatistics(),
    };
  }

  /**
   * Create strict security HTTP parser stack
   */
  static createStrictSecurityParserStack(): {
    config: ParserConfigOptions;
    strategy: IParsingStrategy;
    statistics: ParserStatistics;
  } {
    return {
      config: this.createStrictSecurityConfig(),
      strategy: this.createStrictParsingStrategy(),
      statistics: this.createParserStatistics(),
    };
  }
}
