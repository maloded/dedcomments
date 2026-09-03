import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { Attachment } from '@prisma/client';

import { PrismaService } from '../../core/prisma/prisma.service';
import {
	ALLOWED_IMAGE_EXTENSIONS,
	ALLOWED_IMAGE_MIME_TYPES,
	ALLOWED_TEXT_EXTENSIONS,
	ALLOWED_TEXT_MIME_TYPES,
	MAX_UPLOAD_BYTES,
	TEXT_FILE_MAX_BYTES,
} from '../../shared/constants';
import { AttachmentType } from './enums/attachment-type.enum';
import {
	ATTACHMENT_QUEUE_CLIENT,
	ATTACHMENT_RESIZE_PATTERN,
} from './attachments.constants';
import { AttachmentStorageService } from './storage/attachment-storage.service';
import { ImageProcessingService } from './image/image-processing.service';
import type { UploadAttachmentInput } from './inputs/upload-attachment.input';
import type { AttachmentModel } from './models/attachment.model';

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

type ImageFormat = 'jpeg' | 'png' | 'gif';

/** Detect the real image format from the file's magic bytes (defeats a spoofed MIME type). */
function sniffImageFormat(buffer: Buffer): ImageFormat | null {
	if (buffer.length < 12) {
		return null;
	}
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'jpeg';
	}
	if (
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	) {
		return 'png';
	}
	const header = buffer.toString('latin1', 0, 6);
	if (header === 'GIF87a' || header === 'GIF89a') {
		return 'gif';
	}
	return null;
}

function isValidUtf8(buffer: Buffer): boolean {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(buffer);
		return true;
	} catch {
		return false;
	}
}

@Injectable()
export class AttachmentsService {
	private readonly logger = new Logger(AttachmentsService.name);

	public constructor(
		private readonly prismaService: PrismaService,
		private readonly storageService: AttachmentStorageService,
		private readonly imageProcessingService: ImageProcessingService,
		@Inject(ATTACHMENT_QUEUE_CLIENT)
		private readonly queueClient: ClientProxy,
	) {}

