/** DI token for the RabbitMQ producer that enqueues image-resize jobs. */
export const ATTACHMENT_QUEUE_CLIENT = 'ATTACHMENT_QUEUE_CLIENT';

/** Message pattern for a "resize this image" job. */
export const ATTACHMENT_RESIZE_PATTERN = 'attachment.resize';
