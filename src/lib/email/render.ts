/**
 * Branded email chrome shared by every transactional + marketing email.
 * Wraps a body slot in M+-token-colored cream header band + Spectral-fallback
 * wordmark + hot-pink dot accent + hairline divider + 600px content block +
 * ink-soft footer with current year.
 *
 * All styles inlined because email clients (Outlook especially) drop <style>
 * blocks and any modern CSS. Table-based layout for the same reason.
 *
 * @see docs/superpowers/specs/2026-05-26-baazar-resend-wireup-design.md
 */

export interface BrandedEmailOptions {
  /** Pre-rendered HTML body. The caller is responsible for escaping any user
   * input. Goes into the content block, between header and footer. */
  bodyHtml: string;
}

export function renderBrandedEmail({ bodyHtml }: BrandedEmailOptions): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#FBF6EC;font-family:Helvetica,Arial,sans-serif;color:#1B1414;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FBF6EC;">
            <tr>
              <td style="background:#F4ECDC;padding:24px 32px;border-bottom:1px solid #E8DFC8;">
                <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B1414;letter-spacing:-0.012em;">baazar<span style="color:#D1006C;">.</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:16px;line-height:1.55;color:#1B1414;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid #E8DFC8;font-size:12px;color:#5F5650;text-align:center;">
                &copy; ${year} Baazar Marketplace · Chicago, IL
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
