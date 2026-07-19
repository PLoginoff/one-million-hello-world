import express from 'express';
import 'reflect-metadata';
import { CompositionRoot } from './application/CompositionRoot';
import { Pipeline } from './application/Pipeline';

const app = express();
const portValue = process.env.PORT;
const PORT = portValue != null && portValue !== '' ? portValue : 3000;

app.use(express.json());

const composition = new CompositionRoot();
const pipeline = new Pipeline(composition);

app.use((req, res, next): void => {
  void pipeline.middleware()(req, res, next);
});

app.listen(PORT, () => {
  console.warn(`Server is running on port ${PORT}`);
  console.warn(`Hello World endpoint: http://localhost:${PORT}`);
  console.warn(`Health endpoint: http://localhost:${PORT}/health`);
  console.warn(`Architecture: 85+ layers, deep clean architecture`);
});
