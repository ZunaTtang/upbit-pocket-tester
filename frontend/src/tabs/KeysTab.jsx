import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { PERMISSIONS } from "../endpoints";

const EMPTY = { id: null, label: "", access_key: "", secret_key: "", pocket_type: "main", permissions: [] };

export default function KeysTab() {
  const { keys, activeKey, refreshKeys, setActive, notify } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = form.id != null;

  function togglePerm(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function submit() {
    if (!form.label || !form.access_key || (!editing && !form.secret_key))
      return notify("라벨/Access/Secret 을 입력하세요. (수정 시 Secret 비우면 유지)", "error");
    setBusy(true);
    try {
      if (editing) {
        await api.updateKey(form.id, {
          label: form.label,
          pocket_type: form.pocket_type,
          permissions: form.permissions,
          secret_key: form.secret_key || null,
        });
      } else {
        await api.createKey(form);
      }
      await refreshKeys();
      setForm(EMPTY);
      notify("저장되었습니다.", "success");
    } catch (e) {
      notify("저장 실패: " + e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("이 키를 삭제할까요?")) return;
    await api.deleteKey(id);
    await refreshKeys();
    if (form.id === id) setForm(EMPTY);
  }

  function editKey(k) {
    setForm({ ...k, secret_key: "" });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="card p-4">
        <h2 className="section-title mb-1">{editing ? "API 키 수정" : "API 키 등록"}</h2>
        <p className="field-help mb-3">
          secret_key 는 백엔드에서 암호화 저장되며 프론트로 다시 내려오지 않습니다. 권한 체크리스트는 UI 활성화 판단용 메타데이터입니다(실제 권한은 업비트가 강제).
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">라벨</label>
            <input className="field-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="예: 메인-검증용" />
          </div>
          <div>
            <label className="field-label">포켓 유형</label>
            <select className="field-input" value={form.pocket_type} onChange={(e) => setForm({ ...form, pocket_type: e.target.value })}>
              <option value="main">메인포켓</option>
              <option value="sub">서브포켓</option>
            </select>
          </div>
          <div>
            <label className="field-label">Access Key</label>
            <input className="field-input field-mono" value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} />
          </div>
          <div>
            <label className="field-label">
              Secret Key {editing && <span className="text-ink-400 font-normal">(비우면 기존 유지)</span>}
            </label>
            <input type="password" className="field-input field-mono" value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} />
          </div>
        </div>

        <div className="mt-3">
          <label className="field-label">부여 권한 체크리스트</label>
          <div className="grid grid-cols-3 gap-1.5">
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-center gap-1.5 text-sm text-ink-700">
                <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={busy} className="btn-primary">
            {editing ? "수정 저장" : "키 등록"}
          </button>
          {editing && (
            <button onClick={() => setForm(EMPTY)} className="btn-ghost">취소</button>
          )}
        </div>
      </section>

      <section>
        <h2 className="section-title mb-2">등록된 키</h2>
        <div className="space-y-2">
          {keys.length === 0 && (
            <div className="empty-state">
              <div className="text-3xl">🔑</div>
              <p>등록된 키가 없습니다.</p>
            </div>
          )}
          {keys.map((k) => (
            <div key={k.id} className={k.is_active ? "card p-3 border-brand-400 ring-1 ring-brand-200" : "card p-3"}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink-800">{k.label}</span>
                <span className={`chip ${k.pocket_type === "main" ? "bg-brand-100 text-brand-700" : "bg-accent-violet-100 text-accent-violet-700"}`}>
                  {k.pocket_type === "main" ? "메인포켓" : "서브포켓"}
                </span>
                {k.is_active && <span className="chip bg-ok-100 text-ok-700 font-semibold">활성</span>}
                <span className="ml-auto flex gap-2">
                  {!k.is_active && <button onClick={() => setActive(k.id)} className="btn-ghost btn-sm">활성화</button>}
                  <button onClick={() => editKey(k)} className="btn-ghost btn-sm">수정</button>
                  <button onClick={() => remove(k.id)} className="btn-ghost btn-sm border-danger-300 text-danger-600 hover:bg-danger-50">삭제</button>
                </span>
              </div>
              <div className="field-mono text-xs text-ink-500 mt-1 break-all">access: {k.access_key}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {k.permissions.length === 0 && <span className="text-[11px] text-ink-400">권한 메타 없음</span>}
                {k.permissions.map((p) => (
                  <span key={p} className="chip">
                    {PERMISSIONS.find((x) => x.key === p)?.label || p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
