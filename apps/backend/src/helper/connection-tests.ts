import { RedisService } from './redis/redis.service';
import { S3Service } from './s3/s3.service';
import { DatabaseService } from './database/database.service';

export async function testRedisConnection(redisService: RedisService): Promise<boolean> {
  try {
    if (!redisService.isConnected()) await redisService.connect();
    const pingResult = await redisService.getClient().ping();
    console.log(`Redis Ping: ${pingResult}`);
    return pingResult === 'PONG';
  } catch (error) {
    console.error('Redis: Connection test failed', error);
    return false;
  }
}

export async function testDBConnection(databaseService: DatabaseService): Promise<boolean> {
  try {
    await databaseService.testConnection();
    console.log('DB: Connected');
    return true;
  } catch (error) {
    console.error('DB: Connection test failed', error);
    return false;
  }
}

export async function testS3Connection(s3Service: S3Service): Promise<boolean> {
  try {
    const key = 'test.txt';
    console.log('S3: Connected');
    const uploadResult = await s3Service.uploadFile({
      bucket: process.env.AWS_BUCKET || '',
      key,
      body: 'Hello, world!',
    });
    console.log('S3: File uploaded', uploadResult);
    const retrieveResult = await s3Service.getFile(key);
    console.log('S3: File retrieved', retrieveResult.body.toString());
    await s3Service.deleteFile(key);
    console.log('S3: File deleted');
    return true;
  } catch (error) {
    console.error('S3: Connection test failed', error);
    return false;
  }
}
