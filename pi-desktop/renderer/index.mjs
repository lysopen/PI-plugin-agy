import React, { createElement as h, createPortal, useCallback, useEffect, useMemo, useState } from "react";

let host;

const QUOTA_CSS = `
.agy-quota-control {
  display: inline-flex;
  align-items: center;
}
.agy-quota-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 2px 9px;
  border: 1px solid var(--ds-border-default);
  border-radius: 999px;
  background: transparent;
  color: var(--ds-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.agy-quota-button:hover,
.agy-quota-button[aria-expanded="true"] {
  border-color: var(--ds-accent);
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}
.agy-quota-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ds-success);
}
.agy-quota-dot[data-state="partial"] {
  background: var(--ds-warning);
}
.agy-quota-dot[data-state="error"] {
  background: var(--ds-error);
}
.agy-quota-layer {
  position: fixed;
  left: 14px;
  bottom: 62px;
  z-index: 1;
}
.agy-quota-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(370px, calc(100vw - 28px));
  max-height: min(72vh, 560px);
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--ds-border-default);
  border-radius: 12px;
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  box-shadow: 0 16px 44px rgb(0 0 0 / 26%);
  font-size: 12px;
  line-height: 1.45;
}
.agy-quota-head,
.agy-quota-account-head,
.agy-quota-bucket-head,
.agy-quota-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.agy-quota-head {
  font-size: 13px;
}
.agy-quota-muted {
  color: var(--ds-text-muted);
}
.agy-quota-button-plain {
  padding: 2px 7px;
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  background: transparent;
  color: var(--ds-text-secondary);
  font: inherit;
  cursor: pointer;
}
.agy-quota-button-plain:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}
.agy-quota-account {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--ds-border-subtle);
  border-radius: 9px;
  background: var(--ds-bg-secondary);
}
.agy-quota-account-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.agy-quota-tier {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ds-bg-chip);
  color: var(--ds-text-muted);
  font-size: 10px;
}
.agy-quota-email {
  overflow-wrap: anywhere;
  color: var(--ds-text-muted);
  font-size: 11px;
}
.agy-quota-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.agy-quota-group-name {
  color: var(--ds-text-secondary);
  font-weight: 600;
}
.agy-quota-bucket {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.agy-quota-bucket-head strong {
  color: var(--ds-text-primary);
}
.agy-quota-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--ds-bg-chip);
}
.agy-quota-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ds-accent);
}
.agy-quota-reset {
  color: var(--ds-text-muted);
  font-size: 10px;
}
.agy-quota-error {
  color: var(--ds-error);
}
`;

function percent(fraction) {
  return `${Math.round(Math.min(1, Math.max(0, Number(fraction) || 0)) * 100)}%`;
}

function resetLabel(value) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function accountTitle(account) {
  return account.label || account.email || (account.system ? "本机账号" : account.id);
}

function summaryLabel(data) {
  const fractions = (data?.accounts ?? [])
    .flatMap((account) => (account.quota?.groups ?? []))
    .flatMap((group) => group.buckets ?? [])
    .filter((bucket) => bucket.disabled !== true)
    .map((bucket) => Number(bucket.remainingFraction))
    .filter(Number.isFinite);
  if (fractions.length === 0) return "额度";
  return `额度 ${percent(Math.min(...fractions))}`;
}

function statusOf(data, loading) {
  if (loading) return "partial";
  if (!data || data.status === "ok") return "ok";
  return "error";
}

function Bucket({ bucket }) {
  const value = bucket.disabled ? "不可用" : percent(bucket.remainingFraction);
  return h(
    "div",
    { className: "agy-quota-bucket" },
    h(
      "div",
      { className: "agy-quota-bucket-head" },
      h("span", null, bucket.name || bucket.window || "窗口"),
      h("strong", null, value),
    ),
    bucket.disabled
      ? null
      : h(
          "div",
          { className: "agy-quota-bar", "aria-hidden": "true" },
          h("span", { style: { width: percent(bucket.remainingFraction) } }),
        ),
    bucket.resetTime
      ? h("span", { className: "agy-quota-reset" }, `重置：${resetLabel(bucket.resetTime)}`)
      : null,
  );
}

