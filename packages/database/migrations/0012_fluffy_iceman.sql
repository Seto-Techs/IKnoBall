CREATE TABLE "discord_members" (
	"guildId" text NOT NULL,
	"discordUserId" text NOT NULL,
	"displayName" text,
	"joinedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "discord_members_guildId_discordUserId_pk" PRIMARY KEY("guildId","discordUserId")
);
--> statement-breakpoint
CREATE INDEX "discord_members_discordUserId_idx" ON "discord_members" USING btree ("discordUserId");