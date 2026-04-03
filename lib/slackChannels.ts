// Branch + Department -> Slack Channel mapping
// Shared between notification routes and frontend channel picker
export const DEPARTMENT_SLACK_CHANNELS: Record<string, Record<string, string>> = {
  'Phoenix - SouthWest': {
    'Maintenance': 'C06J7ULQXV4',
    'Maintenance Recurring': 'C06J7ULQXV4',
    'Maintenance : Maintenance': 'C06J7ULQXV4',
    'Maintenance : Maintenance Recurring': 'C06J7ULQXV4',
    'Irrigation': 'C06J7ULQXV4',
  },
  'Phoenix - SouthEast': {
    'Maintenance': 'C06JT7JU81F',
    'Maintenance Recurring': 'C06JT7JU81F',
    'Maintenance : Maintenance': 'C06JT7JU81F',
    'Maintenance : Maintenance Recurring': 'C06JT7JU81F',
    'Irrigation': 'C06JT7JU81F',
  },
  'Phoenix - North': {
    'Maintenance': 'C0738AHV23H',
    'Maintenance Recurring': 'C0738AHV23H',
    'Maintenance : Maintenance': 'C0738AHV23H',
    'Maintenance : Maintenance Recurring': 'C0738AHV23H',
    'Irrigation': 'C0738AHV23H',
  },
  'Phoenix': {
    'Enhancements': 'C06JTB3QS0Z',
    'Arbor': 'C06JT9Q4A3B',
    'Spray': 'C06U9K3EKT7',
    'PHC': 'C0896PY7EAF',
    'Fleet & Equipment': 'C0896PY7EAF',
  },
  'Las Vegas': {
    'Maintenance': 'C06JBNL7UKX',
    'Maintenance Recurring': 'C06JBNL7UKX',
    'Maintenance : Maintenance': 'C06JBNL7UKX',
    'Maintenance : Maintenance Recurring': 'C06JBNL7UKX',
    'Arbor': 'C06JBNL7UKX',
    'Enhancements': 'C06JBNL7UKX',
    'Irrigation': 'C06JBNL7UKX',
    'Office Operations': 'C06JBNL7UKX',
    'Safety': 'C06JBNL7UKX',
    'PHC': 'C06JBNL7UKX',
    'Spray': 'C06JBNL7UKX',
  },
  'Corporate': {
    'Safety': 'C0896PY7EAF',
    'Fleet & Equipment': 'C0896PY7EAF',
    'Overhead: Equipment & Fleet Operations': 'C0896PY7EAF',
    'Enhancements': 'C06JTB3QS0Z',
    'Arbor': 'C06JT9Q4A3B',
    'Spray': 'C06U9K3EKT7',
    'PHC': 'C0896PY7EAF',
  },
  'Business Development': {
    'Business Development': 'C02KV91H44Q',
  },
  'Test': {
    'Test Channel': 'C046RPZGEHE',
  },
};

// Build a deduplicated list of { branch, department, channelId } for the channel picker
export function getChannelOptions(): { label: string; channelId: string }[] {
  const seen = new Set<string>();
  const options: { label: string; channelId: string }[] = [];

  for (const [branch, departments] of Object.entries(DEPARTMENT_SLACK_CHANNELS)) {
    for (const [department, channelId] of Object.entries(departments)) {
      // Skip duplicated department name variants — only keep the shortest
      if (seen.has(channelId + branch)) continue;
      seen.add(channelId + branch);

      // Use the simplest department name (strip "Maintenance : " prefix)
      const simpleDept = department.replace(/^Maintenance : /, '');
      if (simpleDept === 'Maintenance Recurring') continue; // duplicate of Maintenance

      const label = `${branch} — ${simpleDept}`;
      if (!options.find(o => o.label === label)) {
        options.push({ label, channelId });
      }
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}
