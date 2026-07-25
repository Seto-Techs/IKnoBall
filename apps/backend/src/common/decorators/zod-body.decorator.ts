import { Body } from '@nestjs/common';
import { DECORATORS } from '@nestjs/swagger';
import { z } from '@iknoball/schema/zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export function ZodBody(schema: z.ZodType): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Body(new ZodValidationPipe(schema))(target, propertyKey, parameterIndex);

    if (!propertyKey) return;

    const method = target[propertyKey];
    const parameters: unknown[] = Reflect.getMetadata(DECORATORS.API_PARAMETERS, method) ?? [];

    Reflect.defineMetadata(
      DECORATORS.API_PARAMETERS,
      [
        ...parameters,
        {
          in: 'body',
          name: 'body',
          required: true,
          type: String,
          schema: z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0' }),
        },
      ],
      method,
    );
  };
}
