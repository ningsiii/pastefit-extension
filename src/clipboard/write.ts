export type ClipboardWriteFailure = 'unsupported' | 'permission-denied' | 'write-failed';

export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}

export const browserClipboardWriter: ClipboardWriter = {
  async writeText(value: string): Promise<void> {
    if (!navigator.clipboard?.writeText) throw new Error('unsupported');
    await navigator.clipboard.writeText(value);
  }
};
