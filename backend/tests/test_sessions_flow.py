import pytest
from fastapi.testclient import TestClient


def test_full_socratic_to_pomodoro_and_stuck_flow(client: TestClient) -> None:
    # 1. Library endpoint
    fw_resp = client.get("/api/frameworks")
    assert fw_resp.status_code == 200
    assert len(fw_resp.json()) == 6

    # 2. Anti-solution guardrail triggered on "write it for me"
    create_resp = client.post(
        "/api/sessions",
        json={"problem": "Напиши за мене код лабораторної роботи з патернів"},
    )
    assert create_resp.status_code == 201
    session = create_resp.json()
    session_id = session["id"]
    assert session["phase"] == "socratic"
    assert session["question_count"] == 1
    assert session["turns"][0]["guardrail_triggered"] is True
    assert len(session["turns"][0]["options"]) >= 3

    # 3. Switch framework mid-session from library
    switch_resp = client.post(
        f"/api/sessions/{session_id}/framework",
        json={"framework_id": "first_principles"},
    )
    assert switch_resp.status_code == 200
    assert switch_resp.json()["framework_id"] == "first_principles"

    # 4. Answer 3 questions to hit anti-procrastination blitz cap -> auto generates plan
    for idx in range(3):
        current = client.get(f"/api/sessions/{session_id}").json()
        assert current["phase"] == "socratic"
        first_opt = current["turns"][-1]["options"][0]
        ans_resp = client.post(
            f"/api/sessions/{session_id}/answer",
            json={"answer_text": first_opt["label"], "option_id": first_opt["id"]},
        )
        assert ans_resp.status_code == 200
        if idx < 2:
            assert ans_resp.json()["phase"] == "socratic"
            assert ans_resp.json()["question_count"] == idx + 2
        else:
            assert ans_resp.json()["phase"] == "executing"

    # 5. Verify progressive step lock: only step 1 is active, others are locked
    executing = client.get(f"/api/sessions/{session_id}").json()
    steps = executing["steps"]
    assert len(steps) >= 3
    assert steps[0]["status"] == "active"
    assert all(s["status"] == "locked" for s in steps[1:])

    # Attempting to complete locked step 2 must fail
    locked_resp = client.post(
        f"/api/sessions/{session_id}/steps/{steps[1]['id']}/complete",
        json={"elapsed_seconds": 30},
    )
    assert locked_resp.status_code == 400

    # 6. Mark step 1 as stuck -> splits into tiny micro-substeps
    stuck_resp = client.post(f"/api/sessions/{session_id}/steps/{steps[0]['id']}/stuck")
    assert stuck_resp.status_code == 200
    split_steps = stuck_resp.json()["steps"]
    assert split_steps[0]["status"] == "split"
    assert split_steps[1]["status"] == "active"
    assert split_steps[1]["parent_step_id"] == steps[0]["id"]

    # 7. Complete active micro-step -> unlocks next step and records vector memory
    complete_resp = client.post(
        f"/api/sessions/{session_id}/steps/{split_steps[1]['id']}/complete",
        json={"elapsed_seconds": 120, "reflection_note": "Opened IDE and wrote interface"},
    )
    assert complete_resp.status_code == 200
    after_complete = complete_resp.json()["steps"]
    assert after_complete[1]["status"] == "completed"
    assert after_complete[2]["status"] == "active"

    # 8. Memory and cognitive profile updated
    mem_resp = client.get("/api/memory")
    assert mem_resp.status_code == 200
    mem_data = mem_resp.json()
    assert mem_data["cognitive_profile"]["completed_steps"] == 1
    assert mem_data["cognitive_profile"]["total_focus_seconds"] == 120
    assert len(mem_data["memories"]) == 1


