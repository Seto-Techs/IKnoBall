import { HttpException, HttpStatus } from '@nestjs/common';

export class AppHttpException extends HttpException {
  payload: any;

  constructor(message: string, payload: any = null, status: HttpStatus = 400) {
    super({ message, payload }, status); // object di super supaya bisa di serialize
    this.payload = payload;
  }
}
