import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class ContextService {
  private readonly als = new AsyncLocalStorage<Map<string, any>>();

  run(callback: () => void) {
    const store = new Map<string, any>();
    this.als.run(store, callback);
  }

  set(key: string, value: any) {
    const store = this.als.getStore();
    if (store) {
      store.set(key, value);
    }
  }

  get(key: string): any {
    const store = this.als.getStore();
    return store ? store.get(key) : undefined;
  }

  setUser(user: any) {
    this.set('user', user);
  }

  getUser(): any {
    return this.get('user');
  }
}