def test_create_session_with_attachment_and_empty_problem(client: TestClient) -> None:
    create_resp = client.post(
        "/api/sessions",
        json={
            "problem": "",
            "language": "uk",
            "attachments": [
                {
                    "name": "lab3_architecture.py",
                    "mime_type": "text/x-python",
                    "size_bytes": 512,
                    "text_excerpt": "class OrderProcessor:\n    pass\n",
                }
            ],
        },
    )
    assert create_resp.status_code == 201
    session = create_resp.json()
    assert len(session["attachments"]) == 1
    assert session["attachments"][0]["name"] == "lab3_architecture.py"
    assert session["attachments"][0]["has_text"] is True
    assert "lab3_architecture.py" in session["turns"][0]["question_text"]

    # Empty problem without attachments must fail validation
    bad_resp = client.post("/api/sessions", json={"problem": ""})
    assert bad_resp.status_code == 422


def test_reanswer_previous_turn_and_rewind_from_plan(client: TestClient) -> None:
    create_resp = client.post(
        "/api/sessions",
        json={"problem": "Застряг на проєктуванні API для курсової"},
    )
    assert create_resp.status_code == 201
    session = create_resp.json()
    session_id = session["id"]
    turn1_opt1 = session["turns"][0]["options"][0]
    turn1_opt2 = session["turns"][0]["options"][1]

    # Answer Q1 -> generates Q2
    ans1 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": turn1_opt1["label"], "option_id": turn1_opt1["id"]},
    )
    assert ans1.status_code == 200
    assert ans1.json()["question_count"] == 2
    assert len(ans1.json()["turns"]) == 2

    # Answer Q2 -> generates Q3
    turn2_opt1 = ans1.json()["turns"][1]["options"][0]
    ans2 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": turn2_opt1["label"], "option_id": turn2_opt1["id"]},
    )
    assert ans2.status_code == 200
    assert ans2.json()["question_count"] == 3
    assert len(ans2.json()["turns"]) == 3

    # Identical re-answer on Q1 is idempotent and preserves Q2/Q3
    same_q1 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={
            "answer_text": turn1_opt1["label"],
            "option_id": turn1_opt1["id"],
            "turn_number": 1,
        },
    )
    assert same_q1.status_code == 200
    assert same_q1.json()["question_count"] == 3
    assert len(same_q1.json()["turns"]) == 3

    # Re-answering Q1 with a different option truncates Q2/Q3 and generates fresh Q2
    edit_q1 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={
            "answer_text": turn1_opt2["label"],
            "option_id": turn1_opt2["id"],
            "turn_number": 1,
        },
    )
    assert edit_q1.status_code == 200
    edited = edit_q1.json()
    assert edited["phase"] == "socratic"
    assert edited["question_count"] == 2
    assert len(edited["turns"]) == 2
    assert edited["turns"][0]["user_answer"] == turn1_opt2["label"]
    assert edited["turns"][0]["selected_option_id"] == turn1_opt2["id"]
    assert edited["turns"][1]["user_answer"] is None

    # Finish Q2 and Q3 to reach executing plan
    q2_opt = edited["turns"][1]["options"][0]
    ans2_new = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": q2_opt["label"], "option_id": q2_opt["id"]},
    ).json()
    q3_opt1 = ans2_new["turns"][2]["options"][0]
    q3_opt2 = ans2_new["turns"][2]["options"][1]
    exec_session = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": q3_opt1["label"], "option_id": q3_opt1["id"]},
    ).json()
    assert exec_session["phase"] == "executing"
    assert len(exec_session["steps"]) >= 3

    # Re-answering Q3 while in executing (before any step completed) regenerates plan
    re_q3 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={
            "answer_text": q3_opt2["label"],
            "option_id": q3_opt2["id"],
            "turn_number": 3,
        },
    )
    assert re_q3.status_code == 200
    assert re_q3.json()["phase"] == "executing"
    assert re_q3.json()["turns"][2]["user_answer"] == q3_opt2["label"]
    assert re_q3.json()["turns"][2]["selected_option_id"] == q3_opt2["id"]

    # Re-answering Q1 from executing with custom text rewinds back to socratic Q2 and clears steps
    rewind_q1 = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": "Власний фокус на схемі БД", "turn_number": 1},
    )
    assert rewind_q1.status_code == 200
    rewound = rewind_q1.json()
    assert rewound["phase"] == "socratic"
    assert rewound["question_count"] == 2
    assert rewound["steps"] == []
    assert rewound["summary"] is None
    assert rewound["turns"][0]["user_answer"] == "Власний фокус на схемі БД"
    assert rewound["turns"][0]["selected_option_id"] is None

    # Finish Q2 & Q3, complete Step 1 -> editing earlier answers is now blocked
    q2_again = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": rewound["turns"][1]["options"][0]["label"]},
    ).json()
    exec_again = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": q2_again["turns"][2]["options"][0]["label"]},
    ).json()
    step1_id = exec_again["steps"][0]["id"]
    comp = client.post(
        f"/api/sessions/{session_id}/steps/{step1_id}/complete",
        json={"elapsed_seconds": 60},
    )
    assert comp.status_code == 200

    blocked = client.post(
        f"/api/sessions/{session_id}/answer",
        json={"answer_text": "Пізно змінювати", "turn_number": 1},
    )
    assert blocked.status_code == 400