	/**
	 * Accept an upload, validate it against the brief's rules, store it, and:
	 *   - image → create an unprocessed row + enqueue a resize job (async)
	 *   - text  → validate size synchronously, store, mark processed immediately
	 * The returned attachment is not linked to any comment yet — the frontend
	 * passes its id to `createComment(attachmentId:)`.
	 */
	public async upload(
		input: UploadAttachmentInput,
	): Promise<AttachmentModel> {
		const buffer = AttachmentsService.decodeBase64(input.data);
		const ext = extname(input.filename).toLowerCase();
		const mime = input.mimeType.trim().toLowerCase();

		if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
			return this.uploadImage(buffer, ext, input.filename);
		}
		if ((ALLOWED_TEXT_MIME_TYPES as readonly string[]).includes(mime)) {
			return this.uploadText(buffer, ext, input.filename);
		}
		throw new BadRequestException(
			`Unsupported file type "${input.mimeType}". Allowed: JPG / GIF / PNG images, or a .txt file.`,
		);
	}

	/**
	 * Look up one attachment by id, linked or not. Exists so the frontend can
	 * poll `processedAt` on a just-uploaded (not-yet-linked) image while the
	 * RabbitMQ consumer resizes it — `commentThread`'s `attachment` field only
	 * becomes reachable once the attachment is linked to a comment, which is
	 * too late for that pre-submit polling case.
	 */
	public async findById(id: string): Promise<AttachmentModel> {
		const attachment = await this.prismaService.attachment.findUnique({
			where: { id },
		});
		if (!attachment) {
			throw new NotFoundException(`Attachment "${id}" was not found.`);
		}
		return AttachmentsService.toModel(attachment);
	}

	/** Called by the RabbitMQ consumer for image attachments. */
	public async processImage(attachmentId: string): Promise<void> {
		const attachment = await this.prismaService.attachment.findUnique({
			where: { id: attachmentId },
		});
		if (!attachment) {
			this.logger.warn(
				`resize: attachment "${attachmentId}" no longer exists — skipping`,
			);
			return;
		}
		if (attachment.type !== AttachmentType.IMAGE) {
			return;
		}

		const path = this.storageService.pathForUrl(attachment.url);
		const original = await this.storageService.read(path);
		const resized = await this.imageProcessingService.resizeToFit(original);
		await this.storageService.overwrite(path, resized);

		await this.prismaService.attachment.update({
			where: { id: attachmentId },
			data: { processedAt: new Date(), size: resized.length },
		});

		this.logger.log(
			`resize: ${attachmentId} ${original.length}B → ${resized.length}B`,
		);
	}

	// ─── internals ──────────────────────────────────────────────────────────

	private async uploadImage(
		buffer: Buffer,
		ext: string,
		filename: string,
	): Promise<AttachmentModel> {
		if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
			throw new BadRequestException(
				`Image files must be ${ALLOWED_IMAGE_EXTENSIONS.join(' / ')} — got "${ext || 'no extension'}".`,
			);
		}

		const format = sniffImageFormat(buffer);
		if (!format) {
			throw new BadRequestException(
				'The uploaded data is not a valid JPG, PNG or GIF image.',
			);
		}
		try {
			await this.imageProcessingService.probe(buffer);
		} catch {
			throw new BadRequestException('The image could not be decoded.');
		}

		const id = randomUUID();
		const storedExt = format === 'jpeg' ? '.jpg' : `.${format}`;
		const { url } = await this.storageService.save(id, storedExt, buffer);

		const attachment = await this.prismaService.attachment.create({
			data: {
				id,
				type: AttachmentType.IMAGE,
				url,
				originalName: filename,
				size: buffer.length,
				processedAt: null,
			},
		});

		// fire-and-forget: resize happens on the queue, not in this request
		this.queueClient.emit(ATTACHMENT_RESIZE_PATTERN, { attachmentId: id });

		return AttachmentsService.toModel(attachment);
	}

	private async uploadText(
		buffer: Buffer,
		ext: string,
		filename: string,
	): Promise<AttachmentModel> {
		if (!(ALLOWED_TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
			throw new BadRequestException(
				`Text files must have a .txt extension — got "${ext || 'no extension'}".`,
			);
		}
		if (buffer.length > TEXT_FILE_MAX_BYTES) {
			throw new BadRequestException(
				`Text file is ${(buffer.length / 1024).toFixed(1)} KB — the limit is 100 KB.`,
			);
		}
		if (buffer.includes(0) || !isValidUtf8(buffer)) {
			throw new BadRequestException(
				'The file does not look like plain UTF-8 text.',
			);
		}

		const id = randomUUID();
		const { url } = await this.storageService.save(id, '.txt', buffer);

		const attachment = await this.prismaService.attachment.create({
			data: {
				id,
				type: AttachmentType.TEXT,
				url,
				originalName: filename,
				size: buffer.length,
				// nothing to process for text — mark it done now
				processedAt: new Date(),
			},
		});

		return AttachmentsService.toModel(attachment);
	}

	private static decodeBase64(input: string): Buffer {
		let base64 = input.trim();
		if (base64.startsWith('data:')) {
			const comma = base64.indexOf(',');
			if (comma === -1) {
				throw new BadRequestException('Malformed data: URL.');
			}
			base64 = base64.slice(comma + 1);
		}
		base64 = base64.replace(/\s/g, '');

		if (!BASE64_RE.test(base64)) {
			throw new BadRequestException('`data` is not valid base64.');
		}

		const buffer = Buffer.from(base64, 'base64');
		if (buffer.length === 0) {
			throw new BadRequestException('The uploaded file is empty.');
		}
		if (buffer.length > MAX_UPLOAD_BYTES) {
			throw new BadRequestException(
				`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.`,
			);
		}
		return buffer;
	}

	private static toModel(attachment: Attachment): AttachmentModel {
		return {
			id: attachment.id,
			type: attachment.type,
			url: attachment.url,
			originalName: attachment.originalName,
			size: attachment.size,
			processedAt: attachment.processedAt,
		};
	}
}
