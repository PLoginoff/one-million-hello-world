import express, { Request, Response } from 'express';
import 'reflect-metadata';
import { CompositionRoot } from './application/CompositionRoot';
import { Pipeline } from './application/Pipeline';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const composition = new CompositionRoot();
const pipeline = new Pipeline(composition);

app.use(pipeline.middleware());

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Hello World endpoint: http://localhost:${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);
  console.log(`Architecture: 85+ layers, deep clean architecture`);
});