def test_chat_mode_session_and_convert_to_plan(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={
            "problem": "Хочу розібратися, з чого почати робити ігри в Roblox",
            "mode": "chat",
        },
    )
    assert created.status_code == 201
    session = created.json()
    session_id = session["id"]
    assert session["phase"] == "chat"
    assert session["question_count"] == 0
    assert session["turns"] == []
    assert len(session["messages"]) == 2
    assert session["messages"][0]["role"] == "user"
    assert session["messages"][1]["role"] == "assistant"

    followup = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"content": "блять що за фігня, поясни простіше що мені зараз робити"},
    )
    assert followup.status_code == 200
    after_chat = followup.json()
    assert after_chat["phase"] == "chat"
    assert len(after_chat["messages"]) == 4
    assert after_chat["messages"][2]["role"] == "user"
    assert after_chat["messages"][3]["role"] == "assistant"

    with_file = client.post(
        f"/api/sessions/{session_id}/chat",
        json={
            "content": "",
            "attachments": [
                {
                    "name": "script.lua",
                    "mime_type": "text/plain",
                    "size_bytes": 42,
                    "text_excerpt": "print('hello roblox')",
                }
            ],
        },
    )
    assert with_file.status_code == 200
    with_file_data = with_file.json()
    assert len(with_file_data["messages"]) == 6
    assert "script.lua" in with_file_data["messages"][4]["content"]
    assert [att["name"] for att in with_file_data["attachments"]] == ["script.lua"]

    planned = client.post(f"/api/sessions/{session_id}/plan")
    assert planned.status_code == 200
    plan_session = planned.json()
    assert plan_session["phase"] == "executing"
    assert len(plan_session["steps"]) >= 3
    assert len(plan_session["messages"]) == 6


def test_session_chat_preserves_socratic_turn_and_sees_executing_step(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={"problem": "Не можу почати дипломний проект", "mode": "task"},
    )
    assert created.status_code == 201
    session = created.json()
    session_id = session["id"]
    assert session["phase"] == "socratic"
    assert session["question_count"] == 1
    assert session["messages"] == []

    chat_in_socratic = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"content": "Чому ти питаєш саме це?"},
    )
    assert chat_in_socratic.status_code == 200
    data = chat_in_socratic.json()
    assert data["phase"] == "socratic"
    assert data["question_count"] == 1
    assert len(data["turns"]) == 1
    assert data["turns"][0]["user_answer"] is None
    assert len(data["messages"]) == 2

    planned = client.post(f"/api/sessions/{session_id}/plan").json()
    assert planned["phase"] == "executing"

    chat_in_exec = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"content": "Поясни перший крок детальніше"},
    )
    assert chat_in_exec.status_code == 200
    exec_data = chat_in_exec.json()
    assert exec_data["phase"] == "executing"
    assert len(exec_data["messages"]) == 4
    assert exec_data["steps"][0]["title"] in exec_data["messages"][3]["content"]


