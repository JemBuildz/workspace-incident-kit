import { parseHarText } from '../lib/har';

const workerScope = self as unknown as Worker;

workerScope.onmessage = (event: MessageEvent<string>) => {
  try {
    const entries = parseHarText(event.data);
    workerScope.postMessage({ ok: true, entries });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to read this HAR file.',
    });
  }
};
