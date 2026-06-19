import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import cors from 'cors';
import YAML from 'yaml';

import { routes } from './routes';

const app = express();

// Application-level middleware
app.use(
    cors({
        origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? 'http://localhost:3001',
    })
);
app.use(express.json());


const specFile = fs.readFileSync('./openapi.yaml', 'utf8');
const spec = YAML.parse(specFile);
app.get('/openapi.json', (_request: Request, response: Response) => {
    response.json(spec);
});

app.use(routes);

// 404 handler — must be after all routes
app.use((_request: Request, response: Response) => {
    response.status(404).json({ error: 'Route not found' });
});

// Global error handler — catches next(err) from any middleware
app.use(
    (
        err: Error & { type?: string; status?: number },
        _request: Request,
        response: Response,
        _next: NextFunction
    ) => {
        if (err.type === 'entity.parse.failed' || err.status === 400) {
            response.status(400).json({ error: 'Invalid JSON in request body' });
            return;
        }
        console.error(err);
        response.status(500).json({ error: 'Internal server error' });
    }
);

export { app };
