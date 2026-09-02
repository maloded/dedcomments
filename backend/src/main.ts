import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	const config = app.get(ConfigService);

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

	const port = config.get<number>('APP_PORT') ?? 4000;
	await app.listen(port);

	console.log(`🚀 Backend ready at http://localhost:${port}/graphql`);
}

void bootstrap();
