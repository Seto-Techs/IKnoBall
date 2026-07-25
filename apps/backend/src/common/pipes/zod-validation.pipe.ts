import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType } from '@iknoball/schema/zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.issues.map((err) => ({
          message: err.message,
          field: err.path.join('.'),
        }));

        throw new BadRequestException({
          message: 'Validation failed',
          errors: validationErrors,
        });
      }

      throw error;
    }
  }
}
