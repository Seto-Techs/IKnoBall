import { HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiDataResponse(
  type: Type<unknown>,
  status: HttpStatus,
  message: string,
  description: string,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiExtraModels(type)(target, propertyKey, descriptor);
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['status', 'message', 'data', 'meta'],
        properties: {
          status: { type: 'integer', example: status },
          message: { type: 'string', example: message },
          data: { $ref: getSchemaPath(type), nullable: true },
          meta: { type: 'object', additionalProperties: true, nullable: true },
        },
      },
    })(target, propertyKey, descriptor);
  };
}
