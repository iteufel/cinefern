import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';
const artwork: Record<string, number> = {
  'asset:sintel-poster': require('../../assets/films/sintel-poster.jpg'),
  'asset:sintel-backdrop': require('../../assets/films/sintel-backdrop.jpg'),
  'asset:bunny': require('../../assets/films/bunny-poster.jpg'),
  'asset:elephants': require('../../assets/films/elephants-dream.jpg'),
  'asset:tears': require('../../assets/films/tears-of-steel.jpg'),
};
export function imageSource(uri?: string): ImageSourcePropType {
  return uri && artwork[uri] ? artwork[uri] : { uri };
}
export function artworkUri(uri?: string): string | undefined {
  return uri && artwork[uri] ? Asset.fromModule(artwork[uri]).uri : uri;
}
