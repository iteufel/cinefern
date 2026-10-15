import type { StackActionType } from '@react-navigation/native';
import type { Route } from '../app-context';

// Returning to a tab removes pushed screens instead of adding duplicate roots.
// Keep this translation separate from UIKit so it can be exercised with the
// same stack router that backs the native navigator.
export function appleNavigationAction(
  route: Route,
  detailPresentation: 'page' | 'modal',
): StackActionType {
  if (
    route.name === 'home' ||
    route.name === 'search' ||
    route.name === 'providers'
  ) {
    return {
      type: 'POP_TO',
      payload: {
        name: 'Tabs',
        params:
          route.name === 'home'
            ? { screen: 'Discover', params: { route } }
            : { screen: route.name === 'search' ? 'Search' : 'Providers' },
      },
    };
  }
  return {
    type: 'PUSH',
    payload: {
      name:
        route.name === 'item' && detailPresentation === 'modal'
          ? 'Sheet'
          : 'Page',
      params: { route },
    },
  };
}
