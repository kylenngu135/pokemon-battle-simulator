import { initCache } from '../cache';
import { httpServer } from '../index';

beforeAll(async () => {
  await initCache();
  await new Promise<void>((resolve) => {
    httpServer.listen(3001, () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});
