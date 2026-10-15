import type { Route } from '../app-context';

export type TVRoot = 'home' | 'search' | 'library' | 'providers' | 'settings';
export interface TVFrame {
  key: number;
  route: Route;
}
export interface TVNavigationState {
  root: TVRoot;
  nextKey: number;
  branches: Partial<Record<TVRoot, TVFrame[]>>;
}
export const initialTVNavigation: TVNavigationState = {
  root: 'home',
  nextKey: 1,
  branches: { home: [{ key: 0, route: { name: 'home' } }] },
};
export function tvRoot(route: Route): TVRoot | undefined {
  if (['watchlist', 'history', 'downloads'].includes(route.name))
    return 'library';
  if (['home', 'search', 'providers', 'settings'].includes(route.name))
    return route.name as TVRoot;
}
export function tvNavigate(
  state: TVNavigationState,
  route: Route,
): TVNavigationState {
  const root = tvRoot(route);
  if (root) {
    const previous = state.branches[root]?.[0];
    // Retain the root's mounted view and scroll/focus memory when reselecting it.
    const frame =
      previous && JSON.stringify(previous.route) === JSON.stringify(route)
        ? previous
        : { key: state.nextKey, route };
    return {
      root,
      nextKey: state.nextKey + 1,
      branches: { ...state.branches, [root]: [frame] },
    };
  }
  const branch = state.branches[state.root] ?? [];
  if (JSON.stringify(branch.at(-1)?.route) === JSON.stringify(route))
    return state;
  return {
    ...state,
    nextKey: state.nextKey + 1,
    branches: {
      ...state.branches,
      [state.root]: [...branch, { key: state.nextKey, route }],
    },
  };
}
export function tvBack(state: TVNavigationState): TVNavigationState {
  const branch = state.branches[state.root] ?? [];
  if (branch.length <= 1) return state;
  return {
    ...state,
    branches: { ...state.branches, [state.root]: branch.slice(0, -1) },
  };
}
