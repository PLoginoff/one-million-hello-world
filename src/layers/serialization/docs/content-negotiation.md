# Content Negotiation

## Overview
The Serialization Layer implements content negotiation with Accept header parsing, content type prioritization, fallback to JSON, and multiple accept type support.

## Content Type Definition

### Content Type
```typescript
interface ContentType {
  type: string;
  subtype: string;
  parameters: Map<string, string>;
  quality: number;
}
```

### Accept Header Parser
```typescript
class AcceptHeaderParser {
  parse(acceptHeader: string): ContentType[] {
    if (!acceptHeader) {
      return this.getDefaultContentTypes();
    }
    
    const types = acceptHeader.split(',').map(part => this.parseContentType(part.trim()));
    
    return this.sortByQuality(types);
  }
  
  private parseContentType(part: string): ContentType {
    const [typePart, ...paramParts] = part.split(';');
    
    const [type, subtype] = typePart.split('/');
    const parameters = new Map<string, string>();
    
    let quality = 1.0;
    
    for (const param of paramParts) {
      const [key, value] = param.split('=').map(p => p.trim());
      
      if (key === 'q') {
        quality = parseFloat(value);
      } else {
        parameters.set(key, value);
      }
    }
    
    return {
      type: type || '*',
      subtype: subtype || '*',
      parameters,
      quality
    };
  }
  
  private sortByQuality(types: ContentType[]): ContentType[] {
    return types.sort((a, b) => b.quality - a.quality);
  }
  
  private getDefaultContentTypes(): ContentType[] {
    return [
      {
        type: 'application',
        subtype: 'json',
        parameters: new Map(),
        quality: 1.0
      }
    ];
  }
}
```

## Content Negotiator

### Content Negotiator
```typescript
class ContentNegotiator {
  private supportedFormats: Map<string, SerializationFormat>;
  private parser: AcceptHeaderParser;
  
  constructor() {
    this.supportedFormats = new Map([
      ['application/json', SerializationFormat.JSON],
      ['application/xml', SerializationFormat.XML],
      ['text/plain', SerializationFormat.STRING]
    ]);
    this.parser = new AcceptHeaderParser();
  }
  
  negotiate(acceptHeader: string): SerializationFormat {
    const acceptedTypes = this.parser.parse(acceptHeader);
    
    for (const type of acceptedTypes) {
      const format = this.findSupportedFormat(type);
      if (format) {
        return format;
      }
    }
    
    return SerializationFormat.JSON;
  }
  
  private findSupportedFormat(contentType: ContentType): SerializationFormat | null {
    const key = `${contentType.type}/${contentType.subtype}`;
    
    if (this.supportedFormats.has(key)) {
      return this.supportedFormats.get(key)!;
    }
    
    if (contentType.subtype === '*') {
      for (const [supportedKey, format] of this.supportedFormats) {
        const [type] = supportedKey.split('/');
        if (type === contentType.type) {
          return format;
        }
      }
    }
    
    if (contentType.type === '*') {
      return SerializationFormat.JSON;
    }
    
    return null;
  }
  
  addSupportedFormat(contentType: string, format: SerializationFormat): void {
    this.supportedFormats.set(contentType, format);
  }
  
  removeSupportedFormat(contentType: string): void {
    this.supportedFormats.delete(contentType);
  }
}
```

## Content Type Generator

### Content Type Generator
```typescript
class ContentTypeGenerator {
  getContentType(format: SerializationFormat): string {
    switch (format) {
      case SerializationFormat.JSON:
        return 'application/json';
      case SerializationFormat.XML:
        return 'application/xml';
      case SerializationFormat.STRING:
        return 'text/plain';
      default:
        return 'application/json';
    }
  }
  
  getContentTypeWithCharset(format: SerializationFormat, charset: string = 'utf-8'): string {
    const contentType = this.getContentType(format);
    return `${contentType}; charset=${charset}`;
  }
}
```

## Best Practices

### Content Negotiation Guidelines
- Support multiple content types
- Use quality values for prioritization
- Provide sensible fallbacks
- Document supported formats
- Handle wildcard types

### Performance Considerations
- Cache parsed Accept headers
- Use efficient parsing
- Monitor negotiation overhead
