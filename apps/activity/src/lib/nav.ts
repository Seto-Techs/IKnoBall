/** The activity has four screens and no router: one state, one switch. */
export type Screen = 'home' | 'predictions' | 'lebronnect' | 'leaderboard';

export const SCREEN_TITLE: Record<Screen, string> = {
  home: 'Home',
  predictions: 'Predictions',
  lebronnect: 'Lebronnect',
  leaderboard: 'Leaderboard',
};
