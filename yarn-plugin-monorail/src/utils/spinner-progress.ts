import { YELLOW } from './colors';

const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export default async function asyncTaskWithSpinner<T>(
  getMessage: (passedTime: string) => string,
  asyncTask: () => Promise<T>
): Promise<T> {
  if (!process.stderr.isTTY) return asyncTask();

  let iteration = 0;
  const startTime = new Date().getTime();
  const interval = setInterval(
    () => {
      const passedTime = `${((new Date().getTime() - startTime) / 1000).toFixed(1)}s`;
      const message = getMessage(passedTime);
      const frame = spinner[iteration % 10];
      process.stderr.write(YELLOW(`${message} ${frame}\r`));
      iteration += 1;
    },
    process.stderr.isTTY ? 40 : 1000
  );
  const result = await asyncTask();
  clearInterval(interval);
  return result;
}
