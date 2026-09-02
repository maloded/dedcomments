import sharp from 'sharp';
import { ImageProcessingService } from './image-processing.service';
import { IMAGE_MAX_HEIGHT, IMAGE_MAX_WIDTH } from '../../../shared/constants';

const solid = (width: number, height: number): Promise<Buffer> =>
	sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 120, g: 40, b: 200 },
		},
	})
		.png()
		.toBuffer();

describe('ImageProcessingService', () => {
	const service = new ImageProcessingService();

	it('probe() reports width/height/format', async () => {
		const dims = await service.probe(await solid(123, 45));
		expect(dims).toEqual({ width: 123, height: 45, format: 'png' });
	});

	it('probe() rejects a non-image buffer', async () => {
		await expect(
			service.probe(Buffer.from('not an image')),
		).rejects.toThrow();
	});

	it('shrinks a large 4:3 image to exactly 320×240', async () => {
		const out = await service.resizeToFit(await solid(1600, 1200));
		const { width, height } = await sharp(out).metadata();
		expect(width).toBe(IMAGE_MAX_WIDTH);
		expect(height).toBe(IMAGE_MAX_HEIGHT);
	});

	it('keeps aspect ratio for a wide image (800×200 → 320×80)', async () => {
		const out = await service.resizeToFit(await solid(800, 200));
		const { width, height } = await sharp(out).metadata();
		expect(width).toBe(320);
		expect(height).toBe(80);
		expect(width / height).toBeCloseTo(800 / 200);
	});

	it('keeps aspect ratio for a tall image (200×800 → 60×240)', async () => {
		const out = await service.resizeToFit(await solid(200, 800));
		const { width, height } = await sharp(out).metadata();
		expect(width).toBe(60);
		expect(height).toBe(240);
	});

	it('never enlarges a small image', async () => {
		const out = await service.resizeToFit(await solid(100, 50));
		const { width, height } = await sharp(out).metadata();
		expect(width).toBe(100);
		expect(height).toBe(50);
	});

	it('always produces something that fits inside the box', async () => {
		for (const [w, h] of [
			[4000, 3000],
			[1000, 100],
			[100, 1000],
			[321, 241],
		]) {
			const out = await service.resizeToFit(await solid(w, h));
			const meta = await sharp(out).metadata();
			expect(meta.width).toBeLessThanOrEqual(IMAGE_MAX_WIDTH);
			expect(meta.height).toBeLessThanOrEqual(IMAGE_MAX_HEIGHT);
		}
	});
});
