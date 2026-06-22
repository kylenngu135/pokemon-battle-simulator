import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import { app } from './app';
import { initCache } from './cache';
import { initDatabase } from './db/database';
import { registerBattleSocketHandlers } from './sockets/battle.socket';
import { setIo } from './sockets/ioStore';

const PORT = parseInt(process.env.PORT || '3000', 10);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? 'http://localhost:3001',
        methods: ['GET', 'POST'],
    },
});

setIo(io);
registerBattleSocketHandlers(io);

const init = async (): Promise<void> => {
    initDatabase();
    try {
        await initCache();
    } catch (err) {
        console.error('Cache initialization failed, starting server without cache:', err);
    }
};

if (process.env.NODE_ENV !== 'test') {
    init().then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`API docs at http://localhost:${PORT}/api-docs`);
        });
    });
}

export { httpServer };
