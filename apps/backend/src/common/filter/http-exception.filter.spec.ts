import { BadRequestException, HttpStatus, LoggerService } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from './http-exception.filter';

function testFilter() {
  const reply = vi.fn();
  const setHeader = vi.fn();
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
  const filter = new HttpExceptionFilter(
    {
      httpAdapter: {
        getRequestUrl: vi.fn().mockReturnValue('/players'),
        isHeadersSent: vi.fn().mockReturnValue(false),
        reply,
        setHeader,
      },
    } as unknown as HttpAdapterHost,
    logger,
  );
  const host = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  };

  return { filter, host, reply, setHeader, logger };
}

describe('HttpExceptionFilter', () => {
  it('returns error responses in the standard format', () => {
    const { filter, host, reply } = testFilter();
    filter.catch(
      new BadRequestException({
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Invalid email address' }],
      }),
      host as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        is_success: false,
        message: 'Validation failed',
        data: null,
      },
      HttpStatus.BAD_REQUEST,
    );
  });

  it('does not expose unexpected error details but logs them server-side', () => {
    const { filter, host, reply, logger } = testFilter();
    filter.catch(new Error('postgres://user:secret@database'), host as never);
    expect(logger.error).toHaveBeenCalledOnce();

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        is_success: false,
        message: 'Internal server error',
        data: null,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
