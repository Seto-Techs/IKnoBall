import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListBucketsCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadFileOptions {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  public readonly base_url: string;

  constructor() {
    this.region = process.env.AWS_REGION!;
    this.base_url = process.env.AWS_BASE_URL!;
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
    this.bucket = process.env.AWS_BUCKET!;

    if (!this.accessKeyId || !this.secretAccessKey || !this.bucket) {
      this.logger.warn(
        'AWS credentials not found. S3 operations will fail until credentials are configured.',
      );
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
  }

  onModuleInit() {
    this.logger.log(`S3 Service initialized for region: ${this.region}`);
  }

  /**
   * Upload a file to S3
   * @param options Upload options
   * @returns The S3 object key
   */
  async uploadFile(options: UploadFileOptions): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        Metadata: options.metadata,
      });

      await this.s3Client.send(command);
      this.logger.log(`File uploaded successfully: ${options.key}`);
      return options.key;
    } catch (error) {
      this.logger.error(`Failed to upload file ${options.key}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve/download a file from S3
   * @param key S3 object key
   * @returns File content as Buffer along with metadata
   */
  async getFile(key: string): Promise<{
    body: Buffer;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
    etag?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      // Convert the stream to Buffer
      // AWS SDK v3 returns Body as a ReadableStream
      const chunks: Uint8Array[] = [];
      if (response.Body) {
        // Handle both ReadableStream and Blob-like objects
        const stream = response.Body as any;
        if (typeof stream.transformToByteArray === 'function') {
          // Blob-like object (browser)
          const arrayBuffer = await stream.transformToByteArray();
          chunks.push(new Uint8Array(arrayBuffer));
        } else if (stream[Symbol.asyncIterator]) {
          // Async iterable stream (Node.js)
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
        } else if (stream.on) {
          // Node.js Readable stream
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            const bufs: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => bufs.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(bufs)));
            stream.on('error', reject);
          });
          return {
            body: buffer,
            contentType: response.ContentType,
            contentLength: response.ContentLength,
            lastModified: response.LastModified,
            metadata: response.Metadata,
            etag: response.ETag,
          };
        }
      }
      const body = Buffer.concat(chunks);

      this.logger.log(`File retrieved successfully: ${key}`);
      return {
        body,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve file ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a presigned URL for downloading a file
   * @param options Presigned URL options
   * @returns Presigned URL string
   */
  async getPresignedUrl(key: string, expiresIn?: number): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const expiresInValue = expiresIn || 3600; // Default 1 hour

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInValue,
      });

      this.logger.log(`Presigned URL generated for: ${key}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a presigned URL for uploading a file
   * @param options Presigned URL options
   * @param contentType Content type of the file
   * @param expiresIn Expires in seconds, default 3600 (1 hour)
   * @returns Presigned URL string
   */
  async getPresignedUploadUrl(
    key: string,
    contentType?: string,
    expiresIn?: number,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const expiresInValue = expiresIn || 3600; // Default 1 hour

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInValue,
      });

      this.logger.log(`Presigned upload URL generated for: ${key}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param key S3 object key
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if a file exists in S3
   * @param key S3 object key
   * @returns true if file exists, false otherwise
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.logger.error(`Error checking file existence for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   * @param key S3 object key
   * @returns File metadata
   */
  async getFileMetadata(key: string) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag,
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata for ${key}:`, error);
      throw error;
    }
  }

  async listBuckets(): Promise<ListBucketsCommandOutput> {
    const command = new ListBucketsCommand({});
    return await this.s3Client.send(command);
  }
}
