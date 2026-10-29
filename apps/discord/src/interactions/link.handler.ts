import { Injectable } from '@nestjs/common';
import { ButtonStyle, ComponentType, MessageFlags, type ButtonInteraction } from 'discord.js';
import type { ButtonHandler } from './handler.types';
import { LINK_PAGE_URL } from '../linking/links';

/**
 * `link:` — the one-click hop DISC-06 promised for an unlinked click (path A).
 *
 * The pick path already refuses an unlinked click with a `/link` hint
 * (`pick.handler.ts`); this handler is the button beside it. It answers with a
 * `Link`-style button straight at the web page, because the alternative — telling
 * someone to type a URL from a chat window — is the friction path A is paying for
 * elsewhere and should not also pay here.
 *
 * No API call, deliberately. The button has to work when the user is unlinked
 * *and* when the API is unhappy, and a static link can do neither harm nor a
 * round trip. Signing in with Discord on the web writes Better Auth's `account`
 * row, which `resolve` reads first — so the click after that lands on the right
 * profile with no code to type.
 */
@Injectable()
export class LinkHandler implements ButtonHandler {
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content: [
        'Link your account first — it takes one click:',
        `${LINK_PAGE_URL} signs you in with Discord, and that alone links this Discord account. If you sign in with email and password, run \`/link\` in Discord for a code and paste it there.`,
      ].join('\n'),
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: 'Link on the web',
              url: LINK_PAGE_URL,
            },
          ],
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
