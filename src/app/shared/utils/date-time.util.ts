const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

export function formatDateTime(value: Date | null): string {
  return value ? dateTimeFormatter.format(value) : 'Waiting for update';
}

export function formatRelativeTime(value: Date | null): string {
  if (!value) {
    return 'just now';
  }

  const secondsDifference = Math.round((value.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(secondsDifference);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(secondsDifference, 'seconds');
  }

  const minutesDifference = Math.round(secondsDifference / 60);

  if (Math.abs(minutesDifference) < 60) {
    return relativeTimeFormatter.format(minutesDifference, 'minutes');
  }

  const hoursDifference = Math.round(minutesDifference / 60);

  if (Math.abs(hoursDifference) < 24) {
    return relativeTimeFormatter.format(hoursDifference, 'hours');
  }

  return relativeTimeFormatter.format(Math.round(hoursDifference / 24), 'days');
}