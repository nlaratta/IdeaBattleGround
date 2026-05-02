export function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const launch = () => {
        active++;
        fn().then(
          (v) => { resolve(v); next(); },
          (e) => { reject(e); next(); },
        );
      };
      if (active < concurrency) launch();
      else queue.push(launch);
    });
  };
}

export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const lim = pLimit(limit);
  return Promise.all(items.map((item, idx) => lim(() => fn(item, idx))));
}