function AccountCard({ account }) {
  const tier = account.quota?.subscriptionName || account.quota?.subscriptionTier
    || account.subscriptionName || account.subscriptionTier;
  const groups = account.quota?.groups ?? [];
  return h(
    "section",
    { className: "agy-quota-account" },
    h(
      "div",
      { className: "agy-quota-account-head" },
      h("span", { className: "agy-quota-account-title", title: accountTitle(account) }, accountTitle(account)),
      tier ? h("span", { className: "agy-quota-tier" }, tier) : null,
    ),
    account.email && account.email !== accountTitle(account)
      ? h("span", { className: "agy-quota-email" }, account.email)
      : null,
    account.quota?.status === "ok" && groups.length > 0
      ? groups.map((group, index) =>
          h(
            "div",
            { className: "agy-quota-group", key: `${group.kind}-${index}` },
            h("span", { className: "agy-quota-group-name" }, group.name),
            ...(group.buckets ?? []).map((bucket, bucketIndex) =>
              h(Bucket, { bucket, key: `${bucket.id || bucket.window}-${bucketIndex}` }),
            ),
          ),
        )
      : h(
          "span",
          { className: account.quota?.status === "ok" ? "agy-quota-muted" : "agy-quota-error" },
          account.quota?.error || "暂无额度数据",
        ),
  );
}

function QuotaPanel({ layer, data, loading, error, onRefresh, onClose }) {
  const accounts = data?.accounts ?? [];
  return createPortal(
    h(
      "div",
      { className: "agy-quota-layer", "data-agy-quota": "panel" },
      h(
        "div",
        { className: "agy-quota-panel", role: "dialog", "aria-label": "Antigravity 额度" },
        h(
          "div",
          { className: "agy-quota-head" },
          h("strong", null, "Antigravity 额度"),
          h(
            "div",
            null,
            h(
              "button",
              {
                type: "button",
                className: "agy-quota-button-plain",
                onClick: () => onRefresh(true),
                disabled: loading,
              },
              loading ? "刷新中…" : "刷新",
            ),
            " ",
            h(
              "button",
              {
                type: "button",
                className: "agy-quota-button-plain",
                onClick: onClose,
                "aria-label": "关闭额度面板",
              },
              "关闭",
            ),
          ),
        ),
        error ? h("div", { className: "agy-quota-error" }, error) : null,
        loading && accounts.length === 0
          ? h("div", { className: "agy-quota-muted" }, "正在读取账号额度…")
          : accounts.length > 0
            ? accounts.map((account) => h(AccountCard, { account, key: account.id }))
            : h("div", { className: "agy-quota-muted" }, "尚未配置 Antigravity 账号。"),
        h(
          "div",
          { className: "agy-quota-foot" },
          h(
            "span",
            { className: "agy-quota-muted" },
            data?.updatedAt ? `读取时间：${resetLabel(data.updatedAt)}` : "额度按需读取",
          ),
          data?.status === "partial" ? h("span", { className: "agy-quota-muted" }, "部分结果") : null,
        ),
      ),
    ),
    layer.element,
  );
}

function QuotaControl() {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = useMemo(() => summaryLabel(data), [data]);
  const status = statusOf(data, loading);
  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const answer = await host.dispatch("plugin.call", {
        method: "agy.quota",
        args: { force },
      });
      setData(answer);
    } catch (reason) {
      setError(String(reason?.message || reason?.code || reason || "额度读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const opened = host.ui.openLayer();
    setLayer(opened);
    void refresh(false);
    return () => {
      opened.close();
      setLayer(null);
    };
  }, [open, refresh]);

  return h(
    "span",
    { className: "agy-quota-control" },
    h(
      "button",
      {
        type: "button",
        className: "agy-quota-button",
        "aria-expanded": open,
        "aria-label": "查看 Antigravity 账号额度",
        title: "查看 Antigravity 账号剩余额度",
        onClick: () => setOpen((value) => !value),
      },
      h("span", { className: "agy-quota-dot", "data-state": status, "aria-hidden": "true" }),
      label,
    ),
    open && layer
      ? h(QuotaPanel, {
          layer,
          data,
          loading,
          error,
          onRefresh: refresh,
          onClose: () => setOpen(false),
        })
      : null,
  );
}

export function onLoad(pi) {
  host = pi;
  pi.ui.injectStyle(QUOTA_CSS);
  pi.slots.register({
    slot: "composerControl",
    component: QuotaControl,
    positions: ["left"],
  });
}
