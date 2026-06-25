export const PERFORMANCE_ACHIEVEMENT_MESSAGES = {
  today: '今日绩效达标啦，你好棒哦！',
  month: '本月绩效达标了噢，继续保持～',
  quarter: '季度绩效也达标啦，太厉害了！',
};

export const isPerformanceTargetMet = (completed, target) => {
  const done = Number(completed) || 0;
  const goal = Number(target) || 0;

  if (goal <= 0) {
    return done > 0;
  }

  return done + 1e-6 >= goal;
};

export const getPerformanceAchievement = (completed, target, scope) => {
  if (!PERFORMANCE_ACHIEVEMENT_MESSAGES[scope]) {
    return null;
  }

  if (!isPerformanceTargetMet(completed, target)) {
    return null;
  }

  return {
    scope,
    text: PERFORMANCE_ACHIEVEMENT_MESSAGES[scope],
  };
};

export const collectPerformanceAchievements = (items) =>
  items
    .map(({ completed, target, scope }) => getPerformanceAchievement(completed, target, scope))
    .filter(Boolean);
