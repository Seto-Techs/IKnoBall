import { ApiInternalServerErrorResponse } from '@nestjs/swagger';

export const problemDetailsSchema = {
  type: 'object',
  required: ['type', 'title', 'status', 'detail', 'instance'],
  properties: {
    type: { type: 'string', example: 'about:blank' },
    title: { type: 'string', example: 'Internal server error' },
    status: { type: 'integer', example: 500 },
    detail: { type: 'string', example: 'Internal server error' },
    instance: { type: 'string', example: '/' },
    errors: { type: 'array', items: {} },
  },
};

export const ApiInternalProblemResponse = () =>
  ApiInternalServerErrorResponse({
    description: 'Unexpected server error.',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  });
