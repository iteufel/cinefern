import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommonActions,
  StackRouter,
  type StackActionType,
} from '@react-navigation/routers';
import { appleNavigationAction } from '../src/ui/apple-navigation';
import type { Route } from '../src/app-context';

function navigation() {
  const router = StackRouter({ initialRouteName: 'Tabs' });
  const options = {
    routeNames: ['Tabs', 'Page', 'Sheet'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let state = router.getInitialState(options);
  return {
    get state() {
      return state;
    },
    dispatch(
      action: StackActionType | ReturnType<typeof CommonActions.goBack>,
    ) {
      const next = router.getStateForAction(state, action, options);
      if (next) state = router.getRehydratedState(next, options);
    },
  };
}
const item: Route = {
  name: 'item',
  item: { providerId: 'cinema', id: 'sintel', title: 'Sintel', type: 'movie' },
};

test('iOS pushes preserve the previous media route and native back restores it', () => {
  const nav = navigation();
  const collection: Route = {
    name: 'collection',
    providerId: 'cinema',
    id: 'films',
    title: 'Films',
  };
  nav.dispatch(appleNavigationAction(collection, 'page'));
  const previous = nav.state.routes[1];
  nav.dispatch(appleNavigationAction(item, 'page'));
  assert.equal(nav.state.routes[1], previous);
  assert.deepEqual(nav.state.routes[2]?.params, { route: item });
  nav.dispatch(CommonActions.goBack());
  assert.equal(nav.state.index, 1);
  assert.deepEqual(nav.state.routes[1]?.params, { route: collection });
});

test('iOS filter and tab changes keep one root and dismiss pushed screens', () => {
  const nav = navigation();
  for (const filter of ['movie', 'series', undefined] as const) {
    const route: Route = { name: 'home', providerId: 'cinema', filter };
    nav.dispatch(appleNavigationAction(route, 'page'));
    assert.equal(nav.state.routes.length, 1);
    assert.deepEqual(nav.state.routes[0]?.params, {
      screen: 'Discover',
      params: { route },
    });
  }
  nav.dispatch(appleNavigationAction(item, 'page'));
  nav.dispatch(appleNavigationAction({ name: 'settings' }, 'page'));
  nav.dispatch(appleNavigationAction({ name: 'providers' }, 'page'));
  assert.equal(nav.state.routes.length, 1);
  assert.deepEqual(nav.state.routes[0]?.params, { screen: 'Providers' });
  nav.dispatch(appleNavigationAction({ name: 'search' }, 'page'));
  assert.deepEqual(nav.state.routes[0]?.params, { screen: 'Search' });
});

test('iOS detail sheets dismiss to the previous screen while library pages stay navigable', () => {
  const nav = navigation();
  nav.dispatch(appleNavigationAction({ name: 'watchlist' }, 'modal'));
  nav.dispatch(appleNavigationAction(item, 'modal'));
  assert.deepEqual(
    nav.state.routes.map((route) => route.name),
    ['Tabs', 'Page', 'Sheet'],
  );
  nav.dispatch(CommonActions.goBack());
  assert.deepEqual(nav.state.routes[1]?.params, {
    route: { name: 'watchlist' },
  });
  nav.dispatch(appleNavigationAction({ name: 'downloads' }, 'modal'));
  assert.equal(nav.state.routes[2]?.name, 'Page');
});
