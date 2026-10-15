import { LogBox } from 'react-native';
import { registerRootComponent } from 'expo';
import '../../src/agent/polyfills';
import App from '../../App';

// tvOS documents/cache storage is intentionally purgeable; this known warning
// obscures remote controls in development. Other warnings remain visible.
LogBox.ignoreLogs(['Persistent storage is not supported on tvOS']);

registerRootComponent(App);
