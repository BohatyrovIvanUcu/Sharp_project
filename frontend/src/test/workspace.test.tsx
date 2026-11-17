import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { COPY } from "@/lib/i18n"
import { WorkspacePage } from "@/pages/WorkspacePage"

const mockFrameworks = [
  {
    id: "socratic",
    name: { uk: "Метод Сократа", en: "Socratic Inquiry" },
    tagline: { uk: "Розплутування задачі", en: "Untangle unclear problems" },
    when_to_use: { uk: "Коли туманно", en: "When vague" },
    cognitive_mechanism: { uk: "Фокусує мислення", en: "Focuses thinking" },
    anti_pattern: { uk: "Чекати готову відповідь", en: "Waiting for answers" },
    example_question: { uk: "Яка частина невідома?", en: "What part is unknown?" },
    recommended_timer: "sprint",
    color_token: "indigo",
  },
]

const mockSessionTurn1 = {
  id: "sess-1",
  title: "Курсова з ООАП",
  raw_problem: "Напиши за мене курсову з ООАП",
  language: "uk",
  framework_id: "socratic",
  phase: "socratic",
  detected_blocker: "perfectionism",
  memory_insight: [],
  question_count: 1,
  max_questions: 3,
  summary: null,
  turns: [
    {
      id: "turn-1",
      turn_number: 1,
      framework_id: "socratic",
      framework_reason: "Активовано анти-рішення бар'єр.",
      question_text: "На якому саме вузлі задачі ви зупинились?",
      options: [
        { id: "opt_1", label: "Немає структури", hint: "Немає плану розділів" },
        { id: "opt_2", label: "Страх чистого аркуша", hint: "Важко написати перший рядок" },
        { id: "opt_3", label: "Не вистачає концепту", hint: "Нечітка теорія" },
      ],
      user_answer: null,
      selected_option_id: null,
      guardrail_triggered: true,
      ai_source: "bedrock",
      created_at: new Date().toISOString(),
    },
  ],
  steps: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
}

