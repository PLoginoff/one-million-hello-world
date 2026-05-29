import express, { Request, Response } from 'express';
import 'reflect-metadata';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Hello World',
    timestamp: new Date().toISOString(),
    layers: 25
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Hello World endpoint: http://localhost:${PORT}`);
});
