export function goalIconForName(name, purpose = '') {
  const value = String(name || '').toLocaleLowerCase('id-ID');
  if (purpose === 'emergency' || /darurat|kas|vault/.test(value)) return 'vault';
  if (/rumah|renovasi/.test(value)) return 'house';
  if (/mobil|kendaraan/.test(value)) return 'car';
  if (/umroh|haji/.test(value)) return 'kaaba';
  if (/libur|wisata/.test(value)) return 'spark';
  return 'goals';
}

export function categoryIconFor({ category = '', note = '', type = 'expense' } = {}) {
  if (type === 'income') return 'inflow';
  const value = `${category} ${note}`.toLocaleLowerCase('id-ID');
  if (/rumah|kontrakan|sewa|cicilan/.test(value)) return 'house';
  if (/wifi|wi-fi|internet/.test(value)) return 'wifi';
  if (/listrik|token|pln/.test(value)) return 'bolt';
  if (/makan|kuliner|resto/.test(value)) return 'food';
  if (/kopi|jajan|cafe/.test(value)) return 'coffee';
  if (/belanja|market|grocer/.test(value)) return 'cart';
  if (/pendidikan|sekolah|kuliah|buku/.test(value)) return 'book';
  if (/transport|parkir|bensin|kendaraan/.test(value)) return 'car';
  if (/kesehatan|dokter|obat|rumah sakit/.test(value)) return 'health';
  if (/darurat/.test(value)) return 'vault';
  if (/tagihan|utilitas|air|gas/.test(value)) return 'receipt';
  return 'ledger';
}