describe("WorkspacePage interactive Socratic flow", () => {
  beforeEach(() => {
    localStorage.setItem("sharp.lang", "uk")
    localStorage.removeItem("sharp.sidebarCollapsed")
    localStorage.removeItem("sharp.methodsOnboardingSeen")
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it("renders intake screen, starts Socratic card with guardrail and clickable option buttons", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 2,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([]))
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        return new Response(JSON.stringify(mockSessionTurn1), { status: 201 })
      }
      if (url.endsWith("/api/sessions/sess-1/answer")) {
        return new Response(
          JSON.stringify({
            ...mockSessionTurn1,
            phase: "executing",
            summary: "Старт через 3-тезовий каркас",
            steps: [
              {
                id: "step-1",
                parent_step_id: null,
                order_index: 1,
                title: "Відкрити файл і написати 3 заголовки",
                description: "120 секунд без редагування",
                duration_minutes: 2,
                timer_mode: "micro",
                status: "active",
                pomodoro_seconds: 0,
                reflection_note: null,
                completed_at: null,
              },
              {
                id: "step-2",
                parent_step_id: null,
                order_index: 2,
                title: "Заповнити перший розділ",
                description: "Чорновий текст",
                duration_minutes: 15,
                timer_mode: "pomodoro",
                status: "locked",
                pomodoro_seconds: 0,
                reflection_note: null,
                completed_at: null,
              },
            ],
          }),
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const textarea = await screen.findByLabelText("Опишіть задачу або запит")
    const formEl = textarea.closest("form")
    expect(formEl).toHaveAttribute("data-expanded", "false")

    await userEvent.click(screen.getByRole("radio", { name: "Завдання" }))

    const historyToggle = screen.getByRole("button", { name: /Показати історію сесій/i })
    await userEvent.click(historyToggle)
    expect(screen.getByRole("button", { name: /Сховати історію/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    )

    await userEvent.click(textarea)
    expect(formEl).toHaveAttribute("data-expanded", "true")
    expect(screen.getByText("Метод розбору")).toBeInTheDocument()

    await userEvent.type(textarea, "Напиши за мене курсову з ООАП")
    await userEvent.click(screen.getByRole("button", { name: /Почати розбір/i }))

    expect(await screen.findByText("АНТИ-РІШЕННЯ БАР'ЄР")).toBeInTheDocument()
    expect(screen.getByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()

    const optButton = screen.getByRole("button", { name: /Немає структури/i })
    await userEvent.click(optButton)

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Відкрити файл і написати 3 заголовки" }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText("ЗАБЛОКОВАНО")).toBeInTheDocument()

    // Switch to Library tab and verify curated framework view renders
    await userEvent.click(screen.getByRole("button", { name: /Бібліотека методів/i }))
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Курована бібліотека методів мислення",
      }),
    ).toBeInTheDocument()
  })

  it("expands on file attachment and sends attachments payload to POST /api/sessions", async () => {
    const captured: { body: Record<string, unknown> | null } = { body: null }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 0,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([]))
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        captured.body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>
        return new Response(
          JSON.stringify({
            ...mockSessionTurn1,
            id: "sess-file-1",
            title: "Архітектура модуля",
            raw_problem: "Аналіз прикріплених матеріалів",
            attachments: [
              {
                name: "draft.py",
                mime_type: "text/x-python",
                size_bytes: 33,
                has_text: true,
              },
            ],
          }),
          { status: 201 },
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const textarea = await screen.findByLabelText("Опишіть задачу або запит")
    const formEl = textarea.closest("form")
    expect(formEl).toHaveAttribute("data-expanded", "false")

    await userEvent.click(screen.getByRole("radio", { name: "Завдання" }))

    const fileInput = container.querySelector("#task-attachments") as HTMLInputElement
    expect(fileInput).toBeInTheDocument()

    const file = new File(["print('blocked on architecture')\n"], "draft.py", {
      type: "text/x-python",
    })
    await userEvent.upload(fileInput, file)

    expect(await screen.findByText("draft.py")).toBeInTheDocument()
    expect(formEl).toHaveAttribute("data-expanded", "true")

    await userEvent.click(screen.getByRole("button", { name: /Почати розбір/i }))

    await waitFor(() => {
      expect(captured.body).not.toBeNull()
    })

    expect(captured.body?.attachments).toEqual([
      expect.objectContaining({
        name: "draft.py",
        size_bytes: file.size,
        text_excerpt: "print('blocked on architecture')\n",
      }),
    ])
    const attachedList = await screen.findByLabelText("Прикріплені файли")
    expect(within(attachedList).getByText("draft.py")).toBeInTheDocument()
  })

  it("opens method menu from Auto (AI) trigger and allows dismissing proactive unfinished banner", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 1,
              completed_sessions: 0,
              total_focus_seconds: 120,
              current_streak: 3,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions")) {
        return new Response(
          JSON.stringify([
            {
              id: "sess-unfin",
              title: "Незавершена курсова",
              raw_problem: "Застряг на архітектурі",
              language: "uk",
              framework_id: "socratic",
              phase: "executing",
              detected_blocker: "overwhelm",
              attachments: [],
              question_count: 3,
              max_questions: 3,
              active_step: {
                id: "st-1",
                parent_step_id: null,
                order_index: 1,
                title: "Накидати 3 таблиці",
                description: "Схема БД",
                duration_minutes: 2,
                timer_mode: "micro",
                status: "active",
                pomodoro_seconds: 0,
                reflection_note: null,
                completed_at: null,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]),
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const banner = await screen.findByRole("region", { name: "Незавершений Крок #1" })
    expect(banner).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Сховати нагадування" }))
    expect(screen.queryByRole("region", { name: "Незавершений Крок #1" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Згорнути бічну панель" }))
    expect(container.querySelector("aside")).not.toHaveClass("lg:flex")
    await userEvent.click(screen.getByRole("button", { name: "Розгорнути бічну панель" }))
    expect(container.querySelector("aside")).toHaveClass("lg:flex")

    await userEvent.click(screen.getByRole("radio", { name: "Завдання" }))

    const fileInput = container.querySelector("#task-attachments") as HTMLInputElement
    const fileClickSpy = vi.spyOn(fileInput, "click")
    await userEvent.click(screen.getByRole("button", { name: "Додати файл" }))
    expect(fileClickSpy).toHaveBeenCalledTimes(1)

    const textarea = screen.getByLabelText("Опишіть задачу або запит")
    const formEl = textarea.closest("form")
    expect(formEl).toHaveAttribute("data-expanded", "true")

    const methodTrigger = screen.getByRole("button", { name: /Метод: Авто \(ШІ\)/i })
    await userEvent.click(methodTrigger)
    expect(formEl).toHaveAttribute("data-expanded", "true")

    const highlightedBox = container.querySelector('[data-highlighted="true"]')
    expect(highlightedBox).toBeInTheDocument()
    expect(screen.getByText("Оберіть метод нижче або залиште «Авто (ШІ)»")).toBeInTheDocument()

    const methodGroup = screen.getByRole("radiogroup", { name: "Метод розбору" })
    await userEvent.click(within(methodGroup).getByRole("radio", { name: /Метод Сократа/i }))

    expect(formEl).toHaveAttribute("data-expanded", "true")
    expect(within(formEl!).getByRole("button", { name: /Метод Сократа/i })).toBeInTheDocument()

    const drawerWrap = highlightedBox!.parentElement!
    await userEvent.click(within(drawerWrap).getByRole("button", { name: /Бібліотека методів/i }))
    expect(
      await screen.findByRole("heading", { name: "Курована бібліотека методів мислення" }),
    ).toBeInTheDocument()
  })

  it("hides duplicate raw_problem subtitle in active session when identical to title", async () => {
    const duplicateTitle = "Відкладаю курсову з баз даних через страх зробити погану структуру"
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 1,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions/sess-dup")) {
        return new Response(
          JSON.stringify({
            ...mockSessionTurn1,
            id: "sess-dup",
            title: duplicateTitle,
            raw_problem: duplicateTitle,
          }),
        )
      }
      if (url.endsWith("/api/sessions")) {
        return new Response(
          JSON.stringify([
            {
              ...mockSessionTurn1,
              id: "sess-dup",
              title: duplicateTitle,
              raw_problem: duplicateTitle,
            },
          ]),
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const historyItem = await screen.findByRole("button", {
      name: new RegExp(`^${duplicateTitle}`, "i"),
    })
    await userEvent.click(historyItem)

    await screen.findByRole("heading", { level: 2, name: duplicateTitle })
    const mainEl = screen.getByRole("main")
    expect(within(mainEl).getAllByText(duplicateTitle)).toHaveLength(1)
  })

  it("filters sidebar sessions by task search and renders a random landing prompt", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            preferred_language: "uk",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 2,
            },
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ memories: [], profile: {} }))
      }
      if (url.endsWith("/api/sessions")) {
        return new Response(
          JSON.stringify([
            {
              ...mockSessionTurn1,
              id: "sess-db",
              title: "Курсова з баз даних",
              raw_problem: "Схема PostgreSQL",
            },
            {
              ...mockSessionTurn1,
              id: "sess-react",
              title: "Рефакторинг UI",
              raw_problem: "Оновити форму входу",
            },
          ]),
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const mainEl = screen.getByRole("main")
    const heading = await within(mainEl).findByRole("heading", { level: 2 })
    expect(COPY.uk.phase1Titles).toContain(heading.textContent)

    const sidebar = screen.getByRole("complementary")
    await within(sidebar).findByText("Курсова з баз даних")
    expect(within(sidebar).getByText("Рефакторинг UI")).toBeInTheDocument()

    const searchButtons = screen.getAllByRole("button", { name: "Пошук по задачах" })
    await userEvent.click(searchButtons[0])

    const dialog = screen.getByRole("dialog", { name: "Пошук по задачах" })
    expect(dialog).toHaveAttribute("open")
    expect(within(dialog).getByText("Останні задачі")).toBeInTheDocument()

    const searchInput = within(dialog).getByRole("searchbox", { name: "Пошук по задачах" })
    await userEvent.type(searchInput, "PostgreSQL")

    expect(within(dialog).getByText("Результати пошуку")).toBeInTheDocument()
    expect(within(dialog).getByText("Курсова з баз даних")).toBeInTheDocument()
    expect(within(dialog).queryByText("Рефакторинг UI")).not.toBeInTheDocument()

    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, "неіснуюча")
    expect(within(dialog).getByText("Задач за запитом не знайдено")).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: "Закрити" }))
    expect(dialog).not.toHaveAttribute("open")
  })

  it("hides AWS Bedrock badge and lets user navigate back to re-select answers", async () => {
    const turn2 = {
      id: "turn-2",
      turn_number: 2,
      framework_id: "socratic",
      framework_reason: "Уточнюємо наступний крок.",
      question_text: "Що зараз дає найбільший опір?",
      options: [
        { id: "opt_2_1", label: "Невідомий формат", hint: "Не знаю, як почати" },
        { id: "opt_2_2", label: "Брак часу", hint: "Мало часу до дедлайну" },
      ],
      user_answer: null,
      selected_option_id: null,
      guardrail_triggered: false,
      ai_source: "bedrock",
      created_at: new Date().toISOString(),
    }

    const turn3 = {
      id: "turn-3",
      turn_number: 3,
      framework_id: "socratic",
      framework_reason: "Останній фокус.",
      question_text: "Який мінімальний крок на 2 хвилини?",
      options: [
        { id: "opt_3_1", label: "Створити файл", hint: "Почати структуру" },
        { id: "opt_3_2", label: "Написати 3 тези", hint: "Швидка чернетка" },
      ],
      user_answer: null,
      selected_option_id: null,
      guardrail_triggered: false,
      ai_source: "bedrock",
      created_at: new Date().toISOString(),
    }

    const capturedPayloads: Array<Record<string, unknown>> = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 1,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([]))
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        return new Response(JSON.stringify(mockSessionTurn1), { status: 201 })
      }
      if (url.endsWith("/api/sessions/sess-1/answer")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
        capturedPayloads.push(body)

        if (body.turn_number === 1 && body.option_id === "opt_2") {
          return new Response(
            JSON.stringify({
              ...mockSessionTurn1,
              question_count: 2,
              turns: [
                {
                  ...mockSessionTurn1.turns[0],
                  user_answer: "Страх чистого аркуша",
                  selected_option_id: "opt_2",
                },
                {
                  ...turn2,
                  question_text: "Який перший чорновий рядок зніме страх?",
                },
              ],
            }),
          )
        }

        if (body.option_id === "opt_2_1") {
          return new Response(
            JSON.stringify({
              ...mockSessionTurn1,
              question_count: 3,
              turns: [
                {
                  ...mockSessionTurn1.turns[0],
                  user_answer: "Страх чистого аркуша",
                  selected_option_id: "opt_2",
                },
                {
                  ...turn2,
                  question_text: "Який перший чорновий рядок зніме страх?",
                  user_answer: "Невідомий формат",
                  selected_option_id: "opt_2_1",
                },
                turn3,
              ],
            }),
          )
        }

        if (body.option_id === "opt_3_1") {
          return new Response(
            JSON.stringify({
              ...mockSessionTurn1,
              phase: "executing",
              question_count: 3,
              summary: "План старту",
              turns: [
                {
                  ...mockSessionTurn1.turns[0],
                  user_answer: "Страх чистого аркуша",
                  selected_option_id: "opt_2",
                },
                {
                  ...turn2,
                  question_text: "Який перший чорновий рядок зніме страх?",
                  user_answer: "Невідомий формат",
                  selected_option_id: "opt_2_1",
                },
                {
                  ...turn3,
                  user_answer: "Створити файл",
                  selected_option_id: "opt_3_1",
                },
              ],
              steps: [
                {
                  id: "step-1",
                  parent_step_id: null,
                  order_index: 1,
                  title: "Створити файл",
                  description: "Відкрити редактор",
                  duration_minutes: 2,
                  timer_mode: "micro",
                  status: "active",
                  pomodoro_seconds: 0,
                  reflection_note: null,
                  completed_at: null,
                },
              ],
            }),
          )
        }

        return new Response(
          JSON.stringify({
            ...mockSessionTurn1,
            question_count: 2,
            turns: [
              {
                ...mockSessionTurn1.turns[0],
                user_answer: "Немає структури",
                selected_option_id: "opt_1",
              },
              turn2,
            ],
          }),
        )
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByRole("radio", { name: "Завдання" }))
    const textarea = screen.getByLabelText("Опишіть задачу або запит")
    await userEvent.type(textarea, "Напиши за мене курсову з ООАП")
    await userEvent.click(screen.getByRole("button", { name: /Почати розбір/i }))

    expect(await screen.findByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()
    expect(screen.queryByText("AWS Bedrock")).not.toBeInTheDocument()
    expect(screen.queryByText("Local Engine")).not.toBeInTheDocument()

    // Answer Q1 with option 1 -> move to Q2
    await userEvent.click(screen.getByRole("button", { name: /Немає структури/i }))
    expect(await screen.findByText("Що зараз дає найбільший опір?")).toBeInTheDocument()
    expect(screen.queryByText("AWS Bedrock")).not.toBeInTheDocument()

    // Go back to Q1 using Back button
    await userEvent.click(screen.getByRole("button", { name: /Назад/i }))
    expect(await screen.findByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()
    expect(screen.getByText("Попередня відповідь")).toBeInTheDocument()

    const prevOptionBtn = screen.getByRole("button", { name: /Немає структури/i })
    expect(prevOptionBtn).toHaveAttribute("aria-pressed", "true")
    expect(within(prevOptionBtn).getByText("Обрано")).toBeInTheDocument()

    // Stepping forward returns to Q2 without an API call
    await userEvent.click(screen.getByRole("button", { name: /Вперед/i }))
    expect(await screen.findByText("Що зараз дає найбільший опір?")).toBeInTheDocument()
    expect(capturedPayloads).toHaveLength(1)

    // Jump back to Q1 via history "Змінити" button and pick option 2 instead
    await userEvent.click(screen.getByRole("button", { name: /Змінити Q1/i }))
    expect(await screen.findByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Страх чистого аркуша/i }))

    expect(await screen.findByText("Який перший чорновий рядок зніме страх?")).toBeInTheDocument()
    expect(capturedPayloads[1]).toEqual({
      answer_text: "Страх чистого аркуша",
      option_id: "opt_2",
      turn_number: 1,
    })

    // Answer Q2 and Q3 -> reach plan, then verify user can still return to questions before completing steps
    await userEvent.click(screen.getByRole("button", { name: /Невідомий формат/i }))
    expect(await screen.findByText("Який мінімальний крок на 2 хвилини?")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Створити файл/i }))
    expect(
      await screen.findByRole("button", { name: /Повернутися до питань/i }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Повернутися до питань/i }))
    expect(await screen.findByText("Який мінімальний крок на 2 хвилини?")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Створити файл/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    await userEvent.click(screen.getByRole("button", { name: /Повернутися до плану/i }))
    expect(await screen.findByRole("heading", { name: "Створити файл" })).toBeInTheDocument()
  })

  it("submits step completion on Enter in reflection input, keeps history card full-width, and hides Titan/pgvector jargon", async () => {
    const completeCalls: Array<{ stepId: string; body: Record<string, unknown> }> = []

    const executingSession = {
      ...mockSessionTurn1,
      id: "sess-exec",
      title: "677",
      raw_problem: "677",
      phase: "executing",
      summary: "План дій для виявлення та виправлення помилки",
      question_count: 3,
      steps: [
        {
          id: "step-1",
          parent_step_id: null,
          order_index: 1,
          title: "Запис ваших помилок",
          description: "Запишіть усі деталі помилки.",
          duration_minutes: 5,
          timer_mode: "sprint",
          status: "active",
          pomodoro_seconds: 0,
          reflection_note: null as string | null,
          completed_at: null,
        },
        {
          id: "step-2",
          parent_step_id: null,
          order_index: 2,
          title: "Дослідження помилки",
          description: "Перевірте стек виклику.",
          duration_minutes: 5,
          timer_mode: "sprint",
          status: "locked",
          pomodoro_seconds: 0,
          reflection_note: null as string | null,
          completed_at: null,
        },
      ],
    }

    let currentSession = executingSession

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 0,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) {
        return new Response(JSON.stringify(mockFrameworks))
      }
      if (url.endsWith("/api/memory")) {
        return new Response(
          JSON.stringify({
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 0,
            },
            memories: [],
          }),
        )
      }
      if (url.endsWith("/api/sessions/sess-exec/steps/step-1/complete")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
        completeCalls.push({ stepId: "step-1", body })
        currentSession = {
          ...executingSession,
          steps: [
            { ...executingSession.steps[0], status: "completed", reflection_note: "98pipi" },
            { ...executingSession.steps[1], status: "active" },
          ],
        }
        return new Response(JSON.stringify(currentSession))
      }
      if (url.endsWith("/api/sessions/sess-exec")) {
        return new Response(JSON.stringify(currentSession))
      }
      if (url.endsWith("/api/sessions")) {
        return new Response(JSON.stringify([currentSession]))
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const sidebar = screen.getByRole("complementary")
    const sessionBtn = await within(sidebar).findByRole("button", { name: /^677/i })
    expect(sessionBtn).toHaveClass("w-full")
    const deleteBtn = within(sidebar).getByRole("button", { name: "Видалити 677" })
    expect(deleteBtn).toHaveClass("absolute")
    expect(deleteBtn.closest("li")).toBe(sessionBtn.closest("li"))

    await userEvent.click(sessionBtn)
    const reflectionInput = await screen.findByLabelText("Короткий підсумок кроку (необов'язково)")
    await userEvent.type(reflectionInput, "98pipi{Enter}")

    await waitFor(() => {
      expect(completeCalls).toHaveLength(1)
    })
    expect(completeCalls[0].body.reflection_note).toBe("98pipi")
    expect(await screen.findByRole("heading", { name: "Дослідження помилки" })).toBeInTheDocument()

    // Check Memory & Profile view has no internal stack jargon and renders blocker explanation
    await userEvent.click(screen.getByRole("button", { name: /Пам'ять і профіль/i }))
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Твій профіль і збережений досвід",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Що найчастіше гальмує" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Що це таке\?/i }))
    expect(
      screen.getByRole("region", { name: /Як працює показник «Що найчастіше гальмує»/i }),
    ).toBeInTheDocument()
    const mainEl = screen.getByRole("main")
    expect(mainEl.textContent).not.toMatch(/Titan|pgvector|Aurora|Bedrock/i)
  })

  it("defaults landing composer to Chat mode, keeps mobile offset, supports free chat and converting to step plan", async () => {
    const createPayloads: Array<Record<string, unknown>> = []
    const chatPayloads: Array<Record<string, unknown>> = []

    const chatSessionInitial = {
      ...mockSessionTurn1,
      id: "sess-chat",
      title: "Ігри в Roblox",
      raw_problem: "Хочу робити ігри в роблокс",
      phase: "chat",
      question_count: 0,
      turns: [],
      steps: [],
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Хочу робити ігри в роблокс",
          ai_source: "user",
          created_at: new Date().toISOString(),
        },
        {
          id: "m2",
          role: "assistant",
          content: "Окей, почнемо з простого: у тебе вже відкритий Roblox Studio чи ще на етапі ідеї?",
          ai_source: "bedrock",
          created_at: new Date().toISOString(),
        },
      ],
    }

    const chatSessionFollowup = {
      ...chatSessionInitial,
      messages: [
        ...chatSessionInitial.messages,
        {
          id: "m3",
          role: "user",
          content: "блять що за фігня навіщо мені знати lua",
          ai_source: "user",
          created_at: new Date().toISOString(),
        },
        {
          id: "m4",
          role: "assistant",
          content: "Спокійно — на самому старті Lua тобі не потрібен, вистачить зібрати базову сцену з блоків.",
          ai_source: "bedrock",
          created_at: new Date().toISOString(),
        },
      ],
    }

    const plannedSession = {
      ...chatSessionFollowup,
      phase: "executing",
      summary: "Створити базову сцену без коду",
      steps: [
        {
          id: "step-chat-1",
          parent_step_id: null,
          order_index: 1,
          title: "Відкрити Baseplate в Roblox Studio",
          description: "Поставити 3 платформи",
          duration_minutes: 3,
          timer_mode: "micro",
          status: "active",
          pomodoro_seconds: 0,
          reflection_note: null,
          completed_at: null,
        },
      ],
    }

    let currentSession: Record<string, unknown> = chatSessionInitial
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 0,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) return new Response(JSON.stringify(mockFrameworks))
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([]))
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        createPayloads.push(JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>)
        return new Response(JSON.stringify(currentSession), { status: 201 })
      }
      if (url.endsWith("/api/sessions/sess-chat/chat")) {
        chatPayloads.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
        currentSession = chatSessionFollowup
        return new Response(JSON.stringify(currentSession))
      }
      if (url.endsWith("/api/sessions/sess-chat/plan")) {
        currentSession = plannedSession
        return new Response(JSON.stringify(currentSession))
      }
      if (url.endsWith("/api/sessions/sess-chat")) {
        return new Response(JSON.stringify(currentSession))
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const chatRadio = await screen.findByRole("radio", { name: "Чат" })
    const taskRadio = screen.getByRole("radio", { name: "Завдання" })
    expect(chatRadio).toHaveAttribute("aria-checked", "true")
    expect(taskRadio).toHaveAttribute("aria-checked", "false")

    expect(screen.getByTestId("landing-composer-wrap")).toHaveClass("mt-10", "sm:mt-6")
    const onboarding = screen.getByRole("region", { name: "6 методів мислення під рукою" })
    await userEvent.click(within(onboarding).getByRole("button", { name: "Зрозуміло" }))
    expect(localStorage.getItem("sharp.methodsOnboardingSeen")).toBe("true")
    expect(screen.queryByRole("region", { name: "6 методів мислення під рукою" })).not.toBeInTheDocument()

    const textarea = screen.getByLabelText("Опишіть задачу або запит")

    await userEvent.type(textarea, "Хочу робити ігри в роблокс{Enter}")

    await waitFor(() => {
      expect(createPayloads).toHaveLength(1)
    })
    expect(createPayloads[0].mode).toBe("chat")
    const assistantMsgEl = await screen.findByText(
      /Окей, почнемо з простого: у тебе вже відкритий Roblox Studio/i,
    )
    expect(assistantMsgEl).toBeInTheDocument()
    expect(assistantMsgEl.closest("section")).not.toHaveClass("dusk-surface")

    const chatInput = screen.getByRole("textbox", { name: "Асистент по задачі" })
    await userEvent.type(chatInput, "блять що за фігня навіщо мені знати lua{Enter}")

    await waitFor(() => {
      expect(chatPayloads).toHaveLength(1)
    })
    expect(chatPayloads[0]).toEqual({
      content: "блять що за фігня навіщо мені знати lua",
    })
    expect(
      await screen.findByText(/Спокійно — на самому старті Lua тобі не потрібен/i),
    ).toBeInTheDocument()

    const chatForm = chatInput.closest("form")!
    const chatFileInput = chatForm.querySelector('input[type="file"]') as HTMLInputElement
    expect(chatFileInput).toBeInTheDocument()
    const luaFile = new File(["print('test')"], "game.lua", { type: "text/plain" })
    await userEvent.upload(chatFileInput, luaFile)
    expect(await within(chatForm).findByText("game.lua")).toBeInTheDocument()

    await userEvent.click(within(chatForm).getByRole("button", { name: "Надіслати" }))
    await waitFor(() => {
      expect(chatPayloads).toHaveLength(2)
    })
    expect(chatPayloads[1]).toEqual({
      content: "",
      attachments: [
        expect.objectContaining({
          name: "game.lua",
          text_excerpt: "print('test')",
        }),
      ],
    })

    await userEvent.click(screen.getByRole("button", { name: /Розбити на план кроків/i }))
    expect(
      await screen.findByRole("heading", { name: "Відкрити Baseplate в Roblox Studio" }),
    ).toBeInTheDocument()
  })

  it("opens Session Assistant drawer during Socratic Blitz and sends free message without advancing turn", async () => {
    const sessionWithChat = {
      ...mockSessionTurn1,
      messages: [
        {
          id: "cm-1",
          role: "user",
          content: "До чого це питання?",
          ai_source: "user",
          created_at: new Date().toISOString(),
        },
        {
          id: "cm-2",
          role: "assistant",
          content: "Це питання лише визначає, де саме зараз затик: в ідеї чи структурі.",
          ai_source: "bedrock",
          created_at: new Date().toISOString(),
        },
      ],
    }

    let currentSession: typeof mockSessionTurn1 & { messages?: typeof sessionWithChat.messages } = {
      ...mockSessionTurn1,
      messages: [],
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            email: "dev@sharp.local",
            name: "Dev",
            cognitive_profile: {
              blocker_counts: {},
              effective_frameworks: {},
              completed_steps: 0,
              completed_sessions: 0,
              total_focus_seconds: 0,
              current_streak: 0,
            },
            auth_enabled: false,
            created_at: new Date().toISOString(),
          }),
        )
      }
      if (url.endsWith("/api/frameworks")) return new Response(JSON.stringify(mockFrameworks))
      if (url.endsWith("/api/memory")) {
        return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
      }
      if (url.endsWith("/api/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([currentSession]))
      }
      if (url.endsWith("/api/sessions/sess-1/chat")) {
        currentSession = sessionWithChat
        return new Response(JSON.stringify(currentSession))
      }
      if (url.endsWith("/api/sessions/sess-1")) {
        return new Response(JSON.stringify(currentSession))
      }
      return new Response("Not found", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const sidebar = screen.getByRole("complementary")
    await userEvent.click(await within(sidebar).findByRole("button", { name: /^Курсова з ООАП/i }))

    expect(await screen.findByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /^Асистент/i }))
    const drawerInput = await screen.findByRole("textbox", { name: "Асистент по задачі" })
    await userEvent.type(drawerInput, "До чого це питання?{Enter}")

    expect(
      await screen.findByText(/Це питання лише визначає, де саме зараз затик/i),
    ).toBeInTheDocument()
    // Socratic question #1 stays intact without advancing the turn
    expect(screen.getByText("На якому саме вузлі задачі ви зупинились?")).toBeInTheDocument()
    expect(screen.getByText("Питання 1 з 3")).toBeInTheDocument()
  })

  it("toggles workspace light theme and sanitizes uploaded attachments", async () => {
    localStorage.removeItem("sharp.theme")
    document.documentElement.dataset.theme = "dark"
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.endsWith("/api/me")) {
          return new Response(
            JSON.stringify({
              id: "u1",
              email: "dev@sharp.local",
              name: "Dev",
              cognitive_profile: {
                blocker_counts: {},
                effective_frameworks: {},
                completed_steps: 0,
                completed_sessions: 0,
                total_focus_seconds: 0,
                current_streak: 0,
              },
              auth_enabled: false,
              created_at: new Date().toISOString(),
            }),
          )
        }
        if (url.endsWith("/api/frameworks")) return new Response(JSON.stringify(mockFrameworks))
        if (url.endsWith("/api/memory")) {
          return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
        }
        if (url.endsWith("/api/sessions")) return new Response(JSON.stringify([]))
        return new Response("Not found", { status: 404 })
      }),
    )

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const sidebar = await screen.findByRole("complementary")
    const switchBtn = within(sidebar).getByRole("button", { name: "Увімкнути світлу тему" })
    await userEvent.click(switchBtn)
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(localStorage.getItem("sharp.theme")).toBe("light")

    const { readAttachmentsFromFileList } = await import("@/lib/attachments")
    const txtFile = new File(["hello\x00world\u202e!"], "evil\n\u202ename.txt", {
      type: "text/plain",
    })
    const htmlFile = new File(["<script>alert(1)</script>"], "page.html", {
      type: "text/html",
    })
    const fileList = {
      0: txtFile,
      1: htmlFile,
      length: 2,
      item: (i: number) => (i === 0 ? txtFile : htmlFile),
    } as unknown as FileList

    const parsed = await readAttachmentsFromFileList(fileList, [], "Too large")
    expect(parsed.error).toBeNull()
    expect(parsed.next[0].name).toBe("evil name.txt")
    expect(parsed.next[0].text_excerpt).toBe("helloworld!")
    expect(parsed.next[1].name).toBe("page.html")
    expect(parsed.next[1].text_excerpt).toBeUndefined()
  })

  it("shows step breakdown limit notice at 15 steps, renders chat completion banner, and unlocks Sharp Pro audio/video", async () => {
    const fifteenSteps = Array.from({ length: 15 }, (_, idx) => ({
      id: `step-${idx + 1}`,
      parent_step_id: idx > 0 ? "step-1" : null,
      order_index: idx + 1,
      title: `Мікрокрок ${idx + 1}`,
      description: "Коротка дія на 2 хвилини",
      duration_minutes: 2,
      timer_mode: "micro",
      status: idx === 0 ? "active" : "locked",
      pomodoro_seconds: 0,
      reflection_note: null,
      completed_at: null,
    }))

    let currentTier: "free" | "pro" = "free"

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.endsWith("/api/me/subscription") && init?.method === "POST") {
          const body = JSON.parse(String(init.body ?? "{}")) as { tier: "free" | "pro" }
          currentTier = body.tier
          return new Response(
            JSON.stringify({
              id: "u1",
              email: "dev@sharp.local",
              name: "Dev",
              cognitive_profile: {
                blocker_counts: { overwhelm: 2 },
                effective_frameworks: { first_principles: 2 },
                completed_steps: 2,
                completed_sessions: 1,
                total_focus_seconds: 300,
                current_streak: 1,
              },
              subscription: {
                tier: currentTier,
                audio_coach_enabled: currentTier === "pro",
                video_explainer_enabled: currentTier === "pro",
              },
              auth_enabled: false,
              created_at: new Date().toISOString(),
            }),
          )
        }
        if (url.endsWith("/api/me")) {
          return new Response(
            JSON.stringify({
              id: "u1",
              email: "dev@sharp.local",
              name: "Dev",
              cognitive_profile: {
                blocker_counts: { overwhelm: 2 },
                effective_frameworks: { first_principles: 2 },
                completed_steps: 2,
                completed_sessions: 1,
                total_focus_seconds: 300,
                current_streak: 1,
              },
              subscription: {
                tier: currentTier,
                audio_coach_enabled: currentTier === "pro",
                video_explainer_enabled: currentTier === "pro",
              },
              auth_enabled: false,
              created_at: new Date().toISOString(),
            }),
          )
        }
        if (url.endsWith("/api/frameworks")) return new Response(JSON.stringify(mockFrameworks))
        if (url.endsWith("/api/memory")) {
          return new Response(JSON.stringify({ cognitive_profile: {}, memories: [] }))
        }
        if (url.endsWith("/api/sessions/sess-15")) {
          return new Response(
            JSON.stringify({
              ...mockSessionTurn1,
              id: "sess-15",
              title: "Складна задача з 15 кроками",
              phase: "executing",
              steps: fifteenSteps,
              messages: [
                {
                  id: "msg-done",
                  role: "assistant",
                  content: "Домовилися. Питання закрите — переходь до першого кроку.",
                  ai_source: "bedrock",
                  conversation_complete: true,
                  created_at: new Date().toISOString(),
                },
              ],
            }),
          )
        }
        if (url.endsWith("/api/sessions")) {
          return new Response(
            JSON.stringify([
              {
                ...mockSessionTurn1,
                id: "sess-15",
                title: "Складна задача з 15 кроками",
                phase: "executing",
                active_step: fifteenSteps[0],
              },
            ]),
          )
        }
        return new Response("Not found", { status: 404 })
      }),
    )

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <WorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const sidebar = await screen.findByRole("complementary")
    await userEvent.click(
      await within(sidebar).findByRole("button", { name: /^Складна задача з 15 кроками/i }),
    )

    // Step limit notice is shown clearly in PomodoroStepRunner
    expect(
      await screen.findByText(/Досягнуто максимальну деталізацію \(15 кроків\)/i),
    ).toBeInTheDocument()

    // Open assistant drawer -> shows conversation completion banner
    await userEvent.click(screen.getByRole("button", { name: /^Асистент/i }))
    expect(
      await screen.findByText(/Питання розібрано — час переходити до дії/i),
    ).toBeInTheDocument()

    // Open Audio Coach modal from step runner and unlock Sharp Pro
    await userEvent.click(screen.getByRole("button", { name: /Аудіо-розмова/i }))
    const modal = await screen.findByRole("dialog", {
      name: /Sharp Pro: Аудіо- та Відео-розбір складних кроків/i,
    })
    await userEvent.click(within(modal).getByRole("button", { name: /Активувати Sharp Pro/i }))
    expect(
      await within(modal).findByText(/Голосовий розбір кроку \(AI Audio Coach\)/i),
    ).toBeInTheDocument()
  })
})
