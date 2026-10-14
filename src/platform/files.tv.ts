// tvOS has neither UIDocumentPicker nor a share sheet. Keep their native modules
// out of the TV bundle; the TV screens import hosted documents by URL instead.
export async function readTextFile(): Promise<{
  name: string;
  text: string;
} | null> {
  throw new Error('Use a document URL on Apple TV.');
}
export async function exportText(_name: string, _text: string): Promise<void> {
  throw new Error('File export is unavailable on Apple TV.');
}