def test_option_id_length_attachment_sanitization_and_rate_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import rate_limit
    from app.config import settings

    rate_limit.reset_rate_limiter()
    created = client.post(
        "/api/sessions",
        json={
            "problem": "Перевірка безпеки вкладень",
            "attachments": [
                {
                    "name": "evil\nname\u202etxt",
                    "mime_type": "text/plain",
                    "size_bytes": 10,
                    "text_excerpt": "hello\x00world",
                }
            ],
        },
    )
    assert created.status_code == 201
    session = created.json()
    assert "\n" not in session["attachments"][0]["name"]
    assert "\u202e" not in session["attachments"][0]["name"]

    bad_opt = client.post(
        f"/api/sessions/{session['id']}/answer",
        json={"answer_text": "test", "option_id": "x" * 65},
    )
    assert bad_opt.status_code == 422

    monkeypatch.setattr(settings, "rate_limit_llm_requests", 2)
    rate_limit.reset_rate_limiter()
    r1 = client.post(f"/api/sessions/{session['id']}/chat", json={"content": "Ping 1"})
    r2 = client.post(f"/api/sessions/{session['id']}/chat", json={"content": "Ping 2"})
    r3 = client.post(f"/api/sessions/{session['id']}/chat", json={"content": "Ping 3"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    rate_limit.reset_rate_limiter()


def test_simple_problem_fast_tracks_to_action_plan_on_step_1(client: TestClient) -> None:
    resp = client.post(
        "/api/sessions",
        json={
            "problem": "Написати короткий лист викладачу про перенесення консультації",
            "mode": "task",
        },
    )
    assert resp.status_code == 201
    session = resp.json()
    assert session["phase"] == "executing"
    assert session["max_questions"] == 1
    assert len(session["steps"]) >= 3
    assert session["summary"] is not None


def test_chat_sync_to_socratic_and_breakdown_and_auto_completion(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={"problem": "Застряг на архітектурі бази даних", "mode": "task"},
    ).json()
    sid = created["id"]

    # Send a chat message with specific context, then answer Q1 -> Q2 sees chat context
    chat_res = client.post(
        f"/api/sessions/{sid}/chat",
        json={"content": "У мене таблиця orders без індексів"},
    ).json()
    assert chat_res["messages"][-1]["conversation_complete"] is False

    # Send closure message -> assistant marks conversation_complete=True
    closed_chat = client.post(
        f"/api/sessions/{sid}/chat",
        json={"content": "Дякую, все зрозуміло"},
    ).json()
    assert closed_chat["messages"][-1]["conversation_complete"] is True

    # Plan and split stuck step -> breakdown receives chat_messages context
    planned = client.post(f"/api/sessions/{sid}/plan").json()
    active_step_id = planned["steps"][0]["id"]
    split_res = client.post(f"/api/sessions/{sid}/steps/{active_step_id}/stuck").json()
    assert "враховуючи з чату" in split_res["steps"][1]["description"]

    # Splitting repeatedly up to MAX_STEPS_PER_SESSION (15) returns a helpful localized message
    while len(split_res["steps"]) < 15:
        curr_active = next(s for s in split_res["steps"] if s["status"] == "active")
        resp = client.post(f"/api/sessions/{sid}/steps/{curr_active['id']}/stuck")
        assert resp.status_code == 200
        split_res = resp.json()

    assert len(split_res["steps"]) == 15
    final_active = next(s for s in split_res["steps"] if s["status"] == "active")
    limit_resp = client.post(f"/api/sessions/{sid}/steps/{final_active['id']}/stuck")
    assert limit_resp.status_code == 400
    assert "максимальну деталізацію" in limit_resp.json()["detail"]
