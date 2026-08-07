/**
 * Team color palettes — basketball-themed abstractions.
 *
 * These are NOT official NBA brand colors. Each palette is an original
 * composition inspired by the team's general visual identity, designed
 * for light-mode UI (good contrast, readable).
 */

export interface TeamColors {
  /** 3-letter abbreviation */
  abbr: string;
  /** Full team name */
  name: string;
  /**
   * 2–4 hex colors, ordered most → least dominant.
   * First color = primary identity.
   */
  colors: [string, string, string?, string?];
}

export const teamColors: TeamColors[] = [
  {
    abbr: 'ATL',
    name: 'Atlanta Hawks',
    colors: ['#C4403A', '#E8C84A', '#1A1A1A'],
  },
  {
    abbr: 'BOS',
    name: 'Boston Celtics',
    colors: ['#1B7A4B', '#CBA13A', '#1A1A1A'],
  },
  {
    abbr: 'BKN',
    name: 'Brooklyn Nets',
    colors: ['#1A1A1A', '#CCCCCC', '#FFFFFF'],
  },
  {
    abbr: 'CHA',
    name: 'Charlotte Hornets',
    colors: ['#2A1F6E', '#3A8B5E', '#A0A0B0'],
  },
  {
    abbr: 'CHI',
    name: 'Chicago Bulls',
    colors: ['#C63D2F', '#1A1A1A', '#FFFFFF'],
  },
  {
    abbr: 'CLE',
    name: 'Cleveland Cavaliers',
    colors: ['#7A2E3A', '#C8962E', '#1A1A1A'],
  },
  {
    abbr: 'DAL',
    name: 'Dallas Mavericks',
    colors: ['#0A6E9C', '#B0C4D8', '#1A3B5C'],
  },
  {
    abbr: 'DEN',
    name: 'Denver Nuggets',
    colors: ['#1A2E4A', '#B8A44A', '#3A5A7A'],
  },
  {
    abbr: 'DET',
    name: 'Detroit Pistons',
    colors: ['#B8353A', '#1A1A1A', '#4A6A8A'],
  },
  {
    abbr: 'GSW',
    name: 'Golden State Warriors',
    colors: ['#1A4A8A', '#E8C84A', '#6A8ABA'],
  },
  {
    abbr: 'HOU',
    name: 'Houston Rockets',
    colors: ['#C63D2F', '#1A1A1A', '#C0C0C0'],
  },
  {
    abbr: 'IND',
    name: 'Indiana Pacers',
    colors: ['#1A3A6A', '#C8A84A', '#B0B8C0'],
  },
  {
    abbr: 'LAC',
    name: 'LA Clippers',
    colors: ['#C63D2F', '#1A6A9A', '#CCCCCC'],
  },
  {
    abbr: 'LAL',
    name: 'Los Angeles Lakers',
    colors: ['#4A2A7A', '#C8962A', '#1A1A1A'],
  },
  {
    abbr: 'MEM',
    name: 'Memphis Grizzlies',
    colors: ['#5A7AAA', '#1A2E4A', '#8AB0D0'],
  },
  {
    abbr: 'MIA',
    name: 'Miami Heat',
    colors: ['#8A283A', '#C8962A', '#1A1A1A'],
  },
  {
    abbr: 'MIL',
    name: 'Milwaukee Bucks',
    colors: ['#1A5A3A', '#C8A84A', '#1A1A1A'],
  },
  {
    abbr: 'MIN',
    name: 'Minnesota Timberwolves',
    colors: ['#1A3A5A', '#3A8A5A', '#B0C4D8'],
  },
  {
    abbr: 'NOP',
    name: 'New Orleans Pelicans',
    colors: ['#0A2E4A', '#C8962A', '#B0A080'],
  },
  {
    abbr: 'NYK',
    name: 'New York Knicks',
    colors: ['#006A9A', '#D96A2A', '#CCCCCC'],
  },
  {
    abbr: 'OKC',
    name: 'Oklahoma City Thunder',
    colors: ['#007AB0', '#E8A82A', '#0A3A5A'],
  },
  {
    abbr: 'ORL',
    name: 'Orlando Magic',
    colors: ['#006AB0', '#CCCCCC', '#1A4A7A'],
  },
  {
    abbr: 'PHI',
    name: 'Philadelphia 76ers',
    colors: ['#006AB0', '#C63D2F', '#B0B8C0'],
  },
  {
    abbr: 'PHX',
    name: 'Phoenix Suns',
    colors: ['#C86A20', '#1A1A1A', '#C8962A'],
  },
  {
    abbr: 'POR',
    name: 'Portland Trail Blazers',
    colors: ['#C4403A', '#1A1A1A', '#B0B8C0'],
  },
  {
    abbr: 'SAC',
    name: 'Sacramento Kings',
    colors: ['#4A2A6A', '#C8962A', '#1A1A1A'],
  },
  {
    abbr: 'SAS',
    name: 'San Antonio Spurs',
    colors: ['#1A1A1A', '#B0B8C0', '#CCCCCC'],
  },
  {
    abbr: 'TOR',
    name: 'Toronto Raptors',
    colors: ['#C63D2F', '#1A1A1A', '#6A4A2A'],
  },
  {
    abbr: 'UTA',
    name: 'Utah Jazz',
    colors: ['#002B5C', '#8AC0D0', '#3A6A7A'],
  },
  {
    abbr: 'WAS',
    name: 'Washington Wizards',
    colors: ['#002B5C', '#C4403A', '#B0A080'],
  },
];
