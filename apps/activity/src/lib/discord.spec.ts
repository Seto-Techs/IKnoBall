import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { CDN_MAPPING } from './discord';
import { headshotUrl } from './lebronnect';

/**
 * Every image the activity renders — headshots from `headshotUrl`, season logos
 * straight from the API — is an absolute `cdn.nba.com` URL, and Discord's CSP
 * blocks that host. The mapping is the only thing that makes them load, and it
 * fails silently when it is configured wrong, which is exactly what shipped in
 * 0.5.2: broken headshots and broken logos in the client, nothing in the logs.
 */

const PREFIX_HOST = '1531941991875743744.discordsays.com';

/** Capture what `patchUrlMappings` hands to the real fetch, then restore the global. */
async function fetchUrlAfterMapping(url: string): Promise<string> {
  const requested: string[] = [];
  const window = {
    location: { protocol: 'https:', host: PREFIX_HOST },
    fetch: (input: string | URL) => {
      requested.push(input.toString());
      return Promise.resolve(new Response());
    },
  };

  vi.stubGlobal('window', window);
  try {
    patchUrlMappings([CDN_MAPPING], { patchWebSocket: false, patchXhr: false });
    await window.fetch(url);
  } finally {
    vi.unstubAllGlobals();
  }

  return requested[0] ?? '';
}

describe('CDN URL mapping', () => {
  /**
   * The SDK coerces the target with `new URL('https://' + target)`. A target
   * that carries a scheme parses to host `https`, so its regex becomes
   * `https(/|$)/`, which cannot match a URL whose scheme is followed by `:`.
   */
  it('targets a bare host', () => {
    expect(CDN_MAPPING.target).not.toContain('://');
    expect(CDN_MAPPING.target).toBe('cdn.nba.com');
  });

  it('rewrites a headshot onto the activity origin', async () => {
    expect(await fetchUrlAfterMapping(headshotUrl('1642276'))).toBe(
      `https://${PREFIX_HOST}/nba/headshots/nba/latest/1040x760/1642276.png`,
    );
  });

  it('rewrites a team logo the API returned as an absolute URL', async () => {
    expect(
      await fetchUrlAfterMapping('https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg'),
    ).toBe(`https://${PREFIX_HOST}/nba/logos/nba/1610612747/global/L/logo.svg`);
  });

  it('leaves a host outside the mapping alone', async () => {
    const other = 'https://iknoball.setotechs.com/logo.png';
    expect(await fetchUrlAfterMapping(other)).toBe(other);
  });
});
