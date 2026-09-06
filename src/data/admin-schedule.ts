    if (data.action === "customerPay") {
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      const sum = Number(data.sum || 0);
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      if (!sum) return { ok: false as const, error: "Укажите сумму." };
      const { payKindOf, payEffect, appendPay, ensureOpening, customerBalance } = await import("./crm-pay");
      const { packAlfaPayCreate, locationIdForBranch } = await import("./crm-pay-alfa");
      const { cardFromDossier } = await import("./customer-card-disk");
      const { formatRuDob } = await import("./alfacrm");
      const kind = payKindOf(data.payKind);
      const now = new Date();
      const ru =
        formatRuDob(data.documentDate) ||
        formatRuDob(data.date) ||
        `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const note =
        String(data.note || "").trim() ||
        (kind === "product" ? "продажа товара" : kind === "refund" ? "возврат средств" : kind === "correct" ? "корректировка" : "Оплата за обучение");
      const d = findDossier({ crmId: customerId });
      ensureOpening(customerId, Number(d?.branchId || branch), d?.extras?.balance);
      const prev = customerBalance(customerId, d?.extras?.balance);
      const fx = payEffect(kind, sum, prev);
      const pay = appendPay({
        customerId,
        branchId: Number(d?.branchId || branch),
        kind,
        income: fx.income,
        expenditure: fx.expenditure,
        note,
        documentDate: ru,
      });
      upsertDossier({
        crmId: customerId,
        extras: { ...(d?.extras || {}), balance: String(fx.next) },
        source: "admin",
      } as never);
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({
        op: "pay.create",
        branchId: branch,
        entityId: customerId,
        body: packAlfaPayCreate({
          customerId,
          documentDate: ru,
          income: fx.income,
          expenditure: fx.expenditure,
          note,
          localId: pay.id,
          kind,
          payAccountId: Number(data.payAccountId) || 1,
          payItemId: Number(data.payItemId) || 0,
          locationId: Number(data.locationId) || locationIdForBranch(Number(d?.branchId || branch)),
          managerId: Number(data.managerId) || 0,
          cttId: Number(data.cttId) || 0,
          contractId: Number(data.contractId) || 0,
          payerName: String(data.payerName || d?.parent || ""),
          groupId: Number(data.groupId) || 0,
          payMethod: String(data.payMethod || ""),
        }),
      });
      logAdmin(`Клиент ${customerId}: ${note} ${sum} в очереди`);
      if (kind !== "refund") {
        void import("./funnel-auto").then((m) =>
          m.applyFunnelAuto("tariff", { customerId, branchId: branch, isStudy: Number(d?.extras?.is_study), statusId: Number(d?.extras?.lead_status_id || 0) }),
        );
      }
      const fresh = findDossier({ crmId: customerId });
      return {
        ok: true as const,
        queued: true,
        customer: fresh ? cardFromDossier(fresh, branch) : { id: customerId, balance: fx.next },
      };
    }