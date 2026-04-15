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
 * DuitRapi Email Template
 *
 * Matches the DuitRapi design system:
 * - Poppins font family
 * - Accent colors: #10b981 (dark) / #4f46e5 (light)
 * - Clean, modern aesthetic
 * - Subtle, professional styling
 * - Financial app oriented
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
    title = "Confirm your email",
    greeting = "Hello,",
    bodyText = "We received a request to verify your email address. Click the button below to confirm your account and get started managing your finances securely.",
    buttonText = "Verify Account",
    buttonUrl = "{{action_url}}",
    footerText = "If you didn't request this, you can safely ignore this email.",
    logoUrl = "",
    iconType = "verify",
    customIcon,
}) => {
    // Minimalist icons matching DuitRapi style
    const icons = {
        verify: 'https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/verify.png',
        reset: `https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/reset.png`,
        payment: `https://duitrapi.s3.ap-southeast-3.amazonaws.com/shared/payment.png`,
        custom: customIcon || "",
    };

    const selectedIcon = icons[iconType];

    // DuitRapi color palette
    const colorSchemes = {
        verify: {
            accent: "#10b981",
            accentLight: "#34d399",
            bg: "#0a0a0f",
            surface: "#14141f",
        },
        reset: {
            accent: "#10b981",
            accentLight: "#34d399",
            bg: "#0a0a0f",
            surface: "#14141f",
        },
        payment: {
            accent: "#10b981",
            accentLight: "#34d399",
            bg: "#0a0a0f",
            surface: "#14141f",
        },
        custom: {
            accent: "#10b981",
            accentLight: "#34d399",
            bg: "#0a0a0f",
            surface: "#14141f",
        },
    };

    const colors = colorSchemes[iconType];

    // DuitRapi-matched styles
    const styles = {
        body: {
            margin: 0,
            padding: 0,
            backgroundColor: "#f8fafc",
            fontFamily:
                '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            WebkitFontSmoothing: "antialiased" as const,
        },
        wrapper: {
            width: "100%",
            backgroundColor: "#f8fafc",
            padding: "60px 20px",
        },
        container: {
            width: "100%",
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
        },
        accentBar: {
            height: "4px",
            background: `linear-gradient(90deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`,
        },
        header: {
            padding: "48px 48px 40px 48px",
            borderBottom: "1px solid #f1f5f9",
            textAlign: "center" as const,
        },
        logoText: {
            margin: "0 0 32px 0",
            fontSize: "24px",
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.02em",
            fontFamily: '"Poppins", sans-serif',
        },
        iconWrapper: {
            display: "inline-block",
        },
        content: {
            padding: "48px",
        },
        title: {
            margin: "0 0 24px 0",
            fontSize: "32px",
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.03em",
            lineHeight: "1.2",
            fontFamily: '"Poppins", sans-serif',
        },
        greeting: {
            margin: "0 0 16px 0",
            color: "#64748b",
            fontSize: "16px",
            fontWeight: 500,
            fontFamily: '"Poppins", sans-serif',
        },
        bodyText: {
            margin: "0 0 40px 0",
            color: "#475569",
            fontSize: "15px",
            lineHeight: "1.7",
            fontFamily: '"Poppins", sans-serif',
        },
        buttonWrapper: {
            textAlign: "center" as const,
            margin: "40px 0",
        },
        button: {
            display: "inline-block",
            padding: "14px 32px",
            fontSize: "15px",
            fontWeight: 600,
            color: "#ffffff",
            textDecoration: "none",
            backgroundColor: colors.accent,
            borderRadius: "8px",
            fontFamily: '"Poppins", sans-serif',
            transition: "all 0.2s ease",
        },
        infoBox: {
            background: `linear-gradient(135deg, ${colors.accent}08 0%, ${colors.accentLight}12 100%)`,
            padding: "24px 28px",
            borderRadius: "12px",
            border: `1px solid ${colors.accent}30`,
            marginBottom: "32px",
            position: "relative" as const,
        },
        infoIcon: {
            display: "inline-block",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: colors.accent,
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: 700,
            lineHeight: "20px",
            textAlign: "center" as const,
            marginRight: "12px",
            verticalAlign: "middle",
        },
        infoText: {
            margin: "0",
            fontSize: "14px",
            color: "#475569",
            lineHeight: "1.6",
            fontFamily: '"Poppins", sans-serif',
        },
        divider: {
            height: "1px",
            backgroundColor: "#e2e8f0",
            margin: "32px 0",
        },
        helpText: {
            margin: "0 0 12px 0",
            fontSize: "14px",
            color: "#64748b",
            lineHeight: "1.6",
            fontFamily: '"Poppins", sans-serif',
        },
        link: {
            color: colors.accent,
            textDecoration: "none",
            fontWeight: 600,
        },
        footer: {
            backgroundColor: "#f8fafc",
            padding: "40px 48px",
            borderTop: "1px solid #e2e8f0",
            textAlign: "center" as const,
        },
        footerBrand: {
            margin: "0 0 16px 0",
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f172a",
            fontFamily: '"Poppins", sans-serif',
        },
        footerTagline: {
            margin: "0 0 20px 0",
            fontSize: "13px",
            color: "#64748b",
            fontFamily: '"Poppins", sans-serif',
        },
        footerText: {
            margin: "0 0 8px 0",
            color: "#94a3b8",
            fontSize: "13px",
            lineHeight: "1.6",
            fontFamily: '"Poppins", sans-serif',
        },
        footerLinks: {
            margin: "20px 0 0 0",
        },
        footerLink: {
            color: "#64748b",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 500,
            margin: "0 12px",
            fontFamily: '"Poppins", sans-serif',
        },
    };

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

                <title>{title}</title>
                <link
                    href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body style={styles.body}>
                {/* Preheader */}
                <div style={{
                    display: "none",
                    fontSize: 1,
                    color: "#ffffff",
                    lineHeight: 1,
                    maxHeight: 0,
                    maxWidth: 0,
                    opacity: 0,
                    overflow: "hidden",
                }}>
                    {title} — DuitRapi
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
                                        {/* Accent Bar */}
                                        <tr>
                                            <td style={styles.accentBar}></td>
                                        </tr>

                                        {/* Header */}
                                        <tr>
                                            <td style={styles.header}>
                                                <h1 style={styles.logoText}>DuitRapi</h1>

                                                {/* Icon */}
                                                <div>
                                                    <img
                                                        src={selectedIcon}
                                                        width="64"
                                                        height="64"
                                                        alt="Verify Account"
                                                        style={{ display: "block", margin: "0 auto" }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Content */}
                                        <tr>
                                            <td style={styles.content}>
                                                <h2 style={styles.title}>{title}</h2>
                                                <p style={styles.greeting}>{greeting}</p>
                                                <p style={styles.bodyText}>{bodyText}</p>

                                                {/* CTA Button */}
                                                <div style={styles.buttonWrapper}>
                                                    <a href={buttonUrl} style={styles.button}>
                                                        {buttonText}
                                                    </a>
                                                </div>

                                                {/* Info Box */}
                                                <div style={styles.infoBox}>
                                                    <p style={styles.infoText}>
                                                        <svg
                                                            width="18"
                                                            height="18"
                                                            viewBox="0 0 512 512"
                                                            fill="none"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            style={{
                                                                display: "inline-block",
                                                                verticalAlign: "middle",
                                                                marginRight: "12px",
                                                                opacity: 0.8,
                                                            }}
                                                        >
                                                            <path
                                                                d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 64L64 145.2V140c.3 75.1 31.2 222 192 301.7C416.8 362 447.7 215.1 448 140v5.2L256 64z"
                                                                fill="#10b981"
                                                            />
                                                        </svg>
                                                        <strong>Security Notice:</strong> This link is
                                                        unique to your account and will expire for your
                                                        protection.
                                                    </p>
                                                </div>

                                                {/* Divider */}
                                                <div style={styles.divider}></div>

                                                {/* Help Section */}
                                                <p style={styles.helpText}>{footerText}</p>
                                                <p style={styles.helpText}>
                                                    If the button doesn't work,{" "}
                                                    <a href={buttonUrl} style={styles.link}>
                                                        copy this link
                                                    </a>{" "}
                                                    instead.
                                                </p>
                                            </td>
                                        </tr>

                                        {/* Footer */}
                                        <tr>
                                            <td style={styles.footer}>
                                                <p style={styles.footerBrand}>DuitRapi</p>
                                                <p style={styles.footerTagline}>
                                                    Your Financial Companion
                                                </p>
                                                <p style={styles.footerText}>Jakarta, Indonesia</p>
                                                {/* <div style={styles.footerLinks}>
                                                    <a href="#" style={styles.footerLink}>
                                                        Privacy
                                                    </a>
                                                    <span style={{ color: "#cbd5e1" }}>•</span>
                                                    <a href="#" style={styles.footerLink}>
                                                        Terms
                                                    </a>
                                                    <span style={{ color: "#cbd5e1" }}>•</span>
                                                    <a href="#" style={styles.footerLink}>
                                                        Support
                                                    </a>
                                                </div> */}
                                                <p
                                                    style={{
                                                        ...styles.footerText,
                                                        marginTop: "16px",
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    © {new Date().getFullYear()} DuitRapi Inc. All rights reserved.
                                                </p>
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
