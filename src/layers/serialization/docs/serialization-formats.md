# Serialization Formats

## Overview
The Serialization Layer implements multiple serialization formats including JSON (primary), XML (basic), and string (fallback) with configurable default format.

## Format Definition

### Serialization Format
```typescript
enum SerializationFormat {
  JSON = 'json',
  XML = 'xml',
  STRING = 'string'
}

interface SerializationResult {
  data: string;
  format: SerializationFormat;
  contentType: string;
}
```

## JSON Serialization

### JSON Serializer
```typescript
class JsonSerializer {
  serialize(data: any, options: SerializationOptions = {}): SerializationResult {
    const json = JSON.stringify(data, null, options.pretty ? 2 : 0);
    
    return {
      data: json,
      format: SerializationFormat.JSON,
      contentType: 'application/json'
    };
  }
  
  deserialize(json: string): any {
    try {
      return JSON.parse(json);
    } catch (error) {
      throw new SerializationError('Invalid JSON', error);
    }
  }
  
  validate(json: string): boolean {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }
}
```

## XML Serialization

### XML Serializer
```typescript
class XmlSerializer {
  serialize(data: any, options: SerializationOptions = {}): SerializationResult {
    const xml = this.objectToXml(data, options.rootName || 'root');
    
    return {
      data: xml,
      format: SerializationFormat.XML,
      contentType: 'application/xml'
    };
  }
  
  deserialize(xml: string): any {
    try {
      return this.xmlToObject(xml);
    } catch (error) {
      throw new SerializationError('Invalid XML', error);
    }
  }
  
  private objectToXml(obj: any, rootName: string): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<${rootName}>\n`;
    xml += this.objectToXmlNode(obj);
    xml += `</${rootName}>`;
    return xml;
  }
  
  private objectToXmlNode(obj: any): string {
    if (obj === null || obj === undefined) {
      return '';
    }
    
    if (typeof obj !== 'object') {
      return String(obj);
    }
    
    let xml = '';
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        xml += `  <${key}>`;
        
        if (typeof value === 'object' && value !== null) {
          xml += '\n' + this.objectToXmlNode(value) + '  ';
        } else {
          xml += String(value);
        }
        
        xml += `</${key}>\n`;
      }
    }
    
    return xml;
  }
  
  private xmlToObject(xml: string): any {
    const obj: any = {};
    
    const regex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let match;
    
    while ((match = regex.exec(xml)) !== null) {
      const key = match[1];
      const value = match[2].trim();
      
      if (value.startsWith('<')) {
        obj[key] = this.xmlToObject(value);
      } else {
        obj[key] = value;
      }
    }
    
    return obj;
  }
}
```

## String Serialization

### String Serializer
```typescript
class StringSerializer {
  serialize(data: any): SerializationResult {
    const str = String(data);
    
    return {
      data: str,
      format: SerializationFormat.STRING,
      contentType: 'text/plain'
    };
  }
  
  deserialize(str: string): string {
    return str;
  }
}
```

## Serialization Options

### Options
```typescript
interface SerializationOptions {
  pretty?: boolean;
  rootName?: string;
  indent?: string;
}
```

## Best Practices

### Serialization Guidelines
- Use JSON as default format
- Validate serialized output
- Handle circular references
- Use appropriate content types
- Document format limitations

### Performance Considerations
- Use efficient serialization
- Cache serialized output when possible
- Monitor serialization time
- Use streaming for large payloads
