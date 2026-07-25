import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { loginSchema, type LoginInput } from '@iknoball/schema/auth';
import { ZodBody } from './zod-body.decorator';

@Controller('zod-body-test')
class ZodBodyTestController {
  @Post()
  create(@ZodBody(loginSchema) body: LoginInput) {
    return body;
  }
}

@Module({ controllers: [ZodBodyTestController] })
class ZodBodyTestModule {}

describe('ZodBody', () => {
  it('validates and documents the Zod schema', async () => {
    const module = await Test.createTestingModule({ imports: [ZodBodyTestModule] }).compile();
    const app = module.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(app, {});
    expect(document.paths['/zod-body-test'].post.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { format: 'email' },
              password: { minLength: 1 },
            },
          },
        },
      },
    });

    await app.close();
  });
});
