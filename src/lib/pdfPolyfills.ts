// Reservlösningar för webbläsarfunktioner som pdf.js använder men som äldre Safari saknar.
// Varje block gör ingenting om funktionen redan finns.
type Resolvers<T> = { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };

const promiseCtor = Promise as unknown as {
  withResolvers?: <T>() => Resolvers<T>;
  try?: <T>(fn: () => T | PromiseLike<T>) => Promise<T>;
};

if (typeof promiseCtor.withResolvers !== "function") {
  promiseCtor.withResolvers = function withResolvers<T>(): Resolvers<T> {
    let resolve!: Resolvers<T>["resolve"];
    let reject!: Resolvers<T>["reject"];
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof promiseCtor.try !== "function") {
  promiseCtor.try = function promiseTry<T>(fn: () => T | PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn()));
  };
}

// Safari kan inte loopa över en ReadableStream med `for await` (pdf.js gör det när den läser sidtext).
if (typeof ReadableStream !== "undefined") {
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  if (typeof proto[Symbol.asyncIterator] !== "function") {
    const iterate = async function* (this: ReadableStream<unknown>, options?: { preventCancel?: boolean }) {
      const reader = this.getReader();
      let finished = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            finished = true;
            return;
          }
          yield value;
        }
      } finally {
        if (!finished && !options?.preventCancel) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    };
    proto.values = iterate;
    proto[Symbol.asyncIterator] = iterate;
  }
}

export {};
