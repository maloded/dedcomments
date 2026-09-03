import { BadRequestException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import sharp from 'sharp';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AttachmentStorageService } from './storage/attachment-storage.service';
import { ATTACHMENT_RESIZE_PATTERN } from './attachments.constants';
import { AttachmentType } from './enums/attachment-type.enum';
import type { UploadAttachmentInput } from './inputs/upload-attachment.input';

const b64 = (buf: Buffer | string): string =>
	Buffer.from(buf).toString('base64');

const input = (
	over: Partial<UploadAttachmentInput> & Pick<UploadAttachmentInput, 'data'>,
): UploadAttachmentInput => ({
	filename: 'file.png',
	mimeType: 'image/png',
	...over,
});

describe('AttachmentsService', () => {
	let pngBytes: Buffer;

	let prisma: {
		attachment: {
			create: jest.Mock;
			findUnique: jest.Mock;
			update: jest.Mock;
		};
	};
	let storage: {
		save: jest.Mock;
		read: jest.Mock;
		overwrite: jest.Mock;
		pathForUrl: jest.Mock;
	};
	let imageProcessing: { probe: jest.Mock; resizeToFit: jest.Mock };
	let queue: { emit: jest.Mock };
	let service: AttachmentsService;

	beforeAll(async () => {
		pngBytes = await sharp({
			create: {
				width: 400,
				height: 300,
				channels: 3,
				background: { r: 1, g: 2, b: 3 },
			},
		})
			.png()
			.toBuffer();
	});

	beforeEach(() => {
		prisma = {
			attachment: {
				create: jest.fn(data =>
					Promise.resolve({
						commentId: null,
						createdAt: new Date(),
						...(data as { data: object }).data,
					}),
				),
				findUnique: jest.fn(),
				update: jest.fn().mockResolvedValue({}),
			},
		};
		storage = {
			save: jest.fn().mockResolvedValue({
				url: '/uploads/x.png',
				path: '/tmp/x.png',
			}),
			read: jest.fn(),
			overwrite: jest.fn().mockResolvedValue(undefined),
			pathForUrl: jest.fn((url: string) => `/tmp/${url}`),
		};
		imageProcessing = {
			probe: jest
				.fn()
				.mockResolvedValue({ width: 400, height: 300, format: 'png' }),
			resizeToFit: jest.fn(),
		};
		queue = { emit: jest.fn() };

		service = new AttachmentsService(
			prisma as unknown as PrismaService,
			storage as unknown as AttachmentStorageService,
			imageProcessing,
			queue as unknown as ClientProxy,
		);
	});

	describe('upload — images', () => {
		it('stores a PNG, creates an unprocessed row and enqueues a resize job', async () => {
			const result = await service.upload(
				input({ filename: 'pic.png', data: b64(pngBytes) }),
			);

			expect(storage.save).toHaveBeenCalled();
			expect(prisma.attachment.create).toHaveBeenCalled();
			const [created] = prisma.attachment.create.mock.calls.at(0) as [
				{ data: { type: string; processedAt: Date | null } },
			];
			expect(created.data.type).toBe(AttachmentType.IMAGE);
			expect(created.data.processedAt).toBeNull();
			expect(queue.emit).toHaveBeenCalledWith(ATTACHMENT_RESIZE_PATTERN, {
				attachmentId: result.id,
			});
			expect(result.processedAt).toBeNull();
		});

		it('rejects a disallowed image extension', async () => {
			await expect(
				service.upload(
					input({ filename: 'pic.bmp', data: b64(pngBytes) }),
				),
			).rejects.toThrow(/Image files must be/);
			expect(queue.emit).not.toHaveBeenCalled();
		});

		it('rejects content that is not really an image (spoofed MIME)', async () => {
			await expect(
				service.upload(
					input({
						filename: 'evil.png',
						mimeType: 'image/png',
						data: b64('<html>not a png</html>'),
					}),
				),
			).rejects.toThrow(/not a valid JPG, PNG or GIF/);
		});
	});

	describe('upload — text', () => {
		it('stores a small .txt and marks it processed immediately (no queue)', async () => {
			const result = await service.upload(
				input({
					filename: 'note.txt',
					mimeType: 'text/plain',
					data: b64('hello world'),
				}),
			);

			expect(result.type).toBe(AttachmentType.TEXT);
			expect(result.processedAt).toBeInstanceOf(Date);
			expect(queue.emit).not.toHaveBeenCalled();
		});

		it('rejects a .txt over 100 KB', async () => {
			await expect(
				service.upload(
					input({
						filename: 'big.txt',
						mimeType: 'text/plain',
						data: b64(Buffer.alloc(100 * 1024 + 1, 0x41)),
					}),
				),
			).rejects.toThrow(/limit is 100 KB/);
		});

		it('rejects a non-.txt extension', async () => {
			await expect(
				service.upload(
					input({
						filename: 'notes.md',
						mimeType: 'text/plain',
						data: b64('# hi'),
					}),
				),
			).rejects.toThrow(/must have a .txt extension/);
		});

		it('rejects binary content masquerading as text', async () => {
			await expect(
				service.upload(
					input({
						filename: 'x.txt',
						mimeType: 'text/plain',
						data: b64(Buffer.from([0x68, 0x69, 0x00, 0xff])),
					}),
				),
			).rejects.toThrow(/plain UTF-8 text/);
		});
	});

	describe('upload — other', () => {
		it('rejects an unsupported MIME type', async () => {
			await expect(
				service.upload(
					input({
						filename: 'doc.pdf',
						mimeType: 'application/pdf',
						data: b64('%PDF-1.7'),
					}),
				),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('rejects invalid base64', async () => {
			await expect(
				service.upload(
					input({ filename: 'a.png', data: 'not @@@ base64 !!!' }),
				),
			).rejects.toThrow(/not valid base64/);
		});
	});

	describe('processImage', () => {
		it('resizes the stored file and stamps processedAt + new size', async () => {
			prisma.attachment.findUnique.mockResolvedValue({
				id: 'att-1',
				type: AttachmentType.IMAGE,
				url: '/uploads/att-1.png',
			});
			storage.read.mockResolvedValue(pngBytes);
			imageProcessing.resizeToFit.mockResolvedValue(Buffer.alloc(500));

			await service.processImage('att-1');

			expect(imageProcessing.resizeToFit).toHaveBeenCalledWith(pngBytes);
			expect(storage.overwrite).toHaveBeenCalledWith(
				'/tmp//uploads/att-1.png',
				expect.any(Buffer),
			);
			const [update] = prisma.attachment.update.mock.calls.at(0) as [
				{ data: { processedAt: Date; size: number } },
			];
			expect(update.data.processedAt).toBeInstanceOf(Date);
			expect(update.data.size).toBe(500);
		});

		it('is a no-op when the attachment has been deleted', async () => {
			prisma.attachment.findUnique.mockResolvedValue(null);
			await expect(service.processImage('gone')).resolves.toBeUndefined();
			expect(imageProcessing.resizeToFit).not.toHaveBeenCalled();
		});
	});

	describe('findById', () => {
		it('returns the attachment, linked or not', async () => {
			prisma.attachment.findUnique.mockResolvedValue({
				id: 'att-1',
				type: AttachmentType.IMAGE,
				url: '/uploads/att-1.png',
				originalName: 'photo.png',
				size: 123,
				processedAt: null,
			});

			const result = await service.findById('att-1');

			expect(prisma.attachment.findUnique).toHaveBeenCalledWith({
				where: { id: 'att-1' },
			});
			expect(result).toEqual({
				id: 'att-1',
				type: AttachmentType.IMAGE,
				url: '/uploads/att-1.png',
				originalName: 'photo.png',
				size: 123,
				processedAt: null,
			});
		});

		it('404s for an unknown id', async () => {
			prisma.attachment.findUnique.mockResolvedValue(null);
			await expect(service.findById('nope')).rejects.toThrow(
				/was not found/,
			);
		});
	});
});
