/**
 * Terms of Service page — required for Google OAuth verification.
 * Linked from the GCP "OAuth consent screen / Branding" configuration.
 */

export const metadata = {
  title: 'Terms of Service — Koenig Keyword Planner',
  description: 'Terms governing use of the Koenig Keyword Planner internal tool.',
}

const LAST_UPDATED = '2026-04-28'
const COMPANY_NAME = 'Koenig Solutions Pvt. Ltd.'
const APP_NAME = 'Koenig Keyword Planner'
const SUPPORT_EMAIL = 'vardaan.aggarwal@koenig-solutions.com'

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {LAST_UPDATED}</p>

      <section className="space-y-4 mb-8">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {APP_NAME}
          (&ldquo;the Service&rdquo;), an internal Google Ads keyword research tool operated by{' '}
          {COMPANY_NAME} (&ldquo;Koenig&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By signing
          in to the Service, you agree to these Terms.
        </p>
      </section>

      <h2 className="text-xl font-semibold mt-10 mb-3">1. Eligibility</h2>
      <p>
        The Service is for use only by authorized members of Koenig&rsquo;s marketing team and
        employees with explicit access to the Koenig Google Ads Manager (MCC) account hierarchy.
        Unauthorized access is prohibited.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">2. Description of the Service</h2>
      <p>
        The Service helps Koenig users perform read-only keyword research against Google Ads
        Keyword Planner data: discover keyword ideas, view search-volume and competition metrics,
        and receive AI-assisted analysis and recommendations. The Service does not modify any
        Google Ads campaigns, ad groups, keywords, bids, or budgets.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">3. Account and authorization</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You sign in via Google. By signing in, you authorize the Service to read keyword and
          campaign data from Google Ads accounts you have access to.</li>
        <li>You are responsible for maintaining the confidentiality of your Google account
          credentials.</li>
        <li>You may revoke the Service&rsquo;s access at any time at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-electric)] underline"
          >
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">4. Acceptable use</h2>
      <p className="mb-3">You agree not to:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Use the Service for any purpose other than legitimate Koenig marketing operations.</li>
        <li>Attempt to access Google Ads data outside the scope of your authorized accounts.</li>
        <li>Reverse-engineer, scrape, or otherwise abuse the Service or the underlying Google
          Ads API.</li>
        <li>Share your account credentials with unauthorized parties.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">5. Data and privacy</h2>
      <p>
        Your use of the Service is also governed by our{' '}
        <a href="/privacy" className="text-[var(--accent-electric)] underline">Privacy Policy</a>
        , which describes what data we collect, how we use it, and your choices.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">6. Intellectual property</h2>
      <p>
        The Service, including its source code, UI, and AI-generated outputs, is the property of
        Koenig. Keyword data shown in the Service is sourced from Google Ads and is subject to
        Google&rsquo;s terms.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">7. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; for internal use. Search-volume figures,
        bid estimates, and AI-generated recommendations are best-effort and may contain errors;
        users should validate critical decisions independently. Koenig disclaims all warranties to
        the maximum extent permitted by applicable law.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Koenig will not be liable for any indirect,
        incidental, or consequential damages arising from use of the Service. The Service is an
        internal tool and is not offered as a paid product to external customers.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">9. Termination</h2>
      <p>
        Koenig may suspend or terminate access to the Service at any time, particularly if access
        is used in violation of these Terms. You may stop using the Service at any time by
        revoking access via your Google account.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">10. Changes to these Terms</h2>
      <p>
        We may update these Terms occasionally. The &ldquo;Last updated&rdquo; date at the top
        reflects the most recent change. Continued use of the Service after changes constitutes
        acceptance of the updated Terms.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">11. Contact</h2>
      <p>
        Questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent-electric)] underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  )
}
