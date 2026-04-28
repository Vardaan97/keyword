/**
 * Privacy Policy page — required for Google OAuth verification (sensitive Google Ads scope).
 *
 * This page is referenced from the GCP "OAuth consent screen / Branding" configuration
 * and is shown to users on Google's consent screen during the OAuth flow.
 */

export const metadata = {
  title: 'Privacy Policy — Koenig Keyword Planner',
  description: 'How Koenig Keyword Planner handles user data and Google Ads API access.',
}

const LAST_UPDATED = '2026-04-28'
const COMPANY_NAME = 'Koenig Solutions Pvt. Ltd.'
const APP_NAME = 'Koenig Keyword Planner'
const SUPPORT_EMAIL = 'vardaan.aggarwal@koenig-solutions.com'

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {LAST_UPDATED}</p>

      <section className="space-y-4 mb-8">
        <p>
          {APP_NAME} (&ldquo;the Service&rdquo;) is operated by {COMPANY_NAME}
          (&ldquo;Koenig&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy describes what data the
          Service collects, how it is used, and the choices users have. The Service is an internal
          B2B tool used by Koenig&rsquo;s marketing team for Google Ads keyword research.
        </p>
      </section>

      <h2 className="text-xl font-semibold mt-10 mb-3">1. Who can use the Service</h2>
      <p className="mb-4">
        The Service is intended for authorized members of Koenig&rsquo;s marketing team. Users
        authenticate via Google Sign-In and must have access to the Koenig Google Ads Manager
        (MCC) account hierarchy.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">2. Data we collect</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Google account profile</strong> — your email address and basic profile, returned
          by Google during sign-in. We use this to identify you within the Service.
        </li>
        <li>
          <strong>Google OAuth tokens</strong> — a refresh token issued by Google when you
          authorize the Service. Stored encrypted-at-rest in our managed database (Convex) and
          used solely to call the Google Ads API on your behalf.
        </li>
        <li>
          <strong>Course and keyword inputs</strong> — the course names, URLs, and CSV uploads you
          submit to the Service for keyword research.
        </li>
        <li>
          <strong>Service operational data</strong> — request logs, generated keyword sets, and
          AI-derived analyses, retained to power caching, history, and cost reporting.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">
        3. How we use your data — Google API Services User Data Policy
      </h2>
      <p className="mb-4">
        The Service&rsquo;s use and transfer of information received from Google APIs to any other
        app will adhere to the{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-electric)] underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p className="mb-4">
        Specifically, the <code className="text-sm bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">https://www.googleapis.com/auth/adwords</code> scope is used only to:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Read keyword ideas and search-volume data from Google Ads Keyword Planner.</li>
        <li>Read existing keywords in your authorized Google Ads accounts to detect overlaps and
          tag results with an &ldquo;in account&rdquo; status.</li>
        <li>Read campaign and ad-group structure for the same display purposes.</li>
      </ul>
      <p className="mt-4">
        We do <strong>not</strong> create, modify, pause, or delete campaigns, ad groups,
        keywords, ads, bids, or budgets. The integration is read-only.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">4. How data is stored and protected</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>OAuth refresh tokens are stored in Convex, a managed serverless database with
          encryption at rest and TLS in transit. Tokens are never written to logs.</li>
        <li>Application servers are hosted on Vercel; all traffic is served over HTTPS.</li>
        <li>Access to the underlying database and to deployment infrastructure is restricted to
          Koenig&rsquo;s engineering operators.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">5. Data sharing</h2>
      <p>
        We do <strong>not</strong> sell your data. We do not share Google user data with third
        parties except subprocessors strictly necessary to operate the Service: Google (Ads API
        access), Convex (database), Vercel (hosting), and OpenRouter / OpenAI (AI keyword analysis,
        which receives only the keyword text and course-context fields, never your Google
        identity or tokens).
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">6. Data retention</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>OAuth tokens</strong> — retained until you revoke access via your{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-electric)] underline"
          >
            Google Account permissions page
          </a>{' '}
          or until the token expires per Google&rsquo;s rules.
        </li>
        <li><strong>Cached keyword data</strong> — retained for up to 7 days, then refreshed.</li>
        <li><strong>Saved research sessions</strong> — retained until you delete them from the
          Service&rsquo;s history view.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">7. Your choices</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You may revoke the Service&rsquo;s Google access at any time at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-electric)] underline"
          >
            myaccount.google.com/permissions
          </a>
          . On next access, you will be required to reauthorize.
        </li>
        <li>You may request deletion of your account-level data by emailing{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent-electric)] underline">
            {SUPPORT_EMAIL}
          </a>
          .</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">8. Children</h2>
      <p>The Service is not directed to children under 16 and is intended for business use only.</p>

      <h2 className="text-xl font-semibold mt-10 mb-3">9. Changes to this policy</h2>
      <p>
        We may update this policy occasionally. The &ldquo;Last updated&rdquo; date at the top
        reflects the most recent change. Material changes will be communicated to authorized
        users by email.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-3">10. Contact</h2>
      <p>
        Questions or requests:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent-electric)] underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  )
}
