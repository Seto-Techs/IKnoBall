import React from "react";

export interface EmailTemplateProps {
    title?: string;
    greeting?: string;
    bodyText?: string;
    buttonText?: string;
    buttonUrl?: string;
    footerText?: string;
    logoUrl?: string;
    iconType?: "verify" | "reset" | "payment" | "custom";
    customIcon?: string;
}

/**
 * IKnoBall Email Template — Sport Edition
 *
 * Basketball-court-inspired design:
 * - Hardwood dark tones with orange ball-colour accents
 * - Diagonal speed lines evoking court markings
 * - Bold, athletic typography
 * - High-energy, clean aesthetic
 *
 * Usage:
 * ```tsx
 * import { renderEmailToHtml } from '@/shared/utils/emailRenderer';
 * import { EmailTemplate } from '@/shared/components/EmailTemplate';
 *
 * const html = renderEmailToHtml(
 *   <EmailTemplate
 *     title="Verify Your Email"
 *     iconType="verify"
 *     buttonText="Activate Account"
 *     buttonUrl="https://example.com/verify?token=xyz"
 *   />
 * );
 * ```
 */
export const EmailTemplate: React.FC<EmailTemplateProps> = ({
    title = "Lock In.",
    greeting = "What's up,",
    bodyText = "You're one play away from getting court-side. Tap the button below to verify your account and step into the game.",
    buttonText = "Verify & Step On Court",
    buttonUrl = "{{action_url}}",
    footerText = "Didn't request this? No sweat — just ignore this email.",
    logoUrl = "",
    iconType = "verify",
    customIcon,
}) => {
    // Sport icon set — basketball-court-inspired SVGs
    const icons = {
        verify: 'https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/verify.png',
        reset: 'https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/reset.png',
        payment: 'https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/payment.png',
        custom: customIcon || "",
    };

    const selectedIcon = icons[iconType];

    // IKnoBall court colourway
    const colorSchemes = {
        verify: {
            accent: "#FF6B35",       // basketball orange
            accentLight: "#FF8C42",
            accentDark: "#CC4400",
            bg: "#0a0a1a",           // deep hardwood
            surface: "#12122a",
            courtLine: "rgba(255,107,53,0.15)",
        },
        reset: {
            accent: "#FF6B35",
            accentLight: "#FF8C42",
            accentDark: "#CC4400",
            bg: "#0a0a1a",
            surface: "#12122a",
            courtLine: "rgba(255,107,53,0.15)",
        },
        payment: {
            accent: "#FF6B35",
            accentLight: "#FF8C42",
            accentDark: "#CC4400",
            bg: "#0a0a1a",
            surface: "#12122a",
            courtLine: "rgba(255,107,53,0.15)",
        },
        custom: {
            accent: "#FF6B35",
            accentLight: "#FF8C42",
            accentDark: "#CC4400",
            bg: "#0a0a1a",
            surface: "#12122a",
            courtLine: "rgba(255,107,53,0.15)",
        },
    };

    const colors = colorSchemes[iconType];

    const styles = {
        body: {
            margin: 0,
            padding: 0,
            backgroundColor: "#0a0a1a",
            fontFamily:
                '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            WebkitFontSmoothing: "antialiased" as const,
        },
        wrapper: {
            width: "100%",
            backgroundColor: "#0a0a1a",
            padding: "40px 20px",
        },
        container: {
            width: "100%",
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: "#12122a",
            borderRadius: "24px",
            overflow: "hidden",
            border: "1px solid rgba(255,107,53,0.12)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        },

        // --- TOP COURT STRIPE ---
        courtStripe: {
            height: "6px",
            background: `repeating-linear-gradient(
                90deg,
                ${colors.accent} 0px,
                ${colors.accent} 20px,
                transparent 20px,
                transparent 28px,
                ${colors.accent} 28px,
                ${colors.accent} 48px,
                transparent 48px,
                transparent 56px
            )`,
        },

        // --- HERO SECTION (dark hardwood) ---
        hero: {
            padding: "48px 48px 40px 48px",
            textAlign: "center" as const,
            position: "relative" as const,
            background: `
                radial-gradient(ellipse 80% 60% at 50% 120%, ${colors.courtLine} 0%, transparent 70%),
                linear-gradient(180deg, #0f0f25 0%, #12122a 100%)
            `,
        },
        logoBanner: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "28px",
        },
        logoIcon: {
            display: "inline-block",
            width: "32px",
            height: "32px",
        },
        logoText: {
            margin: "0",
            fontSize: "20px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            fontFamily: '"Inter", sans-serif',
        },
        logoTextAccent: {
            color: colors.accent,
        },
        iconWrapper: {
            display: "inline-block",
            position: "relative" as const,
            marginBottom: "8px",
        },
        heroIcon: {
            display: "block",
            margin: "0 auto",
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            border: `3px solid ${colors.accent}`,
            padding: "4px",
            objectFit: "cover" as const,
        },

        // --- CONTENT ---
        content: {
            padding: "0 48px 40px 48px",
        },
        title: {
            margin: "0 0 20px 0",
            fontSize: "36px",
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            lineHeight: "1.1",
            fontFamily: '"Inter", sans-serif',
        },
        greeting: {
            margin: "0 0 12px 0",
            color: "rgba(255,255,255,0.5)",
            fontSize: "15px",
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            fontFamily: '"Inter", sans-serif',
        },
        bodyText: {
            margin: "0 0 36px 0",
            color: "rgba(255,255,255,0.7)",
            fontSize: "15px",
            lineHeight: "1.7",
            fontFamily: '"Inter", sans-serif',
        },

        // --- CTA BUTTON (jersey-style) ---
        buttonWrapper: {
            textAlign: "center" as const,
            margin: "0 0 32px 0",
        },
        button: {
            display: "inline-block",
            padding: "16px 40px",
            fontSize: "15px",
            fontWeight: 700,
            color: "#ffffff",
            textDecoration: "none",
            backgroundColor: colors.accent,
            borderRadius: "100px",
            fontFamily: '"Inter", sans-serif',
            letterSpacing: "0.02em",
            textTransform: "uppercase" as const,
            boxShadow: `0 8px 24px ${colors.accent}40`,
            transition: "all 0.2s ease",
        },

        // --- STATS BAR (like player stat line) ---
        statsBar: {
            background: `linear-gradient(90deg, ${colors.accent}15 0%, transparent 100%)`,
            borderLeft: `3px solid ${colors.accent}`,
            padding: "16px 20px",
            borderRadius: "8px",
            marginBottom: "32px",
        },
        statsText: {
            margin: "0",
            fontSize: "13px",
            color: "rgba(255,255,255,0.55)",
            lineHeight: "1.6",
            fontFamily: '"Inter", sans-serif',
        },
        statsTextStrong: {
            color: colors.accent,
            fontWeight: 600,
        },

        // --- DIVIDER (court line) ---
        divider: {
            height: "1px",
            background: `linear-gradient(90deg, transparent 0%, ${colors.courtLine} 50%, transparent 100%)`,
            margin: "28px 0",
        },

        // --- HELP SECTION ---
        helpText: {
            margin: "0 0 10px 0",
            fontSize: "13px",
            color: "rgba(255,255,255,0.35)",
            lineHeight: "1.6",
            fontFamily: '"Inter", sans-serif',
        },
        link: {
            color: colors.accent,
            textDecoration: "none",
            fontWeight: 600,
        },

        // --- FOOTER (team-card style) ---
        footer: {
            backgroundColor: "#0f0f25",
            padding: "32px 48px",
            borderTop: `1px solid ${colors.courtLine}`,
            textAlign: "center" as const,
        },
        footerBrand: {
            margin: "0 0 4px 0",
            fontSize: "14px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            fontFamily: '"Inter", sans-serif',
        },
        footerTagline: {
            margin: "0 0 20px 0",
            fontSize: "12px",
            color: "rgba(255,255,255,0.3)",
            fontFamily: '"Inter", sans-serif',
            letterSpacing: "0.04em",
        },
        footerText: {
            margin: "0 0 6px 0",
            color: "rgba(255,255,255,0.25)",
            fontSize: "12px",
            lineHeight: "1.6",
            fontFamily: '"Inter", sans-serif',
        },
        footerLinks: {
            margin: "16px 0 0 0",
        },
        footerLink: {
            color: "rgba(255,255,255,0.3)",
            textDecoration: "none",
            fontSize: "12px",
            fontWeight: 500,
            margin: "0 10px",
            fontFamily: '"Inter", sans-serif',
        },
    };

    // Basketball court SVG icon for inline use
    const BasketballIcon = () => (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                display: "inline-block",
                verticalAlign: "middle",
                marginRight: "10px",
                opacity: 0.7,
            }}
        >
            <circle cx="12" cy="12" r="10" stroke={colors.accent} strokeWidth="1.5" fill="none" />
            <path d="M12 2v20M2 12h20" stroke={colors.accent} strokeWidth="1.2" opacity="0.5" />
            <path d="M5 5l14 14M19 5L5 19" stroke={colors.accent} strokeWidth="1.2" opacity="0.3" />
            <circle cx="12" cy="12" r="3" stroke={colors.accent} strokeWidth="1" opacity="0.4" fill="none" />
        </svg>
    );

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

                <title>{title}</title>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body style={styles.body}>
                {/* Preheader */}
                <div style={{
                    display: "none",
                    fontSize: 1,
                    color: "#0a0a1a",
                    lineHeight: 1,
                    maxHeight: 0,
                    maxWidth: 0,
                    opacity: 0,
                    overflow: "hidden",
                }}>
                    {title} — IKnoBall
                </div>

                {/* Main Wrapper */}
                <table
                    role="presentation"
                    width="100%"
                    cellPadding="0"
                    cellSpacing="0"
                    style={styles.wrapper}
                >
                    <tbody>
                        <tr>
                            <td align="center">
                                {/* Container */}
                                <table
                                    role="presentation"
                                    style={styles.container}
                                    cellPadding="0"
                                    cellSpacing="0"
                                >
                                    <tbody>
                                        {/* Court Stripe */}
                                        <tr>
                                            <td style={styles.courtStripe}></td>
                                        </tr>

                                        {/* Hero Section */}
                                        <tr>
                                            <td style={styles.hero}>
                                                {/* Logo row */}
                                                <div style={styles.logoBanner}>
                                                    <span style={styles.logoIcon}>
                                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                                            <circle cx="12" cy="12" r="10" stroke={colors.accent} strokeWidth="2" />
                                                            <path d="M12 2v20M2 12h20" stroke={colors.accent} strokeWidth="1.2" opacity="0.6" />
                                                            <circle cx="12" cy="12" r="3" stroke={colors.accent} strokeWidth="1.2" opacity="0.5" />
                                                        </svg>
                                                    </span>
                                                    <h1 style={styles.logoText}>
                                                        IKN<span style={styles.logoTextAccent}>O</span>BALL
                                                    </h1>
                                                </div>

                                                {/* Icon */}
                                                <div style={styles.iconWrapper}>
                                                    <img
                                                        src={selectedIcon}
                                                        width="72"
                                                        height="72"
                                                        alt=""
                                                        style={styles.heroIcon}
                                                    />
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Content */}
                                        <tr>
                                            <td style={styles.content}>
                                                <p style={styles.greeting}>{greeting}</p>
                                                <h2 style={styles.title}>{title}</h2>
                                                <p style={styles.bodyText}>{bodyText}</p>

                                                {/* CTA Button */}
                                                <div style={styles.buttonWrapper}>
                                                    <a href={buttonUrl} style={styles.button}>
                                                        {buttonText}
                                                    </a>
                                                </div>

                                                {/* Stats bar — like a player stat line */}
                                                <div style={styles.statsBar}>
                                                    <p style={styles.statsText}>
                                                        <BasketballIcon />
                                                        Security check:{" "}
                                                        <span style={styles.statsTextStrong}>
                                                            this link expires in 15 minutes
                                                        </span>{" "}
                                                        — one-time use only.
                                                    </p>
                                                </div>

                                                {/* Divider (mid-court line) */}
                                                <div style={styles.divider}></div>

                                                {/* Help Section */}
                                                <p style={styles.helpText}>{footerText}</p>
                                                <p style={styles.helpText}>
                                                    Button not showing?{" "}
                                                    <a href={buttonUrl} style={styles.link}>
                                                        Tap here
                                                    </a>{" "}
                                                    to open the link directly.
                                                </p>
                                            </td>
                                        </tr>

                                        {/* Footer */}
                                        <tr>
                                            <td style={styles.footer}>
                                                <p style={styles.footerBrand}>IKnoBall</p>
                                                <p style={styles.footerTagline}>
                                                    Know The Game
                                                </p>
                                                <p style={styles.footerText}>
                                                    © {new Date().getFullYear()} SETO Tech. All rights reserved.
                                                </p>
                                                <div style={styles.footerLinks}>
                                                    <a href="#" style={styles.footerLink}>Privacy</a>
                                                    <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
                                                    <a href="#" style={styles.footerLink}>Terms</a>
                                                    <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
                                                    <a href="#" style={styles.footerLink}>Support</a>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </body>
        </html>
    );
};
