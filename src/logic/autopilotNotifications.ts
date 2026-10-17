export interface AutopilotNotification {
  title: string
  description: string
}

export const deliverAutopilotNotifications = (
  notifications: AutopilotNotification[], silent: boolean, notify: (title: string, description: string) => void
): string[] => {
  if (!silent) {
    for (const notification of notifications) notify(notification.title, notification.description)
    return []
  }
  const counts = new Map<string, number>()
  for (const notification of notifications) counts.set(notification.title, (counts.get(notification.title) ?? 0) + 1)
  return [...counts].map(([title, count]) => `${title} ×${count}`)
}
