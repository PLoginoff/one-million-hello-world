# HTTP Response

## Overview
The Transport Layer implements HTTP response with response data handling, status code management, response formatting, and error handling.

### HTTP Response Builder
```typescript
interface HttpResponse {
  statusCode: number;
  headers: Map<string, string>;
  body: any;
}

class HttpResponseBuilder {
  private response: Partial<HttpResponse> = {
    statusCode: 200,
    headers: new Map()
  };
  
  setStatusCode(code: number): HttpResponseBuilder {
    this.response.statusCode = code;
    return this;
  }
  
  setHeader(name: string, value: string): HttpResponseBuilder {
    this.response.headers.set(name, value);
    return this;
  }
  
  setBody(body: any): HttpResponseBuilder {
    this.response.body = body;
    return this;
  }
  
  build(): HttpResponse {
    return {
      statusCode: this.response.statusCode || 200,
      headers: new Map(this.response.headers),
      body: this.response.body
    };
  }
}
```

## Best Practices

### Response Guidelines
- Use appropriate status codes
- Set response headers correctly
- Format response body properly
- Handle errors gracefully
