import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HTTP_BODY_LIMIT } from './shared/constants';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

	const config = app.get(ConfigService);

	// Attachment uploads arrive base64-encoded in the GraphQL body, so the JSON
	// body limit has to be well above Express's 100 KB default.
	app.useBodyParser('json', { limit: HTTP_BODY_LIMIT });

	// Client + server validation is required by the brief; class-validator on the
	// GraphQL @InputType classes runs through this pipe.
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);

	app.enableCors({
		origin: config.get<string>('ALLOWED_ORIGIN') ?? true,
		credentials: true,
	});

	// Serve uploaded attachment files read-only at /uploads/*
	const uploadsDir = resolve(
		process.cwd(),
		config.get<string>('UPLOADS_DIR') ?? 'uploads',
	);
	await mkdir(uploadsDir, { recursive: true });
	app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

	// Same process also consumes the image-resize queue (monolith).
	app.connectMicroservice<MicroserviceOptions>(
		{
			transport: Transport.RMQ,
			options: {
				urls: [config.getOrThrow<string>('RABBITMQ_URL')],
				queue: config.getOrThrow<string>('RABBITMQ_ATTACHMENTS_QUEUE'),
				queueOptions: { durable: true },
				noAck: false,
			},
		},
		{ inheritAppConfig: true },
	);
	await app.startAllMicroservices();

	const port = config.get<number>('APP_PORT') ?? 4000;
	await app.listen(port);

	console.log(`🚀 Backend ready at http://localhost:${port}/graphql`);
}

void bootstrap();
