import { useEffect, useState } from "react"
import type { BlockerType, Language } from "@/types"

const STORAGE_KEY = "sharp.lang"

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "uk" || saved === "en") return saved
  } catch {
    // ignore storage failures
  }
  return "uk"
}

export function setStoredLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
    window.dispatchEvent(new CustomEvent("sharp-lang-change", { detail: lang }))
  } catch {
    // ignore
  }
}

export function useLanguage(): [Language, (lang: Language) => void] {
  const [lang, setLang] = useState<Language>(getStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<Language>
      if (custom.detail === "uk" || custom.detail === "en") {
        setLang(custom.detail)
      }
    }
    window.addEventListener("sharp-lang-change", handler)
    return () => window.removeEventListener("sharp-lang-change", handler)
  }, [])

  const updateLang = (next: Language) => {
    setLang(next)
    setStoredLanguage(next)
  }

  return [lang, updateLang]
}

export const BLOCKER_LABELS: Record<BlockerType, { uk: string; en: string }> = {
  overwhelm: { uk: "Завеликий обсяг задачі", en: "Scope Overwhelm" },
  unclear_scope: { uk: "Нечітка задача", en: "Unclear Scope" },
  perfectionism: { uk: "Перфекціонізм / Страх зробити неідеально", en: "Perfectionism Paralysis" },
  missing_knowledge: { uk: "Бракує знань по темі", en: "Knowledge Gap" },
  fatigue: { uk: "Втома / важко розкачатись", en: "Activation Fatigue" },
}

const RAW_BLOCKER_RE = /\b(overwhelm|unclear_scope|perfectionism|missing_knowledge|fatigue)\b/gi

export function formatMemoryText(text: string, lang: Language): string {
  if (!text) return text
  let formatted = text.replace(RAW_BLOCKER_RE, (match) => {
    const key = match.toLowerCase() as BlockerType
    return BLOCKER_LABELS[key]?.[lang] ?? match
  })
  if (lang === "en") {
    formatted = formatted
      .replace(/\bЗадача:/g, "Task:")
      .replace(/\bБлокер:/g, "Blocker:")
      .replace(/\bПідсумок:/g, "Summary:")
  } else {
    formatted = formatted
      .replace(/\bTask:/g, "Задача:")
      .replace(/\bBlocker:/g, "Блокер:")
      .replace(/\bSummary:/g, "Підсумок:")
  }
  return formatted
}

