import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { IMAGE_MAX_HEIGHT, IMAGE_MAX_WIDTH } from '../../../shared/constants';

export interface ImageDimensions {
	width: number;
	height: number;
	format: string;
}

/**
 * Thin `sharp` wrapper — kept separate from `AttachmentsService` so the resize
 * logic is unit-testable without RabbitMQ or the DB.
 */
@Injectable()
export class ImageProcessingService {
	/** Decode the image just enough to read its size/format; throws if it isn't one. */
	public async probe(data: Buffer): Promise<ImageDimensions> {
		const meta = await sharp(data).metadata();
		if (!meta.width || !meta.height || !meta.format) {
			throw new Error('buffer is not a decodable image');
		}
		return { width: meta.width, height: meta.height, format: meta.format };
	}

	/**
	 * Resize **proportionally** so the image fits inside
	 * `IMAGE_MAX_WIDTH × IMAGE_MAX_HEIGHT`. Smaller images are left untouched
	 * (`withoutEnlargement`). Aspect ratio is always preserved (`fit: 'inside'`).
	 */
	public async resizeToFit(data: Buffer): Promise<Buffer> {
		return sharp(data)
			.rotate() // honour EXIF orientation before resizing
			.resize(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.toBuffer();
	}
}
