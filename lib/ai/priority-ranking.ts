export type RankedPriorityItem = {
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  dueDate: string | null;
  reviewRequired: boolean;
};

function priorityRank(priority: RankedPriorityItem["priority"]) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority];
}

export function sortPriorityItems<T extends RankedPriorityItem>(items: T[]) {
  return [...items].sort((first, second) => {
    const priorityDelta = priorityRank(second.priority) - priorityRank(first.priority);
    if (priorityDelta !== 0) return priorityDelta;
    if (first.reviewRequired !== second.reviewRequired) return first.reviewRequired ? -1 : 1;
    if (first.dueDate && second.dueDate) return first.dueDate.localeCompare(second.dueDate);
    if (first.dueDate) return -1;
    if (second.dueDate) return 1;
    return first.title.localeCompare(second.title);
  });
}