export const COPY = {
  uk: {
    brandTagline: "Допомагати вам, а не замінювати вас.",
    brandSub: "Помічник, що допомагає зрушити задачу з місця без готових рішень замість тебе",
    navWorkspace: "Робочий простір",
    navLibrary: "Бібліотека методів",
    navMemory: "Пам'ять і профіль",
    signOut: "Вийти",
    newTask: "Нова задача",
    sessionsHistory: "Історія сесій",
    noSessionsYet: "Поки немає активних розборів",
    searchTasksLabel: "Пошук по задачах",
    searchTasksPlaceholder: "Пошук...",
    clearSearch: "Очистити пошук",
    recentTasksHeading: "Останні задачі",
    searchResultsHeading: "Результати пошуку",
    noMatchingSessions: "Задач за запитом не знайдено",
    streakLabel: "Серія стартів",
    proactiveBannerPrefix: "Незавершений Крок #1",
    proactiveResume: "Продовжити зараз",
    dismissBanner: "Сховати нагадування",
    phase1Title: "Над чим застрягли?",
    phase1Titles: [
      "Над чим застрягли?",
      "Що сьогодні гальмує?",
      "З чого важко почати?",
      "Яку задачу розберемо?",
      "Де зараз головний затик?",
      "Що відкладається найдовше?",
      "Який наступний крок неясний?",
      "Що тримає вас на місці?",
      "Що розкладемо по поличках?",
      "У чому зараз затик?",
    ],
    phase1Sub:
      "Sharp не робить роботу замість тебе. За кілька точних питань ти сам побачиш, що саме гальмує, і отримаєш простий перший крок на 2 хвилини.",
    problemLabel: "Опишіть задачу або запит",
    problemPlaceholder: "Опишіть задачу...",
    composerModeLabel: "Формат роботи",
    composerModeChat: "Чат",
    composerModeTask: "Завдання",
    chatStarterPlaceholder: "Запитайте будь-що або опишіть думку...",
    chatStartAction: "Надіслати",
    chatStarting: "Асистент відповідає...",
    assistantChatTitle: "Асистент по задачі",
    assistantChatSubtitle: "Живий чат по цій задачі без перемикання кроків.",
    assistantChatBtn: "Асистент",
    assistantChatTrigger: "Спитати асистента у вільному чаті",
    assistantChatEmpty:
      "Не зрозуміло питання, хочеш заперечити чи уточнити деталь? Пиши вільно — асистент відповість по суті, не збиваючи бліц чи план.",
    assistantChatPlaceholder: "Напиши питання, реакцію чи уточнення...",
    assistantChatSend: "Надіслати",
    assistantChatSending: "Асистент відповідає...",
    assistantYouLabel: "Ви",
    assistantRoleLabel: "Асистент",
    chatCompleteTitle: "Питання розібрано — час переходити до дії",
    chatCompleteDesc:
      "Ви отримали достатній план дій. Перейдіть до виконання кроків або почніть нову задачу.",
    chatCompleteToSteps: "Перейти до виконання кроків",
    convertToPlanBtn: "Розбити на план кроків",
    convertingToPlan: "Будую план...",
    phaseTagChat: "чат",
    phaseTagSocratic: "бліц",
    phaseTagExecuting: "в роботі",
    phaseTagCompleted: "завершено",
    methodChipPrefix: "Метод",
    chooseInitialMethod: "Метод розбору",
    autoSelectMethod: "Авто (ШІ)",
    autoMethodHint: "ШІ сам обере підхід під твою задачу",
    openMethodLibraryLink: "Бібліотека методів",
    methodsOnboardingTitle: "6 методів мислення під рукою",
    methodsOnboardingBody:
      "Окрім вільного чату, тут є Сократівський розбір, 5 Чому, Перші принципи та інші техніки. Переглянути їх можна у «Бібліотеці методів» або в режимі «Завдання».",
    methodsOnboardingOpenBtn: "Відкрити бібліотеку",
    methodsOnboardingDismissBtn: "Зрозуміло",
    methodHighlightPrompt: "Оберіть метод нижче або залиште «Авто (ШІ)»",
    quickExamplesLabel: "Або оберіть сценарій старту",
    attachFile: "Додати файл",
    removeAttachment: "Прибрати файл",
    voiceStart: "Голосове введення",
    voiceStop: "Зупинити запис",
    voiceListening: "Слухаю...",
    voiceNotSupported:
      "Голосове введення не підтримується в цьому браузері (спробуйте Chrome, Edge або Safari).",
    attachmentTooLarge: "Файл завеликий (макс. 2.5 МБ)",
    attachmentNeedInput: "Опишіть задачу (від 3 символів) або прикріпіть файл",
    attachedFilesLabel: "Прикріплені файли",
    dropFilesHint: "Відпустіть файли, щоб прикріпити",
    example1: "Відкладаю курсову з баз даних через страх зробити погану структуру",
    example2: "Напиши за мене код лабораторної з патернів проєктування",
    example3: "Застряг на підготовці 5-хвилинного пітчу, занадто багато думок",
    startDiagnosis: "Почати розбір",
    analyzing: "Розбираємо задачу...",
    phaseDiagnostic: "1. Діагностика",
    phaseBlitz: "2. Питання по суті",
    phaseExecution: "3. План і Pomodoro",
    questionProgress: "Питання",
    of: "з",
    guardrailBadge: "АНТИ-РІШЕННЯ БАР'ЄР",
    guardrailText:
      "Готових відповідей замість тебе тут немає — розіб'ємо задачу так, щоб ти легко зробив її сам.",
    memoryInsightTitle: "Пам'ять агента",
    memoryInsightSub: "Схожий затик уже траплявся раніше:",
    methodBadgeTip: "Натисніть, щоб відкрити пояснення методу або перемкнути режим",
    pickHypothesis: "Оберіть варіант (або натисніть клавішу 1–4):",
    orCustomAnswer: "Або напишіть коротко своїми словами:",
    customPlaceholder: "1–2 прості речення...",
    submitAnswer: "Далі",
    skipToPlan: "Перейти до плану зараз",
    previousAnswers: "Ваш хід думок у цій сесії",
    previousQuestion: "Назад",
    nextQuestion: "Вперед",
    backToQuestions: "Повернутися до питань",
    backToPlan: "Повернутися до плану",
    selectedAnswerBadge: "Обрано",
    editingAnswerBadge: "Попередня відповідь",
    editingAnswerHint: "Оберіть інший варіант або оновіть текст — наступні кроки перерахуються.",
    editAnswerBtn: "Змінити",
    editingNowBadge: "Редагуєте",
    planTitle: "План простих кроків",
    planRuleHint: "Наступний крок відкривається після виконання поточного.",
    stepActive: "АКТИВНИЙ КРОК",
    stepLocked: "ЗАБЛОКОВАНО",
    stepDone: "ВИКОНАНО",
    stepSplit: "РОЗБИТО НА ПІДКРОКИ",
    stepLimitReachedTitle: "Досягнуто максимальну деталізацію (15 кроків)",
    stepLimitReachedBody:
      "Подальше розбиття зупинено, щоб не застрягнути у нескінченному плануванні замість роботи. Що робити далі: увімкни таймер на 2 хвилини та виконай поточний найменший мікрокрок у чорновому вигляді.",
    timerTitle: "Фокус-таймер",
    startTimer: "Старт",
    pauseTimer: "Пауза",
    resetTimer: "Скинути",
    reflectionLabel: "Короткий підсумок кроку (необов'язково)",
    reflectionPlaceholder: "Що вдалося зробити за цей час?",
    completeStep: "Виконано → Наступний крок",
    stuckStep: "Застряг → Розбити дрібніше",
    sessionDoneTitle: "Задачу зрушено з місця!",
    sessionDoneDesc:
      "Досвід збережено. Наступного разу Sharp одразу врахує, що допомогло тобі почати.",
    libraryTitle: "Курована бібліотека методів мислення",
    librarySubtitle:
      "Практичні підходи, які допомагають розкласти складну задачу на прості дії. Можна перемкнути в будь-який момент.",
    whenToUse: "Коли стає у пригоді",
    howItWorks: "Як це працює",
    antiPattern: "Типова пастка",
    exampleQ: "Приклад питання",
    applyMethodBtn: "Запустити сесію з цим методом",
    switchToMethodBtn: "Перемкнути поточну сесію на цей метод",
    closeDialog: "Закрити",
    memoryTitle: "Твій профіль і збережений досвід",
    memorySubtitle:
      "Тут зібрано твої завершені старти: видно, що найчастіше гальмує роботу і які підходи найкраще допомагають почати.",
    statSteps: "Виконано кроків",
    statSessions: "Завершено сесій",
    statFocus: "Хвилин у фокусі",
    statBlockers: "Що найчастіше гальмує",
    statMethods: "Методи, що спрацювали",
    blockerHelpToggle: "Що це таке?",
    blockerHelpTitle: "Як працює показник «Що найчастіше гальмує»",
    blockerHelpIntro:
      "Ця шкала показує головні причини, через які тобі найважче взятися за задачу. Коли ти відповідаєш на питання або пишеш у чат, ШІ визначає тип затику й підбирає під нього техніку старту:",
    blockerHelpDescOverwhelm:
      "Завеликий обсяг задачі — коли робота здається величезною горою; ШІ ділить її на прості частини за «Першими принципами».",
    blockerHelpDescUnclear:
      "Нечітка задача — коли незрозуміло, з чого почати і що має вийти в кінці; допомагає «Метод Сократа».",
    blockerHelpDescPerfectionism:
      "Перфекціонізм / Страх зробити неідеально — коли страшно писати першу чернетку; метод «Інверсії» знімає тиск ідеалу.",
    blockerHelpDescKnowledge:
      "Бракує знань по темі — коли не вистачає розуміння одного поняття чи інструменту; техніка Фейнмана точково закриває пробіл.",
    blockerHelpDescFatigue:
      "Втома / важко розкачатись — коли немає сил навіть відкрити файл; «Правило 2 хвилин» запускає рух через крихітну дію.",
    blockerHelpHowAi:
      "Чим більше кроків ти завершуєш, тим точніше Sharp підбирає питання й перші кроки під твій стиль роботи.",
    memoryFeedTitle: "Збережені епізоди пам'яті",
    noMemoriesYet: "Виконай перший крок у будь-якій задачі, щоб тут з'явився перший запис.",
    proBadge: "Sharp Pro",
    freeBadge: "Базовий план",
    monetizationTitle: "Sharp Pro: Аудіо- та Відео-розбір складних кроків",
    monetizationSubtitle:
      "Порівняй можливості безкоштовного плану та підписки Sharp Pro із вищими лімітами й генерацією медіа-пояснень.",
    freeTierTitle: "Free Tier (Безкоштовний)",
    freeTierPrice: "0 ₴ / міс",
    freeTierSub: "Базові інструменти для старту роботи без прокрастинації",
    freeFeature1: "Сократівський бліц та всі 6 методів декомпозиції",
    freeFeature2: "Стандартні ліміти сесій, чату та розбиття (до 15 кроків)",
    freeFeature3: "Фокус-таймер Pomodoro та збереження історії",
    freeFeature4: "Лише текстові пояснення (без генерації аудіо й відео)",
    proTierTitle: "Paid Tier (Sharp Pro)",
    proTierPrice: "999 ₴ / міс",
    proTierSub: "Розширені ліміти та мультимодальні пояснення складних тем",
    proFeature1: "Вищі ліміти на кількість сесій, вкладень та глибину розбору",
    proFeature2: "Підтримка генерації аудіопояснень (AI Audio Coach)",
    proFeature3: "Підтримка генерації відеопояснень (AI Video Walkthrough)",
    proFeature4: "Пріоритетна швидкість генерації та глибокий розбір файлів",
    currentPlanBadge: "Поточний план",
    unlockProBtn: "Активувати Sharp Pro",
    switchToFreeBtn: "Перемкнути на безкоштовний план",
    billingRedirecting: "Створюємо рахунок monobank…",
    billingChecking: "Перевіряємо оплату monobank…",
    billingSuccessNotice: "Оплату через monobank підтверджено! Sharp Pro активовано.",
    billingPendingNotice: "Рахунок очікує завершення оплати в monobank.",
    billingFailedNotice: "Оплата через monobank не завершилась. Спробуйте ще раз.",
    billingRefreshBtn: "Перевірити статус оплати",
    audioCoachBtn: "Аудіо-розмова",
    videoExplainerBtn: "Відео-пояснення",
    audioCoachTitle: "Голосовий розбір кроку (AI Audio Coach)",
    audioCoachDesc:
      "Асистент вголос проведе тебе через поточний крок на 2 хвилини — зручно, коли очі втомилися від екрана.",
    videoExplainerTitle: "Візуальне відео-пояснення (AI Video Walkthrough)",
    videoExplainerDesc:
      "Коротке згенероване відео зі схемою та прикладом для складного поняття чи етапу роботи.",
    proRequiredHint: "Доступно у підписці Sharp Pro. Активуй підписку одним кліком для тестування.",
    mediaGenerating: "Генеруємо медіа-пояснення...",
    mediaReadyHint: "Медіа-пояснення готове до відтворення для поточного кроку.",
    authSignInTitle: "Вхід у Sharp",
    authSignUpTitle: "Створення акаунту Sharp",
    authConfirmTitle: "Підтвердження email",
    authLocalHint:
      "Локальний режим розробки: Cognito не підключено, будь-яка валідна форма відкриє ваш робочий простір.",
    emailLabel: "Електронна пошта",
    passwordLabel: "Пароль",
    nameLabel: "Ваше ім'я",
    codeLabel: "6-значний код з листа",
    showPassword: "Показати",
    hidePassword: "Сховати",
    signInBtn: "Увійти",
    signUpBtn: "Зареєструватися",
    confirmBtn: "Підтвердити email",
    resendCode: "Надіслати код ще раз",
    codeResent: "Новий код надіслано на пошту",
    confirmNeededLink: "Ввести код підтвердження",
    passwordHintCognito: "Мінімум 8 символів: велика та мала літера, цифра й спецсимвол",
    continueWithGoogle: "Продовжити з Google",
    orDivider: "або",
    signingInGoogle: "Вхід через Google…",
    googleSignInFailed: "Не вдалося увійти через Google",
    oauthAccessDenied: "Вхід через Google скасовано",
    themeLabel: "Тема",
    themeLight: "Світла",
    themeDark: "Темна",
    switchToLight: "Увімкнути світлу тему",
    switchToDark: "Увімкнути темну тему",
    backToSignIn: "Повернутися до входу",
    accountConfirmedHint: "Email підтверджено. Увійдіть, щоб продовжити.",
    toSignUp: "Немає акаунту? Створити",
    toSignIn: "Вже є акаунт? Увійти",
    deleteSession: "Видалити",
    authHeroTitle: "Спокійний старт замість туману в голові.",
    authHeroSub:
      "Три точні питання і один перший крок на дві хвилини, без готових рішень замість вас.",
    photoCreditPrefix: "Фото:",
    authPhotoAlt: "Масивні доломітові скелі Tre Cime di Lavaredo над хмарами у сутінках",
    sessionSwitchHint: "Поточний метод",
    activeMethodTag: "Активний",
    historyToggleShow: "Показати історію сесій",
    historyToggleHide: "Сховати історію",
    collapseSidebar: "Згорнути бічну панель",
    expandSidebar: "Розгорнути бічну панель",
  },
  en: {
    brandTagline: "Help you think, never replace your thinking.",
    brandSub: "Practical thinking partner against procrastination",
    navWorkspace: "Workspace",
    navLibrary: "Method Library",
    navMemory: "Memory & Profile",
    signOut: "Sign out",
    newTask: "New task",
    sessionsHistory: "Session History",
    noSessionsYet: "No active breakdowns yet",
    searchTasksLabel: "Search tasks",
    searchTasksPlaceholder: "Search...",
    clearSearch: "Clear search",
    recentTasksHeading: "Recent tasks",
    searchResultsHeading: "Search results",
    noMatchingSessions: "No matching tasks found",
    streakLabel: "Start Streak",
    proactiveBannerPrefix: "Unfinished Step #1",
    proactiveResume: "Resume now",
    dismissBanner: "Dismiss reminder",
    phase1Title: "What are you stuck on?",
    phase1Titles: [
      "What are you stuck on?",
      "What's slowing you down today?",
      "What's hardest to start?",
      "Which problem are we breaking down?",
      "Where's the main knot right now?",
      "What have you been putting off?",
      "Which next step feels foggy?",
      "What's keeping you in place?",
      "What should we untangle?",
      "Where's the bottleneck?",
    ],
    phase1Sub:
      "Sharp refuses to hand out ready-made solutions. In a few direct questions, you isolate the blocker and lock in a 2-minute kickstart.",
    problemLabel: "Describe the task or block",
    problemPlaceholder: "Describe the task...",
    composerModeLabel: "Workspace mode",
    composerModeChat: "Chat",
    composerModeTask: "Task",
    chatStarterPlaceholder: "Ask anything or share a thought...",
    chatStartAction: "Send",
    chatStarting: "Thinking...",
    assistantChatTitle: "Session Assistant",
    assistantChatSubtitle: "Free-form assistant chat in this session's context.",
    assistantChatBtn: "Assistant",
    assistantChatTrigger: "Ask assistant in free chat",
    assistantChatEmpty:
      "Confused by a question, want to push back, or clarify a detail? Write freely here — the assistant answers directly without advancing your blitz or plan.",
    assistantChatPlaceholder: "Write a question, reaction, or follow-up...",
    assistantChatSend: "Send",
    assistantChatSending: "Assistant is replying...",
    assistantYouLabel: "You",
    assistantRoleLabel: "Assistant",
    chatCompleteTitle: "Question resolved — time to take action",
    chatCompleteDesc:
      "You have a clear action plan. Move to executing your steps or start a new task.",
    chatCompleteToSteps: "Go to action steps",
    convertToPlanBtn: "Turn into step plan",
    convertingToPlan: "Building plan...",
    phaseTagChat: "chat",
    phaseTagSocratic: "blitz",
    phaseTagExecuting: "active",
    phaseTagCompleted: "completed",
    methodChipPrefix: "Method",
    chooseInitialMethod: "Breakdown method",
    autoSelectMethod: "Auto (AI)",
    autoMethodHint: "AI picks the best breakdown method for your task",
    openMethodLibraryLink: "Method Library",
    methodsOnboardingTitle: "6 thinking methods ready inside",
    methodsOnboardingBody:
      "Beyond free chat, Sharp includes Socratic Inquiry, 5 Whys, First Principles, and more. Explore them in Method Library or switch to Task mode.",
    methodsOnboardingOpenBtn: "Open Library",
    methodsOnboardingDismissBtn: "Got it",
    methodHighlightPrompt: "Pick a method below or keep Auto (AI)",
    quickExamplesLabel: "Or pick a starter flow",
    attachFile: "Attach file",
    removeAttachment: "Remove file",
    voiceStart: "Voice input",
    voiceStop: "Stop recording",
    voiceListening: "Listening...",
    voiceNotSupported:
      "Voice input is not supported in this browser (try Chrome, Edge, or Safari).",
    attachmentTooLarge: "File too large (max 2.5 MB)",
    attachmentNeedInput: "Describe a task (min 3 chars) or attach a file",
    attachedFilesLabel: "Attached context",
    dropFilesHint: "Drop files to attach",
    example1: "Procrastinating on my database coursework out of perfectionism",
    example2: "Write the full design patterns lab code for me right now",
    example3: "Stuck preparing a 5-minute product pitch, too many scattered ideas",
    startDiagnosis: "Start Diagnosis",
    analyzing: "Analyzing blocker...",
    phaseDiagnostic: "1. Intake",
    phaseBlitz: "2. Socratic Blitz",
    phaseExecution: "3. Plan & Pomodoro",
    questionProgress: "Question",
    of: "of",
    guardrailBadge: "ANTI-SOLUTION GUARDRAIL",
    guardrailText: "Ready-made answer request rejected. Sharp returns cognitive ownership to you.",
    memoryInsightTitle: "Agent Memory",
    memoryInsightSub: "Similar past blocker recalled from your history:",
    methodBadgeTip: "Click to inspect method explanation or switch session framework",
    pickHypothesis: "Pick a hypothesis (or press keys 1–4):",
    orCustomAnswer: "Or write your own concise answer:",
    customPlaceholder: "1–2 crisp points...",
    submitAnswer: "Continue",
    skipToPlan: "Jump to step plan now",
    previousAnswers: "Your reasoning chain in this session",
    previousQuestion: "Back",
    nextQuestion: "Next",
    backToQuestions: "Back to questions",
    backToPlan: "Back to plan",
    selectedAnswerBadge: "Selected",
    editingAnswerBadge: "Previous answer",
    editingAnswerHint: "Pick another option or update your text — follow-up steps will refresh.",
    editAnswerBtn: "Change",
    editingNowBadge: "Editing",
    planTitle: "Micro-Step Action Tree",
    planRuleHint: "Subsequent steps unlock strictly after completing the active one.",
    stepActive: "ACTIVE STEP",
    stepLocked: "LOCKED",
    stepDone: "COMPLETED",
    stepSplit: "SPLIT INTO SUBSTEPS",
    stepLimitReachedTitle: "Maximum breakdown detail reached (15 steps)",
    stepLimitReachedBody:
      "Further splitting is paused so you don't get trapped in endless planning. Next action: start the 2-minute timer and complete the current smallest micro-step.",
    timerTitle: "Focus Timer",
    startTimer: "Start",
    pauseTimer: "Pause",
    resetTimer: "Reset",
    reflectionLabel: "Short completion note (optional)",
    reflectionPlaceholder: "What concrete artifact did you produce?",
    completeStep: "Done → Unlock Next Step",
    stuckStep: "Stuck → Break Step Smaller",
    sessionDoneTitle: "Momentum unlocked!",
    sessionDoneDesc:
      "This episode has been saved so Sharp adapts its future questions to your real patterns.",
    libraryTitle: "Curated Thinking & Decomposition Library",
    librarySubtitle:
      "Structured cognitive frameworks wired directly into AI prompts. Inspect or switch modes anytime.",
    whenToUse: "When to use",
    howItWorks: "Cognitive mechanism",
    antiPattern: "Common trap",
    exampleQ: "Sample Socratic question",
    applyMethodBtn: "Start session with this method",
    switchToMethodBtn: "Switch current session to this method",
    closeDialog: "Close",
    memoryTitle: "Your Profile & Saved Experience",
    memorySubtitle:
      "Sharp remembers your completed starts so you can see what blocks you most often and which methods help you begin.",
    statSteps: "Steps completed",
    statSessions: "Sessions finished",
    statFocus: "Focus minutes",
    statBlockers: "What blocks you most often",
    statMethods: "Effective frameworks",
    blockerHelpToggle: "What is this?",
    blockerHelpTitle: "How the blocker profile works",
    blockerHelpIntro:
      "This metric tracks the main friction patterns that delay your start. During sessions, AI detects your current blocker from your answers and picks a matching kickstart technique:",
    blockerHelpDescOverwhelm:
      "Scope Overwhelm — the task looks too big; AI breaks it into basic parts using First Principles.",
    blockerHelpDescUnclear:
      "Unclear Scope — vague goals or deliverables; Socratic questions clarify what 'done' looks like.",
    blockerHelpDescPerfectionism:
      "Perfectionism — fear of an imperfect first draft; Inversion removes pressure so you can write a rough v0.",
    blockerHelpDescKnowledge:
      "Knowledge Gap — missing one concept or tool; Feynman decomposition isolates the exact unknown.",
    blockerHelpDescFatigue:
      "Activation Fatigue — low energy to even open the file; the 2-Minute Rule shrinks the start threshold.",
    blockerHelpHowAi:
      "As you complete more steps, Sharp tailors future questions and first actions to your personal patterns.",
    memoryFeedTitle: "Stored Memory Episodes",
    noMemoriesYet:
      "Complete your first step in a session so Sharp records your first cognitive insight.",
    proBadge: "Sharp Pro",
    freeBadge: "Free Plan",
    monetizationTitle: "Sharp Pro: Audio & Video Walkthroughs for Complex Steps",
    monetizationSubtitle:
      "Compare the Free tier and Sharp Pro with higher limits and AI audio/video explanations.",
    freeTierTitle: "Free Tier",
    freeTierPrice: "$0 / mo",
    freeTierSub: "Core tools to overcome procrastination and start moving",
    freeFeature1: "Socratic Blitz and all 6 thinking frameworks",
    freeFeature2: "Standard session, chat, and step breakdown limits (up to 15 steps)",
    freeFeature3: "Pomodoro focus timer and cognitive memory profile",
    freeFeature4: "Text-only guidance (no audio or video generation)",
    proTierTitle: "Paid Tier (Sharp Pro)",
    proTierPrice: "999 UAH / mo",
    proTierSub: "Higher limits and multimodal walkthroughs for complex topics",
    proFeature1: "Higher limits on sessions, file attachments, and breakdown depth",
    proFeature2: "Support for generating audio explanations (AI Audio Coach)",
    proFeature3: "Support for generating video explanations (AI Video Walkthrough)",
    proFeature4: "Priority response speed and deeper document analysis",
    currentPlanBadge: "Current plan",
    unlockProBtn: "Unlock Sharp Pro",
    switchToFreeBtn: "Switch to Free plan",
    billingRedirecting: "Creating monobank invoice…",
    billingChecking: "Verifying monobank payment…",
    billingSuccessNotice: "Monobank payment confirmed! Sharp Pro is now active.",
    billingPendingNotice: "Invoice is waiting for payment completion in monobank.",
    billingFailedNotice: "Monobank payment did not complete. Please try again.",
    billingRefreshBtn: "Check payment status",
    audioCoachBtn: "Audio Coach",
    videoExplainerBtn: "Video Explainer",
    audioCoachTitle: "Voice Step Walkthrough (AI Audio Coach)",
    audioCoachDesc:
      "Listen to a guided 2-minute voice breakdown of your active step when you don't want to read text.",
    videoExplainerTitle: "Visual Video Explainer (AI Video Walkthrough)",
    videoExplainerDesc:
      "Generate a concise visual walkthrough explaining the core concept or step structure.",
    proRequiredHint: "Included with Sharp Pro. Activate Pro in one click to preview.",
    mediaGenerating: "Generating media walkthrough...",
    mediaReadyHint: "Media walkthrough ready for the current step.",
    authSignInTitle: "Sign in to Sharp",
    authSignUpTitle: "Create Sharp Account",
    authConfirmTitle: "Verify Email",
    authLocalHint:
      "Local dev mode: Cognito is not configured, any valid credentials open the workspace.",
    emailLabel: "Email address",
    passwordLabel: "Password",
    nameLabel: "Full name",
    codeLabel: "6-digit verification code",
    showPassword: "Show",
    hidePassword: "Hide",
    signInBtn: "Sign in",
    signUpBtn: "Create account",
    confirmBtn: "Confirm email",
    resendCode: "Resend code",
    codeResent: "A new verification code has been sent",
    confirmNeededLink: "Enter verification code",
    passwordHintCognito: "At least 8 chars with uppercase, lowercase, number, and symbol",
    continueWithGoogle: "Continue with Google",
    orDivider: "or",
    signingInGoogle: "Signing in with Google…",
    googleSignInFailed: "Google sign-in failed",
    oauthAccessDenied: "Google sign-in was canceled",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
    backToSignIn: "Back to sign in",
    accountConfirmedHint: "Email confirmed. Sign in to continue.",
    toSignUp: "No account yet? Sign up",
    toSignIn: "Already registered? Sign in",
    deleteSession: "Delete",
    authHeroTitle: "Start moving before the fog settles.",
    authHeroSub:
      "Three sharp questions and one two-minute first step, with zero ready-made answers replacing you.",
    photoCreditPrefix: "Photographs:",
    authPhotoAlt: "Tre Cime di Lavaredo dolomite cliffs rising above clouds at dusk",
    sessionSwitchHint: "Current method",
    activeMethodTag: "Active",
    historyToggleShow: "Show session history",
    historyToggleHide: "Hide history",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
  },
} as const
