/**
 * Generic typed EventEmitter utility
 * Provides type-safe event handling for services
 */

import { EventEmitter } from 'events';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A generic typed EventEmitter that provides type-safe on/off/emit methods
 *
 * Usage:
 * ```typescript
 * interface MyEvents {
 *   'data': (value: string) => void;
 *   'error': (err: Error) => void;
 * }
 *
 * class MyService extends TypedEventEmitter<MyEvents> {
 *   doSomething() {
 *     this.emit('data', 'hello'); // Type-safe!
 *   }
 * }
 * ```
 */
export class TypedEventEmitter<
  T extends { [K in keyof T]: (...args: any[]) => void }
> extends EventEmitter {
  on<K extends keyof T & string>(event: K, listener: T[K]): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  off<K extends keyof T & string>(event: K, listener: T[K]): this {
    return super.off(event, listener as (...args: any[]) => void);
  }

  emit<K extends keyof T & string>(event: K, ...args: Parameters<T[K]>): boolean {
    return super.emit(event, ...args);
  }
}
