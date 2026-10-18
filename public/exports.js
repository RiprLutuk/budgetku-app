function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function transactionsCsv(rows = []) {
  const header = ['ID', 'Tanggal', 'Jenis', 'Nominal IDR', 'Catatan', 'Kategori', 'Goal', 'Klasifikasi', 'Pencatat', 'Referensi', 'Versi'];
  const records = rows.map((transaction) => [
    transaction.id,
    transaction.tx_date,
    transaction.goal_id ? transaction.type === 'income' ? 'Pencairan goal' : 'Setoran goal' : transaction.type === 'income' ? 'Pendapatan' : 'Belanja',
    transaction.amount,
    transaction.note,
    transaction.category_name,
    transaction.goal_name,
    transaction.goal_id ? 'Transfer internal' : transaction.type === 'income' ? 'Pendapatan' : transaction.need ? 'Kebutuhan' : 'Keinginan',
    transaction.created_by_name,
    transaction.external_ref,
    transaction.version ?? 0,
  ]);
  return '\uFEFF' + [header, ...records].map((record) => record.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadTransactions(rows, month) {
  const url = URL.createObjectURL(new Blob([transactionsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `budgetku-transaksi-${month}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
