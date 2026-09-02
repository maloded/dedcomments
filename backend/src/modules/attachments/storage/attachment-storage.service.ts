import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Public URL prefix under which uploaded files are served (see main.ts). */
export const UPLOADS_URL_PREFIX = '/uploads/';

/**
 * Local-disk storage for attachment files. One flat directory, files named
 * `<attachmentId><ext>`. Simple on purpose — swap for S3 later without touching
 * the service/consumer.
 */
@Injectable()
export class AttachmentStorageService implements OnModuleInit {
	private readonly baseDir: string;

	public constructor(configService: ConfigService) {
		this.baseDir = resolve(
			process.cwd(),
			configService.get<string>('UPLOADS_DIR') ?? 'uploads',
		);
	}

	public async onModuleInit(): Promise<void> {
		await mkdir(this.baseDir, { recursive: true });
	}

	public get directory(): string {
		return this.baseDir;
	}

	public urlFor(attachmentId: string, ext: string): string {
		return `${UPLOADS_URL_PREFIX}${attachmentId}${ext}`;
	}

	/** Map a stored `url` (`/uploads/x.png`) back to an absolute disk path. */
	public pathForUrl(url: string): string {
		return join(this.baseDir, basename(url));
	}

	public async save(
		attachmentId: string,
		ext: string,
		data: Buffer,
	): Promise<{ url: string; path: string }> {
		const url = this.urlFor(attachmentId, ext);
		const path = this.pathForUrl(url);
		await writeFile(path, data);
		return { url, path };
	}

	public async read(path: string): Promise<Buffer> {
		return readFile(path);
	}

	public async overwrite(path: string, data: Buffer): Promise<void> {
		await writeFile(path, data);
	}
}
