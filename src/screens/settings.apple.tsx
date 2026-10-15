import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { AppleForm, ApplePicker, AppleTextField } from '../ui/apple-controls';
import { useT } from '../ui/i18n';
import { isTV } from '../ui/theme';
import { useSettingsActions } from './settings-actions';
import { AppleAgentSettings } from './agent-settings.apple';
import { version } from '../../package.json';

const languages = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
] as const;

export function SettingsScreen() {
  const app = useApp();
  const t = useT();
  const actions = useSettingsActions();
  const settings = app.state.settings;
  const [agent, setAgent] = useState(false);
  if (agent) return <AppleAgentSettings onClose={() => setAgent(false)} />;
  const toggle = (
    key:
      | 'autoplay'
      | 'resume'
      | 'autoplayTrailers'
      | 'cropTrailers'
      | 'showAdult'
      | 'vibrancy',
    label: string,
  ) => (
    <Toggle
      label={label}
      isOn={settings[key]}
      onIsOnChange={(value) => app.library.setSettings({ [key]: value })}
    />
  );
  return (
    <AppleForm title={t.settings}>
      <Section title="Playback">
        <ApplePicker
          label="Audio Language"
          value={settings.audioLanguage}
          options={languages}
          onChange={(audioLanguage) =>
            app.library.setSettings({ audioLanguage })
          }
        />
        <ApplePicker
          label="Subtitles"
          value={settings.subtitleLanguage}
          options={[['', 'Off'], ...languages]}
          onChange={(subtitleLanguage) =>
            app.library.setSettings({ subtitleLanguage })
          }
        />
        <ApplePicker
          label="Video Quality"
          value={settings.quality}
          options={[
            [480, '480p'],
            [720, '720p'],
            [1080, '1080p'],
            [2160, '4K'],
          ]}
          onChange={(quality) => app.library.setSettings({ quality })}
        />
        {toggle('autoplay', 'Play Next Episode')}
        {toggle('resume', 'Resume Playback')}
        {toggle('autoplayTrailers', 'Autoplay Previews')}
        {toggle('cropTrailers', 'Fill Frame for Previews')}
      </Section>
      <Section title="Preferences">
        <ApplePicker
          label="Language"
          value={settings.language}
          options={[
            ['en', 'English'],
            ['de', 'Deutsch'],
          ]}
          onChange={(language) => app.library.setSettings({ language })}
        />
        {!isTV && (
          <ApplePicker
            label="Title Details"
            value={settings.detailPresentation}
            options={[
              ['page', 'Screen'],
              ['modal', 'Sheet'],
            ]}
            onChange={(detailPresentation) =>
              app.library.setSettings({ detailPresentation })
            }
          />
        )}
        {toggle('showAdult', 'Show Adult Content')}
        {toggle('vibrancy', 'Background Effects')}
        <Button
          label="Media Agent"
          systemImage="sparkles"
          onPress={() => setAgent(true)}
        />
      </Section>
      <Section
        title="Open a Stream"
        footer={
          <Text>Play a video file or HLS playlist from your media server.</Text>
        }
      >
        <AppleTextField
          label="https://your-server/video.m3u8"
          value={actions.streamUrl}
          onChange={actions.setStreamUrl}
          url
        />
        <Button
          label={actions.busy ? 'Opening…' : 'Open Stream'}
          systemImage="play.fill"
          onPress={() => void actions.openStream()}
          modifiers={[disabled(actions.busy || !actions.streamUrl.trim())]}
        />
      </Section>
      <Section title="Library">
        <Button
          label={t.history}
          systemImage="clock"
          onPress={() => app.navigate({ name: 'history' })}
        />
        {!isTV && (
          <Button
            label="Export Library"
            systemImage="square.and.arrow.up"
            onPress={() => void actions.exportLibrary()}
          />
        )}
        {!isTV && (
          <Button
            label="Import Library"
            systemImage="square.and.arrow.down"
            onPress={() => void actions.importLibrary()}
          />
        )}
        {isTV && (
          <AppleTextField
            label="Library backup URL"
            value={actions.importUrl}
            onChange={actions.setImportUrl}
            url
          />
        )}
        {isTV && (
          <Button
            label="Import Library"
            systemImage="square.and.arrow.down"
            onPress={() => void actions.importFromUrl()}
            modifiers={[disabled(actions.busy || !actions.importUrl.trim())]}
          />
        )}
        {!!actions.importError && (
          <Text modifiers={[foregroundStyle('#ff453a')]}>
            {actions.importError}
          </Text>
        )}
        <Button
          label="Refresh Providers"
          systemImage="arrow.clockwise"
          onPress={() => {
            app.runtime.clearCache();
            void app
              .configureProviders()
              .then(() => app.notify('Providers refreshed'))
              .catch((error) => app.notify(String(error)));
          }}
        />
        <Button
          label="Reset Cinefern"
          role="destructive"
          onPress={() =>
            Alert.alert(
              'Reset Cinefern?',
              'Delete the library, downloads, providers and settings from this device?',
              [
                { text: t.cancel, style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: () => void actions.resetApp(),
                },
              ],
            )
          }
        />
        {!!app.state.persistenceError && (
          <Text modifiers={[foregroundStyle('#ff453a')]}>
            {app.state.persistenceError}
          </Text>
        )}
      </Section>
      <Section
        title="About"
        footer={
          <Text>
            Film artwork © Blender Foundation: Sintel, Big Buck Bunny, Tears of
            Steel (CC BY 3.0); Elephants Dream / Orange Open Movie Project (CC
            BY 2.5). Images are scaled and cropped.
          </Text>
        }
      >
        <Text>Cinefern {version}</Text>
        <Text>Open source · AGPL-3.0-or-later</Text>
        {!isTV && (
          <Button
            label="Cinefern on GitHub"
            systemImage="arrow.up.right"
            onPress={() =>
              void platform.openExternal('https://github.com/iteufel/cinefern')
            }
          />
        )}
      </Section>
    </AppleForm>
  );
}
