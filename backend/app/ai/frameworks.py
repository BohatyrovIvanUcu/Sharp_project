"""Curated library of cognitive thinking and anti-procrastination frameworks."""

from dataclasses import dataclass

from app.schemas import FrameworkId, FrameworkItem, LocalizedText, TimerMode


@dataclass(frozen=True)
class FrameworkDefinition:
    item: FrameworkItem
    system_overlay: str


FRAMEWORKS: dict[FrameworkId, FrameworkDefinition] = {
    "socratic": FrameworkDefinition(
        item=FrameworkItem(
            id="socratic",
            name=LocalizedText(uk="Метод Сократа", en="Socratic Inquiry"),
            tagline=LocalizedText(
                uk="Розплутування задачі через серію гострих уточнювальних запитань",
                en="Untangle unclear problems by exposing hidden assumptions",
            ),
            when_to_use=LocalizedText(
                uk="Коли задача здається туманною і незрозуміло, з чого взагалі почати думати.",
                en="When the task feels vague and you are unsure what the real core question is.",
            ),
            cognitive_mechanism=LocalizedText(
                uk=(
                    "Змушує префронтальну кору чітко сформулювати невідому величину замість "
                    "пасивного очікування готової відповіді."
                ),
                en=(
                    "Forces your prefrontal cortex to define the unknown variable instead "
                    "of outsourcing thought."
                ),
            ),
            anti_pattern=LocalizedText(
                uk="Просити ШІ «напиши готовий план/код за мене» замість уточнення мети.",
                en="Asking AI to write the full solution before defining what problem you solve.",
            ),
            example_question=LocalizedText(
                uk=(
                    "Яка саме частина завдання зараз не визначена: вхідні дані, критерій "
                    "готовності чи перший інструмент?"
                ),
                en=(
                    "Which part is actually undefined right now: the inputs, acceptance "
                    "criteria, or first tool?"
                ),
            ),
            recommended_timer="sprint",
            color_token="indigo",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: Socratic Inquiry. "
            "Ask razor-sharp diagnostic questions that expose unstated assumptions, missing "
            "boundaries, or unclear definitions. Force the user to articulate what they know."
        ),
    ),
    "five_whys": FrameworkDefinition(
        item=FrameworkItem(
            id="five_whys",
            name=LocalizedText(uk="5 Чому (5 Whys)", en="5 Whys Root Cause"),
            tagline=LocalizedText(
                uk="Пошук справжньої причини прокрастинації або блокера під поверхневими симптомами",
                en="Drill past surface excuses to locate the real cognitive blocker",
            ),
            when_to_use=LocalizedText(
                uk=(
                    "Коли ви відкладаєте просту на вигляд задачу вже кілька годин або днів "
                    "без очевидної причини."
                ),
                en=(
                    "When you keep postponing a seemingly straightforward task without an "
                    "obvious technical barrier."
                ),
            ),
            cognitive_mechanism=LocalizedText(
                uk=(
                    "Відділяє емоційний спротив (страх помилки, розмитість) від об'єктивної "
                    "складності завдання."
                ),
                en=(
                    "Separates emotional friction (fear of failure, ambiguity) from true "
                    "technical complexity."
                ),
            ),
            anti_pattern=LocalizedText(
                uk="Звинувачувати себе в ліні замість знаходження конкретного вузла опору.",
                en="Labeling yourself lazy instead of isolating the exact point of friction.",
            ),
            example_question=LocalizedText(
                uk="Чому саме ця частина роботи викликає найбільший опір просто зараз?",
                en="Why does this specific piece of work trigger resistance right now?",
            ),
            recommended_timer="micro",
            color_token="amber",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: 5 Whys Root Cause. "
            "Probe beneath surface procrastination excuses ('no time', 'too hard'). "
            "Ask why the specific sub-part feels blocked until the root trigger is isolated."
        ),
    ),
    "first_principles": FrameworkDefinition(
        item=FrameworkItem(
            id="first_principles",
            name=LocalizedText(uk="Перші принципи", en="First Principles"),
            tagline=LocalizedText(
                uk="Зведення складної проблеми до неподільних базових фактів і дій",
                en="Strip away conventions and rebuild from irreducible facts",
            ),
            when_to_use=LocalizedText(
                uk="Коли задача здається занадто масштабною, перевантаженою вимогами чи шаблонами.",
                en="When a task feels massive, over-constrained, or tangled in templates.",
            ),
            cognitive_mechanism=LocalizedText(
                uk=("Знижує когнітивне перевантаження: замість монолітної гори ви бачите 3 прості елементи."),
                en=(
                    "Reduces cognitive overload by collapsing a monolithic problem into "
                    "3 concrete primitives."
                ),
            ),
            anti_pattern=LocalizedText(
                uk="Копіювати складну архітектуру чи формат до розуміння базової вимоги.",
                en="Copying heavy templates before confirming the bare minimum requirement.",
            ),
            example_question=LocalizedText(
                uk=(
                    "Якщо відкинути оформлення й деталі, які 2 базові елементи мусять "
                    "працювати, щоб задача існувала?"
                ),
                en=(
                    "If you strip away formatting and extras, what 2 core pieces must exist for this to work?"
                ),
            ),
            recommended_timer="pomodoro",
            color_token="emerald",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: First Principles Decomposition. "
            "Strip out non-essential complexity and inherited assumptions. Ask the user to "
            "identify the irreducible inputs, outputs, and minimum viable deliverable."
        ),
    ),
    "inversion": FrameworkDefinition(
        item=FrameworkItem(
            id="inversion",
            name=LocalizedText(uk="Інверсія (Pre-Mortem)", en="Inversion (Pre-Mortem)"),
            tagline=LocalizedText(
                uk="Обхід перфекціонізму через пошук того, що гарантовано зіпсує результат",
                en="Bypass perfectionism by identifying what guarantees failure",
            ),
            when_to_use=LocalizedText(
                uk="Коли ви боїтеся почати через перфекціонізм, чистий аркуш або страх помилки.",
                en="When perfectionism or blank-page anxiety stops you from starting a draft.",
            ),
            cognitive_mechanism=LocalizedText(
                uk="Змінює фокус із недосяжного ідеалу на усунення 1–2 конкретних ризиків провалу.",
                en="Shifts focus from an unattainable ideal to eliminating 1-2 failure modes.",
            ),
            anti_pattern=LocalizedText(
                uk="Шліфувати структуру в голові замість створення грубої чернетки.",
                en="Polishing an imaginary perfect draft instead of producing an ugly v0.",
            ),
            example_question=LocalizedText(
                uk=(
                    "Яка одна дія гарантовано призведе до провалу цієї задачі, і який "
                    "мінімальний крок її унеможливить?"
                ),
                en=("What single mistake would guarantee failure here, and what small check prevents it?"),
            ),
            recommended_timer="sprint",
            color_token="rose",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: Inversion (Pre-Mortem). "
            "Help the user escape perfectionism paralysis by asking what guarantees failure, "
            "what 'good enough v0' looks like, and which single risk actually matters."
        ),
    ),
    "two_min_rule": FrameworkDefinition(
        item=FrameworkItem(
            id="two_min_rule",
            name=LocalizedText(uk="Правило 2 хвилин", en="2-Minute Kickstart"),
            tagline=LocalizedText(
                uk="Стиснення старту до фізичної мікродії, яку неможливо відкласти",
                en="Shrink the start into a physical micro-action under 120 seconds",
            ),
            when_to_use=LocalizedText(
                uk="Коли ви фізично не можете відкрити документ або IDE через втому чи інерцію.",
                en="When inertia or mental fatigue stops you from even opening the file.",
            ),
            cognitive_mechanism=LocalizedText(
                uk=(
                    "Використовує ефект Зейгарник: мозок продовжує розпочату дію автоматично "
                    "після подолання бар'єра старту."
                ),
                en=(
                    "Exploits the Zeigarnik effect: once started, the brain naturally seeks "
                    "closure on the open loop."
                ),
            ),
            anti_pattern=LocalizedText(
                uk="Планувати 3-годинну сесію замість 120 секунд підготовки робочого поля.",
                en="Planning a 3-hour marathon instead of a 120-second setup action.",
            ),
            example_question=LocalizedText(
                uk=(
                    "Яку найменшу фізичну дію (відкрити файл, написати 3 рядки тез) ви можете "
                    "зробити за 120 секунд?"
                ),
                en=(
                    "What is the smallest physical action (open file, write 3 bullet headers) "
                    "doable in 120 seconds?"
                ),
            ),
            recommended_timer="micro",
            color_token="cyan",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: 2-Minute Kickstart Rule. "
            "Focus strictly on overcoming activation energy. Do not strategize the whole week; "
            "ask what tiny physical threshold action takes under 2 minutes right now."
        ),
    ),
    "feynman": FrameworkDefinition(
        item=FrameworkItem(
            id="feynman",
            name=LocalizedText(uk="Декомпозиція Фейнмана", en="Feynman Gap Finder"),
            tagline=LocalizedText(
                uk="Виявлення точного місця, де не вистачає розуміння концепту",
                en="Pinpoint the exact concept gap blocking your progress",
            ),
            when_to_use=LocalizedText(
                uk=(
                    "Коли в навчальній або технічній задачі є поняття, яке ви «ніби знаєте», "
                    "але не можете застосувати."
                ),
                en="When a study or engineering task stalls on a concept that feels fuzzy.",
            ),
            cognitive_mechanism=LocalizedText(
                uk=(
                    "Локалізує прогалину в знаннях замість відчуття «я взагалі нічого не розумію в цій темі»."
                ),
                en=(
                    "Localizes a single knowledge gap instead of triggering "
                    "'I understand nothing about this topic'."
                ),
            ),
            anti_pattern=LocalizedText(
                uk="Пасивно перечитувати конспект або просити ШІ пояснити всю тему з нуля.",
                en="Re-reading entire textbooks or asking AI to summarize a whole chapter.",
            ),
            example_question=LocalizedText(
                uk=(
                    "Якби ви пояснювали цю задачу першокурснику за 2 речення, на якому "
                    "терміні ви б спіткнулись?"
                ),
                en=("If you explained this task in 2 plain sentences, which term would trip you up first?"),
            ),
            recommended_timer="pomodoro",
            color_token="violet",
        ),
        system_overlay=(
            "ACTIVE FRAMEWORK: Feynman Gap Finder. "
            "Do NOT lecture or give textbook explanations. Ask the user to formulate the core "
            "idea in plain words and choose which exact link in the causal chain feels fuzzy."
        ),
    ),
}


def list_frameworks() -> list[FrameworkItem]:
    return [entry.item for entry in FRAMEWORKS.values()]


def get_framework(framework_id: str) -> FrameworkDefinition:
    if framework_id in FRAMEWORKS:
        return FRAMEWORKS[framework_id]  # type: ignore[index]
    return FRAMEWORKS["socratic"]


def recommended_timer_for(framework_id: str) -> TimerMode:
    return get_framework(framework_id).item.recommended_timer
