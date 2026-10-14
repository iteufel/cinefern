import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export async function readTextFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = result.assets[0];
  if (file.size && file.size > 2_000_000)
    throw new Error('The file is larger than 2 MB.');
  return {
    name: file.name,
    text: await FileSystem.readAsStringAsync(file.uri),
  };
}

export async function exportText(name: string, text: string) {
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, text);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Cinefern library',
  });
}
