/**
 * Geo Authorization Module
 *
 * Maps vendor → authorized countries based on the Koenig geo authorization conditions.
 * Used to filter export campaigns — only show campaigns in regions where the vendor
 * has authorized Koenig to advertise their courses.
 *
 * Data source: /Documents/Geo authorization conditions.xlsx
 * Hardcoded here for performance (no Excel parsing at runtime).
 * Update this file when authorization changes.
 *
 * Vendors NOT listed here are assumed to be globally authorized (e.g., Microsoft, CompTIA).
 */

export interface GeoAuthorization {
  vendor: string
  authorizedCountries: string[]
  isGlobal: boolean  // true if vendor can be advertised everywhere
}

// Vendors with RESTRICTED authorization (only specific countries)
// Vendors not in this list = globally authorized
const RESTRICTED_VENDORS: Record<string, string[]> = {
  'Oracle': ['India', 'Australia'],
  'SAP': ['India'],
  'Check Point': ['India'],
  'Autodesk': ['India'],
  'Cloudera': ['India'],
  'Red Hat': ['India'],
  'VMware': ['India', 'Nepal', 'Bangladesh'],
  'Broadcom': [
    'American Samoa', 'Australia', 'Fiji', 'French Polynesia',
    'Guam', 'India', 'New Caledonia', 'New Zealand', 'Samoa'
  ],
  'AWS': [
    'Australia', 'Angola', 'Bangladesh', 'Bhutan', 'India',
    'Indonesia', 'Japan', 'Maldives', 'Nepal', 'New Zealand',
    'Philippines', 'Singapore', 'Sri Lanka', 'Thailand', 'Vietnam'
  ],
  'Cisco': [
    'India', 'Bangladesh', 'Bhutan', 'Maldives', 'Nepal', 'Sri Lanka',
    'Afghanistan', 'Pakistan', 'Mongolia', 'Brunei', 'Cambodia',
    'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines',
    'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam',
    'Australia', 'Fiji', 'New Zealand', 'Papua New Guinea', 'Samoa',
    'Bahrain', 'Iraq', 'Jordan', 'Kuwait', 'Oman',
    'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen',
    'Egypt', 'Iran', 'Lebanon', 'Libya', 'Syria', 'Turkey'
  ],
}

// Globally authorized vendors (can advertise everywhere)
const GLOBAL_VENDORS = [
  'Microsoft', 'CompTIA', 'PMI', 'ITIL', 'Axelos',
  'ISC2', 'EC-Council', 'CertNexus', 'Linux Foundation', 'PECB',
  'Google Cloud', 'Salesforce', 'ServiceNow', 'Tableau',
  'Snowflake', 'Databricks', 'Palo Alto', 'Fortinet', 'HashiCorp', 'Kubernetes',
]

/**
 * Get authorization status for a vendor
 */
export function getVendorAuthorization(vendorName: string): GeoAuthorization {
  // Normalize vendor name for matching
  const normalized = vendorName.trim()

  // Check restricted vendors first (case-insensitive fuzzy match)
  for (const [vendor, countries] of Object.entries(RESTRICTED_VENDORS)) {
    if (
      normalized.toLowerCase().includes(vendor.toLowerCase()) ||
      vendor.toLowerCase().includes(normalized.toLowerCase())
    ) {
      return {
        vendor,
        authorizedCountries: countries,
        isGlobal: false
      }
    }
  }

  // Default: globally authorized
  return {
    vendor: normalized,
    authorizedCountries: [],  // empty = no restrictions
    isGlobal: true
  }
}

/**
 * Check if a vendor is authorized for a specific country
 */
export function isAuthorizedForCountry(vendorName: string, country: string): boolean {
  const auth = getVendorAuthorization(vendorName)

  // Global vendors are authorized everywhere
  if (auth.isGlobal) return true

  // Check if the country is in the authorized list
  return auth.authorizedCountries.some(c =>
    c.toLowerCase() === country.toLowerCase() ||
    country.toLowerCase().includes(c.toLowerCase()) ||
    c.toLowerCase().includes(country.toLowerCase())
  )
}

/**
 * Filter a list of campaigns by vendor authorization
 * Returns campaigns with an `authorized` flag
 */
export function filterCampaignsByAuthorization(
  vendor: string,
  campaigns: { campaignName: string; locations: string[] }[]
): { campaignName: string; locations: string[]; authorized: boolean }[] {
  const auth = getVendorAuthorization(vendor)

  if (auth.isGlobal) {
    // All campaigns are authorized
    return campaigns.map(c => ({ ...c, authorized: true }))
  }

  // Check each campaign's geo targets against authorized countries
  return campaigns.map(campaign => {
    const hasAuthorizedLocation = campaign.locations.some(location =>
      auth.authorizedCountries.some(c =>
        location.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(location.toLowerCase())
      )
    )

    return {
      ...campaign,
      authorized: hasAuthorizedLocation
    }
  })
}

/**
 * Get all vendors with their authorization status
 */
export function getAllVendorAuthorizations(): GeoAuthorization[] {
  const result: GeoAuthorization[] = []

  // Add restricted vendors
  for (const [vendor, countries] of Object.entries(RESTRICTED_VENDORS)) {
    result.push({ vendor, authorizedCountries: countries, isGlobal: false })
  }

  // Add global vendors
  for (const vendor of GLOBAL_VENDORS) {
    result.push({ vendor, authorizedCountries: [], isGlobal: true })
  }

  return result
}
