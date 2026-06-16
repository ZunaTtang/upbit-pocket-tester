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

  const input = "w-full border border-slate-300 rounded px-2 py-1 text-sm";

  return (
    <div className="max-w-4xl space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-bold text-slate-800 mb-1">{editing ? "API 키 수정" : "API 키 등록"}</h2>
        <p className="text-xs text-slate-500 mb-3">
          secret_key 는 백엔드에서 암호화 저장되며 프론트로 다시 내려오지 않습니다. 권한 체크리스트는 UI 활성화 판단용 메타데이터입니다(실제 권한은 업비트가 강제).
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-0.5">라벨</label>
            <input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="예: 메인-검증용" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-0.5">포켓 유형</label>
            <select className={input} value={form.pocket_type} onChange={(e) => setForm({ ...form, pocket_type: e.target.value })}>
              <option value="main">메인포켓</option>
              <option value="sub">서브포켓</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-0.5">Access Key</label>
            <input className={input + " font-mono"} value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-0.5">
              Secret Key {editing && <span className="text-slate-400">(비우면 기존 유지)</span>}
            </label>
            <input type="password" className={input + " font-mono"} value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold text-slate-600 mb-1">부여 권한 체크리스트</label>
          <div className="grid grid-cols-3 gap-1">
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={busy} className="px-4 py-1.5 rounded bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50">
            {editing ? "수정 저장" : "키 등록"}
          </button>
          {editing && (
            <button onClick={() => setForm(EMPTY)} className="px-4 py-1.5 rounded border border-slate-300 text-sm">취소</button>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-slate-800 mb-2">등록된 키</h2>
        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-slate-500">등록된 키가 없습니다.</p>}
          {keys.map((k) => (
            <div key={k.id} className={`bg-white border rounded-lg p-3 ${k.is_active ? "border-sky-400 ring-1 ring-sky-200" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{k.label}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded ${k.pocket_type === "main" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                  {k.pocket_type === "main" ? "메인포켓" : "서브포켓"}
                </span>
                {k.is_active && <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">활성</span>}
                <span className="ml-auto flex gap-2">
                  {!k.is_active && <button onClick={() => setActive(k.id)} className="text-xs px-2 py-1 border border-slate-300 rounded">활성화</button>}
                  <button onClick={() => editKey(k)} className="text-xs px-2 py-1 border border-slate-300 rounded">수정</button>
                  <button onClick={() => remove(k.id)} className="text-xs px-2 py-1 border border-rose-300 text-rose-600 rounded">삭제</button>
                </span>
              </div>
              <div className="text-xs font-mono text-slate-500 mt-1 break-all">access: {k.access_key}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {k.permissions.length === 0 && <span className="text-[11px] text-slate-400">권한 메타 없음</span>}
                {k.permissions.map((p) => (
                  <span key={p} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
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
