import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialTVNavigation,
  tvNavigate,
  tvBack,
} from '../src/ui/tv-navigation';
import type { MediaItem } from '@cinefern/provider-sdk';
const movie: MediaItem = {
  id: 'film',
  providerId: 'cinema',
  type: 'movie',
  title: 'A film',
};

test('TV sidebar selections do not accumulate a Back stack of tabs', () => {
  let state = initialTVNavigation;
  for (const name of [
    'search',
    'providers',
    'settings',
    'home',
    'watchlist',
    'history',
  ] as const)
    state = tvNavigate(state, { name });
  assert.equal(state.root, 'library');
  assert.equal(state.branches.library!.length, 1);
  assert.equal(state.branches.library![0]!.route.name, 'history');
  assert.equal(tvBack(state), state);
});

test('TV details preserve the mounted home frame for focus and scroll restoration', () => {
  const home = initialTVNavigation.branches.home![0];
  let state = tvNavigate(initialTVNavigation, { name: 'item', item: movie });
  assert.equal(state.branches.home!.length, 2);
  assert.equal(state.branches.home![0], home);
  state = tvNavigate(state, {
    name: 'person',
    id: 'actor',
    providerId: 'cinema',
    title: 'An actor',
  });
  state = tvBack(state);
  assert.equal(state.branches.home!.at(-1)!.route.name, 'item');
  state = tvBack(state);
  assert.equal(state.branches.home![0], home);
});

test('returning to a TV root reuses its view while filter changes replace only that root', () => {
  let state = tvNavigate(initialTVNavigation, { name: 'search' });
  const search = state.branches.search![0];
  state = tvNavigate(state, { name: 'home' });
  assert.equal(state.branches.home![0], initialTVNavigation.branches.home![0]);
  state = tvNavigate(state, { name: 'home', filter: 'movie' });
  assert.equal(state.branches.home!.length, 1);
  assert.notEqual(
    state.branches.home![0]!.key,
    initialTVNavigation.branches.home![0]!.key,
  );
  assert.equal(state.branches.search![0], search);
  state = tvNavigate(state, { name: 'search' });
  assert.equal(state.branches.search![0], search);
});
