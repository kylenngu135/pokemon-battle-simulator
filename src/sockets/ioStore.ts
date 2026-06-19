import { Server } from 'socket.io';

let _io: Server | null = null;

export const setIo = (instance: Server): void => {
    _io = instance;
};

export const getIo = (): Server => {
    if (!_io) throw new Error('Socket.IO server not initialized');
    return _io;
};
