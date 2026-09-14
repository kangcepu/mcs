import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const ok = (res: Response, data: unknown = null, message = 'OK', meta?: unknown): void => {
  res.status(200).json({ success: true, message, data, ...(meta === undefined ? {} : { meta }) });
};

export const created = (res: Response, data: unknown = null, message = 'Created'): void => {
  res.status(201).json({ success: true, message, data });
};

export const legacyOk = (res: Response, data: unknown = null, message = 'OK', status = 200): void => {
  res.status(status).json({ status: true, message, data });
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => { void fn(req, res, next).catch(next); };

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const err = error instanceof HttpError ? error : new HttpError(500, 'Internal server error');
  if (!(error instanceof HttpError)) console.error(error);
  res.status(err.status).json({ success: false, message: err.message, data: null, ...(err.code ? { code: err.code } : {}) });
}
