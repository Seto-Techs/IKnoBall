import { readFile } from 'node:fs/promises';

export const HISTORICAL_SOURCE_URL =
  'https://www.kaggle.com/api/v1/datasets/download/flynn28/historical-nba-player-stats-database?datasetVersionNumber=1';

const AGGREGATE_TEAMS = new Set(['TOT', '2TM', '3TM', '4TM']);

export type HistoricalTeamSeason = {
  externalId: string;
  season: string;
  teamAbbr: string;
};

/** Parse one CSV record, including quoted values containing commas. */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

/**
 * Read the source-declared historical export without treating aggregate rows as
 * clubs. The source uses the NBA numeric person id already stored locally.
 */
export async function readHistoricalTeamSeasons(path: string): Promise<HistoricalTeamSeason[]> {
  const csv = await readFile(path, 'utf8');
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const headers = parseCsvLine(lines.shift() ?? '');
  const indexOf = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`Historical source is missing ${name}`);
    return index;
  };
  const playerIndex = indexOf('PLAYER_ID');
  const seasonIndex = indexOf('SEASON_ID');
  const teamIndex = indexOf('TEAM_ABBREVIATION');
  const memberships = new Map<string, HistoricalTeamSeason>();

  for (const line of lines) {
    const values = parseCsvLine(line);
    const externalId = values[playerIndex]?.trim();
    const season = values[seasonIndex]?.trim();
    const teamAbbr = values[teamIndex]?.trim();
    if (!externalId || !season || !teamAbbr || AGGREGATE_TEAMS.has(teamAbbr)) continue;
    const membership = { externalId, season, teamAbbr };
    memberships.set(`${externalId}|${season}|${teamAbbr}`, membership);
  }

  return [...memberships.values()];
}
