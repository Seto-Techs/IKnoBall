import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns the health contract', () => {
    const controller = new AppController({ getHello: () => 'Hello World!' });
    expect(controller.getHello()).toEqual({
      is_success: true,
      message: 'Service is healthy.',
      data: { status: 'ok' },
    });
  });
});
