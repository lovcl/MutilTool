const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PRIVACY_CONFIG = {
  maxFailedAttempts: 5,
  minPasswordLength: 4,
  securityQuestionPool: [
    { id: 'fruit', text: '你最喜欢的水果是什么？' },
    { id: 'city', text: '你出生在哪座城市？' },
    { id: 'color', text: '你最喜欢的颜色是什么？' },
    { id: 'school', text: '你小学的校名是什么？' },
    { id: 'season', text: '你最喜欢的季节是什么？' },
    { id: 'phone', text: '你第一台手机的品牌是什么？' },
    { id: 'mother', text: '你母亲的姓氏是什么？' },
    { id: 'friend', text: '你童年最好朋友的昵称是什么？' },
  ],
};

const createPrivacyModeModule = ({
  userDataPath,
  getPrivacyRules,
  resetAllUserData,
  getMainWindow,
}) => {
  const privacyPath = path.join(userDataPath, 'privacy-mode.json');
  let sessionUnlocked = false;

  const getRules = () => ({
    ...DEFAULT_PRIVACY_CONFIG,
    ...(getPrivacyRules?.() || {}),
  });

  const loadPrivacyState = () => {
    if (!fs.existsSync(privacyPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(privacyPath, 'utf8'));
    } catch (error) {
      console.error('[privacy-mode] 读取失败:', error.message);
      return null;
    }
  };

  const savePrivacyState = (state) => {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(privacyPath, JSON.stringify(state, null, 2));
  };

  const normalizeText = (value) => String(value || '').trim().toLowerCase();

  const hashSecret = (secret) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(normalizeText(secret), salt, 64).toString('hex');
    return { salt, hash };
  };

  const verifySecret = (secret, salt, hash) => {
    if (!salt || !hash) {
      return false;
    }

    const attempt = crypto.scryptSync(normalizeText(secret), salt, 64).toString('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  };

  const randomPickQuestions = (count = 3) => {
    const pool = [...(getRules().securityQuestionPool || [])];
    const selected = [];

    while (selected.length < count && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(index, 1)[0]);
    }

    return selected;
  };

  const getQuestionText = (questionId) => {
    const question = (getRules().securityQuestionPool || []).find((item) => item.id === questionId);
    return question?.text || '密保问题';
  };

  const isConfigured = () => {
    const state = loadPrivacyState();
    return Boolean(state?.passwordHash && Array.isArray(state?.questions) && state.questions.length === 3);
  };

  const isEnabled = () => {
    const state = loadPrivacyState();
    return Boolean(state?.enabled && isConfigured());
  };

  const requiresUnlock = () => isEnabled() && !sessionUnlocked;

  const lockSession = () => {
    sessionUnlocked = false;
  };

  const unlockSession = () => {
    sessionUnlocked = true;
  };

  const getStatus = () => {
    const state = loadPrivacyState();
    const rules = getRules();
    const configured = isConfigured();
    const enabled = Boolean(state?.enabled && configured);
    const lockedOut = Boolean(state?.lockedOut);
    const failedAttempts = Number(state?.failedAttempts || 0);

    return {
      enabled,
      configured,
      locked: enabled && !sessionUnlocked,
      lockedOut,
      failedAttempts,
      maxFailedAttempts: rules.maxFailedAttempts,
      minPasswordLength: rules.minPasswordLength,
      requiresUnlock: enabled && !sessionUnlocked,
    };
  };

  const validatePassword = (password) => {
    const minLength = getRules().minPasswordLength || 4;
    const normalized = String(password || '');

    if (normalized.length < minLength) {
      throw new Error(`密码至少 ${minLength} 位`);
    }
  };

  const registerFailedAttempt = () => {
    const state = loadPrivacyState() || {};
    const failedAttempts = Number(state.failedAttempts || 0) + 1;
    const lockedOut = failedAttempts >= getRules().maxFailedAttempts;

    savePrivacyState({
      ...state,
      failedAttempts,
      lockedOut,
    });

    return {
      failedAttempts,
      lockedOut,
      remainingAttempts: Math.max(getRules().maxFailedAttempts - failedAttempts, 0),
    };
  };

  const resetFailedAttempts = () => {
    const state = loadPrivacyState();
    if (!state) {
      return;
    }

    savePrivacyState({
      ...state,
      failedAttempts: 0,
      lockedOut: false,
    });
  };

  const setupPrivacyMode = ({ password, confirmPassword, answers = [] }) => {
    validatePassword(password);

    if (password !== confirmPassword) {
      throw new Error('两次输入的密码不一致');
    }

    if (!Array.isArray(answers) || answers.length !== 3) {
      throw new Error('请完整填写 3 个密保问题答案');
    }

    const questionIds = answers.map((item) => item.questionId);
    if (new Set(questionIds).size !== 3) {
      throw new Error('密保问题无效，请重新设置');
    }

    for (const item of answers) {
      if (!normalizeText(item.answer)) {
        throw new Error('密保答案不能为空');
      }
    }

    const passwordSecret = hashSecret(password);
    const questions = answers.map((item) => {
      const answerSecret = hashSecret(item.answer);
      return {
        id: item.questionId,
        text: getQuestionText(item.questionId),
        answerSalt: answerSecret.salt,
        answerHash: answerSecret.hash,
      };
    });

    savePrivacyState({
      enabled: true,
      passwordSalt: passwordSecret.salt,
      passwordHash: passwordSecret.hash,
      questions,
      failedAttempts: 0,
      lockedOut: false,
      setupAt: new Date().toISOString(),
    });

    unlockSession();
    return getStatus();
  };

  const verifyPassword = (password) => {
    const state = loadPrivacyState();
    if (!state?.enabled) {
      return { ok: true, unlocked: true };
    }

    if (state.lockedOut) {
      throw new Error('密码错误次数过多，请重置所有配置和数据');
    }

    const ok = verifySecret(password, state.passwordSalt, state.passwordHash);
    if (ok) {
      resetFailedAttempts();
      unlockSession();
      return { ok: true, unlocked: true };
    }

    const failure = registerFailedAttempt();
    return {
      ok: false,
      unlocked: false,
      ...failure,
    };
  };

  const enablePrivacyMode = () => {
    const state = loadPrivacyState();
    if (!isConfigured()) {
      throw new Error('请先完成隐私模式设置');
    }

    savePrivacyState({
      ...state,
      enabled: true,
      failedAttempts: 0,
      lockedOut: false,
    });
    return getStatus();
  };

  const disablePrivacyMode = (password) => {
    const state = loadPrivacyState();
    if (!state?.enabled) {
      return getStatus();
    }

    if (!verifySecret(password, state.passwordSalt, state.passwordHash)) {
      throw new Error('密码错误，无法关闭隐私模式');
    }

    savePrivacyState({
      ...state,
      enabled: false,
      failedAttempts: 0,
      lockedOut: false,
    });
    unlockSession();
    return getStatus();
  };

  const changePrivacyPassword = ({ currentPassword, newPassword, confirmPassword }) => {
    const state = loadPrivacyState();
    if (!isConfigured()) {
      throw new Error('请先完成隐私模式设置');
    }

    if (!verifySecret(currentPassword, state.passwordSalt, state.passwordHash)) {
      throw new Error('当前密码错误');
    }

    validatePassword(newPassword);
    if (newPassword !== confirmPassword) {
      throw new Error('两次输入的新密码不一致');
    }

    if (normalizeText(currentPassword) === normalizeText(newPassword)) {
      throw new Error('新密码不能与当前密码相同');
    }

    const passwordSecret = hashSecret(newPassword);
    savePrivacyState({
      ...state,
      passwordSalt: passwordSecret.salt,
      passwordHash: passwordSecret.hash,
      failedAttempts: 0,
      lockedOut: false,
    });

    return getStatus();
  };

  const getSecurityQuestions = () => {
    const state = loadPrivacyState();
    if (!state?.questions?.length) {
      return [];
    }

    return state.questions.map((item) => ({
      id: item.id,
      text: item.text || getQuestionText(item.id),
    }));
  };

  const recoverWithSecurityAnswer = ({ questionId, answer, newPassword, confirmPassword }) => {
    const state = loadPrivacyState();
    if (!state?.questions?.length) {
      throw new Error('尚未设置密保问题');
    }

    validatePassword(newPassword);
    if (newPassword !== confirmPassword) {
      throw new Error('两次输入的新密码不一致');
    }

    const matched = state.questions.find((item) => item.id === questionId);
    if (!matched || !verifySecret(answer, matched.answerSalt, matched.answerHash)) {
      throw new Error('密保答案错误');
    }

    const passwordSecret = hashSecret(newPassword);
    savePrivacyState({
      ...state,
      enabled: true,
      passwordSalt: passwordSecret.salt,
      passwordHash: passwordSecret.hash,
      failedAttempts: 0,
      lockedOut: false,
    });
    unlockSession();
    return getStatus();
  };

  const resetAllDataAndPrivacy = () => {
    if (fs.existsSync(privacyPath)) {
      fs.unlinkSync(privacyPath);
    }

    sessionUnlocked = false;
    resetAllUserData?.();
    getMainWindow()?.webContents.send('privacyMode:resetComplete');
    return getStatus();
  };

  const notifyLockRequired = () => {
    if (isEnabled()) {
      lockSession();
      getMainWindow()?.webContents.send('privacyMode:lockRequired');
    }
  };

  const beginProtectedFlow = () => {
    unlockSession();
    return getStatus();
  };

  const endProtectedFlow = () => {
    if (isEnabled()) {
      lockSession();
      getMainWindow()?.webContents.send('privacyMode:lockRequired');
    }
    return getStatus();
  };

  return {
    getStatus,
    isEnabled,
    isConfigured,
    requiresUnlock,
    lockSession,
    unlockSession,
    notifyLockRequired,
    beginProtectedFlow,
    endProtectedFlow,
    getSetupQuestions: () => randomPickQuestions(3),
    setupPrivacyMode,
    verifyPassword,
    enablePrivacyMode,
    disablePrivacyMode,
    changePrivacyPassword,
    getSecurityQuestions,
    recoverWithSecurityAnswer,
    resetAllDataAndPrivacy,
  };
};

module.exports = { createPrivacyModeModule };
