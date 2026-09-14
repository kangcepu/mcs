String shortCompanyLabel(String? company) {
  final raw = company?.trim() ?? '';
  if (raw.isEmpty) {
    return '-';
  }

  switch (raw.toUpperCase()) {
    case 'RATIMDO UTAMA':
    case 'RU':
      return 'RU';
    case 'GANDA SARIBU UTAMA':
    case 'GSU':
      return 'GSU';
    case 'UTAMA CORPORATION':
    case 'UC':
      return 'UC';
    default:
      return raw;
  }
}
