// Central, single source of truth for the real Kaveri company identity.
// Update here once and every public surface (footer, contact, legal pages,
// auth panels) stays consistent. The learning product may keep the academy
// brand, but the legal entity behind it is Kaveri Technologies Private Limited.

export const COMPANY = {
  // Legal entity
  legalName: 'Kaveri Technologies Private Limited',

  // Learning-product brand (display name for the LMS itself)
  brandName: 'Kaveri Technologies Academy',
  tagline: 'Learn Technology. Build Real Projects. Become Industry Ready.',

  // Website
  website: 'www.kaveritech.co.in',
  websiteUrl: 'https://www.kaveritech.co.in',

  // Contact
  email: 'kaveritech2022@gmail.com',
  phoneDisplay: '+91 94900 67803',
  phoneRaw: '+919490067803',

  // Offices
  offices: [
    {
      name: 'Tirupati Office',
      lines: [
        'Flat No. 203, IInd Floor,',
        'Balaji Colony,',
        'Opp. Music College,',
        'Tirupati - 517 501, Andhra Pradesh',
      ],
    },
    {
      name: 'Madanapalle Office',
      lines: [
        'D.No: 4/2-20-14-4,',
        'Back Side Sidharth Theatre,',
        'Krishna Nagar,',
        'Madanapalle - 517325, Andhra Pradesh',
      ],
    },
  ],

  supportNote:
    'Reach us by email or phone, or visit one of our offices during working hours.',
} as const;

export const OFFICE_STRING = COMPANY.offices
  .map(o => `${o.name}: ${o.lines.join(' ')}`)
  .join(' | ');
