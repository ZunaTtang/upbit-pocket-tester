import { useState, useRef, useMemo, useEffect } from "react";

// 외부 의존 없는 검색형 콤보박스. 순수 React(useState/useRef/useMemo/useEffect)만 사용.
//
// props:
//   value              단일모드: string, 멀티모드: string[]
//   onChange           단일: onChange(optionValue|freeText) / 멀티: onChange(nextArray)
//   options            옵션 배열
//   multiple           기본 false
//   allowFreeInput     기본 false — 매칭 없는 입력도 확정 허용
//   placeholder
//   getOptionValue     기본 o => o.value
//   getOptionLabel     기본 o => o.label
//   getOptionSecondary 기본 o => o.secondary
//   disabled
//   maxMenu            기본 50
//   emptyText          매칭 옵션이 하나도 없을 때 메뉴에 표시할 문구
//   freeInputHint      allowFreeInput 안내 힌트(메뉴 하단)
export default function Combobox({
  value,
  onChange,
  options = [],
  multiple = false,
  allowFreeInput = false,
  placeholder = "",
  getOptionValue = (o) => o.value,
  getOptionLabel = (o) => o.label,
  getOptionSecondary = (o) => o.secondary,
  disabled = false,
  maxMenu = 50,
  emptyText = "검색 결과 없음",
  freeInputHint,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedValues = useMemo(
    () => (multiple ? (Array.isArray(value) ? value : []) : []),
    [multiple, value]
  );

  // 단일모드: 비포커스 시 선택옵션 label, 포커스(open) 시 query.
  const selectedOption = useMemo(() => {
    if (multiple) return null;
    return options.find((o) => getOptionValue(o) === value) || null;
  }, [multiple, options, value, getOptionValue]);

  const selectedLabel = selectedOption
    ? getOptionLabel(selectedOption)
    : value || "";

  // 필터: query 소문자 trim 으로 label+value 부분일치, 최대 maxMenu.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    for (const o of options) {
      const label = String(getOptionLabel(o) ?? "").toLowerCase();
      const val = String(getOptionValue(o) ?? "").toLowerCase();
      if (!q || label.includes(q) || val.includes(q)) {
        out.push(o);
        if (out.length >= maxMenu) break;
      }
    }
    return out;
  }, [options, query, maxMenu, getOptionLabel, getOptionValue]);

  // 필터 결과가 바뀌면 activeIndex 를 범위 안으로 보정.
  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  // 바깥 클릭 시 닫기 (cleanup 필수).
  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(0);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  // ---- 선택 확정 ----------------------------------------------------------
  function commitOption(o) {
    const v = getOptionValue(o);
    if (multiple) {
      // toggle, 메뉴 유지, query 비움.
      const exists = selectedValues.includes(v);
      const next = exists ? selectedValues.filter((x) => x !== v) : [...selectedValues, v];
      onChange(next);
      setQuery("");
      // 포커스 유지로 멀티 선택을 이어갈 수 있게 함.
      if (inputRef.current) inputRef.current.focus();
    } else {
      onChange(v);
      closeMenu();
    }
  }

  function commitFree() {
    const text = query.trim();
    if (!allowFreeInput || !text) return false;
    if (multiple) {
      // 중복/빈값 무시.
      if (!selectedValues.includes(text)) {
        onChange([...selectedValues, text]);
      }
      setQuery("");
    } else {
      onChange(text);
      closeMenu();
    }
    return true;
  }

  function removeChip(v) {
    if (disabled) return;
    onChange(selectedValues.filter((x) => x !== v));
  }

  // ---- 키보드 -------------------------------------------------------------
  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (filtered.length) setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (filtered.length) setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = open ? filtered[activeIndex] : null;
      if (active) commitOption(active);
      else commitFree();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeMenu();
      }
    } else if (e.key === "Backspace") {
      // 멀티 && query 빈값이면 마지막 칩 제거.
      if (multiple && query === "" && selectedValues.length) {
        e.preventDefault();
        onChange(selectedValues.slice(0, -1));
      }
    } else if (e.key === "Tab") {
      // 메뉴만 닫고 포커스 이동은 그대로(preventDefault 하지 않음).
      if (open) setOpen(false);
    }
  }

  function onInputChange(e) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
    setActiveIndex(0);
  }

  function onFocus() {
    openMenu();
  }

  function onBlur() {
    // free input 확정은 blur 에서도. 바깥클릭 닫힘과 겹치지 않도록 메뉴 닫힘은 mousedown 리스너가 담당.
    if (allowFreeInput && !multiple) {
      const text = query.trim();
      if (text && (!selectedOption || getOptionValue(selectedOption) !== text)) {
        onChange(text);
      }
    }
  }

  // 단일모드 input 표시값: open 이면 query, 아니면 선택 label.
  const inputValue = multiple ? query : open ? query : selectedLabel;

  return (
    <div className="relative" ref={containerRef}>
      {multiple && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selectedValues.map((v) => {
            const o = options.find((x) => getOptionValue(x) === v);
            const label = o ? getOptionLabel(o) : v;
            return (
              <span key={v} className="chip">
                <span>{label}</span>
                <button
                  type="button"
                  className="ml-1 text-ink-500 hover:text-ink-900"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    removeChip(v);
                  }}
                  aria-label={`${label} 제거`}
                  disabled={disabled}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        className="field-input"
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onInputChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-ink-200 rounded-control shadow-pop max-h-56 overflow-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-ink-500">{emptyText}</div>
          )}
          {filtered.map((o, idx) => {
            const v = getOptionValue(o);
            const label = getOptionLabel(o);
            const secondary = getOptionSecondary(o);
            const isActive = idx === activeIndex;
            const isSelected = multiple && selectedValues.includes(v);
            return (
              <div
                key={String(v) + "::" + idx}
                className={`px-3 py-1.5 cursor-pointer ${isActive ? "bg-brand-50" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitOption(o);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                role="option"
                aria-selected={isSelected}
              >
                <div className="flex items-center gap-2">
                  {multiple && (
                    <span className="text-xs text-ink-500">{isSelected ? "☑" : "☐"}</span>
                  )}
                  <span className="font-semibold">{label}</span>
                </div>
                {secondary != null && secondary !== "" && (
                  <div className="text-xs text-ink-500">{secondary}</div>
                )}
              </div>
            );
          })}
          {freeInputHint && (
            <div className="px-3 py-1.5 text-xs text-ink-500 border-t border-ink-200">
              {freeInputHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
