export interface SampleRequest {
  event_type: string;
  date: string;
  guest_count: number;
  budget_range: string;
}

export const SAMPLE_VENDOR_REQUESTS: SampleRequest[] = [
  { event_type: 'wedding', date: 'in 4 months', guest_count: 300, budget_range: '$2,000 - $4,000' },
  { event_type: 'mehndi', date: 'in 6 weeks', guest_count: 80, budget_range: '$800 - $1,500' },
  {
    event_type: 'birthday party',
    date: 'in 3 weeks',
    guest_count: 50,
    budget_range: '$500 - $1,000',
  },
];
