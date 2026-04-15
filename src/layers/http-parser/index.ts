/**
 * HTTP Parser Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the HTTP Parser Layer (Layer 2 of the 25-layer architecture).
 * 
 * The HTTP Parser Layer provides request parsing, headers parsing,
 * and validation of HTTP protocol data.
 * 
 * @module HttpParserLayer
 */

export { IHttpRequestParser } from './interfaces/IHttpRequestParser';
export { HttpRequestParser } from './implementations/HttpRequestParser';
export * from './types/http-parser-types';
