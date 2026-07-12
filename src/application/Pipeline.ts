import { Request, Response, NextFunction } from 'express';
import { CompositionRoot } from './CompositionRoot';
import { HttpRequest, HttpMethod, HttpVersion } from '../layers/http-parser/types/http-parser-types';

export class Pipeline {
  private readonly _composition: CompositionRoot;

  constructor(composition: CompositionRoot) {
    this._composition = composition;
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await this._process(req, res);
      } catch (error) {
        next(error);
      }
    };
  }

  private async _process(req: Request, res: Response): Promise<void> {
    const requestId = this._extractRequestId(req);
    const correlationId = this._extractCorrelationId(req);

    const httpRequest = this._adaptRequest(req);
    const route = this._composition.router.getRoute(req.method as HttpMethod, req.path);

    if (!route) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const handler = this._composition.controller.getHandler(route.handler);
    if (!handler) {
      res.status(500).json({ error: 'Handler not found' });
      return;
    }

    const context = this._composition.controller.createContext(httpRequest, {
      ...req.params,
      ...this._normalizeQuery(req.query),
    });

    const controllerResult = await this._composition.controller.handle(httpRequest, handler, context);

    if (!controllerResult.success || !controllerResult.response) {
      const status = controllerResult.response?.statusCode ?? 500;
      res.status(status).json({
        error: controllerResult.error?.message || 'Internal Server Error',
      });
      return;
    }

    const response = controllerResult.response;
    res.status(response.statusCode);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.send(response.body);
  }

  private _adaptRequest(req: Request): HttpRequest {
    const headers = new Map<string, string>();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers.set(key.toLowerCase(), value);
      } else if (Array.isArray(value)) {
        headers.set(key.toLowerCase(), value.join(', '));
      }
    });

    const body = req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.alloc(0);

    return {
      line: {
        method: req.method as HttpMethod,
        path: req.path,
        version: HttpVersion.HTTP_1_1,
        query: req.url.includes('?') ? req.url.split('?')[1] : undefined,
      },
      headers,
      body,
      raw: body,
    };
  }

  private _extractRequestId(req: Request): string {
    const value = req.headers['x-request-id'];
    return typeof value === 'string' ? value : `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private _extractCorrelationId(req: Request): string {
    const value = req.headers['x-correlation-id'];
    return typeof value === 'string' ? value : this._extractRequestId(req);
  }

  private _normalizeQuery(query: Request['query']): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.join(',');
      }
    }
    return result;
  }
}
