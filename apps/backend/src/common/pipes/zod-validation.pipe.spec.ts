import { BadRequestException } from '@nestjs/common';
import { loginSchema } from '@iknoball/schema/auth';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it('returns parsed input', () => {
    expect(pipe.transform({ email: 'user@example.com', password: 'secret' })).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });

  it('maps Zod issues to a bad request', () => {
    try {
      pipe.transform({ email: 'invalid', password: '' });
      fail('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'Validation failed',
        errors: [
          { field: 'email', message: 'Invalid email address' },
          { field: 'password', message: 'Too small: expected string to have >=1 characters' },
        ],
      });
    }
  });
});
