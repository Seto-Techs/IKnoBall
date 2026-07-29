import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { apiReference } from '@scalar/nestjs-api-reference';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('IKnoBall API')
    .setDescription('IKnoBall backend REST API')
    .setVersion('1.0')
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  // Serve Scalar API reference UI at /docs
  app.use(
    '/docs',
    apiReference({
      content: document,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
