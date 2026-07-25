// import { ConsumeMessage } from 'amqplib';
import { RedisService } from './redis/redis.service';
// import { RabbitMQService } from './modules/rabbitmq/rabbitmq.service';
import { S3Service } from './s3/s3.service';
import { PrismaService } from './prisma/prisma.service';

// Resolve Prisma client at runtime to handle different environments (dev vs Docker)
// In Docker, generated folder is at project root, so we use process.cwd()


/**
 * Test Redis connection
 */
export async function testRedisConnection(
  redisService: RedisService,
): Promise<boolean> {
  try {
    // Ensure connection is established
    if (!redisService.isConnected()) {
      await redisService.connect();
    }
    const redisClient = redisService.getClient();
    const pingResult = await redisClient.ping();
    console.log(`Redis Ping: ${pingResult}`);
    return pingResult === 'PONG';
  } catch (error) {
    console.error('Redis: Connection test failed', error);
    return false;
  }
}

// /**
//  * Test RabbitMQ connection
//  */
// export async function testRabbitMQConnection(
//   rabbitMQService: RabbitMQService,
// ): Promise<boolean> {
//   const TEST_QUEUE_NAME = 'ocr_marketplace_test';
//   try {
//     // Ensure connection is established
//     if (!rabbitMQService.isConnected()) {
//       await rabbitMQService.connect();
//     }
//     const channel = rabbitMQService.getChannel();
//     await channel.assertQueue(TEST_QUEUE_NAME);
//     const sent = channel.sendToQueue(
//       TEST_QUEUE_NAME,
//       Buffer.from('Hello, world!'),
//     );

//     if (!sent) {
//       console.error('RabbitMQ: Failed to send message');
//       return false;
//     }

//     console.log('RabbitMQ: Message sent');

//     return new Promise<boolean>(async (resolve) => {
//       let messageReceived = false;
//       let consumerTag: string | null = null;

//       const consumeResult = await channel.consume(
//         TEST_QUEUE_NAME,
//         async (msg: ConsumeMessage | null) => {
//           if (msg) {
//             console.log(
//               `RabbitMQ: Message received: ${msg.content.toString()}`,
//             );
//             channel.ack(msg);
//             messageReceived = true;

//             // Clean up: cancel consumer and close channel
//             if (consumerTag) {
//               await channel.cancel(consumerTag);
//               console.log('RabbitMQ: Consumer cancelled');
//             }

//             // Delete test queue
//             try {
//               await channel.deleteQueue(TEST_QUEUE_NAME);
//               console.log('RabbitMQ: Test queue deleted');
//             } catch (err) {
//               console.error('RabbitMQ: Failed to delete test queue', err);
//             }

//             // Close channel
//             try {
//               await channel.close();
//               console.log('RabbitMQ: Channel closed');
//             } catch (err) {
//               console.error('RabbitMQ: Failed to close channel', err);
//             }

//             resolve(true);
//           }
//         },
//       );

//       consumerTag = consumeResult.consumerTag;

//       // Timeout after 5 seconds
//       setTimeout(async () => {
//         if (!messageReceived) {
//           console.error('RabbitMQ: Message consumption timeout');

//           // Clean up on timeout
//           if (consumerTag) {
//             try {
//               await channel.cancel(consumerTag);
//               await channel.deleteQueue(TEST_QUEUE_NAME);
//               await channel.close();
//             } catch (err) {
//               console.error('RabbitMQ: Cleanup error on timeout', err);
//             }
//           }

//           resolve(false);
//         }
//       }, 5000);
//     });
//   } catch (error) {
//     console.error('RabbitMQ: Connection test failed', error);
//     return false;
//   }
// }

/**
 * Test Database connection
 */
export async function testDBConnection(
  prismaService: PrismaService,
): Promise<boolean> {
  try {
    await prismaService.testConnection();
    console.log('DB: Connected');
    return true;
  } catch (error) {
    console.error('DB: Connection test failed', error);
    return false;
  }
}


/**
 * Test S3 connection
 */
export async function testS3Connection(s3Service: S3Service): Promise<boolean> {
  try {
    const file_key = 'test.txt';
    console.log('S3: Connected');

    // upload a file to s3
    const uploadResult = await s3Service.uploadFile({
      bucket: process.env.AWS_BUCKET || '',
      key: file_key,
      body: 'Hello, world!',
    });
    console.log('S3: File uploaded', uploadResult);

    // retrieve the file from s3
    const retrieveResult = await s3Service.getFile(file_key);
    console.log('S3: File retrieved', retrieveResult.body.toString());

    // delete the file from s3
    await s3Service.deleteFile(file_key);
    console.log('S3: File deleted');

    return true;
  } catch (error) {
    console.error('S3: Connection test failed', error);
    return false;
  }
}