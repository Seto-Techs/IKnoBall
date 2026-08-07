const STORAGE_KEY = 'iknoball_team';

export interface SelectedTeam {
  abbr: string;
  name: string;
  primaryColor: string;
  logoUrl: string;
}

export function getSelectedTeam(): SelectedTeam | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SelectedTeam) : null;
  } catch {
    return null;
  }
}

export function setSelectedTeam(team: SelectedTeam): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(team));
}

export function clearSelectedTeam(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasSelectedTeam(): boolean {
  return getSelectedTeam() !== null;
}
