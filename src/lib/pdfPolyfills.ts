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

export {};
