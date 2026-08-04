import { HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiDataResponse(
  type: Type<unknown>,
  status: HttpStatus,
  message: string,
  description: string,
  isArray = false,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiExtraModels(type)(target, propertyKey, descriptor);
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['is_success', 'message', 'data'],
        properties: {
          is_success: { type: 'boolean', example: status < 400 },
          message: { type: 'string', example: message },
          data: isArray
            ? { type: 'array', items: { $ref: getSchemaPath(type) } }
            : { $ref: getSchemaPath(type), nullable: true },
        },
      },
    })(target, propertyKey, descriptor);
  };
}
