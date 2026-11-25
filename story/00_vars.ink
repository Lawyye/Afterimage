// ⚠ СПОЙЛЕРЫ. Сценарий игры «Послеобраз».
// Формат реплик: id/эмоция: текст   (id_ — только голос, без портрета)
// thought: — мысли Евы; sys: — системный текст; строка «@» — только теги.

VAR chapter = 0
// отношения и скрытые счётчики
VAR trust_orpheus = 0
VAR trust_leo = 0
VAR kessler_respect = 0
VAR voron_knows = 0
// состояние
VAR told_voron = false
VAR orpheus_silent = false
VAR orpheus_reported = false
VAR orpheus_ally = false
VAR orpheus_cut = false
VAR leo_met = false
VAR leo_alive = true
VAR leo_fled = false
VAR leo_taken = false
VAR kessler_met = false
VAR kessler_offer = false
VAR knows_leo = false
VAR has_archive = false
VAR sent_copy_leo = false
VAR cat_saved = false
VAR hass_met = false
VAR hass_kind = false
VAR deep_read = false
VAR has_needle = false
VAR knows_niche = false
VAR photo_back = false
VAR called = false
VAR leave_soon = 0
VAR apt_seen = 0
VAR pressure = 0
VAR voron_confessed = false
VAR sonya_talked = false
// улики
VAR ev_coat = false
VAR ev_pistol = false
VAR ev_photo = false
VAR ev_note = false
VAR ev_pills = false
VAR ev_service = false
VAR ev_afterimage = false
VAR ev_voron_words = false
VAR ev_glass = false
VAR ev_cups = false
VAR ev_terminal = false
VAR ev_doorlog = false
VAR ev_cctv = false
VAR ev_notebook = false
VAR ev_photo_ms = false
VAR ev_retouch = false
VAR ev_seal = false
VAR ev_gap = false
VAR ev_frames = false
VAR ev_request = false
VAR ev_request_name = false
VAR ev_hass = false
VAR ev_message = false
VAR ev_original = false
VAR ev_log = false
VAR ev_orpheus_log = false
VAR ev_deep = false
// выводы (ставит доска расследования)
VAR ded_where = false
VAR ded_authentic = false
VAR ded_voron_there = false
VAR ded_rewritten = false
VAR ded_sonya = false
VAR ded_loop = false
// хроника решений
VAR c0_orpheus = 0
VAR c0_dream = 0
VAR c0_items = 0
VAR c1_report = 0
VAR c1_voron = 0
VAR c1_cat = 0
VAR c2_first = 0
VAR c2_call = 0
VAR c2_hass = 0
VAR c2_leo = 0
VAR c2_cleaners = 0
VAR c2_kessler = 0
VAR c3_orpheus = 0
VAR c3_deep = 0
VAR c3_copy = 0
VAR c4_final = 0
VAR ending = ""

-> intro
